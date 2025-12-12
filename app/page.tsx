'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ChatInterface from '@/components/ChatInterface';
import Sidebar from '@/components/Sidebar';
import AuthModal from '@/components/AuthModal';
import LoadingScreen from '@/components/LoadingScreen';
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
  serverTimestamp,
} from 'firebase/firestore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: Date;
}

export default function Home() {
  const { user, loading, signIn, signUp, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      setShowAuthModal(true);
    } else if (user) {
      setShowAuthModal(false);
      loadConversations();
    }
  }, [user, loading]);

  const loadConversations = async () => {
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
          updatedAt: data.updatedAt?.toDate() || new Date(),
        });
      });

      setConversations(convs);
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  const saveConversation = async (msgs: Message[]) => {
    if (!user || msgs.length === 0) return;

    try {
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
      }

      await loadConversations();
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  };

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = { role: 'user', content };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
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
                assistantMessage += parsed.content;
                setMessages([...newMessages, { role: 'assistant' as const, content: assistantMessage }]);
              } catch (e) {
                // Ignore parsing errors
              }
            }
          }
        }
      }

      const finalMessages: Message[] = [...newMessages, { role: 'assistant' as const, content: assistantMessage }];
      setMessages(finalMessages);
      await saveConversation(finalMessages);
    } catch (error) {
      console.error('Error:', error);
      setMessages([...newMessages, { role: 'assistant' as const, content: 'Sorry, an error occurred.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentConversationId(null);
  };

  const handleSelectConversation = async (id: string) => {
    try {
      const docSnap = await getDocs(query(collection(db, 'conversations'), where('__name__', '==', id)));
      if (!docSnap.empty) {
        const data = docSnap.docs[0].data();
        setMessages(data.messages || []);
        setCurrentConversationId(id);
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  };

  const handleLogout = async () => {
    await logout();
    setMessages([]);
    setConversations([]);
    setCurrentConversationId(null);
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="flex h-screen">
      {user && (
        <Sidebar
          conversations={conversations}
          currentConversationId={currentConversationId}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onLogout={handleLogout}
          userEmail={user.email}
        />
      )}

      <div className="flex-1">
        <ChatInterface
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
        />
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSignIn={signIn}
        onSignUp={signUp}
      />
    </div>
  );
}
