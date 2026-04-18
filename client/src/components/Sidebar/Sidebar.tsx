import type { SessionGroup, UsageInfo } from '../../types';

/**
 * 세션 관리 사이드바
 *
 * groups: 통합된 세션 그룹 목록
 */
export default function Sidebar({ groups, activeGroupId, onGroupSelect, onNewSession, onToggle, usage }: {
  groups: SessionGroup[];
  activeGroupId: string | null;
  onGroupSelect: (groupId: string) => void;
  onNewSession: () => void;
  onToggle: () => void;
  usage?: UsageInfo;
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

  const usagePercent = usage ? Math.min(100, (usage.used / usage.budget) * 100) : 0;

  return (
    <aside className="w-[280px] bg-bg-secondary flex flex-col h-full overflow-hidden border-r border-border-default" id="sidebar">
      {/* Logo */}
      <div className="px-6 py-8 border-b border-border-subtle shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center">
            <img src="/logo.png" alt="S" className="w-full h-full object-contain" onError={(e) => {
              (e.target as any).style.display = 'none';
              (e.target as any).parentElement.innerHTML = '<div class="w-8 h-8 bg-accent-pro rounded-lg flex items-center justify-center font-bold text-white shadow-sm">S</div>';
            }} />
          </div>
          <div className="flex flex-col">
            <span className="text-[14px] font-black text-text-primary tracking-tight leading-tight">Prompt Arena</span>
            <span className="text-[10px] font-bold text-accent-pro uppercase tracking-wider">Snaplink</span>
          </div>
        </div>
        
        {/* 사이드바 접기 버튼 */}
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

      {/* Usage Stats Dashboard */}
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
        
        {/* Progress Bar Container */}
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

      {/* Sessions */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="text-[10px] font-black uppercase tracking-[0.15em] text-text-tertiary/50 px-2.5 py-2 mb-2">채팅 목록</div>

        {groups.length === 0 && (
          <div className="text-[11px] text-text-tertiary text-center py-10 font-bold opacity-50 italic">
            새 세션을 시작해보세요
          </div>
        )}

        {groups.map((group) => (
          <div
            key={group.groupId}
            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border mb-1.5 ${group.groupId === activeGroupId ? 'bg-white border-slate-200 shadow-sm ring-4 ring-slate-100/50' : 'hover:bg-white hover:border-slate-100 border-transparent shadow-none'}`}
            onClick={() => onGroupSelect(group.groupId)}
            id={`group-${group.groupId}`}
          >
            <div className={`w-9 h-9 min-w-9 rounded-lg flex items-center justify-center text-lg relative overflow-hidden transition-colors ${group.groupId === activeGroupId ? 'bg-accent-pro/10 text-accent-pro' : 'bg-slate-100 text-slate-400'}`}>
              {group.proChatId && <span className="absolute left-1 top-1 text-[9px]">⚡</span>}
              {group.flashChatId && <span className="absolute right-1 bottom-1 text-[9px]">🎨</span>}
              <span className="opacity-30 text-xs font-bold">SP</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-[12.5px] font-bold whitespace-nowrap overflow-hidden text-ellipsis ${group.groupId === activeGroupId ? 'text-text-primary' : 'text-text-secondary opacity-80'}`}>{group.name}</div>
              <div className="text-[11px] text-text-tertiary whitespace-nowrap overflow-hidden text-ellipsis font-bold opacity-60">
                {group.lastMessage || '새 대화'}
              </div>
            </div>
            <div className="text-[9px] font-black text-text-tertiary shrink-0 opacity-40">
              {formatRelativeTime(group.lastMessageAt)}
            </div>
          </div>
        ))}

        <button
          className="mt-4 flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-slate-200 bg-transparent cursor-pointer transition-all w-full text-text-tertiary font-bold text-[12px] hover:border-accent-pro hover:text-accent-pro hover:bg-accent-pro/5 active:scale-[0.98]"
          onClick={onNewSession}
          id="new-session-btn"
        >
          <span className="w-8 h-8 min-w-8 rounded-lg flex items-center justify-center text-xl bg-slate-100 group-hover:bg-accent-pro/10">+</span>
          새 세션 시작
        </button>
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
