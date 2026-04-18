import React, { useState } from 'react';
import { signup, generateUuid } from '../../services/auth';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [uuid, setUuid] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAutoGenerate = () => {
    setUuid(generateUuid());
    setApiKey(generateUuid().split('-')[0].toUpperCase()); // API Key는 좀 더 짧게 생성 시뮬레이션
    setError(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uuid || !apiKey) {
      setError('UUID와 API Key를 모두 입력하거나 자동 생성해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      await signup(uuid, apiKey);
      onLoginSuccess();
    } catch (err) {
      setError('인증 정보 저장 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-aurora flex items-center justify-center p-6 select-none font-sans">
      {/* Decorative Aura Shapes */}
      <div className="absolute top-[10%] left-[15%] w-64 h-64 bg-accent-pro/10 rounded-full blur-[100px] float-animation" />
      <div className="absolute bottom-[10%] right-[15%] w-80 h-80 bg-accent-flash/5 rounded-full blur-[120px] float-animation" style={{ animationDelay: '-3s' }} />

      <div className="glass-card glass-card-accent w-full max-w-[440px] rounded-[32px] p-10 z-10 animate-[scaleIn_0.5s_ease-out]">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-20 h-20 mb-6 flex items-center justify-center -translate-y-2">
             <img src="/logo.png" alt="Snaplink Logo" className="w-full h-full object-contain" onError={(e) => {
               // 로고 이미지가 없을 경우 폴백 표시
               (e.target as any).style.display = 'none';
               (e.target as any).parentElement.innerHTML = '<div class="w-16 h-16 bg-accent-pro rounded-2xl flex items-center justify-center shadow-lg"><span class="text-3xl text-white font-bold">S</span></div>';
             }} />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-text-primary mb-2">
            PROMPT ARENA
          </h1>
          <p className="text-text-secondary text-sm font-semibold opacity-80">
            Unlock the Power of Prompt Engineering
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-4">
            {/* User UUID Input */}
            <div className="space-y-2 text-left">
              <label className="text-[11px] font-bold text-text-tertiary ml-1 uppercase tracking-widest opacity-70">
                User UUID
              </label>
              <div className="relative group">
                <input
                  type="text"
                  value={uuid}
                  onChange={(e) => setUuid(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm text-text-primary focus:outline-none focus:border-accent-pro focus:ring-4 focus:ring-accent-pro/10 transition-all placeholder:text-text-tertiary/40"
                  spellCheck="false"
                />
              </div>
            </div>

            {/* API Key Input */}
            <div className="space-y-2 text-left">
              <label className="text-[11px] font-bold text-text-tertiary ml-1 uppercase tracking-widest opacity-70">
                Arena API Key
              </label>
              <div className="relative group">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm text-text-primary focus:outline-none focus:border-accent-pro focus:ring-4 focus:ring-accent-pro/10 transition-all placeholder:text-text-tertiary/40"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50/50 border border-red-200 text-red-500 text-xs py-2.5 px-3 rounded-xl flex items-center gap-2 animate-shake">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 pt-2">
            <button
              type="button"
              onClick={handleAutoGenerate}
              className="px-4 py-3.5 rounded-xl border border-slate-200 bg-white text-text-secondary text-sm font-bold hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-[0.98]"
            >
              자동 생성
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-3.5 rounded-xl bg-accent-pro text-white text-sm font-black shadow-lg shadow-accent-pro/20 hover:shadow-accent-pro/40 hover:-translate-y-0.5 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {isLoading ? '로딩 중...' : 'ARENA 진입'}
            </button>
          </div>
        </form>

        <div className="mt-12 text-center text-[11px] text-text-tertiary/40">
          © 2026 Prompt Arena AI. All rights reserved.
        </div>
      </div>
    </div>
  );
}
