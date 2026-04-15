import { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import ChatPanel from './components/ChatPanel/ChatPanel';
import { useChat } from './hooks/useChat';
import './App.css';

export default function App() {
  // 세션 상태 관리
  const [sessions, setSessions] = useState([
    { id: 1, name: '프롬프트 테스트 1', detail: 'Gemini Pro & Flash', unread: 0 },
  ]);
  const [activeSessionId, setActiveSessionId] = useState(1);

  // 각각의 훅을 사용해 두 패널의 상태를 독립적으로 관리 (서버 API 연동 시 세션 ID를 넘겨주도록 변경 가능)
  const proChat = useChat('text');
  const flashChat = useChat('image');

  // 사이드바 이벤트
  const handleNewSession = useCallback(() => {
    const newId = Date.now();
    setSessions((prev) => [
      { id: newId, name: `새로운 테스트 세션`, detail: 'Gemini Pro & Flash', unread: 0 },
      ...prev,
    ]);
    setActiveSessionId(newId);
    
    // 새 세션 전환 시 기존 메시지 초기화
    proChat.clearMessages();
    flashChat.clearMessages();
  }, [proChat, flashChat]);

  const handleSessionSelect = useCallback((id) => {
    setActiveSessionId(id);
    // 실제 서버 연동 시 여기에서 해당 세션의 이전 메시지를 불러옵니다.
    // 현재는 Mock이므로 단순히 초기화합니다.
    proChat.clearMessages();
    flashChat.clearMessages();
  }, [proChat, flashChat]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="app-container">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSessionSelect={handleSessionSelect}
        onNewSession={handleNewSession}
      />
      
      <main className="app-main">
        {/* 상단 헤더 */}
        <header className="app-header">
          <div className="app-header__title">
            <span role="img" aria-label="arena">🏟️</span>
            {activeSession ? activeSession.name : '세션을 선택하세요'}
          </div>
          <div className="app-header__active-badge">
            <span className="app-header__active-dot" />
            Arena Active
          </div>
        </header>

        {/* 듀얼 패널 영역 */}
        <div className="app-content">
          <div className="app-panel-wrapper">
            <ChatPanel
              variant="pro"
              messages={proChat.messages}
              isLoading={proChat.isLoading}
              onSend={proChat.sendMessage}
              onClear={proChat.clearMessages}
            />
          </div>
          <div className="app-panel-wrapper">
            <ChatPanel
              variant="flash"
              messages={flashChat.messages}
              isLoading={flashChat.isLoading}
              onSend={flashChat.sendMessage}
              onClear={flashChat.clearMessages}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
