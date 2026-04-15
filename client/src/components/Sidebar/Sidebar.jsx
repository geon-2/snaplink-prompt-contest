import './Sidebar.css';

/**
 * 세션 관리 사이드바
 *
 * @param {object} props
 * @param {object[]} props.sessions - 세션 목록
 * @param {string} props.activeSessionId - 현재 활성 세션 ID
 * @param {function} props.onSessionSelect - 세션 선택 콜백
 * @param {function} props.onNewSession - 새 세션 생성 콜백
 */
export default function Sidebar({ sessions, activeSessionId, onSessionSelect, onNewSession }) {
  return (
    <aside className="sidebar" id="sidebar">
      {/* Logo */}
      <div className="sidebar__header">
        <div className="sidebar__logo">
          <div className="sidebar__logo-icon">P</div>
          <div className="sidebar__logo-text">
            <span className="sidebar__logo-title">Prompt Arena</span>
            <span className="sidebar__logo-subtitle">Gemini 프롬프트 대회</span>
          </div>
        </div>
      </div>

      {/* Sessions */}
      <div className="sidebar__content">
        <div className="sidebar__section-label">세션 목록</div>

        {sessions.map((session) => (
          <div
            key={session.id}
            className={`sidebar__session ${session.id === activeSessionId ? 'sidebar__session--active' : ''}`}
            onClick={() => onSessionSelect(session.id)}
            id={`session-${session.id}`}
          >
            <div className="sidebar__session-icon">⚡</div>
            <div className="sidebar__session-info">
              <div className="sidebar__session-name">{session.name}</div>
              <div className="sidebar__session-detail">{session.detail}</div>
            </div>
            {session.unread > 0 && (
              <div className="sidebar__session-badge">{session.unread}</div>
            )}
          </div>
        ))}

        <button
          className="sidebar__new-session"
          onClick={onNewSession}
          id="new-session-btn"
        >
          <span className="sidebar__new-session-icon">+</span>
          새 세션 시작
        </button>
      </div>

      {/* Footer */}
      <div className="sidebar__footer">
        <div className="sidebar__footer-info">
          <span className="sidebar__footer-dot" />
          <span>대회 진행 중</span>
        </div>
      </div>
    </aside>
  );
}
