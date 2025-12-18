import { useState } from 'react';
import { MessageSquare, Plus, Trash2, LogOut, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Conversation } from '@/types/chat';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface SidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
}

export function Sidebar({
  conversations,
  currentConversationId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
}: SidebarProps) {
  const { user, signOut } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Header - New Chat Button */}
      <div className="flex items-center justify-between border-b border-border p-3">
        <Button
          onClick={() => {
            onNewChat();
            setIsMobileOpen(false);
          }}
          className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Chat
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="ml-2 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Conversations List - Scrollable */}
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No conversations yet
            </p>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-3 py-2 transition-all hover:bg-sidebar-accent cursor-pointer",
                  currentConversationId === conversation.id && "bg-sidebar-accent"
                )}
                onClick={() => {
                  onSelectConversation(conversation.id);
                  setIsMobileOpen(false);
                }}
              >
                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-sm">
                  {conversation.title}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conversation.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* User Section */}
      <div className="border-t border-border p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-medium text-primary">
                {user?.email?.[0].toUpperCase()}
              </span>
            </div>
            <span className="text-sm truncate">
              {user?.email}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            title="Sign out"
            className="flex-shrink-0"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 lg:hidden"
        onClick={() => setIsMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Mobile Sidebar Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar-background border-r border-sidebar-border transition-transform lg:hidden",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col h-screen bg-sidebar-background border-r border-sidebar-border">
        {sidebarContent}
      </aside>
    </>
  );
}
