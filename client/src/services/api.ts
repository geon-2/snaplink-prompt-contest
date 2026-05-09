import type {
  ChatCompletionParams,
  ChatListItem,
  ChatDetailResponse,
  ApiMessage,
  UsageInfo,
  ContestAssetsResponse,
  ContestImageAsset,
  ContestMe,
  ContestAnalysisApiKeyItem,
  ContestAnalysisEvent,
  ContestAnalysisEventKind,
  ContestAnalysisEventRole,
  ContestAnalysisEventStatus,
  ContestAnalysisImage,
  ContestAnalysisImageKind,
  ContestAnalysisSession,
  ContestAnalysisSummary,
  ContestResultStatus,
  ContestSubmission,
  ContestSubmissionStatus,
  ContestTeamSummary,
} from '../types';

const API_BASE = '/api';
const ENABLE_API_DEBUG_LOGS = import.meta.env.DEV;

function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function collectionValue(value: unknown, keyName = 'api_key'): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [];

  return Object.entries(record).map(([key, item]) => ({
    [keyName]: key,
    ...(asRecord(item) ?? {}),
  }));
}

function firstDefined<T>(...values: T[]): T | undefined {
  return values.find((value) => value !== undefined);
}

function parseSseData(rawData: string): unknown {
  if (!rawData) return null;
  try {
    return JSON.parse(rawData);
  } catch {
    return rawData;
  }
}

function isBudgetExhausted(message: string): boolean {
  return message.includes('RESOURCE_EXHAUSTED') || message.includes('spending cap');
}

function sseErrorMessage(data: unknown): string {
  if (typeof data === 'string' && data.trim()) return data;

  const record = asRecord(data);
  if (!record) return '오류가 발생했습니다.';

  const detail = stringValue(record.detail);
  if (detail) return detail;

  const message = stringValue(record.message);
  if (message) return message;

  const nestedError = record.error;
  const nestedMessage = stringValue(asRecord(nestedError)?.message);
  return nestedMessage || '오류가 발생했습니다.';
}

/**
 * POST /api/chat/completion — SSE 스트리밍
 *
 * 요청 중단(signal)은 서버 미지원으로 비활성화.
 */
export async function streamChatCompletion(params: ChatCompletionParams): Promise<void> {
  const {
    uuid,
    chatId,
    partnerChatId,
    type,
    text,
    files,
    signal,
    onMeta,
    onTextDelta,
    onImage,
    onDone,
    onError,
    onStartupTimeout,
    onBudgetExceeded,
  } = params;

  const formData = new FormData();
  formData.append('uuid', uuid);
  if (chatId) formData.append('chat_id', chatId);
  if (partnerChatId) formData.append('partner_chat_id', partnerChatId);
  formData.append('type', type);
  if (text) formData.append('text', text);
  if (files?.length) files.forEach((f) => formData.append('files', f));

  if (ENABLE_API_DEBUG_LOGS) {
    const debugPayload: Record<string, unknown> = {};
    formData.forEach((value, key) => {
      if (value instanceof File) {
        debugPayload[key] = `[File] ${value.name} (${value.type}, ${value.size} bytes)`;
      } else {
        debugPayload[key] = value;
      }
    });
    console.log('[API] POST /chat/completion', debugPayload);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/chat/completion`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      signal,
    });
  } catch (err) {
    if (ENABLE_API_DEBUG_LOGS) {
      console.error('[API] 연결 실패', err);
    }
    onError({ message: '서버에 연결할 수 없습니다.' });
    return;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = typeof body.detail === 'string' ? body.detail : '';
    if (ENABLE_API_DEBUG_LOGS) {
      console.error(`[API] 응답 에러 ${response.status}`, body);
    }
    if (response.status === 504 && detail === 'gemini startup timed out') {
      onStartupTimeout?.({ message: detail });
      if (onStartupTimeout) return;
    }
    if (response.status === 429) {
      onBudgetExceeded?.();
      return;
    }
    onError({ message: detail || `서버 오류 (${response.status})` });
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatchSseEvent = (rawEvent: string): boolean => {
    const lines = rawEvent.split(/\r?\n/);
    let eventType = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (!line || line.startsWith(':')) continue;

      const separatorIndex = line.indexOf(':');
      const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
      const value = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1).replace(/^ /, '');

      if (field === 'event') {
        eventType = value;
      } else if (field === 'data') {
        dataLines.push(value);
      }
    }

    const data = parseSseData(dataLines.join('\n'));
    const record = asRecord(data);

    switch (eventType) {
      case 'meta': {
        const chatId = stringValue(record?.chat_id);
        const userMessageId = stringValue(record?.user_message_id);
        const messageId = stringValue(record?.message_id) ?? (userMessageId ? `ai-${userMessageId}` : undefined);
        if (chatId && userMessageId && messageId) {
          onMeta({
            chat_id: chatId,
            message_id: messageId,
            user_message_id: userMessageId,
          });
        }
        break;
      }
      case 'text_delta': {
        const delta = stringValue(record?.text) ?? stringValue(record?.delta);
        if (delta !== undefined) {
          onTextDelta({ delta });
        }
        break;
      }
      case 'image':
        onImage({
          s3_key: stringValue(record?.s3_key) ?? '',
          data: stringValue(record?.data),
          mime_type: stringValue(record?.mime_type),
        });
        break;
      case 'startup_timeout': {
        const msg = sseErrorMessage(data);
        if (onStartupTimeout) {
          onStartupTimeout({ message: msg });
        } else {
          onError({ message: msg });
        }
        return false;
      }
      case 'done':
        onDone();
        return false;
      case 'error': {
        const msg = sseErrorMessage(data);
        if (isBudgetExhausted(msg)) {
          onBudgetExceeded?.();
        } else {
          onError({ message: msg });
        }
        return false;
      }
    }

    return true;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const rawEvents = buffer.split(/\r?\n\r?\n/);
      buffer = rawEvents.pop() ?? '';

      for (const rawEvent of rawEvents) {
        if (rawEvent && !dispatchSseEvent(rawEvent)) {
          return;
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      dispatchSseEvent(buffer);
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * GET /api/chats — 채팅 목록
 */
export class UnauthorizedError extends Error {
  constructor() { super('unauthorized'); }
}

export async function fetchChats(uuid: string): Promise<ChatListItem[]> {
  const resp = await fetch(`${API_BASE}/chats?uuid=${uuid}`, {
    credentials: 'include',
  });
  if (resp.status === 401) throw new UnauthorizedError();
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
    title: data.title ?? undefined,
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
    image_url: m.image_url ?? undefined,
    created_at: m.created_at,
  }));

  return { chat, messages };
}

/**
 * PATCH /api/chats/:chat_id/title — 채팅 이름 변경
 */
export async function renameChat(chatId: string, title: string, uuid: string): Promise<void> {
  const resp = await fetch(`${API_BASE}/chats/${chatId}/title`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uuid, title }),
  });
  if (!resp.ok) throw new Error(`채팅 이름 변경 실패 (${resp.status})`);
}

/**
 * DELETE /api/chats/:chat_id — 채팅 삭제 (204 No Content)
 */
export async function deleteChat(chatId: string, uuid: string): Promise<void> {
  const resp = await fetch(`${API_BASE}/chats/${chatId}?uuid=${uuid}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (resp.status !== 204 && !resp.ok) throw new Error(`채팅 삭제 실패 (${resp.status})`);
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
    used: parseFloat(data.used_krw ?? '0'),
    budget: parseFloat(data.limit_krw ?? '0'),
  };
}

function normalizeContestAsset(raw: unknown, fallbackId: string): ContestImageAsset {
  const record = asRecord(raw) ?? {};
  const s3Key = stringValue(firstDefined(record.s3_key, record.image_s3_key));
  const url = stringValue(firstDefined(record.url, record.image_url)) ?? (s3Key ? `/api/images/${s3Key}` : '');
  const title =
    stringValue(firstDefined(record.title, record.name, record.file_name, record.filename)) ??
    `이미지 ${fallbackId}`;

  return {
    id: stringValue(firstDefined(record.id, record.asset_id, record.image_id)) ?? fallbackId,
    title,
    url,
    s3_key: s3Key ?? null,
    file_name: stringValue(firstDefined(record.file_name, record.filename)) ?? null,
    mime_type: stringValue(record.mime_type) ?? null,
    created_at: stringValue(record.created_at) ?? null,
  };
}

function normalizeContestAssets(raw: unknown): ContestAssetsResponse {
  const record = asRecord(raw) ?? {};
  const referenceImages = arrayValue(
    firstDefined(record.reference_images, record.references, record.a_cut_references)
  );
  const beforeImages = arrayValue(firstDefined(record.before_images, record.befores));

  return {
    reference_images: referenceImages.map((item, index) => normalizeContestAsset(item, `reference-${index + 1}`)),
    before_images: beforeImages.map((item, index) => normalizeContestAsset(item, `before-${index + 1}`)),
  };
}

function normalizeContestResultStatus(value: unknown): ContestResultStatus {
  const status = stringValue(value);
  if (status === 'pending' || status === 'generating' || status === 'failed') return status;
  return 'succeeded';
}

function normalizeContestSubmissionStatus(value: unknown): ContestSubmissionStatus {
  const status = stringValue(value);
  if (status === 'not_submitted' || status === 'generating' || status === 'failed' || status === 'submitted') {
    return status;
  }
  return 'submitted';
}

function normalizeContestSubmission(raw: unknown): ContestSubmission {
  const record = asRecord(raw) ?? {};
  const results = arrayValue(record.results).map((item, index) => {
    const result = asRecord(item) ?? {};
    return {
      id: stringValue(firstDefined(result.id, result.result_id)) ?? `result-${index + 1}`,
      prompt_slot: stringValue(result.prompt_slot) === 'B' ? 'B' as const : 'A' as const,
      before_image: normalizeContestAsset(result.before_image, `result-before-${index + 1}`),
      after_image: result.after_image ? normalizeContestAsset(result.after_image, `result-after-${index + 1}`) : null,
      status: normalizeContestResultStatus(result.status),
      error_message: stringValue(result.error_message) ?? null,
    };
  });

  return {
    id: stringValue(firstDefined(record.id, record.submission_id)) ?? 'submission',
    team_id: stringValue(record.team_id) ?? '',
    team_name: stringValue(record.team_name) ?? '팀 정보 없음',
    prompt_a: stringValue(record.prompt_a) ?? '',
    prompt_b: stringValue(record.prompt_b) ?? null,
    status: normalizeContestSubmissionStatus(record.status),
    submitted_at: stringValue(record.submitted_at) ?? null,
    results,
  };
}

function normalizeContestMe(raw: unknown): ContestMe {
  const record = asRecord(raw) ?? {};
  const submission = record.submission ? normalizeContestSubmission(record.submission) : null;

  return {
    team_id: stringValue(record.team_id) ?? submission?.team_id ?? '',
    team_name: stringValue(record.team_name) ?? submission?.team_name ?? '팀 정보 없음',
    submitted: booleanValue(record.submitted) ?? Boolean(submission),
    submission,
  };
}

function normalizeContestTeamSummary(raw: unknown, fallbackId: string): ContestTeamSummary {
  const record = asRecord(raw) ?? {};
  const teamId = stringValue(record.team_id) ?? fallbackId;

  return {
    team_id: teamId,
    team_name: stringValue(record.team_name) ?? `${teamId}팀`,
    submitted: booleanValue(record.submitted) ?? false,
    submitted_at: stringValue(record.submitted_at) ?? null,
    result_count: numberValue(record.result_count) ?? null,
  };
}

function adminHeaders(adminKey: string): HeadersInit {
  return {
    'X-Admin-Review-Key': adminKey,
  };
}

function maskAnalysisApiKey(apiKey: string): string {
  const normalized = apiKey.trim();
  if (!normalized) return '...';
  return `...${normalized.slice(-4).toUpperCase()}`;
}

function normalizeAnalysisImageKind(value: unknown, fallback: ContestAnalysisImageKind): ContestAnalysisImageKind {
  const kind = stringValue(value);
  if (kind === 'before' || kind === 'after' || kind === 'attachment' || kind === 'reference' || kind === 'generated') {
    return kind;
  }
  return fallback;
}

function normalizeAnalysisImage(
  raw: unknown,
  fallbackId: string,
  fallbackKind: ContestAnalysisImageKind,
): ContestAnalysisImage {
  if (typeof raw === 'string') {
    const value = raw.trim();
    const isDirectUrl = /^(https?:|data:|blob:|\/)/.test(value);
    const fileName = value.split('/').filter(Boolean).pop() ?? fallbackId;

    return {
      id: fallbackId,
      title: fileName,
      url: isDirectUrl ? value : `/api/images/${value}`,
      s3_key: isDirectUrl ? null : value,
      file_name: fileName,
      mime_type: null,
      created_at: null,
      label: null,
      kind: fallbackKind,
    };
  }

  const record = asRecord(raw) ?? {};
  const asset = normalizeContestAsset(raw, fallbackId);

  return {
    ...asset,
    label: stringValue(firstDefined(record.label, record.caption, record.alt)) ?? null,
    kind: normalizeAnalysisImageKind(record.kind, fallbackKind),
  };
}

function normalizeAnalysisEventKind(value: unknown, role?: ContestAnalysisEventRole | null): ContestAnalysisEventKind {
  const kind = stringValue(value);
  if (
    kind === 'chat_message' ||
    kind === 'before_image_upload' ||
    kind === 'gemini_analysis' ||
    kind === 'prompt_candidate' ||
    kind === 'image_generation_request' ||
    kind === 'image_generation_result'
  ) {
    return kind;
  }
  if (kind === 'chat') return role === 'assistant' ? 'gemini_analysis' : 'chat_message';
  if (kind === 'message' || kind === 'text') return 'chat_message';
  if (kind === 'analysis') return 'gemini_analysis';
  if (kind === 'prompt') return 'prompt_candidate';
  if (kind === 'image_request' || kind === 'generation_request') return 'image_generation_request';
  if (kind === 'image') return role === 'user' ? 'image_generation_request' : 'image_generation_result';
  if (kind === 'result' || kind === 'generation_result') return 'image_generation_result';
  if (role === 'assistant') return 'gemini_analysis';
  return 'chat_message';
}

function normalizeAnalysisRole(value: unknown): ContestAnalysisEventRole | null {
  const role = stringValue(value);
  if (role === 'user' || role === 'assistant' || role === 'system') return role;
  return null;
}

function normalizeAnalysisStatus(value: unknown): ContestAnalysisEventStatus | null {
  const status = stringValue(value);
  if (
    status === 'pending' ||
    status === 'generating' ||
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'running' ||
    status === 'unknown'
  ) {
    return status;
  }
  return null;
}

function normalizeAnalysisEvent(raw: unknown, fallbackSessionId: string, index: number): ContestAnalysisEvent {
  const record = asRecord(raw) ?? {};
  const role = normalizeAnalysisRole(record.role);
  const kind = normalizeAnalysisEventKind(firstDefined(record.kind, record.type, record.event_type), role);
  const sessionId = stringValue(firstDefined(record.session_id, record.chat_id)) ?? fallbackSessionId;

  const hasDirectImage = Boolean(record.image_s3_key || record.s3_key || record.image_url || record.url);
  const beforeRaw = firstDefined(record.before_image, record.beforeImage);
  const inferredAfterRaw = kind === 'image_generation_result' && hasDirectImage ? record : undefined;
  const afterRaw = firstDefined(record.after_image, record.afterImage, record.generated_image, record.result_image, inferredAfterRaw);
  const beforeImage = beforeRaw ? normalizeAnalysisImage(beforeRaw, `${sessionId}-before-${index + 1}`, 'before') : null;
  const afterImage = afterRaw ? normalizeAnalysisImage(afterRaw, `${sessionId}-after-${index + 1}`, 'after') : null;

  const explicitImages = arrayValue(firstDefined(record.images, record.attachments, record.attached_images)).map((item, imageIndex) =>
    normalizeAnalysisImage(item, `${sessionId}-event-${index + 1}-image-${imageIndex + 1}`, role === 'assistant' ? 'generated' : 'attachment')
  );
  const directImage =
    hasDirectImage && !beforeRaw && !afterRaw
      ? [normalizeAnalysisImage(record, `${sessionId}-event-${index + 1}-direct-image`, role === 'assistant' ? 'generated' : 'attachment')]
      : [];

  return {
    id: stringValue(firstDefined(record.id, record.event_id, record.message_id)) ?? `${sessionId}-event-${index + 1}`,
    session_id: sessionId,
    timestamp: stringValue(firstDefined(record.timestamp, record.created_at, record.createdAt)) ?? new Date(0).toISOString(),
    kind,
    role,
    model: stringValue(firstDefined(record.model, record.model_name, record.modelName)) ?? null,
    text: stringValue(firstDefined(record.text, record.content, record.text_content, record.prompt)) ?? null,
    images: [...explicitImages, ...directImage],
    before_image: beforeImage,
    after_image: afterImage,
    linked_prompt_id: stringValue(firstDefined(record.linked_prompt_id, record.linkedPromptId, record.prompt_id)) ?? null,
    linked_before_image_id:
      stringValue(firstDefined(record.linked_before_image_id, record.linkedBeforeImageId, record.before_image_id)) ?? null,
    status: normalizeAnalysisStatus(record.status),
    error_message: stringValue(firstDefined(record.error_message, record.error, record.message)) ?? null,
  };
}

function getDateMs(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asInferredBeforeImage(image: ContestAnalysisImage): ContestAnalysisImage {
  return {
    ...image,
    label: image.label ?? 'Before',
    kind: 'before',
  };
}

function inferBeforeAfterLinks(events: ContestAnalysisEvent[]): ContestAnalysisEvent[] {
  return events.map((event, index) => {
    if (event.kind !== 'image_generation_result' || event.before_image) return event;

    for (let prevIndex = index - 1; prevIndex >= 0; prevIndex -= 1) {
      const previous = events[prevIndex];
      const beforeImage = previous.before_image ?? previous.images[0];
      if ((previous.role === 'user' || previous.kind === 'image_generation_request') && beforeImage) {
        return {
          ...event,
          before_image: asInferredBeforeImage(beforeImage),
          linked_before_image_id: event.linked_before_image_id ?? beforeImage.id,
        };
      }
    }

    return event;
  });
}

function normalizeAnalysisSession(raw: unknown, index: number): ContestAnalysisSession {
  const record = asRecord(raw) ?? {};
  const sessionId = stringValue(firstDefined(record.session_id, record.chat_id, record.id)) ?? `session-${index + 1}`;
  const events = inferBeforeAfterLinks(
    arrayValue(firstDefined(record.events, record.messages, record.logs, record.timeline))
      .map((item, eventIndex) => normalizeAnalysisEvent(item, sessionId, eventIndex))
      .sort((a, b) => getDateMs(a.timestamp) - getDateMs(b.timestamp))
  );
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];
  const createdAt =
    stringValue(firstDefined(record.created_at, record.createdAt, firstEvent?.timestamp)) ?? new Date(0).toISOString();
  const lastMessageAt =
    stringValue(firstDefined(record.last_message_at, record.lastMessageAt, record.updated_at, record.updatedAt, lastEvent?.timestamp)) ??
    createdAt;
  const firstPreview =
    stringValue(firstDefined(record.first_message_preview, record.firstMessagePreview, record.preview, record.last_message_preview)) ??
    firstEvent?.text?.trim().replace(/\s+/g, ' ').slice(0, 120) ??
    '메시지 없음';

  return {
    session_id: sessionId,
    created_at: createdAt,
    last_message_at: lastMessageAt,
    title: stringValue(firstDefined(record.title, record.name)) ?? null,
    first_message_preview: firstPreview,
    events,
  };
}

function eventIsGenerationResult(event: ContestAnalysisEvent): boolean {
  return event.kind === 'image_generation_result' || Boolean(event.after_image);
}

function normalizeAnalysisSummary(raw: unknown, sessions: ContestAnalysisSession[]): ContestAnalysisSummary {
  const record = asRecord(raw) ?? {};
  const events = sessions.flatMap((session) => session.events);
  const attachedImageCount = events.reduce((count, event) => {
    const pairCount = (event.before_image ? 1 : 0) + (event.after_image ? 1 : 0);
    return count + event.images.length + pairCount;
  }, 0);
  const generationResultCount = events.filter(eventIsGenerationResult).length;
  const failedCount = events.filter((event) => event.status === 'failed' || Boolean(event.error_message)).length;
  const lastActivityAt = sessions
    .map((session) => session.last_message_at)
    .sort((a, b) => getDateMs(b) - getDateMs(a))[0] ?? null;

  return {
    session_count: numericValue(firstDefined(record.session_count, record.sessionCount)) ?? sessions.length,
    message_count: numericValue(firstDefined(record.message_count, record.messageCount)) ?? events.length,
    attached_image_count: numericValue(firstDefined(record.attached_image_count, record.attachedImageCount)) ?? attachedImageCount,
    generation_result_count:
      numericValue(firstDefined(record.generation_result_count, record.generationResultCount)) ?? generationResultCount,
    failed_count: numericValue(firstDefined(record.failed_count, record.failedCount)) ?? failedCount,
    last_activity_at: stringValue(firstDefined(record.last_activity_at, record.lastActivityAt)) ?? lastActivityAt,
  };
}

function normalizeAnalysisApiKeyItem(raw: unknown, index: number): ContestAnalysisApiKeyItem {
  const record = asRecord(raw) ?? {};
  const apiKey = stringValue(firstDefined(record.api_key, record.apiKey, record.key)) ?? `api-key-${index + 1}`;
  const sessions = collectionValue(firstDefined(record.sessions, record.chats, record.chat_sessions, record.chatSessions), 'session_id')
    .map((item, sessionIndex) => normalizeAnalysisSession(item, sessionIndex))
    .sort((a, b) => getDateMs(b.last_message_at) - getDateMs(a.last_message_at));

  return {
    api_key: apiKey,
    masked_api_key: stringValue(firstDefined(record.masked_api_key, record.maskedApiKey)) ?? maskAnalysisApiKey(apiKey),
    sessions,
    summary: normalizeAnalysisSummary(record.summary, sessions),
  };
}

/**
 * GET /api/contest/me — 현재 API key에 매핑된 팀/제출 상태
 */
export async function fetchContestMe(): Promise<ContestMe> {
  const resp = await fetch(`${API_BASE}/contest/me`, {
    credentials: 'include',
  });
  if (!resp.ok) throw new Error(`대회 제출 상태 로드 실패 (${resp.status})`);
  return normalizeContestMe(await resp.json());
}

/**
 * GET /api/contest/assets — 참가자에게 제공되는 A컷/Before 이미지
 */
export async function fetchContestAssets(): Promise<ContestAssetsResponse> {
  const resp = await fetch(`${API_BASE}/contest/assets`, {
    credentials: 'include',
  });
  if (!resp.ok) throw new Error(`대회 이미지 로드 실패 (${resp.status})`);
  return normalizeContestAssets(await resp.json());
}

/**
 * POST /api/contest/submissions — 최종 프롬프트 제출 및 after 생성 요청
 */
export async function submitContestPrompts(promptA: string, promptB?: string): Promise<ContestSubmission> {
  const resp = await fetch(`${API_BASE}/contest/submissions`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt_a: promptA, prompt_b: promptB?.trim() || null }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const detail = stringValue(asRecord(body)?.detail);
    throw new Error(detail || `최종 프롬프트 제출 실패 (${resp.status})`);
  }
  return normalizeContestSubmission(body);
}

/**
 * GET /api/contest/review/teams — 심사용 팀 목록
 */
export async function fetchContestReviewTeams(adminKey: string): Promise<ContestTeamSummary[]> {
  const resp = await fetch(`${API_BASE}/contest/review/teams`, {
    credentials: 'include',
    headers: adminHeaders(adminKey),
  });
  if (!resp.ok) throw new Error(`심사용 팀 목록 로드 실패 (${resp.status})`);
  const body = await resp.json();
  const items = arrayValue(asRecord(body)?.teams ?? body);
  return items.map((item, index) => normalizeContestTeamSummary(item, `${index + 1}`));
}

/**
 * GET /api/contest/review/teams/:teamId — 팀별 제출 상세
 */
export async function fetchContestReviewTeam(teamId: string, adminKey: string): Promise<ContestSubmission> {
  const resp = await fetch(`${API_BASE}/contest/review/teams/${encodeURIComponent(teamId)}`, {
    credentials: 'include',
    headers: adminHeaders(adminKey),
  });
  if (!resp.ok) throw new Error(`팀 제출 결과 로드 실패 (${resp.status})`);
  return normalizeContestSubmission(await resp.json());
}

/**
 * GET /api/admin/chats + /api/admin/chats/:chat_id — API key별 세션 로그 분석 데이터
 */
export async function fetchContestAnalysisItems(): Promise<ContestAnalysisApiKeyItem[]> {
  const listResp = await fetch(apiUrl('/admin/chats'), {
    credentials: 'include',
  });
  if (!listResp.ok) throw new Error(`관리자 채팅 목록 로드 실패 (${listResp.status})`);

  const summaries = arrayValue(await listResp.json());
  const details = await Promise.all(
    summaries.map(async (summary, index) => {
      const summaryRecord = asRecord(summary) ?? {};
      const chatId = stringValue(summaryRecord.chat_id);
      if (!chatId) return { ...summaryRecord, chat_id: `chat-${index + 1}`, messages: [] };

      const detailResp = await fetch(apiUrl(`/admin/chats/${encodeURIComponent(chatId)}`), {
        credentials: 'include',
      });
      if (!detailResp.ok) throw new Error(`관리자 채팅 상세 로드 실패 (${detailResp.status})`);

      return {
        ...summaryRecord,
        ...(asRecord(await detailResp.json()) ?? {}),
      };
    })
  );

  const grouped = new Map<string, unknown[]>();
  details.forEach((detail, index) => {
    const detailRecord = asRecord(detail) ?? {};
    const summaryRecord = asRecord(summaries[index]) ?? {};
    const apiKey = stringValue(firstDefined(detailRecord.user_api_key, summaryRecord.user_api_key)) ?? 'unknown-api-key';
    const sessions = grouped.get(apiKey) ?? [];
    sessions.push(detail);
    grouped.set(apiKey, sessions);
  });

  return Array.from(grouped.entries())
    .map(([apiKey, sessions], index) => normalizeAnalysisApiKeyItem({ api_key: apiKey, sessions }, index))
    .sort((a, b) => a.api_key.localeCompare(b.api_key));
}

/**
 * POST /api/contest/review/assets — 심사용 A컷/Before 이미지 등록
 */
export async function uploadContestReviewAssets(
  adminKey: string,
  referenceImages: File[],
  beforeImages: File[],
): Promise<ContestAssetsResponse> {
  const formData = new FormData();
  referenceImages.forEach((file) => formData.append('reference_images', file));
  beforeImages.forEach((file) => formData.append('before_images', file));

  const resp = await fetch(`${API_BASE}/contest/review/assets`, {
    method: 'POST',
    credentials: 'include',
    headers: adminHeaders(adminKey),
    body: formData,
  });
  if (!resp.ok) throw new Error(`대회 이미지 등록 실패 (${resp.status})`);
  return normalizeContestAssets(await resp.json());
}
