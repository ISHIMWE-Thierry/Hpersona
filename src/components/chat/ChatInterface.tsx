import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, X, Brain, Zap, Plus } from 'lucide-react';
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

// Ikamba Logo SVG Component
const IkambaLogo = ({ className }: { className?: string }) => (
  <svg className={className} width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M18.3279 33.2066C19.157 32.2118 20.3851 31.6365 21.6802 31.6365H39.2727C44.0927 31.6365 48 27.7292 48 22.9093V18.5456C48 13.7257 44.0927 9.81836 39.2727 9.81836H35.862C34.567 9.81836 33.3388 10.3936 32.5098 11.3885L29.6721 14.7937C28.843 15.7886 27.6149 16.3638 26.3198 16.3638H8.72727C3.90733 16.3638 0 20.2711 0 25.0911V29.4547C0 34.2747 3.90733 38.182 8.72727 38.182H12.138C13.433 38.182 14.6612 37.6068 15.4902 36.612L18.3279 33.2066ZM41.4545 18.5456C41.4545 17.3406 40.4777 16.3638 39.2727 16.3638H32.5893C31.2942 16.3638 30.0661 16.939 29.237 17.9339L26.3993 21.3392C25.5703 22.334 24.3421 22.9093 23.0471 22.9093H8.72727C7.52229 22.9093 6.54545 23.8861 6.54545 25.0911V29.4547C6.54545 30.6596 7.52229 31.6365 8.72727 31.6365H15.4107C16.7058 31.6365 17.9339 31.0612 18.763 30.0664L21.6007 26.6611C22.4297 25.6663 23.6579 25.0911 24.9529 25.0911H39.2727C40.4777 25.0911 41.4545 24.1142 41.4545 22.9093V18.5456Z" fill="currentColor"/>
  </svg>
);

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

  // Empty state - clean minimal welcome
  if (messages.length === 0) {
    return (
      <div className="flex flex-col h-full min-h-[400px] sm:min-h-[480px] items-center justify-center px-3 sm:px-4 safe-area-inset">
        <div className="w-full max-w-2xl mx-auto">
          {/* Welcome Header - Professional logo without background */}
          <div className="text-center mb-8">
            <IkambaLogo className="h-16 w-16 sm:h-20 sm:w-20 text-primary mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">
              How can I help you today?
            </p>
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
                placeholder="Type something..."
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
                placeholder="Type something..."
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
