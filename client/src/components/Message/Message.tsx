import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getImageUrl } from '../../utils/s3';
import ImageModal from '../ImageModal/ImageModal';

/**
 * 단일 채팅 메시지 컴포넌트
 */
export default function Message({ message, variant = 'pro', onCopy }: any) {
  const { role, content, timestamp, isStreaming, isGenerating, imageS3Key, imageUrl: imageDataUrl, isError, attachedImages } = message;
  const isUser = role === 'user';
  const contentRef = useRef<HTMLDivElement>(null);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // 사용자 첨부 이미지 로딩 에러 방어
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());

  // 이미지 모달 상태
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);

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

  // imageDataUrl(base64) 우선, 없으면 S3 key → URL 변환
  const aiImageUrl = imageDataUrl || (imageS3Key ? getImageUrl(imageS3Key) : null);

  return (
    <div
      ref={contentRef}
      className={`flex gap-4 px-6 py-6 animate-fadeIn w-full ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div className={`w-10 h-10 min-w-[40px] rounded-2xl flex flex-col items-center justify-center text-[16px] font-bold shrink-0 shadow-sm border ${isUser ? 'bg-accent-pro border-accent-pro/20 text-white' : variant === 'pro' ? 'bg-white text-accent-pro border-accent-pro/20' : 'bg-white text-accent-flash border-accent-flash/20'}`}>
        {isUser ? '👤' : variant === 'pro' ? '✦' : '🎨'}
      </div>

      {/* Content Wrapper */}
      <div className={`max-w-[80%] relative min-w-0 flex flex-col group`}>
        {/* 텍스트 또는 텍스트 생성/스트리밍 상태가 있을 때만 거품 영역 표시 */}
        {(content || isStreaming || isGenerating || (isUser && attachedImages?.length > 0)) && (
          <div className={`relative px-5 py-4 rounded-3xl ${isUser ? 'bg-accent-pro text-white font-bold rounded-tr-sm shadow-lg shadow-accent-pro/10' : 'bg-white border border-border-default rounded-tl-sm text-text-primary shadow-sm'} ${isError ? 'border-red-200 bg-red-50 text-red-500' : ''}`}>
            
            {/* 사용자가 첨부한 이미지들 (텍스트 위) */}
            {isUser && attachedImages && attachedImages.length > 0 && (
              <div className={`flex flex-wrap gap-2 mb-3 ${content ? '' : 'mb-0'}`}>
                {attachedImages.map((img: string, i: number) => (
                  !failedImages.has(i) && (
                    <div key={i} className="rounded-xl overflow-hidden border-2 border-white/20 shadow-md">
                      <img
                        src={img}
                        alt="첨부 이미지"
                        className="max-w-[220px] max-h-[220px] object-cover"
                        onError={() => setFailedImages(prev => new Set(prev).add(i))}
                      />
                    </div>
                  )
                ))}
              </div>
            )}

            {/* 텍스트 스트리밍 중 */}
            {isStreaming && !content && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-[6px] py-1.5 px-1">
                  <div className="w-2 h-2 rounded-full bg-accent-pro/40 animate-pulse" />
                  <div className="w-2 h-2 rounded-full bg-accent-pro/30 animate-pulse delay-75" />
                  <div className="w-2 h-2 rounded-full bg-accent-pro/20 animate-pulse delay-150" />
                </div>
              </div>
            )}

            {/* 이미지 생성 중 (AI) */}
            {!isUser && isGenerating && (
              <div className="flex items-center justify-center py-10 px-8">
                <div className="relative w-12 h-12">
                  <div className="w-12 h-12 border-4 border-accent-flash border-t-transparent rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center text-lg">🎨</div>
                </div>
              </div>
            )}

            {/* 실제 텍스트 컨텐츠 */}
            {content && (
              <div className={`break-words whitespace-normal text-[14.5px] leading-relaxed markdown-body ${isUser ? 'text-white' : 'text-text-primary'}`}>
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    strong: ({node, ...props}) => <strong className="font-extrabold text-[1.05em]" {...props} />,
                    code: ({node, className, children, ...props}: any) => {
                      const match = /language-(\w+)/.exec(className || '');
                      const isInline = !match;
                      return !isInline ? (
                        <pre className="bg-slate-900 text-slate-100 border border-slate-700/60 rounded-xl p-4 my-3 overflow-x-auto font-mono text-[13px] leading-relaxed shadow-lg">
                          <code className={className} {...props}>
                            {children}
                          </code>
                        </pre>
                      ) : (
                        <code className={`font-mono px-[6px] py-[2px] rounded-[4px] text-[0.85em] ${isUser ? 'bg-white/20 text-white' : 'bg-slate-100 border border-slate-200 text-accent-pro/90'}`} {...props}>
                          {children}
                        </code>
                      );
                    },
                    h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-5 mb-2 border-b border-black/10 pb-1" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-[17px] font-black mt-5 mb-2" {...props} />,
                    h3: ({node, ...props}) => <h3 className="text-base font-bold mt-4 mb-2" {...props} />,
                    blockquote: ({node, ...props}) => <blockquote className={`border-l-4 pl-4 py-2 my-4 font-medium italic opacity-90 ${isUser ? 'border-white/40 bg-white/10' : 'border-accent-pro/30 bg-accent-pro/[0.03]'}`} {...props} />,
                    p: ({node, ...props}) => <p className="mb-2.5 last:mb-0 leading-[1.6]" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-3 space-y-1 block" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-3 space-y-1 block" {...props} />,
                    li: ({node, ...props}) => <li className="pl-1" {...props} />,
                    a: ({node, ...props}) => <a className={`${isUser ? 'text-white underline' : 'text-blue-500 hover:text-blue-600'} hover:underline font-medium`} target="_blank" rel="noopener noreferrer" {...props} />,
                    hr: ({node, ...props}) => <hr className={`my-4 border-t ${isUser ? 'border-white/30' : 'border-slate-200'}`} {...props} />,
                  }}
                >
                  {content}
                </ReactMarkdown>
                {isStreaming && content && <span className="inline-block w-[2.5px] h-[1.1em] bg-accent-pro ml-1 align-middle animate-pulse" />}
              </div>
            )}
          </div>
        )}

        {/* AI가 생성한 이미지 — 클릭 시 모달 확대 */}
        {!isUser && aiImageUrl && !isGenerating && (
          imageError ? (
            <div className="mt-4 px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-text-tertiary text-[12.5px] font-bold">
              이미지를 불러올 수 없습니다. 새로고침 후 다시 확인해 주세요.
            </div>
          ) : (
            <div
              className="mt-4 rounded-2xl overflow-hidden relative self-start bg-slate-100 border border-slate-200 shadow-xl group/img max-w-[480px] cursor-pointer"
              onClick={() => setModalImageUrl(aiImageUrl)}
            >
              {!imageLoaded && (
                <div className="flex items-center justify-center py-10 px-8">
                  <div className="w-8 h-8 border-3 border-slate-300 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <img
                src={aiImageUrl}
                alt="생성된 이미지"
                className={`block w-full h-auto rounded-2xl transition-all duration-700 ease-out ${imageLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95 absolute'}`}
                onLoad={() => setImageLoaded(true)}
                onError={() => { setImageLoaded(true); setImageError(true); }}
              />
              {/* hover 오버레이 */}
              {imageLoaded && (
                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-all duration-200 flex items-center justify-center">
                  <div className="opacity-0 group-hover/img:opacity-100 transition-all duration-200 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 backdrop-blur-sm text-white text-[13px] font-bold border border-white/30 shadow-lg">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      <line x1="11" y1="8" x2="11" y2="14" />
                      <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                    크게 보기
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {/* 하단 영역 (타임스탬프 + 액션 버튼) */}
        <div className={`relative mt-2 min-h-[24px] flex items-center ${isUser ? 'flex-row' : 'flex-row-reverse'}`}>
          {/* 타임스탬프 */}
          <span className="text-[10px] font-black text-text-tertiary uppercase tracking-wider opacity-60">
            {!isStreaming && !isGenerating && formatTime(timestamp)}
          </span>

          {/* 액션 버튼: 아이콘 형태 (복사, 수정) */}
          {isUser && !isStreaming && !isGenerating && (
            <div className="absolute right-0 top-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none group-hover:pointer-events-auto bg-white/80 backdrop-blur-sm px-2 py-1 rounded-xl border border-slate-200 shadow-sm">
              {/* 복사 버튼 */}
              <button 
                className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-accent-pro hover:bg-accent-pro/10 transition-colors"
                onClick={() => onCopy && onCopy(content)}
                title="복사"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[13px] h-[13px]">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
              
            </div>
          )}
        </div>
      </div>
      {/* 이미지 확대 모달 */}
      {modalImageUrl && (
        <ImageModal
          src={modalImageUrl}
          s3Key={imageS3Key}
          onClose={() => setModalImageUrl(null)}
        />
      )}
    </div>
  );
}
