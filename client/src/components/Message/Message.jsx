import { useEffect, useRef, useState } from 'react';
import './Message.css';

/**
 * 단일 채팅 메시지 컴포넌트
 *
 * @param {object} props
 * @param {object} props.message - 메시지 데이터
 * @param {'pro' | 'flash'} props.variant - 패널 테마 (색상 결정)
 */
export default function Message({ message, variant = 'pro' }) {
  const { role, content, timestamp, isStreaming, isGenerating, imageUrl, isError, type } = message;
  const isUser = role === 'user';
  const contentRef = useRef(null);

  // 이미지 로딩 Progress 시뮬레이션
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [content, isStreaming, isGenerating]);

  const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  // 간단한 마크다운 → HTML 변환
  const renderContent = (text) => {
    if (!text) return null;

    let html = text
      // 볼드
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // 인라인 코드
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // 코드 블록
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      // 헤더
      .replace(/^## (.+)$/gm, '<strong style="font-size: 1.05em; display: block; margin-top: 8px;">$1</strong>')
      .replace(/^> (.+)$/gm, '<blockquote style="border-left: 3px solid var(--border-default); padding-left: 12px; color: var(--text-secondary); margin: 8px 0; font-style: italic;">$1</blockquote>');

    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  };

  return (
    <div
      ref={contentRef}
      className={`message message--${role} ${isError ? 'message--error' : ''}`}
    >
      {/* Avatar */}
      <div className={`message__avatar message__avatar--${variant}`}>
        {isUser ? '👤' : variant === 'pro' ? '✦' : '🎨'}
      </div>

      {/* Content */}
      <div className="message__bubble">
        {/* 텍스트 스트리밍 중 */}
        {isStreaming && !content && (
          <div className="message__loading">
            <div className="typing-indicator">
              <div className="typing-indicator__dot" />
              <div className="typing-indicator__dot" />
              <div className="typing-indicator__dot" />
            </div>
          </div>
        )}

        {/* 이미지 생성 중 */}
        {isGenerating && (
          <div className="image-loading">
            <div className="image-loading__spinner" />
            <div className="image-loading__text">
              🎨 나노바나나가 이미지를 생성하고 있습니다...
            </div>
            <div className="image-loading__progress">
              <div className="image-loading__progress-bar" />
            </div>
          </div>
        )}

        {/* 실제 컨텐츠 */}
        {content && (
          <div className="message__content">
            {isUser ? content : renderContent(content)}
            {isStreaming && content && <span className="message__cursor" />}
          </div>
        )}

        {/* 생성된 이미지 */}
        {imageUrl && !isGenerating && (
          <div className="message__image-container">
            <img
              src={imageUrl}
              alt="생성된 이미지"
              className={`message__image ${imageLoaded ? '' : 'loading'}`}
              onLoad={() => setImageLoaded(true)}
              loading="lazy"
            />
          </div>
        )}

        {/* 타임스탬프 */}
        {!isStreaming && !isGenerating && (
          <span className="message__time">{formatTime(timestamp)}</span>
        )}
      </div>
    </div>
  );
}
