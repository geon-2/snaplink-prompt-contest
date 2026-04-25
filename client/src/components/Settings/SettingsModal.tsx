import React, { useState } from 'react';
import { getUserApiKey, getUserUuid, signup, logout } from '../../services/auth';

interface SettingsModalProps {
  onClose: () => void;
  onLogout: () => void;
  onApiKeyUpdated: () => void;
}

export default function SettingsModal({ onClose, onLogout, onApiKeyUpdated }: SettingsModalProps) {
  const currentKey = getUserApiKey() ?? '';
  const maskedKey = currentKey.length > 8
    ? currentKey.slice(0, 4) + '••••••••' + currentKey.slice(-4)
    : '••••••••••••';

  const [newKey, setNewKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const uuid = getUserUuid();
      if (!uuid) throw new Error('사용자 정보를 찾을 수 없습니다.');
      await signup(uuid, newKey.trim());
      setSaveSuccess(true);
      setNewKey('');
      onApiKeyUpdated();
    } catch (err: any) {
      setSaveError(err.message || 'API Key 변경 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    onLogout();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[420px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-500">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <span className="text-[14px] font-black text-text-primary">설정</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-slate-100 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* API Key Section */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-text-tertiary/60 mb-3">
              Arena API Key
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[12px] font-mono text-text-secondary mb-3">
              {maskedKey}
            </div>
            <form onSubmit={handleSaveKey} className="space-y-2">
              <input
                type="password"
                value={newKey}
                onChange={(e) => { setNewKey(e.target.value); setSaveSuccess(false); setSaveError(null); }}
                placeholder="새 API Key 입력"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-pro focus:ring-4 focus:ring-accent-pro/10 transition-all placeholder:text-text-tertiary/40"
              />
              {saveError && (
                <div className="text-red-500 text-[11px] px-1">{saveError}</div>
              )}
              {saveSuccess && (
                <div className="text-green-600 text-[11px] px-1">API Key가 변경되었습니다.</div>
              )}
              <button
                type="submit"
                disabled={isSaving || !newKey.trim()}
                className="w-full px-4 py-2.5 rounded-xl bg-accent-pro text-white text-sm font-black shadow-sm hover:shadow-accent-pro/30 hover:-translate-y-0.5 transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
              >
                {isSaving ? '저장 중...' : 'API Key 변경'}
              </button>
            </form>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100" />

          {/* Logout */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-text-tertiary/60 mb-3">
              계정
            </div>
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-500 text-sm font-black hover:bg-red-100 hover:border-red-300 transition-all active:scale-[0.98]"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
