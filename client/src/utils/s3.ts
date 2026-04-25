const CDN_BASE = 'https://datsbgc37wc3i.cloudfront.net';

/**
 * S3 key → CloudFront CDN 이미지 URL 변환
 *
 * CloudFront 배포를 통해 이미지를 서빙하므로 CDN URL에 key만 붙인다.
 */
export function getImageUrl(s3Key: string): string {
  if (s3Key.startsWith('http') || s3Key.startsWith('//')) {
    return s3Key;
  }

  // key 앞의 슬래시 중복 방지
  const normalizedKey = s3Key.startsWith('/') ? s3Key.slice(1) : s3Key;
  return `${CDN_BASE}/${normalizedKey}`;
}
