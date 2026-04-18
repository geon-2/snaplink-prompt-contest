import { useEffect, useRef, useState } from 'react';
import { getImageUrl } from '../../utils/s3';

/**
 * 단일 채팅 메시지 컴포넌트
 */
export default function Message({ message, variant = 'pro', onEdit, onCopy }: any) {
  const { role, content, timestamp, isStreaming, isGenerating, imageS3Key, isError, attachedImages } = message;
  const isUser = role === 'user';
  const contentRef = useRef<HTMLDivElement>(null);

  // 이미지 로딩 Progress
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [content, isStreaming, isGenerating]);

  const formatTime = (date: any) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  // 간단한 마크다운 → HTML 변환
  const renderContent = (text: string) => {
    if (!text) return null;

    let html = text
      // 볼드
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-text-primary">$1</strong>')
      // 인라인 코드
      .replace(/`([^`]+)`/g, '<code class="font-mono bg-white/10 px-[6px] py-[2px] rounded-[4px] text-[0.85em]">$1</code>')
      // 코드 블록
      .replace(/```([\s\S]*?)```/g, '<pre class="bg-black/30 border border-border-subtle rounded-xl p-[12px] my-[8px] overflow-x-auto font-mono text-[13px] leading-[1.5]"><code class="bg-transparent p-0 text-text-primary">$1</code></pre>')
      // 헤더
      .replace(/^## (.+)$/gm, '<strong style="font-size: 1.05em; display: block; margin-top: 8px;">$1</strong>')
      .replace(/^> (.+)$/gm, '<blockquote class="border-l-[3px] border-border-default pl-[12px] text-text-secondary my-[8px] italic">$1</blockquote>');

    return <span dangerouslySetInnerHTML={{ __html: html }} className="break-words whitespace-pre-wrap leading-[1.6]" />;
  };

  // S3 key → URL 변환 (AI 생성 이미지용)
  const aiImageUrl = imageS3Key ? getImageUrl(imageS3Key) : null;

  return (
    <div
      ref={contentRef}
      className={`flex gap-4 px-7 py-5 animate-[fadeIn_0.3s_ease-out] w-full ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div className={`w-9 h-9 min-w-[36px] rounded-full flex flex-col items-center justify-center text-[14px] font-semibold shrink-0 mt-[2px] ${isUser ? 'bg-[#4f46e5] text-white' : variant === 'pro' ? 'bg-accent-pro-dim text-accent-pro border border-indigo-500/20' : 'bg-accent-flash-dim text-accent-flash border border-amber-500/20'}`}>
        {isUser ? '👤' : variant === 'pro' ? '✦' : '🎨'}
      </div>

      {/* Content Wrapper */}
      <div className={`max-w-[85%] relative min-w-0 flex flex-col group`}>
        <div className={`relative ${isUser ? 'bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white px-6 py-4 rounded-t-2xl rounded-bl-2xl rounded-br-lg text-[14px] leading-[1.7] shadow-[0_4px_12px_rgba(0,0,0,0.4)]' : 'bg-bg-surface border border-border-subtle px-5 py-4 rounded-t-2xl rounded-br-2xl rounded-bl-lg text-[14px] leading-[1.7] text-text-primary'} ${isError ? 'border-red-500/30 bg-red-500/5' : ''}`}>
          
          {/* 사용자가 첨부한 이미지들 (텍스트 위) */}
          {isUser && attachedImages && attachedImages.length > 0 && (
            <div className={`flex flex-wrap gap-2 mb-3 ${content ? '' : 'mb-0'}`}>
              {attachedImages.map((img: string, i: number) => (
                <img
                  key={i}
                  src={img}
                  alt="첨부 이미지"
                  className="max-w-[200px] max-h-[200px] object-cover rounded-lg border border-white/20 shadow-sm"
                />
              ))}
            </div>
          )}

          {/* 텍스트 스트리밍 중 */}
          {isStreaming && !content && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-[6px] py-2">
                <div className="w-[6px] h-[6px] rounded-full bg-text-tertiary animate-[typing_1.4s_infinite_0s]" />
                <div className="w-[6px] h-[6px] rounded-full bg-text-tertiary animate-[typing_1.4s_infinite_0.2s]" />
                <div className="w-[6px] h-[6px] rounded-full bg-text-tertiary animate-[typing_1.4s_infinite_0.4s]" />
              </div>
            </div>
          )}

          {/* 이미지 생성 중 (AI) */}
          {!isUser && isGenerating && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 min-h-[200px] bg-bg-tertiary rounded-xl border border-dashed border-border-default">
              <div className="w-10 h-10 border-4 border-t-accent-flash border-border-subtle rounded-full animate-spin" />
              <div className="text-[13px] text-text-secondary text-center">
                🎨 나노바나나가 이미지를 생성하고 있습니다...
              </div>
              <div className="w-[120px] h-[3px] bg-bg-secondary rounded-full overflow-hidden mt-1 relative">
                <div className="absolute top-0 left-0 h-full w-[60%] bg-gradient-to-r from-accent-flash to-[#fbbf24] rounded-full animate-[shimmer_2s_ease-in-out_infinite] bg-[length:200%_100%]" />
              </div>
            </div>
          )}

          {/* 실제 텍스트 컨텐츠 */}
          {content && (
            <div className="break-words whitespace-pre-wrap">
              {isUser ? content : renderContent(content)}
              {isStreaming && content && <span className="inline-block w-[2px] h-[1.1em] bg-accent-pro ml-[2px] align-text-bottom animate-pulse" />}
            </div>
          )}
        </div>

        {/* AI가 생성한 이미지 (기존 유지) */}
        {!isUser && aiImageUrl && !isGenerating && (
          <div className="mt-4 rounded-xl overflow-hidden relative bg-bg-tertiary self-start">
            <img
              src={aiImageUrl}
              alt="생성된 이미지"
              className={`block w-full max-w-[400px] h-auto rounded-xl transition-all duration-400 ease-out shadow-lg ${imageLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
              onLoad={() => setImageLoaded(true)}
              loading="lazy"
            />
          </div>
        )}

        {/* 하단 영역 (타임스탬프 + 액션 버튼) */}
        <div className="relative mt-2 min-h-[24px] flex items-center">
          {/* 타임스탬프: 사용자(좌측), AI(우측) */}
          <span className={`text-[11px] text-text-tertiary/60 font-medium ${isUser ? 'mr-auto' : 'ml-auto'}`}>
            {!isStreaming && !isGenerating && formatTime(timestamp)}
          </span>

          {/* 액션 버튼: 아이콘 형태 (복사, 수정) */}
          {isUser && !isStreaming && !isGenerating && (
            <div className="absolute right-0 top-0 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0 pointer-events-none group-hover:pointer-events-auto bg-bg-primary/40 backdrop-blur-md px-1.5 py-1 rounded-lg border border-border-subtle/50 shadow-sm">
              {/* 복사 버튼 */}
              <button 
                className="w-7 h-7 flex items-center justify-center rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover transition-all"
                onClick={() => onCopy && onCopy(content)}
                title="복사"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px]">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
              
              {/* 수정 버튼 */}
              <button 
                className="w-7 h-7 flex items-center justify-center rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover transition-all"
                onClick={() => onEdit && onEdit(content)}
                title="수정"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px]">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
