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
    <div className="w-64 bg-[#202123] h-screen flex flex-col border-r border-[#4d4d4f]">
      {/* Header */}
      <div className="p-4 border-b border-[#4d4d4f]">
        <button
          onClick={onNewChat}
          className="flex items-center gap-2 w-full text-left px-4 py-2 rounded-lg border border-[#565869] text-white hover:bg-[#2a2b32] transition"
        >
          <PlusCircle size={20} />
          <span>New Chat</span>
        </button>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto p-2">
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelectConversation(conv.id)}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-2 mb-1 transition ${
              currentConversationId === conv.id
                ? 'bg-[#343541] text-white'
                : 'text-gray-300 hover:bg-[#2a2b32]'
            }`}
          >
            <MessageSquare size={18} />
            <span className="truncate text-sm">{conv.title}</span>
          </button>
        ))}
      </div>

      {/* User Section */}
      <div className="p-4 border-t border-[#4d4d4f]">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-300 truncate flex-1">
            {userEmail}
          </div>
          <button
            onClick={onLogout}
            className="ml-2 p-2 rounded-lg text-gray-300 hover:bg-[#2a2b32] transition"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
