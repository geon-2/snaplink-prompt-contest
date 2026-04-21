/**
 * 인증 관리 서비스
 *
 * - POST /signup으로 쿠키 기반 인증 설정
 * - 쿠키에서 user_uuid 읽기
 */



/**
 * 회원가입/인증 요청 (Mock)
 */
export async function signup(uuid: string, apiKey: string): Promise<void> {
  console.log('Mock Signup:', { uuid, apiKey });
  // 가짜 쿠키 설정 (Mock 모드)
  document.cookie = `user_uuid=${uuid}; path=/; max-age=3600`;
  document.cookie = `user_api_key=${apiKey}; path=/; max-age=3600`;
  
  // 성공 시뮬레이션
  await new Promise(resolve => setTimeout(resolve, 500));
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

/**
 * UUID v4 생성 (crypto API 사용)
 */
export function generateUuid(): string {
  return crypto.randomUUID();
}
