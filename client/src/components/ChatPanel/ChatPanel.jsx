import { useRef, useEffect } from 'react';
import Message from '../Message/Message';
import InputBar from '../InputBar/InputBar';
import './ChatPanel.css';

/**
 * 채팅 패널 컴포넌트 (텍스트 또는 이미지)
 *
 * @param {object} props
 * @param {'pro' | 'flash'} props.variant - 패널 타입
 * @param {object[]} props.messages - 메시지 목록
 * @param {boolean} props.isLoading - 로딩 상태
 * @param {function} props.onSend - 메시지 전송 콜백
 * @param {function} props.onClear - 대화 초기화 콜백
 */
export default function ChatPanel({ variant, messages, isLoading, onSend, onClear }) {
  const messagesEndRef = useRef(null);

  const isPro = variant === 'pro';
  const modelName = isPro ? 'Gemini 3.1 Pro' : 'Gemini 3.1 Flash';
  const modelDesc = isPro ? '텍스트 채팅 · 스트리밍' : '이미지 생성 · 나노바나나';

  // 새 메시지 시 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const suggestions = isPro
    ? [
        '프롬프트 작성법 알려줘',
        '이 프롬프트를 평가해줘',
        '좋은 프롬프트 예시를 보여줘',
      ]
    : [
        '고양이가 우주를 여행하는 그림',
        '사이버펑크 도시의 야경',
        '수채화 스타일 벚꽃 풍경',
      ];

  return (
    <div className="chat-panel" id={`panel-${variant}`}>
      {/* Header */}
      <div className="chat-panel__header">
        <div className="chat-panel__header-left">
          <div className={`chat-panel__model-icon chat-panel__model-icon--${variant}`}>
            {isPro ? '✦' : '🎨'}
          </div>
          <div className="chat-panel__model-info">
            <span className="chat-panel__model-name">{modelName}</span>
            <span className="chat-panel__model-desc">{modelDesc}</span>
          </div>
        </div>
        <div className="chat-panel__header-actions">
          <div className="chat-panel__status chat-panel__status--active">
            <span className="chat-panel__status-dot" />
            Active
          </div>
          <button
            className="chat-panel__action-btn"
            onClick={onClear}
            title="대화 초기화"
            id={`clear-btn-${variant}`}
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-panel__messages" id={`messages-${variant}`}>
        {messages.length === 0 ? (
          <div className="chat-panel__empty">
            <div className={`chat-panel__empty-icon chat-panel__empty-icon--${variant}`}>
              {isPro ? '✦' : '🎨'}
            </div>
            <div className="chat-panel__empty-title">
              {isPro ? 'Gemini Pro와 대화하기' : '나노바나나로 이미지 생성'}
            </div>
            <div className="chat-panel__empty-desc">
              {isPro
                ? '프롬프트에 대해 질문하고, 평가받고, 개선 방법을 알아보세요.'
                : '원하는 이미지를 텍스트로 설명하면 나노바나나가 생성해드립니다.'}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <Message key={msg.id} message={msg} variant={variant} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <InputBar
        onSend={onSend}
        disabled={isLoading}
        variant={variant}
        placeholder={isPro ? '프롬프트에 대해 물어보세요...' : '생성할 이미지를 설명하세요...'}
        suggestions={messages.length === 0 ? suggestions : []}
      />
    </div>
  );
}
