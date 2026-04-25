import { useState, useCallback, useRef } from 'react';
import { streamChatCompletion, fetchChatDetail } from '../services/api';
import { getUserUuid } from '../services/auth';
import { getImageUrl } from '../utils/s3';
import type { Message, ChatType, ApiMessage } from '../types';

/**
 * API 메시지 → UI 메시지 변환
 *
 * image_url은 무시하고 image_s3_key → CloudFront URL로 변환.
 * 사용자 메시지의 경우 S3 이미지를 attachedImages로 매핑하여
 * 채팅 히스토리 재조회 시에도 첨부 이미지가 표시되게 한다.
 */
function apiMessageToUiMessage(msg: ApiMessage): Message {
  const imageFromS3 = msg.image_s3_key ? getImageUrl(msg.image_s3_key) : undefined;

  return {
    id: msg.message_id,
    role: msg.role,
    content: msg.text_content ?? '',
    timestamp: msg.created_at,
    type: msg.type,
    imageS3Key: msg.image_s3_key || undefined,
    // AI 메시지: imageUrl로 표시 / 사용자 메시지: attachedImages로 표시
    imageUrl: msg.role === 'assistant' ? imageFromS3 : undefined,
    attachedImages: msg.role === 'user' && imageFromS3 ? [imageFromS3] : undefined,
  };
}

/**
 * 채팅 기능을 관리하는 커스텀 훅
 *
 * 백엔드 POST /chat/completion SSE 스트리밍을 처리한다.
 * 세션 전환 시 진행 중인 스트림을 중단하지 않고 백그라운드에서 완료시킨다.
 * generationRef를 통해 이전 세션의 콜백이 현재 UI에 영향을 주지 않도록 제어한다.
 *
 * @param type - 패널 타입 ('chat' | 'image')
 */
export function useChat(type: ChatType, onNewChatCreated?: (chatId: string) => void) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 세대 카운터: 세션 전환 시 증가하여 이전 스트림의 콜백이 UI를 변경하지 않도록 함
  const generationRef = useRef(0);

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

      // 이전 요청 취소 (같은 세션 내에서 연속 전송 시)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // 현재 세대를 캡처 — 콜백에서 세대가 변경되었으면 무시
      const thisGeneration = generationRef.current;
      const isStale = () => generationRef.current !== thisGeneration;

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
            if (isStale()) return; // 세션 전환 후엔 무시

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
            if (isStale()) return;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === resolvedAiMsgId || msg.id === tempAiMsgId
                  ? { ...msg, content: msg.content + data.delta }
                  : msg
              )
            );
          },

          onImage: (data) => {
            if (isStale()) return;
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
            if (isStale()) return;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === resolvedAiMsgId || msg.id === tempAiMsgId
                  ? { ...msg, isStreaming: false, isGenerating: false }
                  : msg
              )
            );
          },

          onError: (data) => {
            if (isStale()) return;
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
        if (isStale()) return;

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
        if (!isStale()) {
          setIsLoading(false);
        }
        abortControllerRef.current = null;
      }
    },
    [isLoading, type, chatId]
  );

  /**
   * 기존 채팅 로드 (세션 전환 시)
   *
   * 진행 중인 스트림을 중단하지 않는다.
   * 세대 카운터를 증가시켜 이전 스트림 콜백이 UI에 영향을 주지 않게 한다.
   * 서버에서 완료된 메시지를 불러온다.
   */
  const loadChat = useCallback(async (targetChatId: string) => {
    const uuid = getUserUuid();
    if (!uuid) return;

    // 세대 증가 → 이전 스트림 콜백 무효화 (스트림 자체는 유지)
    generationRef.current++;
    setIsLoading(false);

    try {
      const detail = await fetchChatDetail(targetChatId, uuid);
      setChatId(targetChatId);
      setMessages(detail.messages.map(apiMessageToUiMessage));
    } catch (error) {
      console.error('Failed to load chat:', error);
    }
  }, []);

  /**
   * 새 채팅으로 초기화 (새 세션 시작 시)
   *
   * 진행 중인 스트림을 중단하고 모든 상태를 초기화한다.
   */
  const clearMessages = useCallback(() => {
    generationRef.current++; // 콜백 무효화
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
    generationRef.current++;
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

