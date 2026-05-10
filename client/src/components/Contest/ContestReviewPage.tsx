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
  ContestSubmission,
  ContestTeamSummary,
} from '../../types';

interface ContestReviewPageProps {
  onBackToChat: () => void;
}

const ADMIN_KEY_STORAGE = 'pa_admin_review_key';
const TEAM_NAMES_STORAGE = 'pa_team_names_map';

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
            <p className="text-[12px] font-bold text-text-tertiary mt-0.5">심사용 페이지 접근에 필요합니다.</p>
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

function TeamNamesModal({
  teams,
  initialMap,
  onConfirm,
  onClose,
}: {
  teams: ContestTeamSummary[];
  initialMap: Record<string, string>;
  onConfirm: (map: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [nameMap, setNameMap] = useState<Record<string, string>>(() => ({ ...initialMap }));

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(nameMap);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5 shrink-0">
          <div>
            <h2 className="text-[16px] font-black text-text-primary">팀 이름 설정</h2>
            <p className="text-[12px] font-bold text-text-tertiary mt-0.5">API key에 팀 이름을 매핑합니다.</p>
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
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          {teams.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[12px] font-bold text-text-tertiary rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8">
              먼저 데이터를 새로고침하세요.
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {teams.map((team) => (
                <div key={team.team_id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-black text-text-tertiary uppercase tracking-wider mb-0.5">API key</div>
                    <div className="font-mono text-[12px] font-bold text-text-primary truncate">{team.api_key_preview}</div>
                  </div>
                  <input
                    type="text"
                    value={nameMap[team.team_id] ?? ''}
                    onChange={(e) => setNameMap((prev) => ({ ...prev, [team.team_id]: e.target.value }))}
                    className="w-28 h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-bold outline-none focus:border-accent-pro/50 focus:ring-4 focus:ring-accent-pro/10 transition-all"
                    placeholder="예) 1팀"
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 mt-4 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl border border-slate-200 text-text-secondary text-[13px] font-black hover:bg-slate-50 transition-all"
            >
              취소
            </button>
            <button
              type="submit"
              className="flex-1 h-11 rounded-xl bg-accent-pro text-white text-[13px] font-black hover:bg-accent-pro/90 transition-all"
            >
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function emptyAssets(): ContestAssetsResponse {
  return { reference_images: [], before_images: [] };
}

function formatDateTime(value?: string | null): string {
  if (!value) return '미제출';
  return new Date(value).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ submitted }: { submitted: boolean }) {
  return (
    <span
      className={`px-2 py-1 rounded-md text-[10px] font-black ${
        submitted
          ? 'bg-accent-pro/10 text-accent-pro border border-accent-pro/15'
          : 'bg-slate-100 text-text-tertiary border border-slate-200'
      }`}
    >
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

function ResultPair({ result }: { result: ContestGeneratedResult }) {
  const afterUrl = result.after_image?.url;
  const hasBeforeImage = Boolean(result.before_image.url);

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="text-[12px] font-black text-text-primary truncate">{result.before_image.title}</div>
        <span
          className={`px-2 py-1 rounded-md text-[10px] font-black ${
            result.status === 'succeeded'
              ? 'bg-accent-pro/10 text-accent-pro'
              : result.status === 'failed'
                ? 'bg-red-50 text-red-500'
                : 'bg-amber-50 text-amber-600'
          }`}
        >
          {result.status === 'succeeded' ? '완료' : result.status === 'failed' ? '실패' : '생성 중'}
        </span>
      </div>
      <div className="grid md:grid-cols-2">
        <div className="min-w-0 border-b md:border-b-0 md:border-r border-slate-200">
          <div className="px-3 py-2 text-[10px] font-black text-text-tertiary uppercase tracking-wider">
            {hasBeforeImage ? 'Before' : 'Prompt'}
          </div>
          <div className="aspect-square bg-slate-100">
            {hasBeforeImage ? (
              <img src={result.before_image.url} alt={result.before_image.title} className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full flex items-center justify-center px-4 text-center text-[11px] font-bold text-text-tertiary">
                최종 프롬프트 기반 생성
              </div>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <div className="px-3 py-2 text-[10px] font-black text-text-tertiary uppercase tracking-wider">After</div>
          <div className="aspect-square bg-slate-100">
            {afterUrl ? (
              <img src={afterUrl} alt={`${result.before_image.title} after`} className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-text-tertiary">
                {result.error_message || '결과 없음'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultSection({ title, results }: { title: string; results: ContestGeneratedResult[] }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-black text-text-primary">{title}</h3>
        <span className="text-[11px] font-bold text-text-tertiary">{results.length}개 결과</span>
      </div>
      {results.length === 0 ? (
        <div className="h-32 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[12px] font-bold text-text-tertiary">
          생성 결과가 없습니다.
        </div>
      ) : (
        <div className="grid xl:grid-cols-2 gap-4">
          {results.map((result) => (
            <ResultPair key={result.id} result={result} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function ContestReviewPage({ onBackToChat }: ContestReviewPageProps) {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? '');
  const [showAdminKeyModal, setShowAdminKeyModal] = useState(() => !sessionStorage.getItem(ADMIN_KEY_STORAGE));
  const [showTeamNamesModal, setShowTeamNamesModal] = useState(false);
  const [teamNamesMap, setTeamNamesMap] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(TEAM_NAMES_STORAGE) ?? '{}'); } catch { return {}; }
  });
  const [teams, setTeams] = useState<ContestTeamSummary[]>([]);
  const [assets, setAssets] = useState<ContestAssetsResponse>(emptyAssets);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<ContestSubmission | null>(null);
  const [sharedImageFile, setSharedImageFile] = useState<File | null>(null);
  const [generationApiKey, setGenerationApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdminKeyConfirm = useCallback((key: string) => {
    sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    setAdminKey(key);
    setShowAdminKeyModal(false);
  }, []);

  const handleTeamNamesConfirm = useCallback((map: Record<string, string>) => {
    localStorage.setItem(TEAM_NAMES_STORAGE, JSON.stringify(map));
    setTeamNamesMap(map);
    setShowTeamNamesModal(false);
  }, []);

  const resolveTeamName = useCallback((teamId: string, fallback: string) => {
    return teamNamesMap[teamId]?.trim() || fallback;
  }, [teamNamesMap]);

  const generatedResults = useMemo(
    () => selectedSubmission?.results ?? [],
    [selectedSubmission],
  );

  const loadReviewData = useCallback(async () => {
    const trimmedKey = adminKey.trim();
    if (!trimmedKey) {
      setError('관리자 키를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      sessionStorage.setItem(ADMIN_KEY_STORAGE, trimmedKey);
      const teamItems = await fetchContestReviewTeams(trimmedKey);
      setTeams(teamItems);
      fetchContestAssets()
        .then(setAssets)
        .catch(() => setAssets(emptyAssets()));
      if (teamItems.length > 0 && !selectedTeamId) {
        setSelectedTeamId(teamItems[0].team_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '심사용 데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [adminKey, selectedTeamId]);

  useEffect(() => {
    if (adminKey.trim()) {
      loadReviewData();
    }
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
    if (!trimmedKey) {
      setError('관리자 키를 입력해주세요.');
      return;
    }
    if (!sharedImageFile) {
      setError('등록할 이미지를 선택해주세요.');
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      setAssets(await uploadContestSharedImage(trimmedKey, sharedImageFile));
      setSharedImageFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 등록에 실패했습니다.');
    } finally {
      setIsUploading(false);
    }
  }, [adminKey, sharedImageFile]);

  const handleGenerateImages = useCallback(async () => {
    const trimmedKey = adminKey.trim();
    const targetApiKey = generationApiKey.trim();
    if (!trimmedKey) {
      setError('관리자 키를 입력해주세요.');
      return;
    }
    if (!targetApiKey) {
      setError('이미지를 생성할 사용자 API key를 입력해주세요.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    try {
      const submission = await generateContestSubmissionImages(trimmedKey, targetApiKey);
      setSelectedTeamId(submission.team_id);
      setSelectedSubmission(submission);
      setGenerationApiKey('');
      setTeams(await fetchContestReviewTeams(trimmedKey));
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 생성 요청에 실패했습니다.');
    } finally {
      setIsGenerating(false);
    }
  }, [adminKey, generationApiKey]);

  return (
    <div className="h-screen w-screen bg-bg-primary text-text-primary overflow-hidden flex flex-col">
      {showAdminKeyModal && (
        <AdminKeyModal
          initialKey={adminKey}
          onConfirm={handleAdminKeyConfirm}
          onClose={() => setShowAdminKeyModal(false)}
        />
      )}
      {showTeamNamesModal && (
        <TeamNamesModal
          teams={teams}
          initialMap={teamNamesMap}
          onConfirm={handleTeamNamesConfirm}
          onClose={() => setShowTeamNamesModal(false)}
        />
      )}
      <header className="h-[64px] shrink-0 bg-white border-b border-border-default px-5 md:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToChat}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-slate-100 transition-all shrink-0"
            title="채팅으로 돌아가기"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-[16px] font-black text-text-primary truncate">심사용 페이지</h1>
            <div className="text-[11px] font-bold text-text-tertiary truncate">Prompt Arena Review</div>
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
            onClick={() => setShowTeamNamesModal(true)}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-text-secondary text-[12px] font-black hover:bg-slate-100 transition-all"
            title="팀 이름 설정"
          >
            팀 이름 설정
          </button>
          <button
            type="button"
            onClick={loadReviewData}
            disabled={isLoading}
            className="h-9 px-3 rounded-lg bg-accent-pro text-white text-[12px] font-black hover:bg-accent-pro/90 transition-all disabled:opacity-50"
          >
            {isLoading ? '새로고침 중...' : '새로고침'}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden grid lg:grid-cols-[320px_1fr]">
        <aside className="min-h-0 overflow-y-auto bg-white border-r border-border-default p-5 space-y-5">
          <section>
            <div className="text-[12px] font-black text-text-primary mb-2">이미지 생성</div>
            <div className="space-y-2">
              <input
                type="password"
                value={generationApiKey}
                onChange={(event) => setGenerationApiKey(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold outline-none transition-all focus:border-accent-pro/50 focus:bg-white focus:ring-4 focus:ring-accent-pro/10"
                placeholder="사용자 API key 원문"
              />
              <button
                type="button"
                onClick={handleGenerateImages}
                disabled={isGenerating}
                className="w-full h-10 rounded-lg bg-slate-900 text-white text-[12px] font-black disabled:opacity-50"
              >
                {isGenerating ? '생성 요청 중...' : '이미지 2장 생성'}
              </button>
            </div>
          </section>

          <section className="border-t border-slate-200 pt-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[12px] font-black text-text-primary">공유 이미지</div>
              <span className="text-[10px] font-bold text-text-tertiary">
                {assets.reference_images.length}장
              </span>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="block text-[11px] font-black text-text-tertiary mb-1.5">업로드할 이미지</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setSharedImageFile(event.target.files?.[0] ?? null)}
                  className="block w-full text-[11px] font-bold text-text-secondary file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-slate-100 file:text-text-secondary file:font-black"
                />
              </label>
              {sharedImageFile && (
                <div className="text-[11px] font-bold text-text-tertiary">
                  선택됨: {sharedImageFile.name}
                </div>
              )}
              <button
                type="button"
                onClick={handleUploadAssets}
                disabled={isUploading}
                className="w-full h-10 rounded-lg bg-accent-pro text-white text-[12px] font-black hover:bg-accent-pro/90 transition-all disabled:opacity-50"
              >
                {isUploading ? '등록 중...' : '이미지 등록'}
              </button>
            </div>
          </section>

          <section className="border-t border-slate-200 pt-5">
            <div className="text-[12px] font-black text-text-primary mb-3">제출 목록</div>
            <div className="space-y-1.5">
              {teams.length === 0 ? (
                <div className="h-24 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[12px] font-bold text-text-tertiary">
                  제출 없음
                </div>
              ) : (
                teams.map((team) => (
                  <button
                    key={team.team_id}
                    type="button"
                    onClick={() => setSelectedTeamId(team.team_id)}
                    className={`w-full text-left rounded-lg border p-3 transition-all ${
                      selectedTeamId === team.team_id
                        ? 'bg-accent-pro/[0.04] border-accent-pro/25'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[12px] font-black text-text-primary truncate">
                        {resolveTeamName(team.team_id, team.team_name)}
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

        <section className="min-h-0 overflow-y-auto p-5 md:p-7">
          <div className="max-w-[1280px] mx-auto space-y-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] font-bold text-red-600">
                {error}
              </div>
            )}

            {isLoadingDetail ? (
              <div className="h-64 flex items-center justify-center text-[13px] font-bold text-text-tertiary">제출 결과를 불러오는 중...</div>
            ) : selectedSubmission ? (
              <>
                <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="text-[18px] font-black text-text-primary">
                    {resolveTeamName(selectedSubmission.team_id, selectedSubmission.team_name)}
                  </div>
                    <div className="text-[12px] font-bold text-text-tertiary mt-1">{formatDateTime(selectedSubmission.submitted_at)}</div>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[12px] font-black text-text-secondary">
                    결과 {selectedSubmission.results.length}개
                  </div>
                </div>

                <PromptBlock label="Final Prompt" value={selectedSubmission.prompt_a} />

                <ResultSection title="생성 이미지" results={generatedResults} />
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
