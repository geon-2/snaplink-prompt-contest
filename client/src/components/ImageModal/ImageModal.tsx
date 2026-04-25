import { useEffect, useCallback, useState } from 'react';

interface ImageModalProps {
  src: string;
  s3Key?: string;
  alt?: string;
  onClose: () => void;
}

/**
 * 이미지 확대 보기 + 다운로드 모달
 *
 * - 배경 클릭 / ESC 키로 닫기
 * - 다운로드 버튼으로 이미지 저장
 * - 부드러운 fade/scale 애니메이션
 */
export default function ImageModal({ src, s3Key, alt = '생성된 이미지', onClose }: ImageModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // 마운트 시 애니메이션 트리거
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
    // body 스크롤 방지
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 200); // 애니메이션 시간 후 실제 닫기
  }, [onClose]);

  /**
   * 이미지 다운로드
   *
   * 1) data: URL → 직접 fetch로 blob 변환
   * 2) s3Key → same-origin 서버 프록시(/api/images/)로 CORS 없이 다운로드
   * 3) fallback → 원본 URL fetch 시도
   */
  const handleDownload = useCallback(async () => {
    setIsDownloading(true);

    const mimeToExt: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    try {
      let blob: Blob;

      if (src.startsWith('data:')) {
        // data: URL은 직접 fetch 가능
        const res = await fetch(src);
        blob = await res.blob();
      } else if (s3Key) {
        // same-origin 프록시를 통해 CORS 없이 다운로드
        const res = await fetch(`/api/images/${s3Key}`, { credentials: 'include' });
        if (!res.ok) throw new Error('proxy fetch failed');
        blob = await res.blob();
      } else {
        // 원본 URL 직접 fetch
        const res = await fetch(src, { mode: 'cors' });
        blob = await res.blob();
      }

      const ext = mimeToExt[blob.type] || 'png';
      const filename = `generated-image-${timestamp}.${ext}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // 모든 fetch 실패 시 → 새 탭에서 열기 (최후 fallback)
      window.open(src, '_blank', 'noopener,noreferrer');
    } finally {
      setIsDownloading(false);
    }
  }, [src, s3Key]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-200 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleClose}
    >
      {/* 배경 오버레이 */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      {/* 모달 컨텐츠 */}
      <div
        className={`relative z-10 flex flex-col items-center gap-4 max-w-[90vw] max-h-[90vh] transition-all duration-200 ${
          isVisible ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 툴바 */}
        <div className="flex items-center gap-2 self-end">
          {/* 다운로드 버튼 */}
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-xl text-white text-[13px] font-bold transition-all border border-white/20 shadow-lg disabled:opacity-50"
            title="이미지 다운로드"
          >
            {isDownloading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            다운로드
          </button>

          {/* 닫기 버튼 */}
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-xl text-white transition-all border border-white/20 shadow-lg"
            title="닫기 (ESC)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 이미지 */}
        <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10">
          <img
            src={src}
            alt={alt}
            className="max-w-[85vw] max-h-[80vh] object-contain"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
