import React, { useState } from 'react';
import { signup, deriveUuidFromApiKey } from '../../services/auth';
import logo from '../../assets/logo.svg';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey) {
      setError('Arena API Key를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const uuid = await deriveUuidFromApiKey(apiKey);
      await signup(uuid, apiKey);
      onLoginSuccess();
    } catch (err: any) {
      setError(err.message || '로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-aurora flex items-center justify-center p-4 relative overflow-hidden font-sans">
      <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-accent-pro opacity-10 blur-[120px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-accent-pro opacity-10 blur-[120px] rounded-full animate-pulse-slow" />

      <div className="w-[440px] glass-card p-10 flex flex-col items-center animate-fadeIn relative z-10 border border-white shadow-2xl">
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-20 h-20 mb-6 flex items-center justify-center -translate-y-2">
            <img
              src={logo}
              alt="Snaplink Logo"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as any).style.display = 'none';
                (e.target as any).parentElement.innerHTML =
                  '<div class="w-16 h-16 bg-accent-pro rounded-2xl flex items-center justify-center shadow-lg"><span class="text-3xl text-white font-bold">S</span></div>';
              }}
            />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-text-primary mb-2">PROMPT ARENA</h1>
          <p className="text-text-secondary text-sm font-semibold opacity-80">
            Unlock the Power of Prompt Engineering
          </p>
        </div>

        <form onSubmit={handleLogin} className="w-full space-y-6">
          <div className="space-y-2 text-left">
            <label className="text-[11px] font-bold text-text-tertiary ml-1 uppercase tracking-widest opacity-70">
              Arena API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="••••••••••••••••"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm text-text-primary focus:outline-none focus:border-accent-pro focus:ring-4 focus:ring-accent-pro/10 transition-all placeholder:text-text-tertiary/40"
            />
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

          <button
            type="submit"
            disabled={isLoading}
            className="w-full px-4 py-3.5 rounded-xl bg-accent-pro text-white text-sm font-black shadow-lg shadow-accent-pro/20 hover:shadow-accent-pro/40 hover:-translate-y-0.5 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            {isLoading ? '로딩 중...' : 'ARENA 진입'}
          </button>
        </form>

        <div className="mt-12 text-center text-[11px] text-text-tertiary/40">
          © 2026 Prompt Arena AI. All rights reserved.
        </div>
      </div>
    </div>
  );
}
