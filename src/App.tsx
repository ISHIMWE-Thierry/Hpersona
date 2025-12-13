import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { Sidebar } from '@/components/layout/Sidebar';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { Conversation, Message } from '@/types/chat';
import { Toaster } from '@/components/ui/sonner';
import { Loader2 } from 'lucide-react';
import { DropdownAvatar } from '@/components/profile/DropdownAvatar';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  serverTimestamp 
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { toast } from 'sonner';
import { openaiClient, AIModel } from '@/lib/openai';

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedModel, setSelectedModel] = useState<AIModel>('gpt-4o');
  const [functionUrl, setFunctionUrl] = useState<string | null>(null);

  // Check for deployed OpenAI function
  useEffect(() => {
    // This URL will be set after deploying the edge function
    // For now, leave it null to show setup instructions
    const url = null; // Replace with your function URL after deployment
    if (url) {
      openaiClient.setFunctionUrl(url);
      setFunctionUrl(url);
    }
  }, []);

  // Subscribe to conversations
  useEffect(() => {
    if (!user || !isFirebaseConfigured || !db) {
      setConversations([]);
      return;
    }

    const q = query(
      collection(db, 'conversations'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const convos: Conversation[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        convos.push({
          id: doc.id,
          title: data.title,
          userId: data.userId,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          messages: data.messages || []
        });
      });
      setConversations(convos);
    }, (error) => {
      console.error('Error fetching conversations:', error);
      
      // Check if it's an index error
      if (error.code === 'failed-precondition' && error.message.includes('index')) {
        toast.error('Firebase index required. Check console for setup link.', {
          duration: 10000,
        });
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('🔥 FIRESTORE INDEX REQUIRED');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('Click the link below to create the required index:');
        console.error(error.message.match(/https:\/\/[^\s]+/)?.[0] || 'Check Firebase console');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      } else {
        toast.error('Failed to load conversations');
      }
    });

    return () => unsubscribe();
  }, [user]);

  const handleNewChat = async () => {
    if (!user || !isFirebaseConfigured || !db) {
      toast.error('Firebase is not configured');
      return;
    }

    try {
      const docRef = await addDoc(collection(db, 'conversations'), {
        title: 'New Chat',
        userId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        messages: []
      });

      setCurrentConversationId(docRef.id);
      toast.success('New chat created');
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast.error('Failed to create new chat');
    }
  };

  const handleSelectConversation = (id: string) => {
    setCurrentConversationId(id);
  };

  const handleDeleteConversation = async (id: string) => {
    if (!isFirebaseConfigured || !db) {
      toast.error('Firebase is not configured');
      return;
    }

    try {
      await deleteDoc(doc(db, 'conversations', id));
      if (currentConversationId === id) {
        setCurrentConversationId(null);
      }
      toast.success('Chat deleted');
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast.error('Failed to delete chat');
    }
  };

  const handleSendMessage = async (content: string, images?: string[]) => {
    if (!isFirebaseConfigured || !db) {
      toast.error('Firebase is not configured');
      return;
    }

    if (!user || !currentConversationId) {
      // If no conversation, create one first
      await handleNewChat();
      // Wait for state update, then send message
      setTimeout(() => handleSendMessage(content, images), 100);
      return;
    }

    const conversation = conversations.find(c => c.id === currentConversationId);
    if (!conversation) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      images: images || [],
      timestamp: new Date()
    };

    const updatedMessages = [...conversation.messages, userMessage];

    try {
      // Update Firestore with user message
      await updateDoc(doc(db, 'conversations', currentConversationId), {
        messages: updatedMessages,
        title: conversation.messages.length === 0 ? content.slice(0, 50) : conversation.title,
        updatedAt: serverTimestamp()
      });

      setIsStreaming(true);

      // Check if OpenAI function is configured
      if (!functionUrl) {
        toast.error('OpenAI function not deployed. Check console for instructions.', {
          duration: 5000,
        });
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('🔧 OPENAI EDGE FUNCTION SETUP REQUIRED');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('1. Deploy the OpenAI edge function:');
        console.error('   blink_deploy_function with:');
        console.error('   - function_name: \"openai-chat\"');
        console.error('   - entrypoint: \"functions/openai-chat/index.ts\"');
        console.error('   - Set OPENAI_API_KEY in secrets');
        console.error('2. Copy the returned URL');
        console.error('3. Update App.tsx line ~28 with the URL');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Show demo response
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: generateDemoResponse(content),
          timestamp: new Date()
        };

        const finalMessages = [...updatedMessages, aiMessage];
        await updateDoc(doc(db, 'conversations', currentConversationId), {
          messages: finalMessages,
          updatedAt: serverTimestamp()
        });
        
        setIsStreaming(false);
        return;
      }

      // Call OpenAI API with streaming
      let fullResponse = '';
      const aiMessageId = (Date.now() + 1).toString();

      await openaiClient.streamChat(
        updatedMessages,
        selectedModel,
        {
          onToken: async (token) => {
            fullResponse += token;
            
            // Update UI with streaming response (optimistic update)
            const streamingMessage: Message = {
              id: aiMessageId,
              role: 'assistant',
              content: fullResponse,
              timestamp: new Date()
            };

            // Update local state only for streaming effect
            setConversations(prev =>
              prev.map(c =>
                c.id === currentConversationId
                  ? { ...c, messages: [...updatedMessages, streamingMessage] }
                  : c
              )
            );
          },
          onComplete: async (finalText) => {
            const aiMessage: Message = {
              id: aiMessageId,
              role: 'assistant',
              content: finalText,
              timestamp: new Date()
            };

            const finalMessages = [...updatedMessages, aiMessage];

            // Save final response to Firestore
            await updateDoc(doc(db, 'conversations', currentConversationId), {
              messages: finalMessages,
              updatedAt: serverTimestamp()
            });

            setIsStreaming(false);
          },
          onError: (error) => {
            console.error('OpenAI streaming error:', error);
            toast.error('AI response failed: ' + error.message);
            setIsStreaming(false);
          }
        }
      );
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
      setIsStreaming(false);
    }
  };

  // Demo response generator (fallback when OpenAI is not configured)
  const generateDemoResponse = (userMessage: string): string => {
    const responses = [
      `I understand you're asking about "${userMessage}". Let me help you with that.`,
      `That's an interesting question about "${userMessage}". Here's what I think...`,
      `Great question! Regarding "${userMessage}", I can provide some insights.`,
      `I'd be happy to help with "${userMessage}". Let me explain...`
    ];
    return responses[Math.floor(Math.random() * responses.length)] + 
      "\n\n⚠️ **Demo Mode**: This is a simulated response. To get real AI responses:\n" +
      "1. Deploy the OpenAI edge function (see console)\n" +
      "2. Add your OPENAI_API_KEY to secrets\n" +
      "3. Update the function URL in App.tsx\n\n" +
      "Once configured, you'll have access to GPT-4o with vision, reasoning models, and more!";
  };

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  const currentConversation = conversations.find(c => c.id === currentConversationId);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
      />
      
      <main className="flex-1 flex flex-col h-screen min-h-0 overflow-hidden">
        {/* Top header with avatar dropdown - glassmorphic style */}
        <header className="relative flex items-center justify-center px-4 py-3 border-b border-white/10 bg-white/5 dark:bg-black/20 backdrop-blur-xl backdrop-saturate-150">
          <h1 className="text-lg font-semibold">Ikamba AI</h1>
          <div className="absolute right-4">
            <DropdownAvatar />
          </div>
        </header>
        <div className="flex-1 min-h-0">
          <ChatInterface
            messages={currentConversation?.messages || []}
            isStreaming={isStreaming}
            onSendMessage={handleSendMessage}
          />
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
      <Toaster position="top-center" richColors />
    </AuthProvider>
  );
}

export default App;
