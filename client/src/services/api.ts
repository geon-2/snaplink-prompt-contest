import type {
  ChatCompletionParams,
  ChatListItem,
  ChatDetailResponse,
  ApiMessage,
  UsageInfo,
  ContestAssetsResponse,
  ContestImageAsset,
  ContestMe,
  ContestResultStatus,
  ContestSubmission,
  ContestSubmissionStatus,
  ContestTeamSummary,
} from '../types';

const API_BASE = '/api';
const ENABLE_API_DEBUG_LOGS = import.meta.env.DEV;

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

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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
