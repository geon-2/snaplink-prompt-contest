import { useCallback, useEffect, useState } from 'react';
import { AlreadySubmittedError, fetchContestMe, submitContestPrompts } from '../../services/api';
import type { ContestMe, ContestSubmission } from '../../types';

interface ContestSubmitPageProps {
  onBackToChat: () => void;
}

function formatSubmittedAt(value?: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AlreadySubmittedModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/40 backdrop-blur-[3px] p-4 animate-fadeIn">
      <div className="w-full max-w-[360px] bg-white rounded-lg shadow-2xl border border-slate-200 p-6">
        <div className="w-11 h-11 rounded-lg bg-accent-pro/10 text-accent-pro flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 className="text-[16px] font-black text-text-primary mb-2">이미 제출되었습니다</h3>
        <p className="text-[13px] font-bold text-text-secondary leading-relaxed">
          해당 API key로 이미 최종 프롬프트가 제출되었습니다. 중복 제출은 허용되지 않습니다.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full h-10 mt-6 rounded-lg bg-slate-100 text-text-secondary text-[13px] font-black hover:bg-slate-200 transition-all"
        >
          확인
        </button>
      </div>
    </div>
  );
}

function ConfirmSubmitModal({
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/40 backdrop-blur-[3px] p-4 animate-fadeIn">
      <div className="w-full max-w-[400px] bg-white rounded-lg shadow-2xl border border-slate-200 p-6">
        <div className="w-11 h-11 rounded-lg bg-red-50 text-red-500 flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h3 className="text-[16px] font-black text-text-primary mb-2">최종 제출</h3>
        <p className="text-[13px] font-bold text-text-secondary leading-relaxed">
          제출 후에는 답안을 수정할 수 없습니다.
        </p>
        <div className="flex gap-2.5 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 h-10 rounded-lg bg-slate-100 text-text-secondary text-[13px] font-black hover:bg-slate-200 transition-all disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="flex-1 h-10 rounded-lg bg-accent-pro text-white text-[13px] font-black hover:bg-accent-pro/90 transition-all disabled:opacity-50"
          >
            {isSubmitting ? '제출 중...' : '제출'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SubmittedSummary({ submission }: { submission: ContestSubmission }) {
  return (
    <div className="rounded-lg border border-accent-pro/20 bg-accent-pro/[0.04] p-5">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <div className="text-[13px] font-black text-accent-pro">제출 완료</div>
          {submission.submitted_at && (
            <div className="text-[11px] font-bold text-text-tertiary mt-1">{formatSubmittedAt(submission.submitted_at)}</div>
          )}
        </div>
        <div className="px-3 py-1.5 rounded-lg bg-white border border-accent-pro/15 text-[11px] font-black text-accent-pro">
          {submission.status}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="text-[11px] font-black text-text-tertiary uppercase tracking-wider mb-2">Final Prompt</div>
        <div className="text-[13px] font-bold text-text-primary leading-relaxed whitespace-pre-wrap">{submission.prompt_a}</div>
      </div>
    </div>
  );
}

export default function ContestSubmitPage({ onBackToChat }: ContestSubmitPageProps) {
  const [me, setMe] = useState<ContestMe | null>(null);
  const [promptA, setPromptA] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAlreadySubmitted, setShowAlreadySubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitted = Boolean(me?.submitted && me.submission);
  const canSubmit = promptA.trim().length > 0 && !submitted && !isSubmitting;

  const loadPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const meData = await fetchContestMe();
      setMe(meData);
      setPromptA(meData.submission?.prompt_a ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : '제출 정보를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const submission = await submitContestPrompts(promptA.trim());
      setMe({
        team_id: submission.team_id,
        team_name: submission.team_name,
        submitted: true,
        submission,
      });
      setShowConfirm(false);
    } catch (err) {
      if (err instanceof AlreadySubmittedError) {
        setShowAlreadySubmitted(true);
      } else {
        setError(err instanceof Error ? err.message : '최종 프롬프트 제출에 실패했습니다.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, promptA]);

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
            <h1 className="text-[16px] font-black text-text-primary truncate">최종 프롬프트 제출</h1>
            <div className="text-[11px] font-bold text-text-tertiary truncate">{me?.team_name ?? '팀 확인 중'}</div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="max-w-[980px] mx-auto space-y-5">
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-[13px] font-bold text-text-tertiary">제출 정보를 불러오는 중...</div>
          ) : (
            <>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] font-bold text-red-600">
                  {error}
                </div>
              )}

              {me?.submission && submitted ? (
                <SubmittedSummary submission={me.submission} />
              ) : (
                <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-[14px] font-black text-text-primary">답안 입력</h2>
                      <div className="text-[11px] font-bold text-text-tertiary mt-1">
                        제출된 프롬프트는 관리자 심사 화면에서 이미지 생성에 사용됩니다.
                      </div>
                    </div>
                    <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-black text-text-tertiary">
                      1회 제출
                    </div>
                  </div>

                  <div className="p-5 space-y-5">
                    <label className="block">
                      <div className="text-[12px] font-black text-text-secondary mb-2">Final Prompt</div>
                      <textarea
                        value={promptA}
                        onChange={(event) => setPromptA(event.target.value)}
                        disabled={submitted || isSubmitting}
                        className="w-full min-h-[180px] resize-y rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] font-bold text-text-primary leading-relaxed outline-none focus:bg-white focus:border-accent-pro/50 focus:ring-4 focus:ring-accent-pro/10 transition-all disabled:opacity-60"
                        placeholder="최종 프롬프트를 입력하세요."
                      />
                    </label>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
                      <div className="text-[12px] font-bold text-text-tertiary">
                        제출 후에는 같은 API key로 다시 제출할 수 없습니다.
                      </div>
                      <button
                        type="button"
                        disabled={!canSubmit}
                        onClick={() => setShowConfirm(true)}
                        className="h-11 px-5 rounded-lg bg-accent-pro text-white text-[13px] font-black shadow-lg shadow-accent-pro/15 hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                      >
                        {isSubmitting ? '생성 요청 중...' : '제출하기'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {showConfirm && (
        <ConfirmSubmitModal
          isSubmitting={isSubmitting}
          onCancel={() => setShowConfirm(false)}
          onConfirm={handleSubmit}
        />
      )}
      {showAlreadySubmitted && (
        <AlreadySubmittedModal onClose={() => setShowAlreadySubmitted(false)} />
      )}
    </div>
  );
}
