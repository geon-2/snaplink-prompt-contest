/**
 * S3 key → 이미지 표시용 URL 변환
 *
 * 환경변수 S3_BUCKET, AWS_REGION 필요.
 * 설정이 없으면 fallback으로 /api/images/ 프록시 경로 사용.
 */
export function getImageUrl(s3Key: string): string {
  if (s3Key.startsWith('http') || s3Key.startsWith('//')) {
    return s3Key;
  }

  const bucket = import.meta.env.VITE_S3_BUCKET as string | undefined;
  const region = import.meta.env.VITE_AWS_REGION as string | undefined;

  if (bucket && region) {
    return `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
  }

  // fallback: 백엔드 프록시를 통해 S3 이미지 제공
  return `/api/images/${s3Key}`;
}
