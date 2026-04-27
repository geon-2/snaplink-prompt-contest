import { useRef, useEffect, useState, useCallback } from 'react';
import Message from '../Message/Message';
import InputBar from '../InputBar/InputBar';
import type { InputBarHandle } from '../InputBar/InputBar';

/**
 * 채팅 패널 컴포넌트 (텍스트 또는 이미지)
 *
 * - 드래그앤드롭 이미지 첨부 지원 (패널별 독립 하이라이팅)
 * - 클립보드 이미지 붙여넣기 지원
 */
export default function ChatPanel({ variant, messages, isLoading, onSend, onStop, onRetry: _onRetry, onEdit: _onEdit, canClose, onClose }: any) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputBarRef = useRef<InputBarHandle>(null);
  const [inputValue, setInputValue] = useState('');

  // 드래그앤드롭 상태
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const isPro = variant === 'pro';
  const modelName = isPro ? 'Gemini 3.1 Pro' : 'Nano Banana Pro';
  const modelDesc = isPro ? '텍스트 채팅' : '이미지 생성';

  // 새 메시지 시 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (text: string, files?: File[]) => {
    onSend(text, files);
    setInputValue('');
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      // Optional: show a toast or feedback
    });
  };

  // ─── 드래그앤드롭 핸들러 ───

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    const imageFiles = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('image/')
    );
    if (imageFiles.length > 0 && inputBarRef.current) {
      inputBarRef.current.addFiles(imageFiles);
    }
  }, []);

  return (
    <div
      className="flex flex-col w-full h-full min-w-0 relative overflow-hidden"
      id={`panel-${variant}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 드래그앤드롭 오버레이 */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none animate-fadeIn">
          <div className={`absolute inset-3 rounded-2xl border-[3px] border-dashed backdrop-blur-[2px] ${isPro ? 'border-accent-pro bg-accent-pro/[0.06]' : 'border-accent-flash bg-accent-flash/[0.06]'}`} />
          <div className="relative flex flex-col items-center gap-3">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${isPro ? 'bg-accent-pro/10 border-2 border-accent-pro/30' : 'bg-accent-flash/10 border-2 border-accent-flash/30'}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-7 h-7 ${isPro ? 'text-accent-pro' : 'text-accent-flash'}`}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className={`font-black text-[15px] ${isPro ? 'text-accent-pro' : 'text-accent-flash'}`}>이미지를 여기에 놓으세요</span>
              <span className="text-text-tertiary font-bold text-[12px]">PNG, JPG, WebP 지원</span>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-default bg-white shrink-0 min-h-[58px] shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className={`w-[32px] h-[32px] rounded-lg flex items-center justify-center text-[14px] font-bold ${isPro ? 'bg-accent-pro/10 text-accent-pro border border-accent-pro/20' : 'bg-accent-flash/10 text-accent-flash border border-accent-flash/20'}`}>
            {isPro ? '✦' : '🎨'}
          </div>
          <div className="flex flex-col">
            <span className="text-[14px] font-black text-text-primary leading-tight">{modelName}</span>
            <span className="text-[11px] font-bold text-text-tertiary leading-tight mt-0.5">{modelDesc}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-[6px] px-3 py-1.5 rounded-full text-[11px] font-black bg-slate-100 text-slate-500 border border-slate-200 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-pro animate-pulse" />
            Active
          </div>
          {canClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-slate-100 transition-all"
              title="패널 닫기"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-6 scroll-smooth bg-transparent" id={`messages-${variant}`}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 p-16 text-center animate-fadeIn">
            <div className={`w-20 h-20 rounded-3xl flex items-center justify-center text-[32px] ${isPro ? 'bg-accent-pro/10 text-accent-pro border border-accent-pro/20' : 'bg-accent-flash/10 text-accent-flash border border-accent-flash/20'}`}>
              {isPro ? '✦' : '🎨'}
            </div>
            <div className="text-[18px] font-black text-text-primary mt-2">
              {isPro ? 'Gemini Pro와 대화하기' : '나노바나나로 이미지 생성'}
            </div>
            <div className="text-[13.5px] font-bold text-text-secondary max-w-[320px] leading-relaxed opacity-60">
              {isPro
                ? '프롬프트에 대해 질문하고, 평가받고,\n개선 방법을 알아보세요.'
                : '원하는 이미지를 텍스트로 설명하면\n나노바나나가 생성해드립니다.'}
            </div>
          </div>
        ) : (
          messages.map((msg: any) => (
            <Message
              key={msg.id}
              message={msg}
              variant={variant}
              onCopy={(content: string) => handleCopy(content)}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <InputBar
        ref={inputBarRef}
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        onStop={onStop}
        isLoading={isLoading}
        disabled={false}
        variant={variant}
        placeholder={variant === 'flash' ? '이미지로 생성할 메시지를 입력해 보세요...' : '궁금한 내용을 질문해 보세요...'}
      />
    </div>
  );
}
