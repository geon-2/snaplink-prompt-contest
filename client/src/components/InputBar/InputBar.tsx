import { useRef, useEffect, useState } from 'react';

/**
 * 채팅 입력 바 컴포넌트
 * - 텍스트 입력 + 이미지 파일 첨부 지원
 * - 첨부된 이미지는 입력 필드 위에 썸네일로 표시
 */
export default function InputBar({
  value,
  onChange,
  onSend,
  onStop,
  isLoading = false,
  disabled = false,
  variant = 'pro',
  placeholder = '메시지를 입력하세요...',
}: any) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [showError, setShowError] = useState(false);

  // 텍스트영역 자동 높이 조절
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
    if (value.trim()) {
      setShowError(false);
    }
  }, [value]);

  // 썸네일 프리뷰 생성/해제
  useEffect(() => {
    const urls = filesToUpload.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [filesToUpload]);

  const handleSubmit = () => {
    if (disabled) return;
    
    if (!value.trim()) {
      setShowError(true);
      // 잠시 후 에러 상태 해제 (애니메이션 반복을 위해)
      setTimeout(() => setShowError(false), 500);
      return;
    }

    onSend(value.trim(), filesToUpload.length > 0 ? filesToUpload : undefined);
    setFilesToUpload([]);
    setShowError(false);
  };

  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setFilesToUpload((prev) => [...prev, ...Array.from(files)]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    setFilesToUpload((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="px-6 py-5 bg-white border-t border-border-default shrink-0 w-full relative shadow-[0_-4px_24px_-12px_rgba(0,0,0,0.05)]">
      {/* 유효성 검사 에러 메시지 */}
      {showError && (
        <div className="absolute top-0 left-11 -translate-y-full bg-red-500 text-white text-[11px] px-3 py-1.5 rounded-lg shadow-xl animate-fadeIn z-20 mb-2 font-bold">
          메시지를 입력해주세요!
        </div>
      )}

      {/* 첨부된 이미지 썸네일 미리보기 — 입력 필드 위 */}
      {filesToUpload.length > 0 && (
        <div className="flex gap-3 pb-4 overflow-x-auto">
          {filesToUpload.map((file, i) => (
            <div
              key={i}
              className="relative shrink-0 group border-2 border-slate-100 rounded-xl p-1 bg-white shadow-sm"
            >
              <img
                src={previews[i]}
                alt={file.name}
                className="w-16 h-16 object-cover rounded-lg"
              />
              {/* 삭제 버튼 — 이미지 우상단 */}
              <button
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] text-slate-400 hover:text-red-500 hover:border-red-200 transition-all shadow-md z-10"
                onClick={() => handleRemoveFile(i)}
                type="button"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={`flex items-center gap-4 bg-slate-50 border rounded-2xl p-2.5 pl-5 transition-all outline-none w-full ${showError ? 'border-red-400 animate-shake ring-4 ring-red-400/10' : 'border-slate-200 focus-within:border-accent-pro/40 focus-within:ring-4 focus-within:ring-accent-pro/5 focus-within:bg-white'}`}>
        {/* 파일 첨부 버튼 */}
        <button
          className="flex items-center justify-center w-9 h-9 min-w-9 rounded-lg text-slate-400 hover:text-accent-pro hover:bg-accent-pro/10 transition-all shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          type="button"
          aria-label="이미지 첨부"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
        />

        <textarea
          ref={textareaRef}
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-text-primary font-bold text-[14px] leading-relaxed resize-none min-h-[44px] max-h-[140px] py-3 px-0 placeholder:text-slate-400 flex items-center"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          id={`input-${variant}`}
        />
        <button
          className={`flex items-center justify-center w-11 h-11 min-w-11 rounded-xl shadow-lg transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed text-white ${isLoading ? 'bg-red-500 shadow-red-500/20' : (variant === 'flash' ? 'bg-accent-flash shadow-accent-flash/20' : 'bg-accent-pro shadow-accent-pro/20 hover:scale-105 active:scale-95')}`}
          onClick={isLoading ? onStop : handleSubmit}
          disabled={!isLoading && (disabled || !value.trim())}
          aria-label={isLoading ? '생성 중단' : '메시지 전송'}
          id={`send-btn-${variant}`}
        >
          {isLoading ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
              <rect x="7" y="7" width="10" height="10" rx="1.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}


// v1.0.1 - Fixed HMR ReferenceError

