// ─── 공통 타입 ───

/** 채팅 유형: chat(텍스트) | image(이미지 생성) */
export type ChatType = 'chat' | 'image';

/** 메시지 역할 */
export type MessageRole = 'user' | 'assistant';

// ─── SSE 이벤트 타입 ───

export interface SSEMetaEvent {
  chat_id: string;
  message_id: string;
  user_message_id: string;
}

export interface SSETextDeltaEvent {
  delta: string;
}

export interface SSEImageEvent {
  s3_key: string;
  data?: string;
  mime_type?: string;
}

export interface SSEErrorEvent {
  message: string;
}

export type SSEEvent =
  | { type: 'meta'; data: SSEMetaEvent }
  | { type: 'text_delta'; data: SSETextDeltaEvent }
  | { type: 'image'; data: SSEImageEvent }
  | { type: 'startup_timeout'; data: SSEErrorEvent }
  | { type: 'done' }
  | { type: 'error'; data: SSEErrorEvent };

// ─── API 응답 타입 ───

/** GET /chats 응답 아이템 */
export interface ChatListItem {
  chat_id: string;
  title?: string;
  last_message_preview: string;
  last_message_type: ChatType;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

/** GET /chats/{chat_id} 응답 메시지 */
export interface ApiMessage {
  message_id: string;
  chat_id: string;
  role: MessageRole;
  type: ChatType;
  text_content: string | null;
  image_s3_key: string | null;
  image_url?: string;
  attached_images?: string[]; // 사용자가 첨부한 이미지 (Base64 등)
  created_at: string;
}

/** GET /chats/{chat_id} 응답 전체 */
export interface ChatDetailResponse {
  chat: ChatListItem;
  messages: ApiMessage[];
}

// ─── UI 내부 타입 ───

/** UI 렌더링용 메시지 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  type: ChatType;
  isStreaming?: boolean;
  isGenerating?: boolean;
  imageS3Key?: string;
  imageUrl?: string;   // base64 data URL (신규 생성) or 직접 URL
  attachedImages?: string[];
  isError?: boolean;
}

/** 사이드바 세션 = 백엔드 chat 엔티티 */
export interface Session {
  chatId: string;
  name: string;
  lastMessage: string;
  lastMessageType: ChatType;
  lastMessageAt: string;
  createdAt: string;
}

/** 세션 그룹 (Pro + Flash 통합) */
export interface SessionGroup {
  groupId: string;      // 기준이 되는 ID (보통 먼저 생성된 chatId)
  proChatId: string | null;
  flashChatId: string | null;
  name: string;
  lastMessage: string;
  lastMessageAt: string;
  createdAt: string;
}

// ─── API 요청 파라미터 ───

export interface ChatCompletionParams {
  uuid: string;
  chatId?: string;
  type: ChatType;
  text: string;
  files?: File[];
  signal?: AbortSignal;
  partnerChatId?: string; // 묶일 상대방 세션 ID
  onMeta: (data: SSEMetaEvent) => void;
  onTextDelta: (data: SSETextDeltaEvent) => void;
  onImage: (data: SSEImageEvent) => void;
  onDone: () => void;
  onError: (data: SSEErrorEvent) => void;
  onStartupTimeout?: (data: SSEErrorEvent) => void;
  onBudgetExceeded?: () => void;
}

/** 사용량 정보 */
export interface UsageInfo {
  used: number;    // 사용 금액 ($)
  budget: number;  // 할당 예산 ($)
}

// ─── 대회 제출/심사 타입 ───

export type ContestPromptSlot = 'A' | 'B';

export type ContestSubmissionStatus = 'not_submitted' | 'generating' | 'submitted' | 'completed' | 'failed';

export type ContestResultStatus = 'pending' | 'generating' | 'succeeded' | 'failed';

export interface ContestImageAsset {
  id: string;
  title: string;
  url: string;
  s3_key?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  created_at?: string | null;
}

export interface ContestAssetsResponse {
  reference_images: ContestImageAsset[];
  before_images: ContestImageAsset[];
}

export interface ContestGeneratedResult {
  id: string;
  prompt_slot: ContestPromptSlot;
  before_image: ContestImageAsset;
  after_image?: ContestImageAsset | null;
  status: ContestResultStatus;
  error_message?: string | null;
}

export interface ContestSubmission {
  id: string;
  team_id: string;
  team_name: string;
  prompt_a: string;
  prompt_b?: string | null;
  status: ContestSubmissionStatus;
  submitted_at?: string | null;
  results: ContestGeneratedResult[];
}

export interface ContestMe {
  team_id: string;
  team_name: string;
  submitted: boolean;
  submission?: ContestSubmission | null;
}

export interface ContestTeamSummary {
  team_id: string;
  team_name: string;
  api_key_preview: string;
  status: ContestSubmissionStatus;
  submitted: boolean;
  submitted_at?: string | null;
  result_count?: number | null;
}

// ─── 대회 분석 타입 ───

export type ContestAnalysisEventKind =
  | 'chat_message'
  | 'before_image_upload'
  | 'gemini_analysis'
  | 'prompt_candidate'
  | 'image_generation_request'
  | 'image_generation_result';

export type ContestAnalysisEventRole = MessageRole | 'system';

export type ContestAnalysisEventStatus = ContestResultStatus | 'running' | 'unknown';

export type ContestAnalysisImageKind = 'before' | 'after' | 'attachment' | 'reference' | 'generated';

export interface ContestAnalysisImage extends ContestImageAsset {
  label?: string | null;
  kind?: ContestAnalysisImageKind | null;
}

export interface ContestAnalysisEvent {
  id: string;
  session_id: string;
  timestamp: string;
  kind: ContestAnalysisEventKind;
  role?: ContestAnalysisEventRole | null;
  model?: string | null;
  text?: string | null;
  images: ContestAnalysisImage[];
  before_image?: ContestAnalysisImage | null;
  after_image?: ContestAnalysisImage | null;
  linked_prompt_id?: string | null;
  linked_before_image_id?: string | null;
  status?: ContestAnalysisEventStatus | null;
  error_message?: string | null;
}

export interface ContestAnalysisSession {
  session_id: string;
  created_at: string;
  last_message_at: string;
  title?: string | null;
  first_message_preview: string;
  events: ContestAnalysisEvent[];
}

export interface ContestAnalysisSummary {
  session_count: number;
  message_count: number;
  attached_image_count: number;
  generation_result_count: number;
  failed_count: number;
  last_activity_at?: string | null;
}

export interface ContestAnalysisApiKeyItem {
  api_key: string;
  masked_api_key: string;
  sessions: ContestAnalysisSession[];
  summary: ContestAnalysisSummary;
}
