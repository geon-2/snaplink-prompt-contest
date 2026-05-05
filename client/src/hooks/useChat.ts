import { useState, useCallback, useRef, useEffect } from 'react';
import { streamChatCompletion, fetchChatDetail, fetchChats } from '../services/api';
import { getUserUuid } from '../services/auth';
import { getImageUrl } from '../utils/s3';
import type { Message, ChatType, ApiMessage, ChatDetailResponse, ChatListItem } from '../types';

const RECOVERY_POLL_INTERVAL_MS = 2000;
const RECOVERY_MAX_POLLS = 150; // 5분
const RECOVERY_SESSION_GRACE_MS = 10000;
const STARTUP_TIMEOUT_RECOVERY_MESSAGE = '이미지 생성이 계속 진행 중입니다. 완료되면 자동으로 표시됩니다.';
const RECOVERY_EXPIRED_MESSAGE = '아직 완료되지 않았습니다. 잠시 후 새로고침하거나 세션을 다시 열어 확인해주세요.';

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

function normalizePreview(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 120);
}

function getSessionTimeMs(session: ChatListItem): number {
  const times = [session.last_message_at, session.updated_at, session.created_at]
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  return times.length > 0 ? Math.max(...times) : 0;
}

function findRecoverySession(
  sessions: ChatListItem[],
  prompt: string,
  requestStartedAtMs: number
): ChatListItem | null {
  const promptPreview = normalizePreview(prompt);
  const earliestAcceptedTime = requestStartedAtMs - RECOVERY_SESSION_GRACE_MS;
  const candidates = sessions
    .filter((session) => session.last_message_type === 'image')
    .filter((session) => getSessionTimeMs(session) >= earliestAcceptedTime)
    .sort((a, b) => getSessionTimeMs(b) - getSessionTimeMs(a));

  const previewMatch = candidates.find((session) => {
    const sessionPreview = normalizePreview(session.last_message_preview);
    return (
      promptPreview.length > 0 &&
      sessionPreview.length > 0 &&
      (sessionPreview === promptPreview ||
        promptPreview.startsWith(sessionPreview) ||
        sessionPreview.startsWith(promptPreview))
    );
  });

  return previewMatch ?? candidates[0] ?? null;
}

function hasRecoveredAssistant(
  detail: ChatDetailResponse,
  knownMessageIds: Set<string>,
  requestStartedAtMs: number
): boolean {
  const lastMessage = detail.messages[detail.messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'assistant') return false;
  if (knownMessageIds.has(lastMessage.message_id)) return false;

  const createdAtMs = Date.parse(lastMessage.created_at);
  return !Number.isFinite(createdAtMs) || createdAtMs >= requestStartedAtMs - RECOVERY_SESSION_GRACE_MS;
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
export function useChat(
  type: ChatType,
  onNewChatCreated?: (chatId: string) => void,
  onChatUpdated?: () => void
) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 세대 카운터 제거: 대신 각 스트림이 자신의 Message 객체를 클로저와 activeStreams 맵으로 관리
  const activeStreams = useRef<Map<string, Message>>(new Map());
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const pollRunIdRef = useRef(0);
  // loadChat race condition 방지: 마지막으로 요청한 chatId 추적
  const latestLoadChatIdRef = useRef<string | null>(null);

  const cancelPoll = useCallback(() => {
    pollRunIdRef.current += 1;
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
      const requestStartedAtMs = Date.now();
      const knownMessageIds = new Set(messages.map((message) => message.id));

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
      let keepLoadingAfterRequest = false;

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

      const startImageRecoveryPoll = (initialChatId: string | null) => {
        let targetChatId = initialChatId;
        let pollInFlight = false;
        const pollRunId = ++pollRunIdRef.current;
        pollCountRef.current = 0;
        setIsLoading(true);

        const finishRecovery = (detail: ChatDetailResponse) => {
          cancelPoll();
          if (targetChatId) {
            activeStreams.current.delete(targetChatId);
          }
          setMessages(detail.messages.map(apiMessageToUiMessage));
          setIsLoading(false);
          onChatUpdated?.();
        };

        const expireRecovery = () => {
          cancelPoll();
          updateActiveMessage((msg) => ({
            ...msg,
            content: RECOVERY_EXPIRED_MESSAGE,
            isStreaming: false,
            isGenerating: false,
            isError: false,
          }));
          if (targetChatId) {
            activeStreams.current.delete(targetChatId);
          }
          setIsLoading(false);
          onChatUpdated?.();
        };

        const pollOnce = async () => {
          if (pollRunIdRef.current !== pollRunId || pollInFlight) return;
          pollInFlight = true;
          pollCountRef.current += 1;

          if (pollCountRef.current > RECOVERY_MAX_POLLS) {
            pollInFlight = false;
            expireRecovery();
            return;
          }

          try {
            if (!targetChatId) {
              const sessions = await fetchChats(uuid);
              if (pollRunIdRef.current !== pollRunId) return;
              const recoveredSession = findRecoverySession(sessions, prompt, requestStartedAtMs);
              if (!recoveredSession) return;

              targetChatId = recoveredSession.chat_id;
              streamChatId = recoveredSession.chat_id;
              latestLoadChatIdRef.current = recoveredSession.chat_id;
              setChatId(recoveredSession.chat_id);
              onNewChatCreated?.(recoveredSession.chat_id);
            }

            const detail = await fetchChatDetail(targetChatId, uuid);
            if (pollRunIdRef.current !== pollRunId) return;
            if (hasRecoveredAssistant(detail, knownMessageIds, requestStartedAtMs)) {
              finishRecovery(detail);
            }
          } catch {
            // 복구 폴링은 일시적인 조회 실패를 무시하고 다음 tick에서 재시도한다.
          } finally {
            pollInFlight = false;
          }
        };

        pollIntervalRef.current = setInterval(() => {
          void pollOnce();
        }, RECOVERY_POLL_INTERVAL_MS);
        void pollOnce();
      };

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

          onStartupTimeout: () => {
            keepLoadingAfterRequest = true;
            updateActiveMessage((msg) => ({
              ...msg,
              content: STARTUP_TIMEOUT_RECOVERY_MESSAGE,
              isStreaming: false,
              isGenerating: true,
              isError: false,
            }));
            if (streamChatId) {
              activeStreams.current.delete(streamChatId);
            }
            startImageRecoveryPoll(streamChatId);
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
        if (!keepLoadingAfterRequest) {
          setIsLoading(false);
        }
        abortControllerRef.current = null;
      }
    },
    [isLoading, type, chatId, messages, cancelPoll, onNewChatCreated, onChatUpdated]
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
    latestLoadChatIdRef.current = targetChatId;

    try {
      const detail = await fetchChatDetail(targetChatId, uuid);

      // 응답 도착 시점에 다른 채팅방으로 이미 전환됐으면 stale 응답 무시
      if (latestLoadChatIdRef.current !== targetChatId) return;
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

        const knownMessageIds = new Set(detail.messages.map((message) => message.message_id));
        const pollStartedAtMs = Date.now();
        pollCountRef.current = 0;
        const pollRunId = ++pollRunIdRef.current;
        pollIntervalRef.current = setInterval(async () => {
          if (pollRunIdRef.current !== pollRunId) return;
          pollCountRef.current += 1;
          if (pollCountRef.current > RECOVERY_MAX_POLLS) {
            cancelPoll();
            setMessages((prev) =>
              prev.map((message) =>
                message.id === placeholder.id
                  ? {
                      ...message,
                      content: RECOVERY_EXPIRED_MESSAGE,
                      isStreaming: false,
                      isGenerating: false,
                    }
                  : message
              )
            );
            setIsLoading(false);
            return;
          }
          try {
            const updated = await fetchChatDetail(targetChatId, uuid);
            if (pollRunIdRef.current !== pollRunId) return;
            if (hasRecoveredAssistant(updated, knownMessageIds, pollStartedAtMs)) {
              cancelPoll();
              setMessages(updated.messages.map(apiMessageToUiMessage));
              setIsLoading(false);
              onChatUpdated?.();
            }
          } catch {
            // 폴링 에러는 무시하고 재시도
          }
        }, RECOVERY_POLL_INTERVAL_MS);
        return;
      }

      setMessages(loadedMsgs);
    } catch (error) {
      console.error('Failed to load chat:', error);
    }
  }, [type, cancelPoll, onChatUpdated]);

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
    }
    setIsLoading(false);
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
