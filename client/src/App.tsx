import { useState, useCallback, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import ChatPanel from './components/ChatPanel/ChatPanel';
import LoginPage from './components/Login/LoginPage';
import SettingsModal from './components/Settings/SettingsModal';
import { useChat } from './hooks/useChat';
import { fetchChats, fetchUsage, renameChat, deleteChat, UnauthorizedError } from './services/api';
import { getUserUuid, isAuthenticated, logout } from './services/auth';
import type { ChatListItem, UsageInfo } from './types';

function sortByRecent(items: ChatListItem[]): ChatListItem[] {
  return [...items].sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  );
}

const CHAT_TYPE_KEY = 'pa_chat_types';

function getChatTypeMap(): Record<string, 'chat' | 'image'> {
  try { return JSON.parse(localStorage.getItem(CHAT_TYPE_KEY) ?? '{}'); } catch { return {}; }
}

function recordChatType(chatId: string, type: 'chat' | 'image') {
  const map = getChatTypeMap();
  map[chatId] = type;
  localStorage.setItem(CHAT_TYPE_KEY, JSON.stringify(map));
}

function clearChatTypeMap() {
  localStorage.removeItem(CHAT_TYPE_KEY);
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

  const [usageAlert, setUsageAlert] = useState<'warn' | 'critical' | null>(null);
  const alertedThresholds = useRef<Set<number>>(new Set());

  const [isBudgetExceeded, setIsBudgetExceeded] = useState(false);

  const proChat = useChat('chat', (id) => {
    setActiveProChatId(id);
    recordChatType(id, 'chat');
    refreshData();
  }, () => {
    refreshData();
  }, () => setIsBudgetExceeded(true));
  const flashChat = useChat('image', (id) => {
    setActiveFlashChatId(id);
    recordChatType(id, 'image');
    refreshData();
  }, () => {
    refreshData();
  }, () => setIsBudgetExceeded(true));

  useEffect(() => {
    const init = async () => {
      try {
        const authed = isAuthenticated();
        if (authed) {
          const uuid = getUserUuid();
          if (uuid) {
            const [chats, usageData] = await Promise.all([fetchChats(uuid), fetchUsage(uuid)]);
            const typeMap = getChatTypeMap();
            setProSessions(sortByRecent(chats.filter((c) => (typeMap[c.chat_id] ?? c.last_message_type) === 'chat')));
            setFlashSessions(sortByRecent(chats.filter((c) => (typeMap[c.chat_id] ?? c.last_message_type) === 'image')));
            setUsage(usageData);
            setIsLoggedIn(true);
          }
        }
      } catch (error) {
        if (error instanceof UnauthorizedError || error instanceof URIError) {
          logout();
          setIsLoggedIn(false);
        } else {
          console.error('Initialization failed:', error);
        }
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
    clearChatTypeMap();
  }, [proChat, flashChat]);

  const handleLoginSuccess = useCallback(async () => {
    setIsLoggedIn(true);
    const uuid = getUserUuid();
    if (uuid) {
      try {
        const [chats, usageData] = await Promise.all([fetchChats(uuid), fetchUsage(uuid)]);
        const typeMap = getChatTypeMap();
        setProSessions(sortByRecent(chats.filter((c) => (typeMap[c.chat_id] ?? c.last_message_type) === 'chat')));
        setFlashSessions(sortByRecent(chats.filter((c) => (typeMap[c.chat_id] ?? c.last_message_type) === 'image')));
        setUsage(usageData);
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          logout();
          setIsLoggedIn(false);
        }
      }
    }
  }, []);

  const refreshData = useCallback(async () => {
    const uuid = getUserUuid();
    if (!uuid) return;
    try {
      const [chats, usageData] = await Promise.all([fetchChats(uuid), fetchUsage(uuid)]);
      const typeMap = getChatTypeMap();
      setProSessions(sortByRecent(chats.filter((c) => (typeMap[c.chat_id] ?? c.last_message_type) === 'chat')));
      setFlashSessions(sortByRecent(chats.filter((c) => (typeMap[c.chat_id] ?? c.last_message_type) === 'image')));
      setUsage(usageData);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!usage || !usage.budget) return;
    const percent = (usage.used / usage.budget) * 100;
    if (percent >= 90 && !alertedThresholds.current.has(90)) {
      alertedThresholds.current.add(90);
      setUsageAlert('critical');
    } else if (percent >= 80 && !alertedThresholds.current.has(80)) {
      alertedThresholds.current.add(80);
      setUsageAlert('warn');
    }
  }, [usage]);

  useEffect(() => {
    if (!usageAlert) return;
    const timer = setTimeout(() => setUsageAlert(null), 12000);
    return () => clearTimeout(timer);
  }, [usageAlert]);

  useEffect(() => {
    if (usage && usage.budget > 0 && usage.used >= usage.budget) {
      setIsBudgetExceeded(true);
    }
  }, [usage]);

  const handleProSessionSelect = useCallback(
    (chatId: string | null) => {
      setIsProPanelOpen(true);
      setActiveProChatId(chatId);
      if (chatId) {
        // 기존 세션 전환 — 스트림 중단 없이 세대 카운터만 갱신
        proChat.loadChat(chatId);
      } else {
        // 새 채팅 시작 — 스트림 중단 + 초기화
        proChat.clearMessages();
      }
    },
    [proChat]
  );

  const handleFlashSessionSelect = useCallback(
    (chatId: string | null) => {
      setIsFlashPanelOpen(true);
      setActiveFlashChatId(chatId);
      if (chatId) {
        flashChat.loadChat(chatId);
      } else {
        flashChat.clearMessages();
      }
    },
    [flashChat]
  );

  const handleRenameSession = useCallback(
    async (chatId: string, newTitle: string) => {
      const uuid = getUserUuid();
      const update = (sessions: ChatListItem[]) =>
        sessions.map((s) => (s.chat_id === chatId ? { ...s, title: newTitle } : s));
      setProSessions((prev) => update(prev));
      setFlashSessions((prev) => update(prev));
      if (uuid) {
        try {
          await renameChat(chatId, newTitle, uuid);
        } catch {
          refreshData();
        }
      }
    },
    [refreshData]
  );

  const handleDeleteSession = useCallback(
    async (chatId: string) => {
      const uuid = getUserUuid();
      if (activeProChatId === chatId) {
        setActiveProChatId(null);
        setIsProPanelOpen(false);
        proChat.clearMessages();
      }
      if (activeFlashChatId === chatId) {
        setActiveFlashChatId(null);
        setIsFlashPanelOpen(false);
        flashChat.clearMessages();
      }
      setProSessions((prev) => prev.filter((s) => s.chat_id !== chatId));
      setFlashSessions((prev) => prev.filter((s) => s.chat_id !== chatId));
      if (uuid) {
        try {
          await deleteChat(chatId, uuid);
        } catch {
          refreshData();
        }
      }
    },
    [activeProChatId, activeFlashChatId, proChat, flashChat, refreshData]
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
          onRenameSession={handleRenameSession}
          onDeleteSession={handleDeleteSession}
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
                isBudgetExceeded={isBudgetExceeded}
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
                isBudgetExceeded={isBudgetExceeded}
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

      {isBudgetExceeded && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] flex items-start gap-3.5 px-5 py-4 rounded-2xl shadow-2xl border animate-fadeIn max-w-[380px] w-[calc(100%-2rem)] bg-red-600 border-red-700">
          <span className="text-xl shrink-0 mt-0.5">🚫</span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-black mb-0.5 text-white">예산 한도 초과</div>
            <div className="text-[12px] font-bold leading-relaxed text-red-100">
              이번 대회의 사용 한도에 도달했습니다. 더 이상 메시지를 전송할 수 없습니다.
            </div>
          </div>
        </div>
      )}

      {usageAlert && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[300] flex items-start gap-3.5 px-5 py-4 rounded-2xl shadow-2xl border animate-fadeIn max-w-[360px] w-[calc(100%-2rem)] ${
          usageAlert === 'critical'
            ? 'bg-red-50 border-red-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <span className="text-xl shrink-0 mt-0.5">
            {usageAlert === 'critical' ? '🚨' : '⚠️'}
          </span>
          <div className="flex-1 min-w-0">
            <div className={`text-[13px] font-black mb-0.5 ${usageAlert === 'critical' ? 'text-red-700' : 'text-amber-700'}`}>
              {usageAlert === 'critical' ? '예산 한도 임박' : '예산 주의'}
            </div>
            <div className={`text-[12px] font-bold leading-relaxed ${usageAlert === 'critical' ? 'text-red-600/80' : 'text-amber-600/80'}`}>
              {usageAlert === 'critical'
                ? '사용량이 90%에 달했습니다. 남은 예산이 얼마 없으니 신중하게 사용해 주세요.'
                : '사용량이 80%에 달했습니다. 예산이 얼마 남지 않았으니 신중하게 사용해 주세요.'}
            </div>
          </div>
          <button
            onClick={() => setUsageAlert(null)}
            className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-md transition-colors mt-0.5 ${usageAlert === 'critical' ? 'text-red-400 hover:text-red-600 hover:bg-red-100' : 'text-amber-400 hover:text-amber-600 hover:bg-amber-100'}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
