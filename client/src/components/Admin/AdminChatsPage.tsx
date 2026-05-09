import { useCallback, useEffect, useState } from 'react';
import { fetchAdminAllChats, fetchAdminChat } from '../../services/api';
import type { AdminChatDetail, AdminChatSummary } from '../../services/api';

interface AdminChatsPageProps {
  onBackToChat: () => void;
}

const ADMIN_KEY_STORAGE = 'pa_admin_review_key';

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return key;
  return `${key.slice(0, 8)}...`;
}

function ChatDetailModal({
  detail,
  onClose,
}: {
  detail: AdminChatDetail;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="text-[13px] font-black text-text-primary truncate">
              {detail.title ?? '(제목 없음)'}
            </div>
            <div className="text-[11px] text-text-tertiary mt-0.5 font-mono break-all">
              {detail.user_uuid} · {detail.user_api_key}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-text-tertiary hover:text-text-primary text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {detail.messages.length === 0 ? (
            <div className="text-center text-[12px] font-bold text-text-tertiary py-8">
              메시지가 없습니다.
            </div>
          ) : (
            detail.messages.map((msg) => (
              <div
                key={msg.message_id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                    msg.role === 'user'
                      ? 'bg-accent-pro text-white'
                      : 'bg-slate-100 text-text-primary'
                  }`}
                >
                  <div className="text-[11px] font-black opacity-60 mb-1 uppercase">
                    {msg.role === 'user' ? 'User' : 'Assistant'} · {msg.type}
                  </div>
                  {msg.text_content && (
                    <div className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                      {msg.text_content}
                    </div>
                  )}
                  {msg.image_s3_key && !msg.text_content && (
                    <div className="text-[12px] opacity-70 italic">[이미지]</div>
                  )}
                  <div className="text-[10px] opacity-50 mt-1">{formatDateTime(msg.created_at)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminChatsPage({ onBackToChat }: AdminChatsPageProps) {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? '');
  const [chats, setChats] = useState<AdminChatSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AdminChatDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const loadChats = useCallback(async () => {
    const trimmedKey = adminKey.trim();
    if (!trimmedKey) {
      setError('어드민 키를 입력해주세요.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminAllChats(trimmedKey);
      sessionStorage.setItem(ADMIN_KEY_STORAGE, trimmedKey);
      setChats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    const stored = sessionStorage.getItem(ADMIN_KEY_STORAGE);
    if (stored) {
      loadChats();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRowClick = useCallback(async (chatId: string) => {
    const trimmedKey = adminKey.trim();
    if (!trimmedKey) return;
    setIsLoadingDetail(true);
    try {
      const detail = await fetchAdminChat(chatId, trimmedKey);
      setSelectedDetail(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : '채팅 상세 조회 실패');
    } finally {
      setIsLoadingDetail(false);
    }
  }, [adminKey]);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      {selectedDetail && (
        <ChatDetailModal detail={selectedDetail} onClose={() => setSelectedDetail(null)} />
      )}

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBackToChat}
            className="text-[12px] font-black text-text-tertiary hover:text-text-primary transition-colors"
          >
            ← 채팅으로
          </button>
          <h1 className="text-[18px] font-black text-text-primary">전체 채팅 관리</h1>
          {chats.length > 0 && (
            <span className="text-[11px] font-bold text-text-tertiary">
              총 {chats.length}개
            </span>
          )}
        </div>

        <div className="flex gap-2 mb-6">
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadChats()}
            placeholder="어드민 키 입력"
            className="flex-1 rounded-lg border border-border-subtle bg-bg-secondary px-4 py-2.5 text-[13px] font-bold text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-pro/30"
          />
          <button
            onClick={loadChats}
            disabled={isLoading}
            className="rounded-lg bg-accent-pro px-5 py-2.5 text-[13px] font-black text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isLoading ? '조회 중...' : '조회'}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-[12px] font-bold text-red-600">
            {error}
          </div>
        )}

        {isLoadingDetail && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20">
            <div className="bg-white rounded-xl px-6 py-4 text-[13px] font-bold text-text-primary shadow-xl">
              채팅 불러오는 중...
            </div>
          </div>
        )}

        {chats.length > 0 && (
          <div className="rounded-xl border border-border-subtle overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-bg-secondary border-b border-border-subtle">
                  <th className="px-4 py-3 text-left font-black text-text-tertiary uppercase tracking-wider w-8">#</th>
                  <th className="px-4 py-3 text-left font-black text-text-tertiary uppercase tracking-wider">User UUID</th>
                  <th className="px-4 py-3 text-left font-black text-text-tertiary uppercase tracking-wider">API Key</th>
                  <th className="px-4 py-3 text-left font-black text-text-tertiary uppercase tracking-wider">채팅 제목</th>
                  <th className="px-4 py-3 text-left font-black text-text-tertiary uppercase tracking-wider">마지막 메시지</th>
                  <th className="px-4 py-3 text-left font-black text-text-tertiary uppercase tracking-wider">마지막 활동</th>
                </tr>
              </thead>
              <tbody>
                {chats.map((chat, i) => (
                  <tr
                    key={chat.chat_id}
                    onClick={() => handleRowClick(chat.chat_id)}
                    className="border-b border-border-subtle last:border-none hover:bg-bg-secondary cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-text-tertiary font-bold">{i + 1}</td>
                    <td className="px-4 py-3 font-mono text-text-secondary text-[11px] max-w-[160px] truncate">
                      {chat.user_uuid}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-secondary text-[11px]">
                      {maskApiKey(chat.user_api_key)}
                    </td>
                    <td className="px-4 py-3 font-bold text-text-primary max-w-[200px] truncate">
                      {chat.title ?? <span className="text-text-tertiary italic">제목 없음</span>}
                    </td>
                    <td className="px-4 py-3 text-text-secondary max-w-[220px] truncate">
                      {chat.last_message_preview ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-text-tertiary whitespace-nowrap">
                      {formatDateTime(chat.last_message_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && chats.length === 0 && !error && (
          <div className="text-center py-16 text-[13px] font-bold text-text-tertiary">
            어드민 키를 입력하고 조회하세요.
          </div>
        )}
      </div>
    </div>
  );
}
