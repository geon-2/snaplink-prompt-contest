/**
 * API 서비스 레이어 (지속성 Mock 버전)
 *
 * LocalStorage를 사용하여 대화 내역을 브라우저에 저장합니다.
 * 실제 백엔드가 준비되면 USE_MOCK 플래그를 꺼서 전환할 수 있습니다.
 */

import type {
  ChatCompletionParams,
  ChatListItem,
  ChatDetailResponse,
  ApiMessage,
} from '../types';

const STORAGE_KEYS = {
  CHATS: 'PA_CHATS',
  MESSAGES: 'PA_MESSAGES',
  GROUP_MAP: 'PA_GROUP_MAP', // { id1: id2, id2: id1 } 매핑 저장
};

// ─── 그룹 매핑 헬퍼 ───
function bindPartner(id1: string, id2: string) {
  const map = getStorage<Record<string, string>>(STORAGE_KEYS.GROUP_MAP, {});
  map[id1] = id2;
  map[id2] = id1;
  saveStorage(STORAGE_KEYS.GROUP_MAP, map);
}

// ─── SessionStorage 헬퍼 ───

function getStorage<T>(key: string, defaultValue: T): T {
  const data = sessionStorage.getItem(key);
  return data ? JSON.parse(data) : defaultValue;
}

function saveStorage<T>(key: string, data: T): void {
  sessionStorage.setItem(key, JSON.stringify(data));
}

// ─── 설정 ───
const API_BASE_URL = 'http://localhost:5174/api'; // 백엔드 주소
const USE_REAL_API = false; // 현재 실제 백엔드가 없으므로 false로 설정하여 502 에러 방지

// ─── Mock 데이터 & 시뮬레이션 ───

const MOCK_BOT_RESPONSES = [
  "반갑습니다! 프롬프트 아레나에 오신 것을 환영합니다. 무엇을 도와드릴까요?",
  "좋은 프롬프트를 작성하려면 명확한 페르소나와 제약 조건을 설정하는 것이 중요합니다.",
  "현재 입력하신 프롬프트는 가독성이 좋고 구체적이네요. **A등급**을 드릴 수 있겠습니다!",
  "이미지를 생성할 때는 예술적 스타일(예: 수채화, 사이버펑크)과 조명 설정을 추가해보세요.",
];

// ─── 유틸 ───
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * POST /chat/completion (지속성 Mock SSE)
 */
export async function streamChatCompletion(params: ChatCompletionParams): Promise<void> {
  const { chatId: existingChatId, type, text, onMeta, onTextDelta, onImage, onDone, signal, partnerChatId, files } = params;

  const chatId = existingChatId || `chat-${Date.now()}`;
  const userMsgId = `msg-u-${Date.now()}`;
  const aiMsgId = `msg-a-${Date.now()}`;

  // 파트너 ID가 있으면 명시적으로 묶음
  if (partnerChatId && partnerChatId !== chatId) {
    bindPartner(chatId, partnerChatId);
  }

  // 1. Meta 전송
  onMeta({
    chat_id: chatId,
    message_id: aiMsgId,
    user_message_id: userMsgId,
  });

  // 첨부 이미지 Base64 변환 (지속성 유지 위해)
  const attached_images = files && files.length > 0 
    ? await Promise.all(files.map(f => fileToBase64(f)))
    : undefined;

  // 사용자 메시지 즉시 저장
  const messages = getStorage<ApiMessage[]>(STORAGE_KEYS.MESSAGES, []);
  const userMsg: ApiMessage = {
    message_id: userMsgId,
    chat_id: chatId,
    role: 'user',
    type: type,
    text_content: text,
    image_s3_key: null,
    attached_images, // 변환된 이미지 저장
    created_at: new Date().toISOString(),
  };
  messages.push(userMsg);
  saveStorage(STORAGE_KEYS.MESSAGES, messages);

  // 세션 목록 업데이트 (Upsert)
  const chats = getStorage<ChatListItem[]>(STORAGE_KEYS.CHATS, []);
  const existingChatIdx = chats.findIndex(c => c.chat_id === chatId);
  const now = new Date().toISOString();
  
  const chatItem: ChatListItem = {
    chat_id: chatId,
    last_message_preview: text.slice(0, 50),
    last_message_type: type,
    last_message_at: now,
    created_at: existingChatIdx >= 0 ? chats[existingChatIdx].created_at : now,
    updated_at: now,
  };

  if (existingChatIdx >= 0) {
    chats[existingChatIdx] = chatItem;
  } else {
    chats.push(chatItem);
  }
  saveStorage(STORAGE_KEYS.CHATS, chats);

  await new Promise(r => setTimeout(r, 800));
  if (signal?.aborted) return;

  let fullResponse = "";
  let finalS3Key: string | null = null;

  if (type === 'chat') {
    const response = MOCK_BOT_RESPONSES[Math.floor(Math.random() * MOCK_BOT_RESPONSES.length)];
    for (const char of response.split('')) {
      if (signal?.aborted) return;
      onTextDelta({ delta: char });
      fullResponse += char;
      await new Promise(r => setTimeout(r, 20 + Math.random() * 20));
    }
  } else {
    await new Promise(r => setTimeout(r, 2000));
    if (signal?.aborted) return;
    const randomId = Math.floor(Math.random() * 1000);
    finalS3Key = `mock/outputs/${randomId}.png`;
    onImage({ s3_key: finalS3Key });
    fullResponse = `🎨 "${text}" 프롬프트로 이미지를 생성했습니다.`;
    onTextDelta({ delta: fullResponse });
  }

  // AI 응답 저장
  const aiMsg: ApiMessage = {
    message_id: aiMsgId,
    chat_id: chatId,
    role: 'assistant',
    type: type,
    text_content: fullResponse,
    image_s3_key: finalS3Key,
    created_at: new Date().toISOString(),
  };
  
  const currentMessages = getStorage<ApiMessage[]>(STORAGE_KEYS.MESSAGES, []);
  currentMessages.push(aiMsg);
  saveStorage(STORAGE_KEYS.MESSAGES, currentMessages);

  onDone();
}

/**
 * GET /chats (SessionStorage + API Fallback)
 */
export async function fetchChats(uuid: string): Promise<ChatListItem[]> {
  await new Promise(r => setTimeout(r, 200));
  const localChats = getStorage<ChatListItem[]>(STORAGE_KEYS.CHATS, []);
  
  // 저장된 내역이 없으면 실제 API 시도 (플래그가 켜져 있을 때만)
  if (localChats.length === 0 && USE_REAL_API) {
    try {
      const resp = await fetch(`${API_BASE_URL}/chats?uuid=${uuid}`);
      if (resp.ok) {
        const data = await resp.json();
        saveStorage(STORAGE_KEYS.CHATS, data); // 다음 세션을 위해 저장
        return data;
      }
    } catch (e) {
      console.warn('API fetch failed, returning empty list');
    }
  }
  
  return localChats;
}

/**
 * GET /chats/{chat_id} (SessionStorage + API Fallback)
 */
export async function fetchChatDetail(chatId: string, uuid: string): Promise<ChatDetailResponse> {
  await new Promise(r => setTimeout(r, 200));
  
  const allMessages = getStorage<ApiMessage[]>(STORAGE_KEYS.MESSAGES, []);
  const localMessages = allMessages.filter(m => m.chat_id === chatId);
  
  const chats = getStorage<ChatListItem[]>(STORAGE_KEYS.CHATS, []);
  const localChat = chats.find(c => c.chat_id === chatId);

  // 현재 세션에 데이터가 없으면 실제 API 시도 (플래그가 켜져 있을 때만)
  if ((!localChat || localMessages.length === 0) && USE_REAL_API) {
    try {
      const resp = await fetch(`${API_BASE_URL}/chats/${chatId}?uuid=${uuid}`);
      if (resp.ok) {
        const data: ChatDetailResponse = await resp.json();
        
        // 가져온 데이터 캐싱
        if (!localChat) {
          chats.push(data.chat);
          saveStorage(STORAGE_KEYS.CHATS, chats);
        }
        const mergedMessages = [
          ...allMessages.filter(m => m.chat_id !== chatId),
          ...data.messages
        ];
        saveStorage(STORAGE_KEYS.MESSAGES, mergedMessages);
        
        return data;
      }
    } catch (e) {
      console.warn('API fetch failed for chat detail');
    }
  }

  if (!localChat) throw new Error('Chat not found');
  return { chat: localChat, messages: localMessages };
}


