import { useState, useRef, useEffect } from 'react';
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
  onSettingsOpen: () => void;
  onRenameSession: (chatId: string, newTitle: string) => void;
  onDeleteSession: (chatId: string) => void;
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

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

function SessionItem({
  session,
  isActive,
  onClick,
  onRename,
  onDelete,
}: {
  session: ChatListItem;
  isActive: boolean;
  onClick: () => void;
  onRename: (newTitle: string) => void;
  onDelete: () => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayName = session.title || session.last_message_preview?.slice(0, 30) || '새 대화';

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isMenuOpen]);

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming]);

  const handleRenameStart = () => {
    setRenameValue(displayName);
    setIsRenaming(true);
    setIsMenuOpen(false);
  };

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== displayName) {
      onRename(trimmed);
    }
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
    }
  };

  if (isRenaming) {
    return (
      <div
        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border mb-1 ${
          isActive
            ? 'bg-white border-slate-200 shadow-sm ring-2 ring-slate-100/80'
            : 'bg-white border-slate-200'
        }`}
      >
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={handleRenameSubmit}
          className="flex-1 min-w-0 text-[12px] font-bold text-text-primary bg-transparent border-none outline-none"
        />
      </div>
    );
  }

  return (
    <div
      className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all border mb-1 ${
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
          {displayName}
        </div>
        <div className="text-[10.5px] text-text-tertiary font-bold opacity-50 mt-0.5">
          {formatRelativeTime(session.last_message_at)}
        </div>
      </div>

      <div className="relative shrink-0" ref={menuRef}>
        <button
          className="w-6 h-6 flex items-center justify-center rounded-md text-text-tertiary hover:text-text-primary hover:bg-slate-100 transition-all opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            setIsMenuOpen((prev) => !prev);
          }}
          title="더보기"
        >
          <DotsIcon />
        </button>

        {isMenuOpen && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 min-w-[110px] animate-fadeIn">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-bold text-text-primary hover:bg-slate-50 transition-all text-left"
              onClick={(e) => {
                e.stopPropagation();
                handleRenameStart();
              }}
            >
              이름 변경
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-bold text-red-500 hover:bg-red-50 transition-all text-left"
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(false);
                onDelete();
              }}
            >
              삭제
            </button>
          </div>
        )}
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

function DeleteConfirmModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-[2px] animate-fadeIn"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-[320px] w-full mx-4 border border-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[15px] font-black text-text-primary mb-1.5">대화를 삭제할까요?</h3>
        <p className="text-[12.5px] text-text-tertiary font-bold mb-6 leading-relaxed">
          삭제된 대화는 복구할 수 없습니다.
        </p>
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-black text-text-secondary bg-slate-100 hover:bg-slate-200 transition-all"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-black text-white bg-red-500 hover:bg-red-600 transition-all shadow-sm"
          >
            삭제
          </button>
        </div>
      </div>
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
  onSettingsOpen,
  onRenameSession,
  onDeleteSession,
  usage,
}: SidebarProps) {
  const [proExpanded, setProExpanded] = useState(false);
  const [flashExpanded, setFlashExpanded] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const usagePercent = usage ? Math.min(100, (usage.used / usage.budget) * 100) : 0;
  const usedKRW = usage ? Math.floor(usage.used) : 0;
  const budgetKRW = usage ? Math.floor(usage.budget) : 0;

  const handleDeleteConfirm = () => {
    if (deleteTargetId) {
      onDeleteSession(deleteTargetId);
      setDeleteTargetId(null);
    }
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
            ₩{usedKRW.toLocaleString('ko-KR')} / ₩{budgetKRW.toLocaleString('ko-KR')}
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
            onClick={() => setProExpanded((prev) => !prev)}
          >
            <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[13px] shrink-0 ${isProPanelOpen ? 'bg-accent-pro/10' : 'bg-slate-100'}`}>
              ✦
            </div>
            <span className="flex-1 text-left text-[12.5px] font-black">Gemini</span>
            {isProPanelOpen && <span className="w-1.5 h-1.5 rounded-full bg-accent-pro animate-pulse shrink-0" />}
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
                  onRename={(newTitle) => onRenameSession(session.chat_id, newTitle)}
                  onDelete={() => setDeleteTargetId(session.chat_id)}
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
            onClick={() => setFlashExpanded((prev) => !prev)}
          >
            <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[13px] shrink-0 ${isFlashPanelOpen ? 'bg-accent-flash/10' : 'bg-slate-100'}`}>
              🎨
            </div>
            <span className="flex-1 text-left text-[12.5px] font-black">나노바나나</span>
            {isFlashPanelOpen && <span className="w-1.5 h-1.5 rounded-full bg-accent-flash animate-pulse shrink-0" />}
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
                  onRename={(newTitle) => onRenameSession(session.chat_id, newTitle)}
                  onDelete={() => setDeleteTargetId(session.chat_id)}
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
      <div className="px-4 py-4 border-t border-border-subtle shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-[10px] font-black text-text-tertiary uppercase tracking-widest opacity-60">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-pro animate-pulse" />
          <span>Snaplink Live</span>
        </div>
        <button
          onClick={onSettingsOpen}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all"
          title="설정"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {deleteTargetId && (
        <DeleteConfirmModal
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTargetId(null)}
        />
      )}
    </aside>
  );
}
