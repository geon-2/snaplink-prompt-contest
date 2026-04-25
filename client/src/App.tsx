import { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import ChatPanel from './components/ChatPanel/ChatPanel';
import LoginPage from './components/Login/LoginPage';
import SettingsModal from './components/Settings/SettingsModal';
import { useChat } from './hooks/useChat';
import { fetchChats, fetchUsage } from './services/api';
import { getUserUuid, isAuthenticated } from './services/auth';
import type { ChatListItem, UsageInfo } from './types';

function sortByRecent(items: ChatListItem[]): ChatListItem[] {
  return [...items].sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  );
}

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [usage, setUsage] = useState<UsageInfo>();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [proSessions, setProSessions] = useState<ChatListItem[]>([]);
  const [flashSessions, setFlashSessions] = useState<ChatListItem[]>([]);

  const [activeProChatId, setActiveProChatId] = useState<string | null>(null);
  const [activeFlashChatId, setActiveFlashChatId] = useState<string | null>(null);

  const [isProPanelOpen, setIsProPanelOpen] = useState(false);
  const [isFlashPanelOpen, setIsFlashPanelOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const proChat = useChat('chat', (id) => {
    setActiveProChatId(id);
    refreshData();
  });
  const flashChat = useChat('image', (id) => {
    setActiveFlashChatId(id);
    refreshData();
  });

  useEffect(() => {
    const init = async () => {
      try {
        const authed = isAuthenticated();
        setIsLoggedIn(authed);
        if (authed) {
          const uuid = getUserUuid();
          if (uuid) {
            const [chats, usageData] = await Promise.all([fetchChats(uuid), fetchUsage(uuid)]);
            setProSessions(sortByRecent(chats.filter((c) => c.last_message_type === 'chat')));
            setFlashSessions(sortByRecent(chats.filter((c) => c.last_message_type === 'image')));
            setUsage(usageData);
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

  const handleLogout = useCallback(() => {
    setIsLoggedIn(false);
    setProSessions([]);
    setFlashSessions([]);
    setUsage(undefined);
    setActiveProChatId(null);
    setActiveFlashChatId(null);
    setIsProPanelOpen(false);
    setIsFlashPanelOpen(false);
    setIsSettingsOpen(false);
    proChat.clearMessages();
    flashChat.clearMessages();
  }, [proChat, flashChat]);

  const handleLoginSuccess = useCallback(async () => {
    setIsLoggedIn(true);
    const uuid = getUserUuid();
    if (uuid) {
      const [chats, usageData] = await Promise.all([fetchChats(uuid), fetchUsage(uuid)]);
      setProSessions(sortByRecent(chats.filter((c) => c.last_message_type === 'chat')));
      setFlashSessions(sortByRecent(chats.filter((c) => c.last_message_type === 'image')));
      setUsage(usageData);
    }
  }, []);

  const refreshData = useCallback(async () => {
    const uuid = getUserUuid();
    if (!uuid) return;
    try {
      const [chats, usageData] = await Promise.all([fetchChats(uuid), fetchUsage(uuid)]);
      setProSessions(sortByRecent(chats.filter((c) => c.last_message_type === 'chat')));
      setFlashSessions(sortByRecent(chats.filter((c) => c.last_message_type === 'image')));
      setUsage(usageData);
    } catch { /* ignore */ }
  }, []);

  const handleProSessionSelect = useCallback(
    (chatId: string | null) => {
      setIsProPanelOpen(true);
      setActiveProChatId(chatId);
      proChat.clearMessages();
      if (chatId) proChat.loadChat(chatId);
    },
    [proChat]
  );

  const handleFlashSessionSelect = useCallback(
    (chatId: string | null) => {
      setIsFlashPanelOpen(true);
      setActiveFlashChatId(chatId);
      flashChat.clearMessages();
      if (chatId) flashChat.loadChat(chatId);
    },
    [flashChat]
  );

  const handleProSend = useCallback(
    async (text: string, files?: File[]) => {
      await proChat.sendMessage(text, files);
      setTimeout(refreshData, 500);
    },
    [proChat, refreshData]
  );

  const handleFlashSend = useCallback(
    async (text: string, files?: File[]) => {
      await flashChat.sendMessage(text, files);
      setTimeout(refreshData, 500);
    },
    [flashChat, refreshData]
  );

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

  if (!isLoggedIn) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const noneOpen = !isProPanelOpen && !isFlashPanelOpen;
  const bothOpen = isProPanelOpen && isFlashPanelOpen;
  const showPro = noneOpen || isProPanelOpen;
  const showFlash = noneOpen || isFlashPanelOpen;
  const bothVisible = showPro && showFlash;

  return (
    <div className="flex h-screen w-screen bg-bg-primary text-text-primary overflow-hidden">
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden border-r border-border-subtle shrink-0 ${
          isSidebarOpen ? 'w-[280px] opacity-100' : 'w-0 opacity-0 border-none'
        }`}
      >
        <Sidebar
          proSessions={proSessions}
          flashSessions={flashSessions}
          activeProChatId={activeProChatId}
          activeFlashChatId={activeFlashChatId}
          isProPanelOpen={isProPanelOpen}
          isFlashPanelOpen={isFlashPanelOpen}
          onProSessionSelect={handleProSessionSelect}
          onFlashSessionSelect={handleFlashSessionSelect}
          onToggle={() => setIsSidebarOpen(false)}
          onSettingsOpen={() => setIsSettingsOpen(true)}
          usage={usage}
        />
      </div>

      <main className="flex-1 flex flex-col min-w-0 relative">
        {!isSidebarOpen && (
          <button
            className="absolute top-3 left-3 z-20 w-9 h-9 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover bg-bg-secondary border border-border-subtle shadow-sm transition-all"
            onClick={() => setIsSidebarOpen(true)}
            title="사이드바 열기"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          {showPro && (
            <div
              className={`flex-1 flex min-w-0 h-full ${
                bothVisible ? 'border-b md:border-b-0 md:border-r border-border-subtle' : ''
              }`}
            >
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
                canClose={bothOpen}
                onClose={() => setIsProPanelOpen(false)}
              />
            </div>
          )}
          {showFlash && (
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
                canClose={bothOpen}
                onClose={() => setIsFlashPanelOpen(false)}
              />
            </div>
          )}
        </div>
      </main>

      {isSettingsOpen && (
        <SettingsModal
          onClose={() => setIsSettingsOpen(false)}
          onLogout={handleLogout}
          onApiKeyUpdated={() => {}}
        />
      )}
    </div>
  );
}
