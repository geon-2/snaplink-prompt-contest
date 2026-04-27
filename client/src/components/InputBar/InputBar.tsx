import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';

/**
 * InputBar 외부에서 파일을 주입하기 위한 핸들
 */
export interface InputBarHandle {
  addFiles: (files: File[]) => void;
}

/**
 * 채팅 입력 바 컴포넌트
 * - 텍스트 입력 + 이미지 파일 첨부 지원
 * - 첨부된 이미지는 입력 필드 위에 썸네일로 표시
 * - 외부(드래그앤드롭, 클립보드)에서 addFiles()로 파일 주입 가능
 */
const InputBar = forwardRef<InputBarHandle, any>(({
  value,
  onChange,
  onSend,
  isLoading = false,
  disabled = false,
  variant = 'pro',
  placeholder = '메시지를 입력하세요...',
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [showError, setShowError] = useState(false);
  // 파일 input 리마운트용 key — 같은 파일 재선택 시 onChange 보장
  const [fileInputKey, setFileInputKey] = useState(0);

  // 외부에서 파일을 주입할 수 있는 메서드 노출
  useImperativeHandle(ref, () => ({
    addFiles: (newFiles: File[]) => {
      setFilesToUpload((prev) => [...prev, ...newFiles]);
    },
  }));

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

  const hasFiles = filesToUpload.length > 0;
  const hasText = value.trim().length > 0;
  const canSubmit = hasText || hasFiles;

  const handleSubmit = () => {
    if (disabled) return;
    
    if (!canSubmit) {
      setShowError(true);
      setTimeout(() => setShowError(false), 500);
      return;
    }

    onSend(value.trim(), hasFiles ? filesToUpload : undefined);
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
    // key 변경으로 input 리마운트 → 같은 파일 재선택 시에도 onChange 트리거
    setFileInputKey((k) => k + 1);
  };

  const handleRemoveFile = (index: number) => {
    setFilesToUpload((prev) => prev.filter((_, i) => i !== index));
  };

  // 클립보드 붙여넣기: textarea에서 이미지 감지
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      setFilesToUpload((prev) => [...prev, ...imageFiles]);
    }
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
          key={fileInputKey}
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
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          id={`input-${variant}`}
        />
        <button
          className={`flex items-center justify-center w-11 h-11 min-w-11 rounded-xl shadow-lg transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed text-white ${variant === 'flash' ? 'bg-accent-flash shadow-accent-flash/20' : 'bg-accent-pro shadow-accent-pro/20 hover:scale-105 active:scale-95'}`}
          onClick={handleSubmit}
          disabled={disabled || isLoading || !canSubmit}
          aria-label="메시지 전송"
          id={`send-btn-${variant}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
});

InputBar.displayName = 'InputBar';

export default InputBar;
