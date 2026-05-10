import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  generateContestSubmissionImages,
  fetchContestAssets,
  fetchContestReviewTeam,
  fetchContestReviewTeams,
  uploadContestSharedImage,
} from '../../services/api';
import type {
  ContestAssetsResponse,
  ContestGeneratedResult,
  ContestImageAsset,
  ContestSubmission,
  ContestTeamSummary,
} from '../../types';

interface ContestReviewPageProps {
  onBackToChat: () => void;
}

interface TeamRegistration {
  apiKey: string;
  teamName: string;
}

const ADMIN_KEY_STORAGE = 'pa_admin_review_key';
const TEAM_REGISTRATIONS_STORAGE = 'pa_team_registrations';

function loadRegistrations(): TeamRegistration[] {
  const envJson = process.env.CONTEST_TEAMS_JSON;
  if (envJson) {
    try {
      const parsed = JSON.parse(envJson);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* fall through to localStorage */ }
  }
  try {
    const raw = localStorage.getItem(TEAM_REGISTRATIONS_STORAGE);
    if (!raw) return [{ apiKey: '', teamName: '' }];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [{ apiKey: '', teamName: '' }];
    return parsed;
  } catch {
    return [{ apiKey: '', teamName: '' }];
  }
}

const TEAMS_FROM_ENV = (() => {
  const envJson = process.env.CONTEST_TEAMS_JSON;
  if (!envJson) return false;
  try {
    const parsed = JSON.parse(envJson);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch { return false; }
})();

function apiKeyMatchesPreview(apiKey: string, preview: string): boolean {
  if (!apiKey.trim() || !preview) return false;
  const suffix = apiKey.trim().slice(-4).toUpperCase();
  return preview.toUpperCase().includes(suffix);
}

function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '-';
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 10)}...${trimmed.slice(-4)}`;
}

function downloadJson(data: unknown, filename: string) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadUrl(url: string, filename: string) {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

// ─── Modals ───

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
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim()) onConfirm(key.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-white rounded-2xl shadow-2xl border border-slate-200 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-[16px] font-black text-text-primary">관리자 키 입력</h2>
            <p className="text-[12px] font-bold text-text-tertiary mt-0.5">심사용 페이지 접근에 필요합니다.</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:bg-slate-100 transition-all">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-black text-text-primary mb-1.5">Admin Review Key</label>
            <input ref={inputRef} type="password" value={key} onChange={(e) => setKey(e.target.value)}
              className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-[13px] font-bold outline-none focus:bg-white focus:border-accent-pro/50 focus:ring-4 focus:ring-accent-pro/10 transition-all"
              placeholder="관리자 키를 입력하세요" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-slate-200 text-text-secondary text-[13px] font-black hover:bg-slate-50 transition-all">취소</button>
            <button type="submit" disabled={!key.trim()} className="flex-1 h-11 rounded-xl bg-accent-pro text-white text-[13px] font-black hover:bg-accent-pro/90 transition-all disabled:opacity-40">확인</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TeamRegistrationModal({
  initialRegistrations,
  onConfirm,
  onClose,
}: {
  initialRegistrations: TeamRegistration[];
  onConfirm: (registrations: TeamRegistration[]) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<TeamRegistration[]>(() =>
    initialRegistrations.length > 0 ? [...initialRegistrations] : [{ apiKey: '', teamName: '' }],
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const validRows = rows.filter((r) => r.apiKey.trim() || r.teamName.trim());

  const handleDownload = () => downloadJson(validRows, 'contest-teams.json');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(validRows);
  };

  const addRow = () => setRows((prev) => [...prev, { apiKey: '', teamName: '' }]);
  const removeRow = (index: number) =>
    setRows((prev) => (prev.length === 1 ? [{ apiKey: '', teamName: '' }] : prev.filter((_, i) => i !== index)));
  const updateRow = (index: number, field: keyof TeamRegistration, value: string) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <h2 className="text-[16px] font-black text-text-primary">팀 설정</h2>
            <p className="text-[12px] font-bold text-text-tertiary mt-0.5">
              {TEAMS_FROM_ENV
                ? '환경변수(CONTEST_TEAMS_JSON)에서 로드됨 — 읽기 전용'
                : '제출이 감지되면 이미지를 자동으로 생성합니다.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:bg-slate-100 transition-all">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Table */}
        {validRows.length > 0 && (
          <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden shrink-0">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2 text-[10px] font-black text-text-tertiary uppercase tracking-wider w-[110px]">팀 이름</th>
                  <th className="px-3 py-2 text-[10px] font-black text-text-tertiary uppercase tracking-wider">API Key</th>
                </tr>
              </thead>
              <tbody>
                {validRows.map((row, i) => (
                  <tr key={i} className={i > 0 ? 'border-t border-slate-100' : ''}>
                    <td className="px-3 py-2 text-[13px] font-bold text-text-primary">{row.teamName || '-'}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-text-secondary">{maskApiKey(row.apiKey)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Edit form — only when not from env var */}
        {!TEAMS_FROM_ENV && (
          <>
            <div className="grid grid-cols-[120px_1fr_32px] gap-2 mb-2 shrink-0 px-1">
              <div className="text-[11px] font-black text-text-tertiary uppercase tracking-wider">팀 이름</div>
              <div className="text-[11px] font-black text-text-tertiary uppercase tracking-wider">API key</div>
              <div />
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                {rows.map((row, index) => (
                  <div key={index} className="grid grid-cols-[120px_1fr_32px] gap-2 items-center">
                    <input type="text" value={row.teamName} onChange={(e) => updateRow(index, 'teamName', e.target.value)}
                      className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold outline-none focus:border-accent-pro/50 focus:bg-white focus:ring-4 focus:ring-accent-pro/10 transition-all"
                      placeholder="예) 1팀" />
                    <input type="password" value={row.apiKey} onChange={(e) => updateRow(index, 'apiKey', e.target.value)}
                      className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-[12px] font-bold outline-none focus:border-accent-pro/50 focus:bg-white focus:ring-4 focus:ring-accent-pro/10 transition-all"
                      placeholder="sk-ant-..." />
                    <button type="button" onClick={() => removeRow(index)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:bg-red-50 hover:text-red-500 transition-all">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addRow}
                className="mt-3 h-9 w-full rounded-lg border border-dashed border-slate-300 text-text-tertiary text-[12px] font-black hover:border-accent-pro/40 hover:text-accent-pro transition-all shrink-0">
                + 팀 추가
              </button>
              <div className="flex gap-2 mt-3 shrink-0">
                <button type="button" onClick={handleDownload}
                  className="h-11 px-4 rounded-xl border border-slate-200 text-text-secondary text-[13px] font-black hover:bg-slate-50 transition-all flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  JSON 다운로드
                </button>
                <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-slate-200 text-text-secondary text-[13px] font-black hover:bg-slate-50 transition-all">취소</button>
                <button type="submit" className="flex-1 h-11 rounded-xl bg-accent-pro text-white text-[13px] font-black hover:bg-accent-pro/90 transition-all">저장</button>
              </div>
            </form>
          </>
        )}

        {/* Read-only footer when from env var */}
        {TEAMS_FROM_ENV && (
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={handleDownload}
              className="h-11 px-4 rounded-xl border border-slate-200 text-text-secondary text-[13px] font-black hover:bg-slate-50 transition-all flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              JSON 다운로드
            </button>
            <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-slate-200 text-text-secondary text-[13px] font-black hover:bg-slate-50 transition-all">닫기</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ComparisonModal({
  result,
  sharedImage,
  onClose,
}: {
  result: ContestGeneratedResult;
  sharedImage: ContestImageAsset | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const afterUrl = result.after_image?.url;
  const beforeUrl = result.before_image.url || sharedImage?.url || null;
  const afterFilename = result.after_image?.file_name ?? result.after_image?.title ?? 'after.png';

  const handleDownloadAfter = () => {
    if (afterUrl) downloadUrl(afterUrl, afterFilename);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: 'calc(100vh - 32px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
          <div className="text-[14px] font-black text-text-primary">Before / After 비교</div>
          <div className="flex items-center gap-2">
            {afterUrl && (
              <button type="button" onClick={handleDownloadAfter}
                className="h-8 px-3 rounded-lg border border-slate-200 text-[12px] font-black text-text-secondary hover:bg-slate-50 flex items-center gap-1.5 transition-all">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                After 저장
              </button>
            )}
            <button type="button" onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:bg-slate-100 transition-all">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        {/* Body */}
        <div className="grid grid-cols-2 flex-1 min-h-0" style={{ minHeight: 0 }}>
          <div className="flex flex-col border-r border-slate-200 min-h-0">
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 shrink-0">
              <div className="text-[10px] font-black text-text-tertiary uppercase tracking-wider">Before</div>
            </div>
            <div className="flex-1 bg-slate-100 flex items-center justify-center overflow-hidden">
              {beforeUrl ? (
                <img src={beforeUrl} alt="Before" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-[12px] font-bold text-text-tertiary">공유 이미지 없음</span>
              )}
            </div>
          </div>
          <div className="flex flex-col min-h-0">
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 shrink-0">
              <div className="text-[10px] font-black text-text-tertiary uppercase tracking-wider">After</div>
            </div>
            <div className="flex-1 bg-slate-100 flex items-center justify-center overflow-hidden">
              {afterUrl ? (
                <img src={afterUrl} alt="After" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-[12px] font-bold text-text-tertiary">{result.error_message || '생성 결과 없음'}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── UI helpers ───

function emptyAssets(): ContestAssetsResponse {
  return { reference_images: [], before_images: [] };
}

function formatDateTime(value?: string | null): string {
  if (!value) return '미제출';
  return new Date(value).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ submitted }: { submitted: boolean }) {
  return (
    <span className={`px-2 py-1 rounded-md text-[10px] font-black ${
      submitted ? 'bg-accent-pro/10 text-accent-pro border border-accent-pro/15' : 'bg-slate-100 text-text-tertiary border border-slate-200'
    }`}>
      {submitted ? '제출 완료' : '미제출'}
    </span>
  );
}

function PromptBlock({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 min-w-0">
      <div className="text-[11px] font-black text-text-tertiary uppercase tracking-wider mb-2">{label}</div>
      <div className="text-[13px] font-bold text-text-primary leading-relaxed whitespace-pre-wrap break-words">
        {value?.trim() || '미제출'}
      </div>
    </div>
  );
}

function AfterImageGrid({
  results,
  sharedImage,
  onSelect,
}: {
  results: ContestGeneratedResult[];
  sharedImage: ContestImageAsset | null;
  onSelect: (result: ContestGeneratedResult) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="h-32 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[12px] font-bold text-text-tertiary">
        생성 결과가 없습니다.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
      {results.map((result) => {
        const afterUrl = result.after_image?.url;
        const clickable = Boolean(afterUrl) || Boolean(result.before_image.url || sharedImage);
        return (
          <button
            key={result.id}
            type="button"
            onClick={() => onSelect(result)}
            disabled={!clickable}
            className="group rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm text-left transition-all enabled:hover:border-accent-pro/40 enabled:hover:shadow-md disabled:opacity-50 disabled:cursor-default"
          >
            <div className="aspect-square bg-slate-100 overflow-hidden relative">
              {afterUrl ? (
                <img
                  src={afterUrl}
                  alt={result.before_image.title}
                  className="w-full h-full object-cover group-enabled:group-hover:scale-[1.03] transition-transform duration-200"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-text-tertiary">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    className={`w-7 h-7 ${result.status === 'failed' ? 'text-red-400' : 'text-slate-300'}`}>
                    {result.status === 'failed'
                      ? <><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>
                      : <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>
                    }
                  </svg>
                  <span className={`text-[10px] font-black ${result.status === 'failed' ? 'text-red-400' : 'text-slate-400'}`}>
                    {result.status === 'failed' ? '생성 실패' : result.status === 'generating' ? '생성 중...' : '대기 중'}
                  </span>
                </div>
              )}
            </div>
            <div className="px-2.5 py-2 border-t border-slate-200 bg-white">
              <div className="text-[11px] font-black text-text-primary truncate leading-tight">
                {result.before_image.title || `결과 ${result.id}`}
              </div>
              {result.status === 'succeeded' && (
                <div className="mt-0.5 text-[10px] font-bold text-accent-pro">클릭하여 비교</div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Page ───

export default function ContestReviewPage({ onBackToChat }: ContestReviewPageProps) {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? '');
  const [showAdminKeyModal, setShowAdminKeyModal] = useState(() => !sessionStorage.getItem(ADMIN_KEY_STORAGE));
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [teamRegistrations, setTeamRegistrations] = useState<TeamRegistration[]>(loadRegistrations);
  const [teams, setTeams] = useState<ContestTeamSummary[]>([]);
  const [assets, setAssets] = useState<ContestAssetsResponse>(emptyAssets);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<ContestSubmission | null>(null);
  const [comparisonResult, setComparisonResult] = useState<ContestGeneratedResult | null>(null);
  const [sharedImageFile, setSharedImageFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adminKeyRef = useRef(adminKey);
  const teamRegistrationsRef = useRef(teamRegistrations);
  const teamsRef = useRef<ContestTeamSummary[]>([]);
  const selectedTeamIdRef = useRef<string | null>(null);
  const autoGeneratedRef = useRef(new Set<string>());

  useEffect(() => { adminKeyRef.current = adminKey; }, [adminKey]);
  useEffect(() => { teamRegistrationsRef.current = teamRegistrations; }, [teamRegistrations]);
  useEffect(() => { teamsRef.current = teams; }, [teams]);
  useEffect(() => { selectedTeamIdRef.current = selectedTeamId; }, [selectedTeamId]);

  const handleAdminKeyConfirm = useCallback((key: string) => {
    sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    setAdminKey(key);
    setShowAdminKeyModal(false);
  }, []);

  const handleRegistrationsConfirm = useCallback((registrations: TeamRegistration[]) => {
    localStorage.setItem(TEAM_REGISTRATIONS_STORAGE, JSON.stringify(registrations));
    setTeamRegistrations(registrations);
    setShowRegistrationModal(false);
  }, []);

  const resolveTeamName = useCallback((apiKeyPreview: string, fallback: string) => {
    const reg = teamRegistrations.find(
      (r) => r.apiKey.trim() && apiKeyMatchesPreview(r.apiKey, apiKeyPreview),
    );
    return reg?.teamName.trim() || fallback;
  }, [teamRegistrations]);

  const generatedResults = useMemo(() => selectedSubmission?.results ?? [], [selectedSubmission]);

  const selectedTeamPreview = useMemo(
    () => teams.find((t) => t.team_id === selectedSubmission?.team_id)?.api_key_preview ?? '',
    [teams, selectedSubmission],
  );

  const sharedImage = assets.reference_images[0] ?? null;

  const loadReviewData = useCallback(async () => {
    const trimmedKey = adminKey.trim();
    if (!trimmedKey) { setError('관리자 키를 입력해주세요.'); return; }

    setIsLoading(true);
    setError(null);
    try {
      sessionStorage.setItem(ADMIN_KEY_STORAGE, trimmedKey);
      const teamItems = await fetchContestReviewTeams(trimmedKey);
      setTeams(teamItems);
      fetchContestAssets(trimmedKey).then(setAssets).catch(() => setAssets(emptyAssets()));
      if (teamItems.length > 0 && !selectedTeamId) setSelectedTeamId(teamItems[0].team_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '심사용 데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [adminKey, selectedTeamId]);

  useEffect(() => {
    if (adminKey.trim()) loadReviewData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  // Auto-polling + auto-generate
  useEffect(() => {
    if (!adminKey.trim()) return;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      const trimmedKey = adminKeyRef.current.trim();
      if (!trimmedKey) return;

      try {
        const teamItems = await fetchContestReviewTeams(trimmedKey);
        if (cancelled) return;

        // Detect generating → completed for the selected team and reload detail
        const prevSelected = teamsRef.current.find((t) => t.team_id === selectedTeamIdRef.current);
        const nextSelected = teamItems.find((t) => t.team_id === selectedTeamIdRef.current);
        if (
          prevSelected?.status === 'generating' &&
          nextSelected?.status === 'completed' &&
          selectedTeamIdRef.current
        ) {
          fetchContestReviewTeam(selectedTeamIdRef.current, trimmedKey)
            .then((submission) => { if (!cancelled) setSelectedSubmission(submission); })
            .catch(() => {});
        }

        setTeams(teamItems);

        for (const team of teamItems) {
          if (team.status !== 'submitted') {
            const matched = teamRegistrationsRef.current.find(
              (r) => r.apiKey.trim() && apiKeyMatchesPreview(r.apiKey, team.api_key_preview),
            );
            if (matched) autoGeneratedRef.current.add(matched.apiKey.trim());
          }
        }

        for (const reg of teamRegistrationsRef.current) {
          if (cancelled) break;
          const apiKey = reg.apiKey.trim();
          if (!apiKey || autoGeneratedRef.current.has(apiKey)) continue;

          const match = teamItems.find(
            (team) => team.status === 'submitted' && apiKeyMatchesPreview(apiKey, team.api_key_preview),
          );
          if (!match) continue;

          autoGeneratedRef.current.add(apiKey);
          try {
            const submission = await generateContestSubmissionImages(trimmedKey, apiKey);
            if (cancelled) break;
            setSelectedTeamId(submission.team_id);
            setSelectedSubmission(submission);
            const refreshed = await fetchContestReviewTeams(trimmedKey);
            if (!cancelled) setTeams(refreshed);
          } catch {
            // silent, no retry
          }
        }
      } catch {
        // ignore polling errors
      }
    };

    poll();
    const interval = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  useEffect(() => {
    const loadTeamDetail = async () => {
      const trimmedKey = adminKey.trim();
      if (!selectedTeamId || !trimmedKey) return;

      setIsLoadingDetail(true);
      setError(null);
      try {
        setSelectedSubmission(await fetchContestReviewTeam(selectedTeamId, trimmedKey));
      } catch (err) {
        setSelectedSubmission(null);
        setError(err instanceof Error ? err.message : '제출 결과를 불러오지 못했습니다.');
      } finally {
        setIsLoadingDetail(false);
      }
    };
    loadTeamDetail();
  }, [adminKey, selectedTeamId]);

  const handleUploadAssets = useCallback(async () => {
    const trimmedKey = adminKey.trim();
    if (!trimmedKey) { setError('관리자 키를 입력해주세요.'); return; }
    if (!sharedImageFile) { setError('등록할 이미지를 선택해주세요.'); return; }

    setIsUploading(true);
    setError(null);
    try {
      await uploadContestSharedImage(trimmedKey, sharedImageFile);
      setSharedImageFile(null);
      // Re-fetch assets to update the displayed image
      fetchContestAssets().then(setAssets).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 등록에 실패했습니다.');
    } finally {
      setIsUploading(false);
    }
  }, [adminKey, sharedImageFile]);

  return (
    <div className="h-screen w-screen bg-bg-primary text-text-primary overflow-hidden flex flex-col">
      {showAdminKeyModal && (
        <AdminKeyModal initialKey={adminKey} onConfirm={handleAdminKeyConfirm} onClose={() => setShowAdminKeyModal(false)} />
      )}
      {showRegistrationModal && (
        <TeamRegistrationModal initialRegistrations={teamRegistrations} onConfirm={handleRegistrationsConfirm} onClose={() => setShowRegistrationModal(false)} />
      )}
      {comparisonResult && (
        <ComparisonModal result={comparisonResult} sharedImage={sharedImage} onClose={() => setComparisonResult(null)} />
      )}

      <header className="h-[64px] shrink-0 bg-white border-b border-border-default px-5 md:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onBackToChat}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-slate-100 transition-all shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-[16px] font-black text-text-primary truncate">심사용 페이지</h1>
            <div className="text-[11px] font-bold text-text-tertiary truncate">Prompt Arena Review</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowAdminKeyModal(true)}
            className={`h-9 px-3 rounded-lg border text-[12px] font-black transition-all ${
              adminKey.trim() ? 'border-accent-pro/30 bg-accent-pro/[0.06] text-accent-pro hover:bg-accent-pro/10' : 'border-slate-200 bg-slate-50 text-text-secondary hover:bg-slate-100'
            }`}>
            <span className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              {adminKey.trim() ? '키 변경' : '관리자 키 입력'}
            </span>
          </button>
          <button type="button" onClick={() => setShowRegistrationModal(true)}
            className={`h-9 px-3 rounded-lg border text-[12px] font-black transition-all ${
              teamRegistrations.some((r) => r.apiKey.trim()) ? 'border-slate-300 bg-white text-text-primary hover:bg-slate-50' : 'border-slate-200 bg-slate-50 text-text-secondary hover:bg-slate-100'
            }`}>
            팀 설정
          </button>
          <button type="button" onClick={loadReviewData} disabled={isLoading}
            className="h-9 px-3 rounded-lg bg-accent-pro text-white text-[12px] font-black hover:bg-accent-pro/90 transition-all disabled:opacity-50">
            {isLoading ? '새로고침 중...' : '새로고침'}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden grid lg:grid-cols-[300px_1fr]">
        {/* Sidebar */}
        <aside className="min-h-0 overflow-y-auto bg-white border-r border-border-default p-5 space-y-5">
          {/* Shared image */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[12px] font-black text-text-primary">공유 이미지</div>
            </div>

            {sharedImage ? (
              <div className="rounded-xl border border-slate-200 overflow-hidden mb-3">
                <div className="bg-slate-100">
                  <img src={sharedImage.url} alt={sharedImage.title} className="w-full object-contain max-h-48" />
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-slate-200 bg-white">
                  <span className="text-[11px] font-bold text-text-secondary truncate">{sharedImage.title}</span>
                  <a
                    href={sharedImage.url}
                    download={sharedImage.file_name ?? sharedImage.title ?? 'shared-image'}
                    className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-slate-100 text-[11px] font-black text-text-secondary hover:bg-slate-200 transition-all shrink-0"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    저장
                  </a>
                </div>
              </div>
            ) : (
              <div className="h-14 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[11px] font-bold text-text-tertiary mb-3">
                등록된 공유 이미지 없음
              </div>
            )}

            <div className="space-y-2">
              <label className="block">
                <span className="block text-[11px] font-black text-text-tertiary mb-1.5">이미지 교체</span>
                <input type="file" accept="image/*"
                  onChange={(event) => setSharedImageFile(event.target.files?.[0] ?? null)}
                  className="block w-full text-[11px] font-bold text-text-secondary file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-100 file:text-text-secondary file:font-black" />
              </label>
              {sharedImageFile && (
                <div className="text-[11px] font-bold text-text-tertiary truncate">선택됨: {sharedImageFile.name}</div>
              )}
              <button type="button" onClick={handleUploadAssets} disabled={isUploading || !sharedImageFile}
                className="w-full h-9 rounded-lg bg-accent-pro text-white text-[12px] font-black hover:bg-accent-pro/90 transition-all disabled:opacity-50">
                {isUploading ? '등록 중...' : '이미지 등록'}
              </button>
            </div>
          </section>

          {/* Team list */}
          <section className="border-t border-slate-200 pt-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[12px] font-black text-text-primary">제출 목록</div>
              {adminKey.trim() && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-accent-pro">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-pro animate-pulse" />
                  자동 감지 중
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {teams.length === 0 ? (
                <div className="h-24 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[12px] font-bold text-text-tertiary">
                  제출 없음
                </div>
              ) : (
                teams.map((team) => (
                  <button key={team.team_id} type="button" onClick={() => setSelectedTeamId(team.team_id)}
                    className={`w-full text-left rounded-lg border p-3 transition-all ${
                      selectedTeamId === team.team_id ? 'bg-accent-pro/[0.04] border-accent-pro/25' : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[12px] font-black text-text-primary truncate">
                        {resolveTeamName(team.api_key_preview, team.team_name)}
                      </span>
                      <StatusBadge submitted={team.submitted} />
                    </div>
                    <div className="font-mono text-[10px] font-bold text-text-tertiary truncate">{team.api_key_preview}</div>
                    <div className="text-[10px] font-bold text-text-tertiary mt-0.5">{formatDateTime(team.submitted_at)}</div>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>

        {/* Main content */}
        <section className="min-h-0 overflow-y-auto p-5 md:p-7">
          <div className="max-w-[1280px] mx-auto space-y-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] font-bold text-red-600">{error}</div>
            )}

            {isLoadingDetail ? (
              <div className="h-64 flex items-center justify-center text-[13px] font-bold text-text-tertiary">제출 결과를 불러오는 중...</div>
            ) : selectedSubmission ? (
              <>
                <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="text-[18px] font-black text-text-primary">
                      {resolveTeamName(selectedTeamPreview, selectedSubmission.team_name)}
                    </div>
                    <div className="text-[12px] font-bold text-text-tertiary mt-1">{formatDateTime(selectedSubmission.submitted_at)}</div>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[12px] font-black text-text-secondary">
                    결과 {selectedSubmission.results.length}개
                  </div>
                </div>

                <PromptBlock label="Final Prompt" value={selectedSubmission.prompt_a} />

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[13px] font-black text-text-primary">생성 결과</h3>
                    <span className="text-[11px] font-bold text-text-tertiary">{generatedResults.length}개 · 클릭하여 비교</span>
                  </div>
                  <AfterImageGrid results={generatedResults} sharedImage={sharedImage} onSelect={setComparisonResult} />
                </div>
              </>
            ) : (
              <div className="h-64 rounded-lg border border-dashed border-slate-200 bg-white flex items-center justify-center text-[13px] font-bold text-text-tertiary">
                제출을 선택하세요.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
