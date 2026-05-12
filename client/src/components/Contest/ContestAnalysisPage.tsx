import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchContestAnalysisKeys, fetchContestAnalysisKeyDetail } from '../../services/api';
import { getImageUrl } from '../../utils/s3';
import type {
  ContestAnalysisApiKeyItem,
  ContestAnalysisEvent,
  ContestAnalysisEventKind,
  ContestAnalysisImage,
  ContestAnalysisSession,
} from '../../types';
import ImageModal from '../ImageModal/ImageModal';


function AdminKeyModal({
  initialKey,
  onConfirm,
  onClose,
}: {
  initialKey: string;
  onConfirm: (key: string) => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState(initialKey);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim()) onConfirm(key.trim());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-sm mx-4 bg-white rounded-2xl shadow-2xl border border-slate-200 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-[16px] font-black text-text-primary">관리자 키 입력</h2>
            <p className="text-[12px] font-bold text-text-tertiary mt-0.5">로그 조회에 필요합니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:bg-slate-100 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-black text-text-primary mb-1.5">Admin Review Key</label>
            <input
              ref={inputRef}
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-[13px] font-bold outline-none focus:bg-white focus:border-accent-pro/50 focus:ring-4 focus:ring-accent-pro/10 transition-all"
              placeholder="관리자 키를 입력하세요"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl border border-slate-200 text-text-secondary text-[13px] font-black hover:bg-slate-50 transition-all"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!key.trim()}
              className="flex-1 h-11 rounded-xl bg-accent-pro text-white text-[13px] font-black hover:bg-accent-pro/90 transition-all disabled:opacity-40"
            >
              확인
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ContestAnalysisPageProps {
  onBackToChat: () => void;
}

type ApiKeyFilter = 'all' | 'active' | 'image' | 'failed';
type EventFilter = 'all' | 'prompts' | 'images' | 'generation' | 'failed';

type TimelineRow =
  | { type: 'boundary'; session: ContestAnalysisSession }
  | { type: 'event'; event: ContestAnalysisEvent; session: ContestAnalysisSession };

const ADMIN_KEY_STORAGE = 'pa_admin_review_key';

const API_FILTERS: Array<{ id: ApiKeyFilter; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'active', label: '활동 있음' },
  { id: 'image', label: '이미지 생성' },
  { id: 'failed', label: '실패 있음' },
];

const EVENT_FILTERS: Array<{ id: EventFilter; label: string }> = [
  { id: 'all', label: '전체 로그' },
  { id: 'prompts', label: '프롬프트 도출만' },
  { id: 'images', label: '이미지 포함만' },
  { id: 'generation', label: '생성 결과만' },
  { id: 'failed', label: '실패만' },
];

function getTimeMs(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(value?: string | null): string {
  if (!value || getTimeMs(value) === 0) return '-';
  return new Date(value).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(value?: string | null): string {
  if (!value || getTimeMs(value) === 0) return '';
  return new Date(value).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function eventHasImage(event: ContestAnalysisEvent): boolean {
  return Boolean(event.before_image || event.after_image || event.images.length > 0);
}

function eventIsGeneration(event: ContestAnalysisEvent): boolean {
  return event.kind === 'image_generation_request' || event.kind === 'image_generation_result' || Boolean(event.after_image);
}

function eventIsPrompt(event: ContestAnalysisEvent): boolean {
  return event.kind === 'prompt_candidate' || event.kind === 'gemini_analysis';
}

function eventIsFailed(event: ContestAnalysisEvent): boolean {
  return event.status === 'failed' || Boolean(event.error_message);
}

function eventMatchesFilter(event: ContestAnalysisEvent, filter: EventFilter): boolean {
  if (filter === 'prompts') return eventIsPrompt(event);
  if (filter === 'images') return eventHasImage(event);
  if (filter === 'generation') return event.kind === 'image_generation_result' || Boolean(event.after_image);
  if (filter === 'failed') return eventIsFailed(event);
  return true;
}

function getEventLabel(event: ContestAnalysisEvent): string {
  if (event.kind === 'chat_message') {
    if (event.role === 'user') return '사용자 메시지';
    if (event.role === 'assistant') return 'AI 응답';
    return '로그 메시지';
  }

  const labels: Record<ContestAnalysisEventKind, string> = {
    chat_message: '로그 메시지',
    before_image_upload: 'Before 이미지',
    gemini_analysis: 'Gemini 분석',
    prompt_candidate: '도출 프롬프트',
    image_generation_request: '생성 요청',
    image_generation_result: '생성 결과',
  };
  return labels[event.kind];
}

function getStatusLabel(event: ContestAnalysisEvent): string | null {
  if (event.error_message) return '실패';
  if (!event.status) return null;
  if (event.status === 'pending') return '대기';
  if (event.status === 'generating' || event.status === 'running') return '진행 중';
  if (event.status === 'succeeded') return '성공';
  if (event.status === 'failed') return '실패';
  return '알 수 없음';
}

function eventTone(event: ContestAnalysisEvent): {
  avatar: string;
  bubble: string;
  label: string;
  rail: string;
} {
  if (eventIsFailed(event)) {
    return {
      avatar: 'bg-red-50 text-red-500 border-red-200',
      bubble: 'bg-red-50 border-red-200 text-red-700',
      label: 'text-red-500',
      rail: 'bg-red-400',
    };
  }
  if (event.role === 'user') {
    return {
      avatar: 'bg-accent-pro text-white border-accent-pro/20',
      bubble: 'bg-accent-pro text-white border-accent-pro',
      label: 'text-white/80',
      rail: 'bg-accent-pro',
    };
  }
  if (event.kind === 'prompt_candidate') {
    return {
      avatar: 'bg-amber-50 text-amber-600 border-amber-200',
      bubble: 'bg-amber-50 border-amber-200 text-amber-900',
      label: 'text-amber-600',
      rail: 'bg-amber-400',
    };
  }
  if (eventIsGeneration(event)) {
    return {
      avatar: 'bg-sky-50 text-sky-600 border-sky-200',
      bubble: 'bg-white border-sky-200 text-text-primary',
      label: 'text-sky-600',
      rail: 'bg-sky-400',
    };
  }
  return {
    avatar: 'bg-white text-accent-pro border-accent-pro/20',
    bubble: 'bg-white border-border-default text-text-primary',
    label: 'text-accent-pro',
    rail: 'bg-accent-pro',
  };
}

function sessionModels(session: ContestAnalysisSession): string[] {
  const models = session.events
    .map((event) => event.model)
    .filter((value): value is string => Boolean(value?.trim()));

  if (models.length > 0) return Array.from(new Set(models)).slice(0, 3);

  const inferred = new Set<string>();
  session.events.forEach((event) => {
    if (event.kind === 'gemini_analysis' || event.kind === 'prompt_candidate') inferred.add('Gemini 3.1 Pro');
    if (eventIsGeneration(event)) inferred.add('Image Gen');
  });
  return Array.from(inferred).slice(0, 3);
}

function sessionGenerationCount(session: ContestAnalysisSession): number {
  return session.events.filter((event) => event.kind === 'image_generation_result' || Boolean(event.after_image)).length;
}

function sessionFailedCount(session: ContestAnalysisSession): number {
  return session.events.filter(eventIsFailed).length;
}

function MarkdownText({ text, inverse = false }: { text: string; inverse?: boolean }) {
  return (
    <div className={`break-words text-[13.5px] leading-relaxed ${inverse ? 'text-white' : 'text-text-primary'}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (props) => <p className="mb-2 last:mb-0" {...props} />,
          ul: (props) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
          ol: (props) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
          li: (props) => <li className="pl-1" {...props} />,
          code: ({ className, children, ...props }: any) => {
            const isBlock = /language-(\w+)/.test(className || '');
            if (isBlock) {
              return (
                <pre className="my-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[12px] leading-relaxed text-slate-100">
                  <code className={className} {...props}>{children}</code>
                </pre>
              );
            }
            return (
              <code
                className={`rounded px-1.5 py-0.5 font-mono text-[0.86em] ${
                  inverse ? 'bg-white/20 text-white' : 'bg-slate-100 text-accent-pro'
                }`}
                {...props}
              >
                {children}
              </code>
            );
          },
          blockquote: (props) => (
            <blockquote
              className={`my-3 border-l-4 py-1 pl-3 ${
                inverse ? 'border-white/40 bg-white/10' : 'border-accent-pro/30 bg-accent-pro/[0.03]'
              }`}
              {...props}
            />
          ),
          a: (props) => (
            <a
              className={inverse ? 'font-bold text-white underline' : 'font-bold text-blue-600 hover:underline'}
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 shrink-0 rounded-lg border px-3 text-[11px] font-black transition-all ${
        active
          ? 'border-accent-pro bg-accent-pro text-white'
          : 'border-slate-200 bg-white text-text-secondary hover:border-accent-pro/30 hover:text-accent-pro'
      }`}
    >
      {label}
    </button>
  );
}

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-[10px] font-black uppercase tracking-wider text-text-tertiary">{label}</div>
      <div className="mt-1 truncate text-[18px] font-black text-text-primary">{value}</div>
    </div>
  );
}

function StatusPill({ event }: { event: ContestAnalysisEvent }) {
  const label = getStatusLabel(event);
  if (!label) return null;

  const className =
    label === '실패'
      ? 'bg-red-50 text-red-500 border-red-200'
      : label === '성공'
        ? 'bg-accent-pro/10 text-accent-pro border-accent-pro/20'
        : 'bg-amber-50 text-amber-600 border-amber-200';

  return <span className={`rounded-md border px-2 py-1 text-[10px] font-black ${className}`}>{label}</span>;
}

function resolveImageUrl(image?: ContestAnalysisImage | null): string | null {
  if (!image) return null;
  if (image.s3_key) return getImageUrl(image.s3_key);
  if (image.url) return image.url;
  return null;
}

function ImageThumb({
  image,
  label,
  onClick,
}: {
  image?: ContestAnalysisImage | null;
  label: string;
  onClick?: () => void;
}) {
  const displayUrl = resolveImageUrl(image);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!displayUrl}
      className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left transition-all enabled:hover:border-accent-pro/40 enabled:hover:shadow-sm"
    >
      <div className="flex h-7 items-center justify-between gap-2 border-b border-slate-200 bg-white px-2">
        <span className="truncate text-[10px] font-black uppercase tracking-wider text-text-tertiary">{label}</span>
      </div>
      <div className="aspect-square bg-slate-100">
        {displayUrl ? (
          <img src={displayUrl} alt={image?.title} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-[11px] font-bold text-text-tertiary">
            이미지 없음
          </div>
        )}
      </div>
      {image?.title && (
        <div className="truncate border-t border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-text-tertiary">
          {image.title}
        </div>
      )}
    </button>
  );
}

function ApiKeyListItem({
  item,
  selected,
  onSelect,
}: {
  item: ContestAnalysisApiKeyItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-3 text-left transition-all ${
        selected
          ? 'border-accent-pro/30 bg-accent-pro/[0.05] shadow-sm'
          : 'border-slate-200 bg-white hover:border-accent-pro/25 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-[12px] font-black text-text-primary">{item.masked_api_key}</span>
        {item.summary.failed_count > 0 && (
          <span className="rounded-md bg-red-50 px-2 py-1 text-[10px] font-black text-red-500">실패</span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-md bg-slate-50 px-1.5 py-1">
          <div className="text-[11px] font-black text-text-primary">{item.summary.session_count}</div>
          <div className="text-[9px] font-bold text-text-tertiary">세션</div>
        </div>
        <div className="rounded-md bg-slate-50 px-1.5 py-1">
          <div className="text-[11px] font-black text-text-primary">{item.summary.message_count}</div>
          <div className="text-[9px] font-bold text-text-tertiary">로그</div>
        </div>
        <div className="rounded-md bg-slate-50 px-1.5 py-1">
          <div className="text-[11px] font-black text-text-primary">{item.summary.generation_result_count}</div>
          <div className="text-[9px] font-bold text-text-tertiary">결과</div>
        </div>
      </div>
      <div className="mt-2 truncate text-[10px] font-bold text-text-tertiary">
        마지막 활동 {formatDateTime(item.summary.last_activity_at)}
      </div>
    </button>
  );
}

function SessionCard({
  session,
  selected,
  onSelect,
}: {
  session: ContestAnalysisSession;
  selected: boolean;
  onSelect: () => void;
}) {
  const models = sessionModels(session);
  const generationCount = sessionGenerationCount(session);
  const failedCount = sessionFailedCount(session);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`min-w-[230px] max-w-[280px] rounded-lg border p-4 text-left transition-all ${
        selected
          ? 'border-accent-pro/35 bg-accent-pro/[0.05] shadow-sm'
          : 'border-slate-200 bg-white hover:border-accent-pro/25 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-black text-text-primary">{session.title || session.session_id}</div>
          <div className="mt-1 text-[10px] font-bold text-text-tertiary">{formatDateTime(session.created_at)}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-text-secondary">
          {session.events.length}
        </div>
      </div>
      <div className="mt-3 line-clamp-2 min-h-[32px] text-[11px] font-bold leading-relaxed text-text-secondary">
        {session.first_message_preview}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {models.length > 0 ? (
          models.map((model) => (
            <span key={model} className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-black text-text-secondary">
              {model}
            </span>
          ))
        ) : (
          <span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-black text-text-tertiary">모델 없음</span>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-text-tertiary">
        <span>결과 {generationCount}개</span>
        <span className={failedCount > 0 ? 'text-red-500' : ''}>실패 {failedCount}개</span>
      </div>
    </button>
  );
}

function TimelineBoundary({ session }: { session: ContestAnalysisSession }) {
  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center shadow-sm">
          <div className="text-[11px] font-black text-text-primary">{session.title || session.session_id}</div>
          <div className="mt-0.5 text-[10px] font-bold text-text-tertiary">
            {formatDateTime(session.created_at)} - {formatDateTime(session.last_message_at)}
          </div>
        </div>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
    </div>
  );
}

function EventBubble({
  event,
  session,
  selected,
  onSelect,
}: {
  event: ContestAnalysisEvent;
  session: ContestAnalysisSession;
  selected: boolean;
  onSelect: () => void;
}) {
  const isUser = event.role === 'user';
  const tone = eventTone(event);
  const hasPair = Boolean(event.before_image || event.after_image);
  const hasImages = event.images.length > 0 || hasPair;
  const label = getEventLabel(event);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex w-full gap-3 px-6 py-4 text-left transition-all ${
        isUser ? 'flex-row-reverse' : 'flex-row'
      } ${selected ? 'bg-accent-pro/[0.04]' : 'hover:bg-white/60'}`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-[11px] font-black ${tone.avatar}`}>
        {isUser ? 'USER' : eventIsGeneration(event) ? 'IMG' : 'AI'}
      </div>
      <div className={`min-w-0 max-w-[82%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`rounded-lg border px-4 py-3 shadow-sm ${tone.bubble} ${selected ? 'ring-2 ring-accent-pro/15' : ''}`}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`text-[10px] font-black uppercase tracking-wider ${tone.label}`}>{label}</span>
            {event.model && (
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-black ${isUser ? 'bg-white/15 text-white' : 'bg-slate-100 text-text-secondary'}`}>
                {event.model}
              </span>
            )}
            <StatusPill event={event} />
          </div>

          {event.text ? (
            <div className="max-h-[260px] overflow-y-auto pr-1">
              <MarkdownText text={event.text} inverse={isUser && !eventIsFailed(event)} />
            </div>
          ) : (
            <div className={`text-[12px] font-bold ${isUser ? 'text-white/70' : 'text-text-tertiary'}`}>텍스트 없음</div>
          )}

          {hasPair && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ImageThumb image={event.before_image} label="Before" />
              <ImageThumb image={event.after_image} label="After" />
            </div>
          )}

          {!hasPair && event.images.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {event.images.slice(0, 6).map((image) => (
                <ImageThumb key={image.id} image={image} label={image.label || image.kind || 'Image'} />
              ))}
            </div>
          )}

          {event.error_message && (
            <div className="mt-3 rounded-lg border border-red-200 bg-white/70 px-3 py-2 text-[12px] font-bold text-red-600">
              {event.error_message}
            </div>
          )}
        </div>
        <div className={`mt-1.5 flex items-center gap-2 text-[10px] font-black text-text-tertiary ${isUser ? 'flex-row-reverse' : ''}`}>
          <span>{formatTime(event.timestamp)}</span>
          {hasImages && <span>이미지 포함</span>}
          <span className="max-w-[180px] truncate">{session.title || session.session_id}</span>
        </div>
      </div>
    </button>
  );
}

function DetailPanel({
  event,
  session,
  onImageOpen,
}: {
  event: ContestAnalysisEvent | null;
  session: ContestAnalysisSession | null;
  onImageOpen: (image: ContestAnalysisImage) => void;
}) {
  if (!event || !session) {
    return (
      <aside className="min-h-0 border-l border-border-default bg-white p-5">
        <div className="flex h-full min-h-[240px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-[13px] font-bold text-text-tertiary">
          로그를 선택하세요.
        </div>
      </aside>
    );
  }

  const images = event.images;
  const hasPair = Boolean(event.before_image || event.after_image);

  return (
    <aside className="min-h-0 overflow-y-auto border-l border-border-default bg-white p-5">
      <div className="space-y-5">
        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-black text-text-primary">{getEventLabel(event)}</h2>
              <div className="mt-1 text-[11px] font-bold text-text-tertiary">{formatDateTime(event.timestamp)}</div>
            </div>
            <StatusPill event={event} />
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-cols-2 gap-2 text-[11px] font-bold">
              <div>
                <div className="text-text-tertiary">세션</div>
                <div className="mt-1 truncate text-text-primary">{session.title || session.session_id}</div>
              </div>
              <div>
                <div className="text-text-tertiary">모델</div>
                <div className="mt-1 truncate text-text-primary">{event.model || '-'}</div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-2 text-[12px] font-black text-text-primary">본문</div>
          <div className="max-h-[420px] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4">
            {event.text ? (
              <MarkdownText text={event.text} />
            ) : (
              <div className="text-[12px] font-bold text-text-tertiary">텍스트가 없습니다.</div>
            )}
          </div>
        </section>

        {hasPair && (
          <section>
            <div className="mb-2 text-[12px] font-black text-text-primary">Before / After</div>
            <div className="grid grid-cols-2 gap-3">
              <ImageThumb image={event.before_image} label="Before" onClick={() => event.before_image && onImageOpen(event.before_image)} />
              <ImageThumb image={event.after_image} label="After" onClick={() => event.after_image && onImageOpen(event.after_image)} />
            </div>
          </section>
        )}

        {!hasPair && images.length > 0 && (
          <section>
            <div className="mb-2 text-[12px] font-black text-text-primary">이미지</div>
            <div className="grid grid-cols-2 gap-3">
              {images.map((image) => (
                <ImageThumb
                  key={image.id}
                  image={image}
                  label={image.label || image.kind || 'Image'}
                  onClick={() => onImageOpen(image)}
                />
              ))}
            </div>
          </section>
        )}

        {(event.linked_prompt_id || event.linked_before_image_id) && (
          <section>
            <div className="mb-2 text-[12px] font-black text-text-primary">연결 정보</div>
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] font-bold">
              {event.linked_prompt_id && (
                <div>
                  <span className="text-text-tertiary">Prompt ID</span>
                  <div className="mt-1 break-all font-mono text-text-primary">{event.linked_prompt_id}</div>
                </div>
              )}
              {event.linked_before_image_id && (
                <div>
                  <span className="text-text-tertiary">Before Image ID</span>
                  <div className="mt-1 break-all font-mono text-text-primary">{event.linked_before_image_id}</div>
                </div>
              )}
            </div>
          </section>
        )}

        {event.error_message && (
          <section>
            <div className="mb-2 text-[12px] font-black text-red-500">오류</div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] font-bold leading-relaxed text-red-600">
              {event.error_message}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

export default function ContestAnalysisPage({ onBackToChat }: ContestAnalysisPageProps) {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? '');
  const [showAdminKeyModal, setShowAdminKeyModal] = useState(() => !sessionStorage.getItem(ADMIN_KEY_STORAGE));
  const [items, setItems] = useState<ContestAnalysisApiKeyItem[]>([]);
  const [selectedApiKey, setSelectedApiKey] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [apiFilter, setApiFilter] = useState<ApiKeyFilter>('all');
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [showMergedTimeline, setShowMergedTimeline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalImage, setModalImage] = useState<ContestAnalysisImage | null>(null);

  const loadedKeysRef = useRef(new Set<string>());

  const handleAdminKeyConfirm = useCallback((key: string) => {
    sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    setAdminKey(key);
    setShowAdminKeyModal(false);
  }, []);

  const loadAnalysisData = useCallback(async () => {
    const trimmedKey = adminKey.trim();
    if (!trimmedKey) {
      setError('관리자 키를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);
    loadedKeysRef.current.clear();
    try {
      sessionStorage.setItem(ADMIN_KEY_STORAGE, trimmedKey);
      const nextItems = await fetchContestAnalysisKeys(trimmedKey);
      setItems(nextItems);
      setSelectedApiKey((current) => {
        if (current && nextItems.some((item) => item.api_key === current)) return current;
        return nextItems[0]?.api_key ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 로그를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    if (adminKey.trim()) {
      loadAnalysisData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  // API key 선택 시 해당 key의 상세만 로드
  useEffect(() => {
    if (!selectedApiKey) return;
    const trimmedKey = adminKey.trim();
    if (!trimmedKey) return;
    if (loadedKeysRef.current.has(selectedApiKey)) return;

    const item = items.find((i) => i.api_key === selectedApiKey);
    if (!item || item.sessions.length === 0) {
      loadedKeysRef.current.add(selectedApiKey);
      return;
    }

    let cancelled = false;
    setIsLoadingDetail(true);
    setError(null);

    fetchContestAnalysisKeyDetail(trimmedKey, item)
      .then((updatedItem) => {
        if (cancelled) return;
        loadedKeysRef.current.add(selectedApiKey);
        setItems((prev) => prev.map((i) => (i.api_key === selectedApiKey ? updatedItem : i)));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '상세 데이터를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetail(false);
      });

    return () => { cancelled = true; };
  // items를 의존성에 넣되, loadedKeysRef로 중복 호출 방지
  }, [selectedApiKey, adminKey, items]);

  const selectedItem = useMemo(
    () => items.find((item) => item.api_key === selectedApiKey) ?? null,
    [items, selectedApiKey],
  );

  useEffect(() => {
    if (!selectedItem) {
      setSelectedSessionId(null);
      setSelectedEventId(null);
      return;
    }

    setSelectedSessionId((current) => {
      if (current && selectedItem.sessions.some((session) => session.session_id === current)) return current;
      return selectedItem.sessions[0]?.session_id ?? null;
    });
  }, [selectedItem]);

  const selectedSession = useMemo(() => {
    if (!selectedItem || !selectedSessionId) return null;
    return selectedItem.sessions.find((session) => session.session_id === selectedSessionId) ?? null;
  }, [selectedItem, selectedSessionId]);

  const filteredApiItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch =
        !query ||
        item.api_key.toLowerCase().includes(query) ||
        item.masked_api_key.toLowerCase().includes(query);
      const matchesFilter =
        apiFilter === 'all' ||
        (apiFilter === 'active' && item.summary.message_count > 0) ||
        (apiFilter === 'image' && item.summary.generation_result_count > 0) ||
        (apiFilter === 'failed' && item.summary.failed_count > 0);
      return matchesSearch && matchesFilter;
    });
  }, [apiFilter, items, search]);

  const sessionById = useMemo(() => {
    const map = new Map<string, ContestAnalysisSession>();
    selectedItem?.sessions.forEach((session) => map.set(session.session_id, session));
    return map;
  }, [selectedItem]);

  const timelineRows = useMemo<TimelineRow[]>(() => {
    if (!selectedItem) return [];

    const eventRows = (showMergedTimeline
      ? selectedItem.sessions.flatMap((session) => session.events.map((event) => ({ event, session })))
      : selectedSession
        ? selectedSession.events.map((event) => ({ event, session: selectedSession }))
        : []
    )
      .filter(({ event }) => eventMatchesFilter(event, eventFilter))
      .sort((a, b) => getTimeMs(a.event.timestamp) - getTimeMs(b.event.timestamp));

    if (!showMergedTimeline) {
      return eventRows.map(({ event, session }) => ({ type: 'event', event, session }));
    }

    const rows: TimelineRow[] = [];
    let lastSessionId: string | null = null;
    eventRows.forEach(({ event, session }) => {
      if (session.session_id !== lastSessionId) {
        rows.push({ type: 'boundary', session });
        lastSessionId = session.session_id;
      }
      rows.push({ type: 'event', event, session });
    });
    return rows;
  }, [eventFilter, selectedItem, selectedSession, showMergedTimeline]);

  const visibleEventIds = useMemo(
    () => timelineRows.filter((row): row is Extract<TimelineRow, { type: 'event' }> => row.type === 'event').map((row) => row.event.id),
    [timelineRows],
  );

  useEffect(() => {
    if (visibleEventIds.length === 0) {
      setSelectedEventId(null);
      return;
    }
    setSelectedEventId((current) => (current && visibleEventIds.includes(current) ? current : visibleEventIds[0]));
  }, [visibleEventIds]);

  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return selectedItem?.sessions.flatMap((session) => session.events).find((event) => event.id === selectedEventId) ?? null;
  }, [selectedEventId, selectedItem]);

  const selectedEventSession = selectedEvent ? sessionById.get(selectedEvent.session_id) ?? null : null;

  return (
    <>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
        {showAdminKeyModal && (
          <AdminKeyModal
            initialKey={adminKey}
            onConfirm={handleAdminKeyConfirm}
            onClose={() => setShowAdminKeyModal(false)}
          />
        )}
        <header className="flex h-[64px] shrink-0 items-center justify-between border-b border-border-default bg-white px-5 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onBackToChat}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-all hover:bg-slate-100 hover:text-text-primary"
              title="채팅으로 돌아가기"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-[16px] font-black text-text-primary">프롬프트 분석</h1>
              <div className="truncate text-[11px] font-bold text-text-tertiary">API key별 세션 로그</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAdminKeyModal(true)}
              className={`h-9 px-3 rounded-lg border text-[12px] font-black transition-all ${
                adminKey.trim()
                  ? 'border-accent-pro/30 bg-accent-pro/[0.06] text-accent-pro hover:bg-accent-pro/10'
                  : 'border-slate-200 bg-slate-50 text-text-secondary hover:bg-slate-100'
              }`}
              title="관리자 키 설정"
            >
              <span className="flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                {adminKey.trim() ? '키 변경' : '관리자 키 입력'}
              </span>
            </button>
            <button
              type="button"
              onClick={loadAnalysisData}
              disabled={isLoading}
              className="h-9 rounded-lg bg-accent-pro px-3 text-[12px] font-black text-white transition-all hover:bg-accent-pro/90 disabled:opacity-50"
            >
              {isLoading ? '불러오는 중...' : '새로고침'}
            </button>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[300px_minmax(0,1fr)_400px] lg:overflow-hidden">
          <aside className="min-h-0 overflow-y-auto border-r border-border-default bg-white p-5">
            <section>
            <label className="block">
              <span className="mb-2 block text-[12px] font-black text-text-primary">API key 검색</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-[13px] font-bold outline-none transition-all focus:border-accent-pro/50 focus:bg-white focus:ring-4 focus:ring-accent-pro/10"
                placeholder="...A91F"
              />
            </label>

            <div className="mt-3 flex flex-wrap gap-2">
              {API_FILTERS.map((filter) => (
                <FilterButton
                  key={filter.id}
                  active={apiFilter === filter.id}
                  label={filter.label}
                  onClick={() => setApiFilter(filter.id)}
                />
              ))}
            </div>
          </section>

          <section className="mt-5 border-t border-slate-200 pt-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[12px] font-black text-text-primary">API key 목록</div>
              <span className="text-[10px] font-bold text-text-tertiary">{filteredApiItems.length}개</span>
            </div>
            <div className="space-y-2">
              {isLoading ? (
                <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-[12px] font-bold text-text-tertiary">
                  불러오는 중...
                </div>
              ) : filteredApiItems.length === 0 ? (
                <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-[12px] font-bold text-text-tertiary">
                  표시할 API key가 없습니다.
                </div>
              ) : (
                filteredApiItems.map((item) => (
                  <ApiKeyListItem
                    key={item.api_key}
                    item={item}
                    selected={selectedApiKey === item.api_key}
                    onSelect={() => setSelectedApiKey(item.api_key)}
                  />
                ))
              )}
            </div>
          </section>
        </aside>

        <section className="min-h-0 overflow-y-auto">
          <div className="mx-auto max-w-[1180px] space-y-5 p-5 md:p-7">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] font-bold text-red-600">
                {error}
              </div>
            )}

            {isLoadingDetail && (
              <div className="flex h-12 items-center gap-2 rounded-lg border border-accent-pro/20 bg-accent-pro/[0.04] px-4 text-[12px] font-bold text-accent-pro">
                <div className="w-4 h-4 border-2 border-accent-pro/30 border-t-accent-pro rounded-full animate-spin shrink-0" />
                세션 상세 데이터를 불러오는 중...
              </div>
            )}

            {!selectedItem ? (
              <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-[13px] font-bold text-text-tertiary">
                API key를 선택하세요.
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div className="min-w-0">
                      <div className="font-mono text-[18px] font-black text-text-primary">{selectedItem.masked_api_key}</div>
                      <div className="mt-1 text-[12px] font-bold text-text-tertiary">
                        마지막 활동 {formatDateTime(selectedItem.summary.last_activity_at)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMergedTimeline((prev) => !prev)}
                      className={`h-10 rounded-lg border px-4 text-[12px] font-black transition-all ${
                        showMergedTimeline
                          ? 'border-accent-pro bg-accent-pro text-white'
                          : 'border-slate-200 bg-slate-50 text-text-secondary hover:border-accent-pro/30 hover:text-accent-pro'
                      }`}
                    >
                      {showMergedTimeline ? '세션별 보기' : '전체 보기'}
                    </button>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    <SummaryStat label="세션" value={selectedItem.summary.session_count} />
                    <SummaryStat label="로그" value={selectedItem.summary.message_count} />
                    <SummaryStat label="첨부 이미지" value={selectedItem.summary.attached_image_count} />
                    <SummaryStat label="생성 결과" value={selectedItem.summary.generation_result_count} />
                    <SummaryStat label="실패" value={selectedItem.summary.failed_count} />
                    <SummaryStat label="마지막" value={formatDateTime(selectedItem.summary.last_activity_at)} />
                  </div>
                </div>

                {!showMergedTimeline && (
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-[13px] font-black text-text-primary">세션</h2>
                      <span className="text-[11px] font-bold text-text-tertiary">{selectedItem.sessions.length}개 세션</span>
                    </div>
                    {selectedItem.sessions.length === 0 ? (
                      <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-[12px] font-bold text-text-tertiary">
                        세션 로그가 없습니다.
                      </div>
                    ) : (
                      <div className="flex gap-3 overflow-x-auto pb-1">
                        {selectedItem.sessions.map((session) => (
                          <SessionCard
                            key={session.session_id}
                            session={session}
                            selected={selectedSessionId === session.session_id}
                            onSelect={() => setSelectedSessionId(session.session_id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <h2 className="truncate text-[14px] font-black text-text-primary">
                        {showMergedTimeline ? '전체 타임라인' : selectedSession?.title || selectedSession?.session_id || '세션 로그'}
                      </h2>
                      <div className="mt-1 text-[11px] font-bold text-text-tertiary">
                        {showMergedTimeline
                          ? '모든 세션을 시간순으로 합쳐서 봅니다.'
                          : `${formatDateTime(selectedSession?.created_at)} - ${formatDateTime(selectedSession?.last_message_at)}`}
                      </div>
                    </div>
                    <div className="flex gap-2 overflow-x-auto">
                      {EVENT_FILTERS.map((filter) => (
                        <FilterButton
                          key={filter.id}
                          active={eventFilter === filter.id}
                          label={filter.label}
                          onClick={() => setEventFilter(filter.id)}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="min-h-[360px] bg-slate-50/60 py-2">
                    {timelineRows.length === 0 ? (
                      <div className="flex h-56 items-center justify-center px-4 text-center text-[13px] font-bold text-text-tertiary">
                        선택한 조건에 맞는 로그가 없습니다.
                      </div>
                    ) : (
                      timelineRows.map((row, index) =>
                        row.type === 'boundary' ? (
                          <TimelineBoundary key={`${row.session.session_id}-${index}`} session={row.session} />
                        ) : (
                          <EventBubble
                            key={row.event.id}
                            event={row.event}
                            session={row.session}
                            selected={selectedEventId === row.event.id}
                            onSelect={() => setSelectedEventId(row.event.id)}
                          />
                        ),
                      )
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        <DetailPanel event={selectedEvent} session={selectedEventSession} onImageOpen={setModalImage} />
      </main>

        {modalImage && (
          <ImageModal
            src={resolveImageUrl(modalImage) ?? modalImage.url}
            s3Key={modalImage.s3_key ?? undefined}
            onClose={() => setModalImage(null)}
          />
        )}
      </div>
    </>
  );
}
