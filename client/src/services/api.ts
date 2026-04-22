import type {
  ChatCompletionParams,
  ChatListItem,
  ChatDetailResponse,
  ApiMessage,
  UsageInfo,
} from '../types';

const API_BASE = '/api';

/**
 * POST /api/chat/completion — SSE 스트리밍
 *
 * 요청 중단(signal)은 서버 미지원으로 비활성화.
 */
export async function streamChatCompletion(params: ChatCompletionParams): Promise<void> {
  const { uuid, chatId, type, text, files, onMeta, onTextDelta, onImage, onDone, onError } = params;

  const formData = new FormData();
  formData.append('uuid', uuid);
  if (chatId) formData.append('chat_id', chatId);
  formData.append('type', type);
  if (text) formData.append('text', text);
  if (files?.length) files.forEach((f) => formData.append('files', f));

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/chat/completion`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
  } catch (err) {
    onError({ message: '서버에 연결할 수 없습니다.' });
    return;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    onError({ message: body.detail || `서버 오류 (${response.status})` });
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEventType = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const raw = line.slice(6);
          try {
            const data = JSON.parse(raw);
            switch (currentEventType) {
              case 'meta':
                onMeta({
                  chat_id: data.chat_id,
                  // 서버는 message_id를 반환하지 않으므로 합성
                  message_id: `ai-${data.user_message_id}`,
                  user_message_id: data.user_message_id,
                });
                break;
              case 'text_delta':
                // 서버는 { text } 로 전송, 클라이언트 인터페이스는 { delta }
                onTextDelta({ delta: data.text });
                break;
              case 'image':
                onImage({ s3_key: data.s3_key });
                break;
              case 'done':
                onDone();
                break;
              case 'error':
                onError({ message: data.detail || '오류가 발생했습니다.' });
                break;
            }
          } catch {
            // JSON 파싱 실패 무시
          }
          currentEventType = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * GET /api/chats — 채팅 목록
 */
export async function fetchChats(uuid: string): Promise<ChatListItem[]> {
  const resp = await fetch(`${API_BASE}/chats?uuid=${uuid}`, {
    credentials: 'include',
  });
  if (!resp.ok) throw new Error(`채팅 목록 로드 실패 (${resp.status})`);
  return resp.json();
}

/**
 * GET /api/chats/:chat_id — 채팅 상세 (메시지 포함)
 */
export async function fetchChatDetail(chatId: string, uuid: string): Promise<ChatDetailResponse> {
  const resp = await fetch(`${API_BASE}/chats/${chatId}?uuid=${uuid}`, {
    credentials: 'include',
  });
  if (!resp.ok) throw new Error(`채팅 상세 로드 실패 (${resp.status})`);

  const data = await resp.json();

  // 서버 응답은 chat과 messages가 평탄화되어 있음 → ChatDetailResponse 형태로 변환
  const chat: ChatListItem = {
    chat_id: data.chat_id,
    last_message_preview: data.last_message_preview,
    last_message_type: data.last_message_type,
    last_message_at: data.last_message_at,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };

  const messages: ApiMessage[] = (data.messages ?? []).map((m: any) => ({
    message_id: m.message_id,
    chat_id: chatId,
    role: m.role,
    type: m.type,
    text_content: m.text_content,
    image_s3_key: m.image_s3_key,
    created_at: m.created_at,
  }));

  return { chat, messages };
}

/**
 * GET /api/usage/me — 사용량 조회
 */
export async function fetchUsage(_uuid: string): Promise<UsageInfo> {
  const resp = await fetch(`${API_BASE}/usage/me`, {
    credentials: 'include',
  });
  if (!resp.ok) return { used: 0, budget: 10 };

  const data = await resp.json();
  return {
    used: parseFloat(data.used_usd ?? '0'),
    budget: parseFloat(data.limit_usd ?? '10'),
  };
}
