'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { Sidebar } from '@/components/layout/Sidebar';
import { AuthScreen } from '@/components/auth/AuthScreen';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { Message, Conversation } from '@/types/chat';

export default function Home() {
  const { user, loading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    if (!user) return;

    try {
      const q = query(
        collection(db, 'conversations'),
        where('userId', '==', user.uid),
        orderBy('updatedAt', 'desc'),
        limit(10)
      );

      const snapshot = await getDocs(q);
      const convs: Conversation[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        convs.push({
          id: doc.id,
          title: data.title || 'New Chat',
          userId: data.userId || user.uid,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          messages: data.messages || [],
        });
      });

      setConversations(convs);
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user, loadConversations]);

  const saveConversation = async (msgs: Message[]) => {
    if (!user || msgs.length === 0) return;

    try {
      const lastMessage = msgs[msgs.length - 1];
      if (lastMessage.role !== 'assistant') return; // Only save after assistant response

      const title = msgs[0].content.slice(0, 30) + (msgs[0].content.length > 30 ? '...' : '');

      if (currentConversationId) {
        // Update existing conversation
        await updateDoc(doc(db, 'conversations', currentConversationId), {
          messages: msgs,
          updatedAt: serverTimestamp(),
        });
      } else {
        // Create new conversation
        const docRef = await addDoc(collection(db, 'conversations'), {
          userId: user.uid,
          title,
          messages: msgs,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setCurrentConversationId(docRef.id);
        loadConversations(); // Refresh list
      }
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  };

  const handleSendMessage = async (content: string, images?: string[], mode?: 'gpt' | 'thinking') => {
    const userMessage: Message = { 
      id: Date.now().toString(),
      role: 'user', 
      content,
      images,
      timestamp: new Date()
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsStreaming(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, mode: mode || 'gpt' }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;

              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  assistantMessage += parsed.content;
                  // Update the last message (assistant's response) in real-time
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last.role === 'assistant') {
                      return [...prev.slice(0, -1), { ...last, content: assistantMessage }];
                    } else {
                      return [...prev, { 
                        id: (Date.now() + 1).toString(),
                        role: 'assistant', 
                        content: assistantMessage,
                        timestamp: new Date()
                      }];
                    }
                  });
                }
              } catch {
                // Ignore parsing errors
              }
            }
          }
        }
      }
      
      // Save conversation after streaming is complete
      const finalMessages = [...newMessages, { 
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const, 
        content: assistantMessage,
        timestamp: new Date()
      }];
      saveConversation(finalMessages);

    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [...prev, { 
        id: Date.now().toString(),
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      }]);
    } finally {
      setIsStreaming(false);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setCurrentConversationId(null);
  };

  const handleSelectConversation = async (id: string) => {
    setCurrentConversationId(id);
    try {
        const docRef = doc(db, 'conversations', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.messages) {
                // Ensure messages have required fields if they are old data
                const validMessages = data.messages.map((m: any) => ({
                    ...m,
                    id: m.id || Math.random().toString(),
                    timestamp: m.timestamp ? m.timestamp.toDate() : new Date() // Firestore timestamp to Date
                }));
                setMessages(validMessages);
            }
        }
    } catch (error) {
        console.error("Error loading conversation", error);
    }
  };

  const deleteConversation = async (id: string) => {
    if (!confirm('Are you sure you want to delete this conversation?')) return;
    
    try {
        await deleteDoc(doc(db, 'conversations', id));
        if (currentConversationId === id) {
            startNewChat();
        }
        loadConversations();
    } catch (error) {
        console.error("Error deleting conversation", error);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onNewChat={startNewChat}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={deleteConversation}
      />
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <ChatInterface
          messages={messages}
          isStreaming={isStreaming}
          onSendMessage={handleSendMessage}
        />
      </main>
    </div>
  );
}
