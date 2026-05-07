import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchContestAssets,
  fetchContestReviewTeam,
  fetchContestReviewTeams,
  uploadContestReviewAssets,
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
const TEAM_JSON_TEMPLATE = {
  '1': {
    team_name: '1팀',
    api_key: 'TEAM_1_API_KEY',
  },
  '2': {
    team_name: '2팀',
    api_key: 'TEAM_2_API_KEY',
  },
};

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

function downloadTeamJsonTemplate(): void {
  const json = `${JSON.stringify(TEAM_JSON_TEMPLATE, null, 2)}\n`;
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'contest-teams.sample.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
          <div className="px-3 py-2 text-[10px] font-black text-text-tertiary uppercase tracking-wider">Before</div>
          <div className="aspect-square bg-slate-100">
            {result.before_image.url ? (
              <img src={result.before_image.url} alt={result.before_image.title} className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-text-tertiary">이미지 없음</div>
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
  const [teams, setTeams] = useState<ContestTeamSummary[]>([]);
  const [assets, setAssets] = useState<ContestAssetsResponse>(emptyAssets);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<ContestSubmission | null>(null);
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [beforeFiles, setBeforeFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const promptAResults = useMemo(
    () => selectedSubmission?.results.filter((result) => result.prompt_slot === 'A') ?? [],
    [selectedSubmission],
  );
  const promptBResults = useMemo(
    () => selectedSubmission?.results.filter((result) => result.prompt_slot === 'B') ?? [],
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
      const [teamItems, assetItems] = await Promise.all([
        fetchContestReviewTeams(trimmedKey),
        fetchContestAssets(),
      ]);
      setTeams(teamItems);
      setAssets(assetItems);
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
  }, []);

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
        setError(err instanceof Error ? err.message : '팀 제출 결과를 불러오지 못했습니다.');
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
    if (referenceFiles.length === 0 && beforeFiles.length === 0) {
      setError('등록할 이미지를 선택해주세요.');
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      setAssets(await uploadContestReviewAssets(trimmedKey, referenceFiles, beforeFiles));
      setReferenceFiles([]);
      setBeforeFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 등록에 실패했습니다.');
    } finally {
      setIsUploading(false);
    }
  }, [adminKey, beforeFiles, referenceFiles]);

  return (
    <div className="h-screen w-screen bg-bg-primary text-text-primary overflow-hidden flex flex-col">
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
        <button
          type="button"
          onClick={loadReviewData}
          disabled={isLoading}
          className="h-9 px-3 rounded-lg bg-accent-pro text-white text-[12px] font-black hover:bg-accent-pro/90 transition-all disabled:opacity-50"
        >
          {isLoading ? '새로고침 중...' : '새로고침'}
        </button>
      </header>

      <main className="flex-1 overflow-hidden grid lg:grid-cols-[320px_1fr]">
        <aside className="min-h-0 overflow-y-auto bg-white border-r border-border-default p-5 space-y-5">
          <section>
            <div className="text-[12px] font-black text-text-primary mb-2">관리자 키</div>
            <div className="flex gap-2">
              <input
                type="password"
                value={adminKey}
                onChange={(event) => setAdminKey(event.target.value)}
                className="flex-1 min-w-0 h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold outline-none focus:bg-white focus:border-accent-pro/50 focus:ring-4 focus:ring-accent-pro/10 transition-all"
                placeholder="Admin review key"
              />
              <button
                type="button"
                onClick={loadReviewData}
                disabled={isLoading}
                className="h-10 px-3 rounded-lg bg-slate-900 text-white text-[12px] font-black disabled:opacity-50"
              >
                확인
              </button>
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-bold text-text-tertiary leading-relaxed mb-2">
                서버 환경변수에는 관리자 키와 팀/API key 매핑 JSON을 등록합니다.
              </div>
              <button
                type="button"
                onClick={downloadTeamJsonTemplate}
                className="w-full h-9 rounded-lg bg-white border border-slate-200 text-[12px] font-black text-text-secondary hover:text-accent-pro hover:border-accent-pro/30 transition-all"
              >
                팀 JSON 템플릿 다운로드
              </button>
            </div>
          </section>

          <section className="border-t border-slate-200 pt-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[12px] font-black text-text-primary">이미지 등록</div>
              <span className="text-[10px] font-bold text-text-tertiary">
                A컷 {assets.reference_images.length} / Before {assets.before_images.length}
              </span>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="block text-[11px] font-black text-text-tertiary mb-1.5">A컷 레퍼런스</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => setReferenceFiles(Array.from(event.target.files ?? []))}
                  className="block w-full text-[11px] font-bold text-text-secondary file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-slate-100 file:text-text-secondary file:font-black"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-black text-text-tertiary mb-1.5">Before 이미지</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => setBeforeFiles(Array.from(event.target.files ?? []))}
                  className="block w-full text-[11px] font-bold text-text-secondary file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-slate-100 file:text-text-secondary file:font-black"
                />
              </label>
              {(referenceFiles.length > 0 || beforeFiles.length > 0) && (
                <div className="text-[11px] font-bold text-text-tertiary">
                  선택됨: A컷 {referenceFiles.length}장, Before {beforeFiles.length}장
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
            <div className="text-[12px] font-black text-text-primary mb-3">팀 목록</div>
            <div className="space-y-1.5">
              {teams.length === 0 ? (
                <div className="h-24 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[12px] font-bold text-text-tertiary">
                  팀 없음
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
                      <span className="text-[12px] font-black text-text-primary truncate">{team.team_name}</span>
                      <StatusBadge submitted={team.submitted} />
                    </div>
                    <div className="text-[10px] font-bold text-text-tertiary">{formatDateTime(team.submitted_at)}</div>
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
              <div className="h-64 flex items-center justify-center text-[13px] font-bold text-text-tertiary">팀 결과를 불러오는 중...</div>
            ) : selectedSubmission ? (
              <>
                <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="text-[18px] font-black text-text-primary">{selectedSubmission.team_name}</div>
                    <div className="text-[12px] font-bold text-text-tertiary mt-1">{formatDateTime(selectedSubmission.submitted_at)}</div>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[12px] font-black text-text-secondary">
                    결과 {selectedSubmission.results.length}개
                  </div>
                </div>

                <div className="grid lg:grid-cols-2 gap-4">
                  <PromptBlock label="Prompt A" value={selectedSubmission.prompt_a} />
                  <PromptBlock label="Prompt B" value={selectedSubmission.prompt_b} />
                </div>

                <ResultSection title="Prompt A 결과" results={promptAResults} />
                <ResultSection title="Prompt B 결과" results={promptBResults} />
              </>
            ) : (
              <div className="h-64 rounded-lg border border-dashed border-slate-200 bg-white flex items-center justify-center text-[13px] font-bold text-text-tertiary">
                팀을 선택하세요.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
