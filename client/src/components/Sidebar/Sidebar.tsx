import { useState } from 'react';
import type { ChatListItem, UsageInfo } from '../../types';
import logo from '../../assets/logo.svg';

function formatRelativeTime(dateStr: string) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

interface SidebarProps {
  proSessions: ChatListItem[];
  flashSessions: ChatListItem[];
  activeProChatId: string | null;
  activeFlashChatId: string | null;
  isProPanelOpen: boolean;
  isFlashPanelOpen: boolean;
  onProSessionSelect: (chatId: string | null) => void;
  onFlashSessionSelect: (chatId: string | null) => void;
  onToggle: () => void;
  usage?: UsageInfo;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function SessionItem({
  session,
  isActive,
  onClick,
}: {
  session: ChatListItem;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all border mb-1 ${
        isActive
          ? 'bg-white border-slate-200 shadow-sm ring-2 ring-slate-100/80'
          : 'hover:bg-white hover:border-slate-100 border-transparent'
      }`}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div
          className={`text-[12px] font-bold whitespace-nowrap overflow-hidden text-ellipsis ${
            isActive ? 'text-text-primary' : 'text-text-secondary opacity-80'
          }`}
        >
          {session.last_message_preview?.slice(0, 30) || '새 대화'}
        </div>
        <div className="text-[10.5px] text-text-tertiary font-bold opacity-50 mt-0.5">
          {formatRelativeTime(session.last_message_at)}
        </div>
      </div>
    </div>
  );
}

function NewChatItem({ isActive, onClick }: { isActive: boolean; onClick: () => void }) {
  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all border mb-1 ${
        isActive
          ? 'bg-white border-slate-200 shadow-sm ring-2 ring-slate-100/80'
          : 'hover:bg-white hover:border-slate-100 border-transparent'
      }`}
      onClick={onClick}
    >
      <div className="w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-slate-400">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>
      <span className="text-[12px] font-bold text-text-tertiary">새 대화</span>
    </div>
  );
}

export default function Sidebar({
  proSessions,
  flashSessions,
  activeProChatId,
  activeFlashChatId,
  isProPanelOpen,
  isFlashPanelOpen,
  onProSessionSelect,
  onFlashSessionSelect,
  onToggle,
  usage,
}: SidebarProps) {
  const [proExpanded, setProExpanded] = useState(false);
  const [flashExpanded, setFlashExpanded] = useState(false);

  const usagePercent = usage ? Math.min(100, (usage.used / usage.budget) * 100) : 0;

  const handleProToggle = () => {
    setProExpanded((prev) => !prev);
  };

  const handleFlashToggle = () => {
    setFlashExpanded((prev) => !prev);
  };

  return (
    <aside className="w-[280px] bg-bg-secondary flex flex-col h-full overflow-hidden border-r border-border-default" id="sidebar">
      {/* Logo */}
      <div className="px-6 py-8 border-b border-border-subtle shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center">
            <img
              src={logo}
              alt="S"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as any).style.display = 'none';
                (e.target as any).parentElement.innerHTML =
                  '<div class="w-8 h-8 bg-accent-pro rounded-lg flex items-center justify-center font-bold text-white shadow-sm">S</div>';
              }}
            />
          </div>
          <div className="flex flex-col">
            <span className="text-[14px] font-black text-text-primary tracking-tight leading-tight">Prompt Arena</span>
            <span className="text-[10px] font-bold text-accent-pro uppercase tracking-wider">Snaplink</span>
          </div>
        </div>
        <button
          className="w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all"
          onClick={onToggle}
          title="사이드바 닫기"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Usage Stats */}
      <div className="px-6 py-5 border-b border-border-subtle shrink-0 bg-slate-50/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-accent-pro/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-2.5 h-2.5 text-accent-pro">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <span className="text-[10px] font-black text-text-secondary uppercase tracking-[0.1em]">Usage</span>
          </div>
          <span className="text-[10px] font-mono font-bold text-accent-pro bg-white px-1.5 py-0.5 rounded border border-accent-pro/10 shadow-sm">
            ${usage?.used.toFixed(2)} / ${usage?.budget.toFixed(2)}
          </span>
        </div>
        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden relative">
          <div
            className="h-full bg-accent-pro transition-all duration-1000 ease-out relative"
            style={{ width: `${usagePercent}%` }}
          >
            <div className="absolute top-0 right-0 h-full w-4 bg-white/20 blur-[2px]" />
          </div>
        </div>
        <div className="mt-2.5 text-[10px] text-text-tertiary leading-relaxed font-bold opacity-70">
          {usagePercent > 80 ? '⚠️ 예산이 얼마 남지 않았습니다.' : '대회 참여를 위한 사용량이 집계 중입니다.'}
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="text-[10px] font-black uppercase tracking-[0.15em] text-text-tertiary/50 px-2.5 py-2 mb-3">
          채팅 목록
        </div>

        {/* Gemini Section */}
        <div className="mb-2">
          <button
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all border ${
              isProPanelOpen
                ? 'bg-accent-pro/5 border-accent-pro/20 text-accent-pro'
                : 'bg-slate-50 border-slate-100 text-text-secondary hover:bg-white hover:border-slate-200'
            }`}
            onClick={handleProToggle}
          >
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center text-[13px] shrink-0 ${
                isProPanelOpen ? 'bg-accent-pro/10' : 'bg-slate-100'
              }`}
            >
              ✦
            </div>
            <span className="flex-1 text-left text-[12.5px] font-black">Gemini</span>
            {isProPanelOpen && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent-pro animate-pulse shrink-0" />
            )}
            <ChevronIcon open={proExpanded} />
          </button>

          {proExpanded && (
            <div className="mt-1.5 pl-2">
              <NewChatItem
                isActive={isProPanelOpen && !activeProChatId}
                onClick={() => onProSessionSelect(null)}
              />
              {proSessions.map((session) => (
                <SessionItem
                  key={session.chat_id}
                  session={session}
                  isActive={isProPanelOpen && activeProChatId === session.chat_id}
                  onClick={() => onProSessionSelect(session.chat_id)}
                />
              ))}
              {proSessions.length === 0 && (
                <div className="text-[11px] text-text-tertiary text-center py-4 font-bold opacity-40 italic">
                  아직 대화가 없습니다
                </div>
              )}
            </div>
          )}
        </div>

        {/* 나노바나나 Section */}
        <div className="mb-2">
          <button
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all border ${
              isFlashPanelOpen
                ? 'bg-accent-flash/5 border-accent-flash/20 text-accent-flash'
                : 'bg-slate-50 border-slate-100 text-text-secondary hover:bg-white hover:border-slate-200'
            }`}
            onClick={handleFlashToggle}
          >
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center text-[13px] shrink-0 ${
                isFlashPanelOpen ? 'bg-accent-flash/10' : 'bg-slate-100'
              }`}
            >
              🎨
            </div>
            <span className="flex-1 text-left text-[12.5px] font-black">나노바나나</span>
            {isFlashPanelOpen && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent-flash animate-pulse shrink-0" />
            )}
            <ChevronIcon open={flashExpanded} />
          </button>

          {flashExpanded && (
            <div className="mt-1.5 pl-2">
              <NewChatItem
                isActive={isFlashPanelOpen && !activeFlashChatId}
                onClick={() => onFlashSessionSelect(null)}
              />
              {flashSessions.map((session) => (
                <SessionItem
                  key={session.chat_id}
                  session={session}
                  isActive={isFlashPanelOpen && activeFlashChatId === session.chat_id}
                  onClick={() => onFlashSessionSelect(session.chat_id)}
                />
              ))}
              {flashSessions.length === 0 && (
                <div className="text-[11px] text-text-tertiary text-center py-4 font-bold opacity-40 italic">
                  아직 대화가 없습니다
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border-subtle shrink-0">
        <div className="flex items-center gap-2.5 text-[10px] font-black text-text-tertiary uppercase tracking-widest opacity-60">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-pro animate-pulse" />
          <span>Snaplink Live</span>
        </div>
      </div>
    </aside>
  );
}
