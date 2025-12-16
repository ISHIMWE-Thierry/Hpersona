import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, X, Brain, Zap, Plus, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Message } from '@/types/chat';
import { MessageBubble } from './MessageBubble';
import { uploadImage, validateImageFile } from '@/lib/storage';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ChatMode = 'gpt' | 'thinking';

interface ChatInterfaceProps {
  messages: Message[];
  isStreaming: boolean;
  onSendMessage: (content: string, images?: string[], mode?: ChatMode) => void;
}

// Quick action suggestions - general AI + money transfer
const QUICK_ACTIONS = [
  { label: '💰 Send money to Rwanda', action: 'I want to send money to Rwanda' },
  { label: '💱 Check exchange rates', action: 'What are the current exchange rates?' },
  { label: '📐 Explain a math concept', action: 'Explain Euler\'s formula with derivation' },
  { label: '💻 Help me code', action: 'Help me write a Python function' },
];

export function ChatInterface({ messages, isStreaming, onSendMessage }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [mode, setMode] = useState<ChatMode>('thinking');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputRefCompact = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && uploadedImages.length === 0) || isStreaming) return;
    onSendMessage(input.trim() || 'Analyze this image', uploadedImages, mode);
    setInput('');
    setUploadedImages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;
    setIsUploading(true);
    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const validation = validateImageFile(file);
        if (!validation.valid) {
          toast.error(validation.error || 'Invalid file');
          return null;
        }
        const result = await uploadImage(file, user.uid);
        return result.url;
      });
      const results = await Promise.all(uploadPromises);
      const validUrls = results.filter((url): url is string => url !== null);
      setUploadedImages(prev => [...prev, ...validUrls]);
      toast.success(validUrls.length + ' image(s) uploaded');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload image');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  // Handle recipient selection from RecentRecipientsBox
  const handleSelectRecipient = (recipient: any, index: number) => {
    // Send a message to the AI with the selected recipient
    const message = `Send to recipient ${index}: ${recipient.name}`;
    onSendMessage(message, [], mode);
  };

  // Handle order submission from OrderFlowBox
  const handleSubmitOrder = (orderData: any) => {
    // Construct a confirmation message with all order details
    const message = `CONFIRM ORDER:
- Amount: ${orderData.sendAmount} ${orderData.sendCurrency}
- Recipient: ${orderData.recipientName}
- Delivery: ${orderData.deliveryMethod === 'mobile_money' ? 'Mobile Money' : 'Bank Transfer'}
${orderData.deliveryMethod === 'mobile_money' 
  ? `- Provider: ${orderData.mobileProvider}\n- Phone: ${orderData.recipientPhone}` 
  : `- Bank: ${orderData.recipientBank}\n- Account: ${orderData.recipientAccountNumber}`}
- My Phone: ${orderData.senderPhone}
- Payment: ${orderData.paymentMethod}`;
    
    onSendMessage(message, [], mode);
  };

  // Handle quick reply selection
  const handleQuickReply = (value: string) => {
    onSendMessage(value, [], mode);
  };

  // Handle quick action click
  const handleQuickAction = (action: string) => {
    onSendMessage(action, [], mode);
  };

  // Empty state - centered welcome
  if (messages.length === 0) {
    return (
      <div className="flex flex-col h-full min-h-[400px] sm:min-h-[480px] items-center justify-center px-3 sm:px-4 safe-area-inset">
        <div className="w-full max-w-2xl mx-auto">
          {/* Welcome Header - Mobile optimized */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/10 mb-3">
              <Brain className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">Ikamba AI</h1>
            <p className="text-muted-foreground text-xs sm:text-sm px-4">
              Your intelligent assistant for anything - math, coding, writing, and instant money transfers to Africa.
            </p>
          </div>

          {/* Quick Actions - Mobile friendly grid */}
          <div className="grid grid-cols-2 gap-2 mb-4 px-2">
            {QUICK_ACTIONS.map((item) => (
              <button
                key={item.action}
                onClick={() => handleQuickAction(item.action)}
                className="p-3 rounded-xl bg-muted/50 hover:bg-muted/80 border border-border/50 text-left transition-colors"
              >
                <p className="text-xs sm:text-sm font-medium truncate">{item.label}</p>
              </button>
            ))}
          </div>

          {uploadedImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 justify-center">
              {uploadedImages.map((url, index) => (
                <div key={index} className="relative group">
                  <img src={url} alt="Upload preview" className="h-12 w-12 sm:h-14 sm:w-14 object-cover rounded-lg border border-border" />
                  <button 
                    type="button" 
                    onClick={() => handleRemoveImage(index)} 
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />

          <form onSubmit={handleSubmit} className="w-full px-2">
            <div className="flex items-center gap-1.5 sm:gap-2 bg-muted/50 backdrop-blur-lg border border-border rounded-full px-2 h-12 sm:h-14">
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()} 
                disabled={isStreaming || isUploading} 
                className="flex-shrink-0 rounded-full flex items-center justify-center transition-all bg-zinc-800 hover:bg-zinc-700 text-white disabled:opacity-50 h-8 w-8 sm:h-10 sm:w-10"
                title="Attach files"
              >
                {isUploading ? <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" /> : <Plus className="h-4 w-4 sm:h-5 sm:w-5" />}
              </button>

              <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                <button 
                  type="button" 
                  onClick={() => setMode('thinking')} 
                  className={cn(
                    "flex items-center gap-1 rounded-full text-[10px] sm:text-xs font-medium transition-all px-2 py-1 sm:px-3 sm:py-1.5",
                    mode === 'thinking' ? "bg-zinc-900 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  )}
                >
                  <Brain className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">Advanced</span>
                </button>
                <button 
                  type="button" 
                  onClick={() => setMode('gpt')} 
                  className={cn(
                    "flex items-center gap-1 rounded-full text-[10px] sm:text-xs font-medium transition-all px-2 py-1 sm:px-3 sm:py-1.5",
                    mode === 'gpt' ? "bg-zinc-900 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  )}
                >
                  <Zap className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">Chat</span>
                </button>
              </div>

              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={mode === 'thinking' ? "Send 5000 RUB to Rwanda..." : "Message..."}
                className="flex-1 min-w-0 bg-transparent border-0 outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground text-sm sm:text-base"
                disabled={isStreaming || isUploading}
              />

              <Button 
                type="submit" 
                size="sm"
                disabled={(!input.trim() && uploadedImages.length === 0) || isStreaming || isUploading} 
                className="flex-shrink-0 rounded-full bg-primary hover:bg-primary/90 h-8 w-8 sm:h-10 sm:w-10 p-0"
              >
                {isStreaming ? <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" /> : <Send className="h-4 w-4 sm:h-5 sm:w-5" />}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Chat state with messages
  return (
    <div className="relative flex flex-col h-full min-h-[400px] sm:min-h-[520px]">
      <div className="flex-1 overflow-y-auto px-2 sm:px-4 lg:px-8" ref={scrollRef}>
        <div className="max-w-3xl mx-auto min-h-full flex flex-col justify-end py-4 sm:py-6 pb-28 sm:pb-32">
          <div className="space-y-3 sm:space-y-4">
            {messages.map((message, index) => (
              <MessageBubble 
                key={message.id || index} 
                message={message} 
                className="animate-fade-in-up" 
                style={{ animationDelay: index * 30 + 'ms' }}
                onSelectRecipient={handleSelectRecipient}
                onSubmitOrder={handleSubmitOrder}
                onQuickReply={handleQuickReply}
              />
            ))}
            {isStreaming && (
              <div className="flex items-center gap-2 text-muted-foreground pl-10 sm:pl-12">
                <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                <span className="text-xs sm:text-sm">Thinking...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fixed bottom input - Mobile optimized */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent pt-4 sm:pt-6 pb-3 sm:pb-4 px-2 sm:px-4 safe-area-inset-bottom">
        <div className="max-w-2xl mx-auto">
          {uploadedImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 sm:mb-3 justify-center">
              {uploadedImages.map((url, index) => (
                <div key={index} className="relative group">
                  <img src={url} alt="Upload preview" className="h-10 w-10 sm:h-12 sm:w-12 object-cover rounded-lg border border-border" />
                  <button 
                    type="button" 
                    onClick={() => handleRemoveImage(index)} 
                    className="absolute -top-1 -right-1 h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  >
                    <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />

          <form onSubmit={handleSubmit} className="w-full">
            <div className="flex items-center gap-1.5 sm:gap-2 bg-muted/50 backdrop-blur-lg border border-border rounded-full px-1.5 sm:px-2 h-11 sm:h-12">
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()} 
                disabled={isStreaming || isUploading} 
                className="flex-shrink-0 rounded-full flex items-center justify-center transition-all bg-zinc-800 hover:bg-zinc-700 text-white disabled:opacity-50 h-7 w-7 sm:h-8 sm:w-8"
                title="Attach files"
              >
                {isUploading ? <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" /> : <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
              </button>

              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button 
                  type="button" 
                  onClick={() => setMode('thinking')} 
                  className={cn(
                    "flex items-center gap-0.5 rounded-full text-[10px] sm:text-xs font-medium transition-all px-1.5 py-0.5 sm:px-2 sm:py-1",
                    mode === 'thinking' ? "bg-zinc-900 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  )}
                >
                  <Brain className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  <span className="hidden sm:inline">Advanced</span>
                </button>
                <button 
                  type="button" 
                  onClick={() => setMode('gpt')} 
                  className={cn(
                    "flex items-center gap-0.5 rounded-full text-[10px] sm:text-xs font-medium transition-all px-1.5 py-0.5 sm:px-2 sm:py-1",
                    mode === 'gpt' ? "bg-zinc-900 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  )}
                >
                  <Zap className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  <span className="hidden sm:inline">Chat</span>
                </button>
              </div>

              <input
                ref={inputRefCompact}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Send 5000 RUB to Rwanda..."
                className="flex-1 min-w-0 bg-transparent border-0 outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground text-xs sm:text-sm"
                disabled={isStreaming || isUploading}
              />

              <Button 
                type="submit" 
                size="sm"
                disabled={(!input.trim() && uploadedImages.length === 0) || isStreaming || isUploading} 
                className="flex-shrink-0 rounded-full bg-primary hover:bg-primary/90 h-7 w-7 sm:h-8 sm:w-8 p-0"
              >
                {isStreaming ? <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" /> : <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
