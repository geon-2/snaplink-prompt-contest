import { useState, useCallback, useRef } from 'react';
import { streamTextChat, generateImage } from '../services/api';

/**
 * 채팅 기능을 관리하는 커스텀 훅
 *
 * @param {'text' | 'image'} type - 패널 타입
 * @returns {object} 채팅 상태 및 액션
 */
export function useChat(type) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef(null);

  const sendMessage = useCallback(
    async (prompt) => {
      if (!prompt.trim() || isLoading) return;

      // 이전 요청 취소
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // 사용자 메시지 추가
      const userMessage = {
        id: Date.now(),
        role: 'user',
        content: prompt,
        timestamp: new Date(),
      };

      // AI 응답 플레이스홀더
      const aiMessageId = Date.now() + 1;
      const aiMessage = {
        id: aiMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: type === 'text',
        isGenerating: type === 'image',
        type,
      };

      setMessages((prev) => [...prev, userMessage, aiMessage]);
      setIsLoading(true);

      try {
        if (type === 'text') {
          // 텍스트 스트리밍
          await streamTextChat(
            prompt,
            (chunk) => {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === aiMessageId
                    ? { ...msg, content: msg.content + chunk }
                    : msg
                )
              );
            },
            controller.signal
          );

          // 스트리밍 완료
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId ? { ...msg, isStreaming: false } : msg
            )
          );
        } else {
          // 이미지 생성
          const result = await generateImage(prompt, controller.signal);

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? {
                    ...msg,
                    content: result.description,
                    imageUrl: result.imageUrl,
                    isGenerating: false,
                  }
                : msg
            )
          );
        }
      } catch (error) {
        if (error.name === 'AbortError') return;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? {
                  ...msg,
                  content: '⚠️ 오류가 발생했습니다. 다시 시도해주세요.',
                  isStreaming: false,
                  isGenerating: false,
                  isError: true,
                }
              : msg
          )
        );
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [isLoading, type]
  );

  const clearMessages = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setIsLoading(false);
  }, []);

  return { messages, isLoading, sendMessage, clearMessages };
}
