import { useState, useCallback, useRef, useEffect } from 'react';
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

  // 세대 카운터 제거: 대신 각 스트림이 자신의 Message 객체를 클로저와 activeStreams 맵으로 관리
  const activeStreams = useRef<Map<string, Message>>(new Map());
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  const cancelPoll = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  useEffect(() => () => cancelPoll(), [cancelPoll]);

  /**
   * 메시지 전송 — SSE 스트리밍 처리
   */
  const sendMessage = useCallback(
    async (prompt: string, files?: File[], partnerChatId?: string) => {
      if ((!prompt.trim() && (!files || files.length === 0)) || isLoading) return;

      const uuid = getUserUuid();
      if (!uuid) return;

      cancelPoll();

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const tempUserMsgId = `temp-user-${Date.now()}`;
      const userMessage: Message = {
        id: tempUserMsgId,
        role: 'user',
        content: prompt,
        timestamp: new Date().toISOString(),
        type,
        attachedImages: files ? files.map(file => URL.createObjectURL(file)) : undefined,
      };

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
      let activeMsg = aiMessage;
      let streamChatId = chatId;

      // 현재 진행 중인 메시지 상태를 업데이트하고, Global Map과 현재 UI(messages)에 동기화
      const updateActiveMessage = (updater: (msg: Message) => Message) => {
        activeMsg = updater(activeMsg);
        if (streamChatId) {
          activeStreams.current.set(streamChatId, activeMsg);
        }
        setMessages((prev) => 
          prev.map((msg) => (msg.id === resolvedAiMsgId || msg.id === tempAiMsgId ? activeMsg : msg))
        );
      };

      // 만약 기존 채팅방이면 바로 Map에 등록
      if (streamChatId) {
        activeStreams.current.set(streamChatId, activeMsg);
      }

      try {
        await streamChatCompletion({
          uuid,
          chatId: chatId ?? undefined,
          partnerChatId,
          type,
          text: prompt,
          files,
          signal: controller.signal,

          onMeta: (data) => {
            const isNewChat = !chatId;
            setChatId(data.chat_id);
            streamChatId = data.chat_id;
            resolvedAiMsgId = data.message_id;

            activeMsg = { ...activeMsg, id: data.message_id };
            activeStreams.current.set(streamChatId, activeMsg);

            if (isNewChat && onNewChatCreated) {
              onNewChatCreated(data.chat_id);
            }

            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id === tempUserMsgId) return { ...msg, id: data.user_message_id };
                if (msg.id === tempAiMsgId) return activeMsg;
                return msg;
              })
            );
          },

          onTextDelta: (data) => {
            updateActiveMessage(msg => ({ ...msg, content: msg.content + data.delta }));
          },

          onImage: (data) => {
            let imageUrl: string | undefined;
            if (data.data) {
              imageUrl = `data:${data.mime_type ?? 'image/png'};base64,${data.data}`;
            } else if (data.s3_key) {
              imageUrl = getImageUrl(data.s3_key);
            }
            updateActiveMessage(msg => ({ ...msg, imageS3Key: data.s3_key, imageUrl, isGenerating: false }));
          },

          onDone: () => {
            updateActiveMessage(msg => ({ ...msg, isStreaming: false, isGenerating: false }));
            if (streamChatId) activeStreams.current.delete(streamChatId);
          },

          onError: (data) => {
            updateActiveMessage(msg => ({
              ...msg,
              content: `⚠️ ${data.message || '오류가 발생했습니다.'}`,
              isStreaming: false,
              isGenerating: false,
              isError: true,
            }));
            if (streamChatId) activeStreams.current.delete(streamChatId);
          },
        });
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') return;

        updateActiveMessage(msg => ({
          ...msg,
          content: '⚠️ 오류가 발생했습니다. 다시 시도해주세요.',
          isStreaming: false,
          isGenerating: false,
          isError: true,
        }));
        if (streamChatId) activeStreams.current.delete(streamChatId);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [isLoading, type, chatId, cancelPoll]
  );

  /**
   * 기존 채팅 로드 (세션 전환 시)
   *
   * 진행 중인 스트림을 중단하지 않는다.
   * 백그라운드에 진행 중인 메시지가 있다면 messages 배열의 끝에 병합한다.
   */
  const loadChat = useCallback(async (targetChatId: string) => {
    const uuid = getUserUuid();
    if (!uuid) return;

    cancelPoll();
    setIsLoading(false);

    try {
      const detail = await fetchChatDetail(targetChatId, uuid);
      setChatId(targetChatId);

      const loadedMsgs = detail.messages.map(apiMessageToUiMessage);

      // Case 1: 같은 세션 내 채팅 전환 — 백그라운드 스트림이 살아있으면 복원
      if (activeStreams.current.has(targetChatId)) {
        loadedMsgs.push(activeStreams.current.get(targetChatId)!);
        setMessages(loadedMsgs);
        setIsLoading(true);
        return;
      }

      // Case 2: 페이지 새로고침 후 재진입 — 마지막 메시지가 user면 서버가 아직 처리 중
      const lastApiMsg = detail.messages[detail.messages.length - 1];
      if (lastApiMsg?.role === 'user') {
        const placeholder: Message = {
          id: `pending-${targetChatId}`,
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
          type,
          isStreaming: type === 'chat',
          isGenerating: type === 'image',
        };
        setMessages([...loadedMsgs, placeholder]);
        setIsLoading(true);

        const MAX_POLLS = 60; // 2분
        pollCountRef.current = 0;
        pollIntervalRef.current = setInterval(async () => {
          pollCountRef.current += 1;
          if (pollCountRef.current > MAX_POLLS) {
            cancelPoll();
            setIsLoading(false);
            return;
          }
          try {
            const updated = await fetchChatDetail(targetChatId, uuid);
            const updatedLast = updated.messages[updated.messages.length - 1];
            if (updatedLast?.role === 'assistant') {
              cancelPoll();
              setMessages(updated.messages.map(apiMessageToUiMessage));
              setIsLoading(false);
            }
          } catch {
            // 폴링 에러는 무시하고 재시도
          }
        }, 2000);
        return;
      }

      setMessages(loadedMsgs);
    } catch (error) {
      console.error('Failed to load chat:', error);
    }
  }, [type, cancelPoll]);

  /**
   * 새 채팅으로 초기화 (새 세션 시작 시)
   */
  const clearMessages = useCallback(() => {
    cancelPoll();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setChatId(null);
    setMessages([]);
    setIsLoading(false);
  }, [cancelPoll]);

  /**
   * 특정 메시지까지 롤백 (재요청/수정용)
   */
  const rollbackTo = useCallback((messageId: string) => {
    cancelPoll();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx === -1) return prev;
      return prev.slice(0, idx);
    });
    setIsLoading(false);
  }, [cancelPoll]);

  /**
   * 생성 중단
   */
  const stopGeneration = useCallback(() => {
    cancelPoll();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  }, [cancelPoll]);

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

