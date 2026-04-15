import { useState, useRef, useEffect } from 'react';
import './InputBar.css';

/**
 * 채팅 입력 바 컴포넌트
 *
 * @param {object} props
 * @param {function} props.onSend - 메시지 전송 콜백
 * @param {boolean} props.disabled - 비활성화 상태
 * @param {'pro' | 'flash'} props.variant - 테마 변형
 * @param {string} props.placeholder - 플레이스홀더 텍스트
 * @param {string[]} props.suggestions - 추천 프롬프트 목록
 */
export default function InputBar({
  onSend,
  disabled = false,
  variant = 'pro',
  placeholder = '메시지를 입력하세요...',
  suggestions = [],
}) {
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);

  // 텍스트영역 자동 높이 조절
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [value]);

  const handleSubmit = () => {
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestionClick = (suggestion) => {
    if (disabled) return;
    onSend(suggestion);
  };

  return (
    <div className="input-bar">
      {suggestions.length > 0 && (
        <div className="input-bar__suggestions">
          {suggestions.map((s, i) => (
            <button
              key={i}
              className="input-bar__suggestion"
              onClick={() => handleSuggestionClick(s)}
              disabled={disabled}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
      <div className={`input-bar__container ${variant === 'flash' ? 'input-bar__container--flash' : ''}`}>
        <textarea
          ref={textareaRef}
          className="input-bar__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          id={`input-${variant}`}
        />
        <button
          className={`input-bar__send ${variant === 'flash' ? 'input-bar__send--flash' : ''}`}
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          aria-label="메시지 전송"
          id={`send-btn-${variant}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
