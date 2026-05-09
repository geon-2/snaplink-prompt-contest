import { useCallback, useEffect, useState } from 'react';
import { fetchContestAssets } from '../../services/api';
import type { ContestAssetsResponse, ContestImageAsset } from '../../types';

interface ContestAssetsModalProps {
  onClose: () => void;
}

function fallbackAssets(): ContestAssetsResponse {
  return { reference_images: [], before_images: [] };
}

function safeFilename(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9가-힣._-]+/g, '_') || 'contest-image';
}

async function downloadAsset(asset: ContestImageAsset): Promise<void> {
  const source = asset.s3_key ? `/api/images/${asset.s3_key}` : asset.url;
  if (!source) return;

  try {
    const response = await fetch(source, { credentials: 'include' });
    if (!response.ok) throw new Error('download failed');
    const blob = await response.blob();
    const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1] || 'png';
    const filename = asset.file_name || `${safeFilename(asset.title)}.${extension}`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch {
    window.open(source, '_blank', 'noopener,noreferrer');
  }
}

function AssetGrid({
  title,
  emptyText,
  assets,
}: {
  title: string;
  emptyText: string;
  assets: ContestImageAsset[];
}) {
  return (
    <section className="min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-black text-text-primary">{title}</h3>
        <span className="text-[11px] font-bold text-text-tertiary">{assets.length}장</span>
      </div>

      {assets.length === 0 ? (
        <div className="h-28 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[12px] font-bold text-text-tertiary">
          {emptyText}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {assets.map((asset) => (
            <div key={asset.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div className="aspect-square bg-slate-100 overflow-hidden">
                {asset.url ? (
                  <img src={asset.url} alt={asset.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-text-tertiary">
                    이미지 없음
                  </div>
                )}
              </div>
              <div className="p-3 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-black text-text-primary truncate">{asset.title}</div>
                  {asset.file_name && (
                    <div className="text-[10px] font-bold text-text-tertiary truncate mt-0.5">{asset.file_name}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => downloadAsset(asset)}
                  className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-accent-pro hover:bg-accent-pro/10 transition-all"
                  title="다운로드"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ContestAssetsModal({ onClose }: ContestAssetsModalProps) {
  const [assets, setAssets] = useState<ContestAssetsResponse>(fallbackAssets);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const loadAssets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setAssets(await fetchContestAssets());
    } catch (err) {
      setError(err instanceof Error ? err.message : '대회 이미지를 불러오지 못했습니다.');
      setAssets(fallbackAssets());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 backdrop-blur-[3px] animate-fadeIn p-4" onClick={onClose}>
      <div
        className="w-full max-w-[920px] max-h-[88vh] bg-white rounded-lg shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border-default flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-[16px] font-black text-text-primary">대회 이미지</h2>
            <p className="text-[12px] font-bold text-text-tertiary mt-0.5">관리자가 공유한 이미지를 확인하고 받을 수 있습니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-slate-100 transition-all"
            title="닫기"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-[13px] font-bold text-text-tertiary">이미지를 불러오는 중...</div>
          ) : (
            <div className="space-y-8">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] font-bold text-red-600">
                  {error}
                </div>
              )}
              <AssetGrid
                title="공유 이미지"
                emptyText="등록된 공유 이미지가 없습니다."
                assets={assets.reference_images}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
