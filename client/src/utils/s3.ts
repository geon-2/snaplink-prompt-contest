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

  // 환경변수 우선, 없으면 서버 설정 기본값 사용
  const bucket = (process.env.S3_BUCKET as string) || 'revede';
  const region = (process.env.AWS_REGION as string) || 'ap-northeast-2';
  return `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
}
