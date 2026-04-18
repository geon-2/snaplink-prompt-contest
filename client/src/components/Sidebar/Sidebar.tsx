import type { SessionGroup } from '../../types';

/**
 * 세션 관리 사이드바
 *
 * groups: 통합된 세션 그룹 목록
 */
export default function Sidebar({ groups, activeGroupId, onGroupSelect, onNewSession, onToggle }: {
  groups: SessionGroup[];
  activeGroupId: string | null;
  onGroupSelect: (groupId: string) => void;
  onNewSession: () => void;
  onToggle: () => void;
}) {
  const formatRelativeTime = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return '방금';
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}시간 전`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}일 전`;
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  return (
    <aside className="w-[280px] bg-bg-secondary flex flex-col h-full overflow-hidden" id="sidebar">
      {/* Logo */}
      <div className="px-6 py-7 border-b border-border-subtle shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-lg text-white shadow-[0_0_20px_rgba(99,102,241,0.3)]">P</div>
          <div className="flex flex-col gap-[2px]">
            <span className="text-[15px] font-bold text-text-primary tracking-[-0.02em]">Prompt Arena</span>
            <span className="text-xs text-text-tertiary">Gemini 프롬프트 대회</span>
          </div>
        </div>
        
        {/* 사이드바 접기 버튼 */}
        <button 
          className="w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover transition-all"
          onClick={onToggle}
          title="사이드바 닫기"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Sessions */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="text-xs font-semibold uppercase tracking-[0.05em] text-text-tertiary px-2 py-2 mb-3">채팅 목록</div>

        {groups.length === 0 && (
          <div className="text-xs text-text-tertiary text-center py-8">
            새 세션을 시작해보세요
          </div>
        )}

        {groups.map((group) => (
          <div
            key={group.groupId}
            className={`flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all border border-transparent mb-2 ${group.groupId === activeGroupId ? 'bg-bg-surface border-border-default shadow-sm' : 'hover:bg-bg-surface-hover'}`}
            onClick={() => onGroupSelect(group.groupId)}
            id={`group-${group.groupId}`}
          >
            <div className="w-9 h-9 min-w-9 rounded-lg flex items-center justify-center text-lg bg-bg-tertiary relative overflow-hidden">
              {group.proChatId && <span className="absolute left-1 top-1 text-[10px]">⚡</span>}
              {group.flashChatId && <span className="absolute right-1 bottom-1 text-[10px]">🎨</span>}
              <span className="opacity-40 text-sm">✦</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-text-primary whitespace-nowrap overflow-hidden text-ellipsis">{group.name}</div>
              <div className="text-xs text-text-tertiary whitespace-nowrap overflow-hidden text-ellipsis">
                {group.lastMessage || '새 대화'}
              </div>
            </div>
            <div className="text-[10px] text-text-tertiary shrink-0">
              {formatRelativeTime(group.lastMessageAt)}
            </div>
          </div>
        ))}

        <button
          className="mt-3 flex items-center gap-3 p-3.5 rounded-xl border border-dashed border-border-default bg-transparent cursor-pointer transition-all w-full text-text-tertiary font-sans text-[13px] hover:border-accent-pro hover:text-accent-pro hover:bg-accent-pro-dim"
          onClick={onNewSession}
          id="new-session-btn"
        >
          <span className="w-9 h-9 min-w-9 rounded-lg flex items-center justify-center text-xl">+</span>
          새 세션 시작
        </button>
      </div>

      {/* Footer */}
      <div className="px-5 py-5 border-t border-border-subtle shrink-0">
        <div className="flex items-center gap-2.5 text-xs text-text-tertiary">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
          <span>대회 진행 중</span>
        </div>
      </div>
    </aside>
  );
}
