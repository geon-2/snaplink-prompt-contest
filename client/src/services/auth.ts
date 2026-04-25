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
 * 브라우저별 고유 UUID를 반환한다.
 * localStorage에 저장되어 있으면 그대로 사용하고,
 * 없으면 새로 생성하여 저장한다.
 *
 * API Key는 팀 단위로 공유되지만 UUID는 개인 식별용이므로
 * API Key와 무관하게 브라우저(사용자)마다 고유해야 한다.
 */
export function getOrCreateUserUuid(): string {
  const STORAGE_KEY = 'pa_user_uuid';
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const uuid = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, uuid);
  return uuid;
}
