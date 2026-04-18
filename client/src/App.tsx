import { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import ChatPanel from './components/ChatPanel/ChatPanel';
import LoginPage from './components/Login/LoginPage';
import { useChat } from './hooks/useChat';
import { fetchChats } from './services/api';
import { getUserUuid, isAuthenticated } from './services/auth';
import type { SessionGroup, ChatListItem } from './types';

/** 세션 그룹화 유틸리티 */
function groupChats(items: ChatListItem[]): SessionGroup[] {
  const groups: SessionGroup[] = [];
  
  // PA_GROUP_MAP (명시적 바인딩) 가져오기
  const groupMapStr = sessionStorage.getItem('PA_GROUP_MAP');
  const bindingMap: Record<string, string> = groupMapStr ? JSON.parse(groupMapStr) : {};

  // 생성 시간(10초 단위)과 메시지 내용을 키로 사용 (Fallback)
  const getGroupKey = (item: ChatListItem) => {
    // 이미 명시적으로 묶인 짝꿍이 있다면 그 짝꿍의 ID와 본인의 ID 중 작은 것을 키로 사용 (일관성)
    const partnerId = bindingMap[item.chat_id];
    if (partnerId) {
      return [item.chat_id, partnerId].sort().join('_');
    }
    
    const timeBucket = Math.floor(new Date(item.created_at).getTime() / 10000);
    return `${timeBucket}_${item.last_message_preview?.slice(0, 30)}`;
  };

  const groupMap = new Map<string, SessionGroup>();

  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).forEach(item => {
    const key = getGroupKey(item);
    if (!groupMap.has(key)) {
      const g: SessionGroup = {
        groupId: key, // 키 자체를 그룹 ID로 사용 (또는 첫 발견 ID)
        proChatId: item.last_message_type === 'chat' ? item.chat_id : null,
        flashChatId: item.last_message_type === 'image' ? item.chat_id : null,
        name: item.last_message_preview?.slice(0, 30) || '새 대화',
        lastMessage: item.last_message_preview || '',
        lastMessageAt: item.last_message_at,
        createdAt: item.created_at,
      };
      groupMap.set(key, g);
      groups.push(g);
    } else {
      const g = groupMap.get(key)!;
      if (item.last_message_type === 'chat') g.proChatId = item.chat_id;
      if (item.last_message_type === 'image') g.flashChatId = item.chat_id;
      // 가장 최근 시간/메시지 업데이트
      if (new Date(item.last_message_at) > new Date(g.lastMessageAt)) {
        g.lastMessage = item.last_message_preview;
        g.lastMessageAt = item.last_message_at;
      }
    }
  });

  return groups;
}

export default function App() {
  // 인증 상태
  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // 사이드바 상태
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // 세션 그룹 목록
  const [sessionGroups, setSessionGroups] = useState<SessionGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  // 듀얼 채팅 훅 (새로운 chatId 생성 시 그룹 갱신)
  const proChat = useChat('chat', (id) => {
    if (!activeGroupId) setActiveGroupId(id);
    refreshSessions();
  });
  const flashChat = useChat('image', (id) => {
    if (!activeGroupId) setActiveGroupId(id);
    refreshSessions();
  });

  // 앱 초기화: 인증 확인 + 세션 로드
  useEffect(() => {
    const init = async () => {
      try {
        const authed = isAuthenticated();
        setIsLoggedIn(authed);
        
        if (authed) {
          const uuid = getUserUuid();
          if (uuid) {
            const chats = await fetchChats(uuid);
            setSessionGroups(groupChats(chats));
          }
        }
      } catch (error) {
        console.error('Initialization failed:', error);
      } finally {
        setIsReady(true);
      }
    };
    init();
  }, []);

  // 로그인 성공 핸들러
  const handleLoginSuccess = useCallback(async () => {
    setIsLoggedIn(true);
    const uuid = getUserUuid();
    if (uuid) {
      const chats = await fetchChats(uuid);
      setSessionGroups(groupChats(chats));
    }
  }, []);

  // 세션 목록 새로고침
  const refreshSessions = useCallback(async () => {
    const uuid = getUserUuid();
    if (!uuid) return;
    try {
      const chats = await fetchChats(uuid);
      setSessionGroups(groupChats(chats));
    } catch { /* 무시 */ }
  }, []);

  // 새 세션 시작
  const handleNewSession = useCallback(() => {
    setActiveGroupId(null);
    proChat.clearMessages();
    flashChat.clearMessages();
  }, [proChat, flashChat]);

  // 세션 그룹 선택
  const handleSessionSelect = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
    proChat.clearMessages();
    flashChat.clearMessages();

    const group = sessionGroups.find((g) => g.groupId === groupId);
    if (group) {
      if (group.proChatId) proChat.loadChat(group.proChatId);
      if (group.flashChatId) flashChat.loadChat(group.flashChatId);
    }
  }, [proChat, flashChat, sessionGroups]);

  // 메시지 전송 래퍼
  const handleProSend = useCallback(async (text: string, files?: File[]) => {
    // 현재 세션 그룹의 짝꿍 ID가 있으면 같이 전달하여 명시적으로 묶음
    const partnerId = flashChat.chatId || undefined;
    await proChat.sendMessage(text, files, partnerId);
    setTimeout(refreshSessions, 500);
  }, [proChat, flashChat.chatId, refreshSessions]);

  const handleFlashSend = useCallback(async (text: string, files?: File[]) => {
    // 현재 세션 그룹의 짝꿍 ID가 있으면 같이 전달하여 명시적으로 묶음
    const partnerId = proChat.chatId || undefined;
    await flashChat.sendMessage(text, files, partnerId);
    setTimeout(refreshSessions, 500);
  }, [flashChat, proChat.chatId, refreshSessions]);

  // 초기화 중 로딩 표시
  if (!isReady) {
    return (
      <div className="flex h-screen w-screen bg-bg-primary items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-t-accent-pro border-border-subtle rounded-full animate-spin" />
          <span className="text-text-tertiary text-sm">초기화 중...</span>
        </div>
      </div>
    );
  }


  const activeGroup = sessionGroups.find((g) => g.groupId === activeGroupId);

  // 미인증 시 로그인 페이지 표시
  if (!isLoggedIn) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="flex h-screen w-screen bg-bg-primary text-text-primary overflow-hidden">
      {/* 사이드바 컨테이너 (트랜지션 적용) */}
      <div className={`transition-all duration-300 ease-in-out overflow-hidden border-r border-border-subtle shrink-0 ${isSidebarOpen ? 'w-[280px] opacity-100' : 'w-0 opacity-0 border-none'}`}>
        <Sidebar
          groups={sessionGroups}
          activeGroupId={activeGroupId}
          onGroupSelect={handleSessionSelect}
          onNewSession={handleNewSession}
          onToggle={() => setIsSidebarOpen(false)}
        />
      </div>
      
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* 상단 헤더 */}
        <header className="h-[64px] flex items-center justify-between px-8 bg-bg-secondary border-b border-border-subtle shrink-0 z-10">
          <div className="flex items-center gap-4">
            {/* 사이드바 열기 버튼 (닫혀있을 때만 표시) */}
            {!isSidebarOpen && (
              <button 
                className="w-9 h-9 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover transition-all"
                onClick={() => setIsSidebarOpen(true)}
                title="사이드바 열기"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[20px] h-[20px]">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            )}
            <div className="flex items-center gap-3 text-base font-semibold">
              {activeGroup ? activeGroup.name : '새 대화'}
            </div>
          </div>
          <div className="bg-[#22c55e]/10 text-[#22c55e] px-3 py-1.5 rounded-full text-xs flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            Arena Active
          </div>
        </header>

        {/* 듀얼 패널 영역 */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          <div className="flex-1 flex min-w-0 h-full border-b md:border-b-0 md:border-r border-border-subtle">
            <ChatPanel
              variant="pro"
              messages={proChat.messages}
              isLoading={proChat.isLoading}
              onSend={handleProSend}
              onStop={proChat.stopGeneration}
              onRetry={(id: string, content: string) => {
                proChat.rollbackTo(id);
                proChat.sendMessage(content);
              }}
              onEdit={(id: string) => {
                proChat.rollbackTo(id);
              }}
            />
          </div>
          <div className="flex-1 flex min-w-0 min-h-0 overflow-hidden">
            <ChatPanel
              variant="flash"
              messages={flashChat.messages}
              isLoading={flashChat.isLoading}
              onSend={handleFlashSend}
              onStop={flashChat.stopGeneration}
              onRetry={(id: string, content: string) => {
                flashChat.rollbackTo(id);
                flashChat.sendMessage(content);
              }}
              onEdit={(id: string) => {
                flashChat.rollbackTo(id);
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
