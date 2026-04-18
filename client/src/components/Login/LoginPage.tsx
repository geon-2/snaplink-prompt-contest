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
          <div className="w-16 h-16 bg-gradient-to-br from-accent-pro to-purple-600 rounded-2xl flex items-center justify-center shadow-lg mb-6 shadow-indigo-500/20">
            <span className="text-3xl">✦</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
            PROMPT ARENA
          </h1>
          <p className="text-text-secondary text-sm font-medium">
            Unlock the Power of Conversation
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-4">
            {/* UUID Input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-text-tertiary ml-1 uppercase tracking-wider">
                User UUID
              </label>
              <div className="relative group">
                <input
                  type="text"
                  value={uuid}
                  onChange={(e) => setUuid(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-text-primary focus:outline-none focus:border-accent-pro/50 focus:bg-white/10 transition-all placeholder:text-text-tertiary/50"
                  spellCheck="false"
                />
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-text-tertiary group-focus-within:text-accent-pro transition-colors">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              </div>
            </div>

            {/* API Key Input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-text-tertiary ml-1 uppercase tracking-wider">
                Arena API Key
              </label>
              <div className="relative group">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-text-primary focus:outline-none focus:border-accent-pro/50 focus:bg-white/10 transition-all placeholder:text-text-tertiary/50"
                />
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-text-tertiary group-focus-within:text-accent-pro transition-colors">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs py-2.5 px-3 rounded-lg flex items-center gap-2 animate-[shake_0.4s_ease-in-out]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0">
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
              className="px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-text-secondary text-sm font-semibold hover:bg-white/10 hover:text-white transition-all active:scale-[0.98]"
            >
              자동 생성
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-3 rounded-xl bg-gradient-to-r from-accent-pro to-indigo-600 text-white text-sm font-bold shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:-translate-y-0.5 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
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
