import { useEffect, useRef, useState } from 'react';

/**
 * 관리자 이미지 로딩 훅
 *
 * /api/images/{s3_key} 엔드포인트는 세션 쿠키 인증을 요구하지만,
 * 관리자(심사/분석) 페이지에는 일반 사용자 쿠키가 없을 수 있다.
 * 이 훅은 X-Admin-Review-Key 헤더로 /api/images/ 에 직접 fetch하거나,
 * 이미 data:/blob:/https: 형태의 URL이면 그대로 반환한다.
 */
export function useAdminImage(
  src: string | null | undefined,
  adminKey: string,
): { blobUrl: string | null; isLoading: boolean; error: boolean } {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const prevBlobRef = useRef<string | null>(null);

  useEffect(() => {
    if (!src) {
      setBlobUrl(null);
      setIsLoading(false);
      setError(false);
      return;
    }

    // 이미 직접 표시 가능한 URL (data:, blob:, https://, http://)
    const isDirectUrl = /^(data:|blob:|https?:)/.test(src);
    if (isDirectUrl) {
      setBlobUrl(src);
      setIsLoading(false);
      setError(false);
      return;
    }

    // /api/images/ 경로: adminKey 헤더와 함께 fetch
    const apiPath = src.startsWith('/') ? src : `/api/images/${src}`;
    const trimmedKey = adminKey.trim();

    setIsLoading(true);
    setError(false);

    const controller = new AbortController();

    const headers: HeadersInit = {};
    if (trimmedKey) {
      headers['X-Admin-Review-Key'] = encodeURIComponent(trimmedKey);
    }

    fetch(apiPath, {
      credentials: 'include',
      headers,
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        // 이전 blob URL 해제
        if (prevBlobRef.current) {
          URL.revokeObjectURL(prevBlobRef.current);
        }
        prevBlobRef.current = url;
        setBlobUrl(url);
        setIsLoading(false);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setError(true);
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [src, adminKey]);

  // 언마운트 시 blob URL 해제
  useEffect(() => {
    return () => {
      if (prevBlobRef.current) {
        URL.revokeObjectURL(prevBlobRef.current);
      }
    };
  }, []);

  return { blobUrl, isLoading, error };
}
