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
    <div className="px-6 py-5 bg-bg-secondary border-t border-border-subtle shrink-0 w-full relative">
      {/* 유효성 검사 에러 메시지 */}
      {showError && (
        <div className="absolute top-0 left-11 -translate-y-1/2 bg-red-500 text-white text-[11px] px-2.5 py-1 rounded-md shadow-lg animate-[fadeIn_0.2s_ease-out] z-20">
          메시지를 입력해주세요!
        </div>
      )}

      {/* 첨부된 이미지 썸네일 미리보기 — 입력 필드 위 */}
      {filesToUpload.length > 0 && (
        <div className="flex gap-3 pb-4 overflow-x-auto">
          {filesToUpload.map((file, i) => (
            <div
              key={i}
              className="relative shrink-0 group"
            >
              <img
                src={previews[i]}
                alt={file.name}
                className="w-[72px] h-[72px] object-cover rounded-xl border border-border-subtle"
              />
              {/* 삭제 버튼 — 이미지 우상단 */}
              <button
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-bg-primary border border-border-subtle flex items-center justify-center text-[10px] text-text-tertiary hover:text-red-400 hover:border-red-400/50 transition-all shadow-sm"
                onClick={() => handleRemoveFile(i)}
                type="button"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={`flex items-center gap-3 bg-bg-tertiary border rounded-[18px] p-2.5 pl-5 transition-all ${showError ? 'border-red-500/80 animate-shake ring-4 ring-red-500/10' : 'border-border-default focus-within:border-border-focus'} ${variant === 'flash' ? 'focus-within:border-amber-500/50 focus-within:shadow-glow-flash' : 'focus-within:shadow-glow-pro'}`}>
        {/* 파일 첨부 버튼 */}
        <button
          className="flex items-center justify-center w-9 h-9 min-w-9 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover transition-all shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          type="button"
          aria-label="이미지 첨부"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
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
          className="flex-1 bg-transparent border-none outline-none text-text-primary font-sans text-[14px] leading-normal resize-none min-h-[24px] max-h-[120px] py-2 px-0 placeholder:text-text-tertiary scrollbar-thin scrollbar-thumb-border-default scrollbar-track-transparent flex items-center pt-[10px]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          id={`input-${variant}`}
        />
        <button
          className={`flex items-center justify-center w-11 h-11 min-w-11 rounded-xl border-none text-white cursor-pointer transition-all shrink-0 hover:not-disabled:scale-105 active:not-disabled:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${isLoading ? 'bg-red-500 hover:bg-red-600' : (variant === 'flash' ? 'bg-accent-flash hover:not-disabled:bg-[#d97706]' : 'bg-accent-pro hover:not-disabled:bg-[#4f46e5]')}`}
          onClick={isLoading ? onStop : handleSubmit}
          disabled={!isLoading && (disabled || !value.trim())}
          aria-label={isLoading ? '생성 중단' : '메시지 전송'}
          id={`send-btn-${variant}`}
        >
          {isLoading ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
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

