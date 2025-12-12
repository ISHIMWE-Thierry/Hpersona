'use client';

import { PlusCircle, MessageSquare, LogOut } from 'lucide-react';

interface Conversation {
  id: string;
  title: string;
  updatedAt: Date;
}

interface SidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onLogout: () => void;
  userEmail: string | null;
}

export default function Sidebar({
  conversations,
  currentConversationId,
  onNewChat,
  onSelectConversation,
  onLogout,
  userEmail,
}: SidebarProps) {
  return (
    <div className="w-72 bg-black/30 backdrop-blur-xl h-screen flex flex-col border-r border-white/10 shadow-2xl shadow-black/30">
      {/* Header */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-400">Assistant</p>
            <h2 className="text-lg font-semibold text-white">Ikamba AI</h2>
          </div>
        </div>
        <button
          onClick={onNewChat}
          className="flex items-center justify-center gap-2 w-full text-left px-4 py-3 rounded-xl bg-gradient-to-r from-[#10a37f] to-[#0d8968] text-white font-semibold shadow-lg shadow-[#10a37f]/20 transition hover:shadow-xl hover:-translate-y-0.5"
        >
          <PlusCircle size={20} />
          <span>New Chat</span>
        </button>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {conversations.length === 0 && (
          <div className="text-center text-sm text-gray-400 bg-white/5 border border-white/10 rounded-xl py-4 px-3">
            No conversations yet
          </div>
        )}
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelectConversation(conv.id)}
            className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-2 transition border ${
              currentConversationId === conv.id
                ? 'bg-white/10 border-white/15 text-white shadow-lg'
                : 'bg-white/5 border-white/5 text-gray-300 hover:bg-white/10'
            }`}
          >
            <MessageSquare size={18} className="text-[#10a37f]" />
            <div className="flex-1 min-w-0">
              <span className="truncate text-sm font-medium">{conv.title}</span>
              <p className="text-[11px] text-gray-400">Updated {conv.updatedAt.toLocaleDateString()}</p>
            </div>
          </button>
        ))}
      </div>

      {/* User Section */}
      <div className="p-5 border-t border-white/10 bg-black/20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400">Signed in as</p>
            <p className="text-sm font-medium text-white truncate">{userEmail}</p>
          </div>
          <button
            onClick={onLogout}
            className="p-2 rounded-lg text-gray-200 hover:bg-white/10 border border-white/10 transition"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
