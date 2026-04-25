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
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * 쿠키에서 user_api_key 값을 읽는다.
 */
export function getUserApiKey(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)user_api_key=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
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

const UUID_KEY = 'pa_user_uuid';

/**
 * localStorage에서 UUID를 가져오거나, 없으면 생성 후 저장한다.
 */
export function getOrCreateLocalUuid(): string {
  const existing = localStorage.getItem(UUID_KEY);
  if (existing) return existing;
  const newUuid = crypto.randomUUID();
  localStorage.setItem(UUID_KEY, newUuid);
  return newUuid;
}
