import { useRef, useEffect, useState } from 'react';
import Message from '../Message/Message';
import InputBar from '../InputBar/InputBar';

/**
 * 채팅 패널 컴포넌트 (텍스트 또는 이미지)
 */
export default function ChatPanel({ variant, messages, isLoading, onSend, onStop, onRetry, onEdit }: any) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');

  const isPro = variant === 'pro';
  const modelName = isPro ? 'Gemini 3.1 Pro' : 'Gemini 3.1 Flash';
  const modelDesc = isPro ? '텍스트 채팅 · 스트리밍' : '이미지 생성 · 나노바나나';

  // 새 메시지 시 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (text: string, files?: File[]) => {
    onSend(text, files);
    setInputValue('');
  };

  const handleEdit = (msgId: string, content: string) => {
    if (onEdit) {
      onEdit(msgId);
    }
    setInputValue(content);
  };

  const handleRetry = (msgId: string, content: string) => {
    if (onRetry) {
      onRetry(msgId, content);
    }
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      // Optional: show a toast or feedback
    });
  };

  return (
    <div className="flex flex-col w-full h-full min-w-0 relative overflow-hidden" id={`panel-${variant}`}>
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
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-[6px] px-3 py-1.5 rounded-full text-[11px] font-black bg-slate-100 text-slate-500 border border-slate-200 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-pro animate-pulse" />
            Active
          </div>
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
              onRetry={(content: string) => handleRetry(msg.id, content)}
              onEdit={(content: string) => handleEdit(msg.id, content)}
              onCopy={(content: string) => handleCopy(content)}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <InputBar
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
