/**
 * 인증 관리 서비스
 */

const API_BASE = '/api';

/**
 * POST /api/signup — 신규 등록 또는 기존 사용자 재인증
 */
export async function signup(uuid: string, apiKey: string): Promise<void> {
  const resp = await fetch(`${API_BASE}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ uuid, api_key: apiKey }),
  });

  if (resp.ok || resp.status === 409) {
    // 서버가 Set-Cookie로 쿠키를 설정하지만, 프록시 환경에서 안 될 경우 JS에서도 설정
    // 409: 서버가 UPSERT 미적용 상태일 때를 위한 클라이언트 fallback
    document.cookie = `user_uuid=${uuid}; path=/; max-age=604800; samesite=lax`;
    document.cookie = `user_api_key=${apiKey}; path=/; max-age=604800; samesite=lax`;
    return;
  }

  const body = await resp.json().catch(() => ({}));
  throw new Error(body.detail || `서버 오류 (${resp.status})`);
}

/**
 * 쿠키에서 user_uuid 값을 읽는다.
 */
export function getUserUuid(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)user_uuid=([^;]*)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    document.cookie = 'user_uuid=; path=/; max-age=0; samesite=lax';
    return null;
  }
}

/**
 * 쿠키에서 user_api_key 값을 읽는다.
 */
export function getUserApiKey(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)user_api_key=([^;]*)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    document.cookie = 'user_api_key=; path=/; max-age=0; samesite=lax';
    return null;
  }
}

/**
 * 인증 상태 확인 (두 쿠키 모두 존재 여부)
 */
export function isAuthenticated(): boolean {
  return getUserUuid() !== null && getUserApiKey() !== null;
}

export function logout(): void {
  document.cookie = 'user_uuid=; path=/; max-age=0; samesite=lax';
  document.cookie = 'user_api_key=; path=/; max-age=0; samesite=lax';
}

/**
 * API Key에서 UUID v4를 결정론적으로 파생한다.
 * 같은 Key → 항상 같은 UUID → DB와 항상 일치, 팀 공유 가능.
 */
export async function deriveUuidFromApiKey(apiKey: string): Promise<string> {
  const data = new TextEncoder().encode(`pa_arena_${apiKey}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hashBuffer).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const h = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
