import { useState, useCallback, useRef } from 'react';
import { streamChatCompletion, fetchChatDetail } from '../services/api';
import { getUserUuid } from '../services/auth';
import { getImageUrl } from '../utils/s3';
import type { Message, ChatType, ApiMessage } from '../types';

/**
 * API 메시지 → UI 메시지 변환
 */
function apiMessageToUiMessage(msg: ApiMessage): Message {
  return {
    id: msg.message_id,
    role: msg.role,
    content: msg.text_content ?? '',
    timestamp: msg.created_at,
    type: msg.type,
    imageS3Key: msg.image_s3_key || undefined,
    imageUrl: msg.image_url || (msg.image_s3_key ? getImageUrl(msg.image_s3_key) : undefined),
    attachedImages: msg.attached_images,
  };
}

/**
 * 채팅 기능을 관리하는 커스텀 훅
 *
 * 백엔드 POST /chat/completion SSE 스트리밍을 처리한다.
 *
 * @param type - 패널 타입 ('chat' | 'image')
 */
export function useChat(type: ChatType, onNewChatCreated?: (chatId: string) => void) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * 메시지 전송 — SSE 스트리밍 처리
   */
  const sendMessage = useCallback(
    async (prompt: string, files?: File[], partnerChatId?: string) => {
      if ((!prompt.trim() && (!files || files.length === 0)) || isLoading) return;

      const uuid = getUserUuid();
      if (!uuid) {
        console.error('User not authenticated');
        return;
      }

      // 이전 요청 취소
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // 낙관적 UI: 사용자 메시지 즉시 추가 (ID는 서버 meta 이벤트로 업데이트)
      const tempUserMsgId = `temp-user-${Date.now()}`;
      const userMessage: Message = {
        id: tempUserMsgId,
        role: 'user',
        content: prompt,
        timestamp: new Date().toISOString(),
        type,
        attachedImages: files ? files.map(file => URL.createObjectURL(file)) : undefined,
      };

      // AI 응답 플레이스홀더
      const tempAiMsgId = `temp-ai-${Date.now()}`;
      const aiMessage: Message = {
        id: tempAiMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        type,
        isStreaming: type === 'chat',
        isGenerating: type === 'image',
      };

      setMessages((prev) => [...prev, userMessage, aiMessage]);
      setIsLoading(true);

      let resolvedAiMsgId = tempAiMsgId;

      try {
        await streamChatCompletion({
          uuid,
          chatId: chatId ?? undefined,
          partnerChatId, // 파트너 ID 전달
          type,
          text: prompt,
          files,
          signal: controller.signal,

          onMeta: (data) => {
            // 서버에서 실제 chat_id, message_id 수신
            const isNewChat = !chatId;
            setChatId(data.chat_id);
            resolvedAiMsgId = data.message_id;

            if (isNewChat && onNewChatCreated) {
              onNewChatCreated(data.chat_id);
            }

            // temp ID를 서버 ID로 교체
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id === tempUserMsgId) {
                  return { ...msg, id: data.user_message_id };
                }
                if (msg.id === tempAiMsgId) {
                  return { ...msg, id: data.message_id };
                }
                return msg;
              })
            );
          },

          onTextDelta: (data) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === resolvedAiMsgId || msg.id === tempAiMsgId
                  ? { ...msg, content: msg.content + data.delta }
                  : msg
              )
            );
          },

          onImage: (data) => {
            let imageUrl: string | undefined;
            if (data.data) {
              // base64 인라인 데이터가 있으면 data URL 사용
              imageUrl = `data:${data.mime_type ?? 'image/png'};base64,${data.data}`;
            } else if (data.s3_key) {
              // s3_key만 있으면 CloudFront URL로 변환
              imageUrl = getImageUrl(data.s3_key);
            }
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === resolvedAiMsgId || msg.id === tempAiMsgId
                  ? { ...msg, imageS3Key: data.s3_key, imageUrl, isGenerating: false }
                  : msg
              )
            );
          },

          onDone: () => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === resolvedAiMsgId || msg.id === tempAiMsgId
                  ? { ...msg, isStreaming: false, isGenerating: false }
                  : msg
              )
            );
          },

          onError: (data) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === resolvedAiMsgId || msg.id === tempAiMsgId
                  ? {
                      ...msg,
                      content: `⚠️ ${data.message || '오류가 발생했습니다.'}`,
                      isStreaming: false,
                      isGenerating: false,
                      isError: true,
                    }
                  : msg
              )
            );
          },
        });
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') return;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === resolvedAiMsgId || msg.id === tempAiMsgId
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
    [isLoading, type, chatId]
  );

  /**
   * 기존 채팅 로드 (세션 전환 시)
   */
  const loadChat = useCallback(async (targetChatId: string) => {
    const uuid = getUserUuid();
    if (!uuid) return;

    try {
      const detail = await fetchChatDetail(targetChatId, uuid);
      setChatId(targetChatId);
      setMessages(detail.messages.map(apiMessageToUiMessage));
    } catch (error) {
      console.error('Failed to load chat:', error);
    }
  }, []);

  /**
   * 메시지 초기화
   */
  const clearMessages = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setChatId(null);
    setMessages([]);
    setIsLoading(false);
  }, []);

  /**
   * 특정 메시지까지 롤백 (재요청/수정용)
   */
  const rollbackTo = useCallback((messageId: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx === -1) return prev;
      return prev.slice(0, idx);
    });
    setIsLoading(false);
  }, []);

  /**
   * 생성 중단
   */
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  }, []);

  return {
    chatId,
    messages,
    isLoading,
    sendMessage,
    stopGeneration,
    loadChat,
    clearMessages,
    rollbackTo,
  };
}

