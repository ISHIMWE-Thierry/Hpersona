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

export function ChatInterface({ messages, isStreaming, onSendMessage }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [mode, setMode] = useState<ChatMode>('thinking');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  const InputBar = ({ isCompact = false }: { isCompact?: boolean }) => (
    <div className="w-full">
      {uploadedImages.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 justify-center">
          {uploadedImages.map((url, index) => (
            <div key={index} className="relative group">
              <img 
                src={url} 
                alt="Upload preview" 
                className={cn(
                  "object-cover rounded-lg border border-border",
                  isCompact ? "h-12 w-12" : "h-14 w-14"
                )} 
              />
              <button 
                type="button" 
                onClick={() => handleRemoveImage(index)} 
                className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input 
        ref={fileInputRef} 
        type="file" 
        accept="image/*" 
        multiple 
        onChange={handleFileSelect} 
        className="hidden" 
      />

      <form onSubmit={handleSubmit} className="w-full">
        <div className={cn(
          "flex items-center gap-2 bg-muted/50 backdrop-blur-lg border border-border rounded-full px-2",
          isCompact ? "h-12" : "h-14"
        )}>
          <button 
            type="button" 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isStreaming || isUploading} 
            className={cn(
              "flex-shrink-0 rounded-full flex items-center justify-center transition-all bg-zinc-800 hover:bg-zinc-700 text-white disabled:opacity-50",
              isCompact ? "h-8 w-8" : "h-10 w-10"
            )}
            title="Attach files"
          >
            {isUploading ? (
              <Loader2 className={cn("animate-spin", isCompact ? "h-4 w-4" : "h-5 w-5")} />
            ) : (
              <Plus className={isCompact ? "h-4 w-4" : "h-5 w-5"} />
            )}
          </button>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button 
              type="button" 
              onClick={() => setMode('thinking')} 
              className={cn(
                "flex items-center gap-1 rounded-full text-xs font-medium transition-all",
                isCompact ? "px-2 py-1" : "px-3 py-1.5",
                mode === 'thinking' 
                  ? "bg-zinc-900 text-white" 
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              )}
            >
              <Brain className={isCompact ? "h-3 w-3" : "h-3.5 w-3.5"} />
              <span className="hidden sm:inline">Advanced</span>
            </button>
            <button 
              type="button" 
              onClick={() => setMode('gpt')} 
              className={cn(
                "flex items-center gap-1 rounded-full text-xs font-medium transition-all",
                isCompact ? "px-2 py-1" : "px-3 py-1.5",
                mode === 'gpt' 
                  ? "bg-zinc-900 text-white" 
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              )}
            >
              <Zap className={isCompact ? "h-3 w-3" : "h-3.5 w-3.5"} />
              <span className="hidden sm:inline">Chat</span>
            </button>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'thinking' ? "Ask anything..." : "Message..."}
            className={cn(
              "flex-1 min-w-0 bg-transparent border-0 outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground",
              isCompact ? "text-sm" : "text-base"
            )}
            disabled={isStreaming || isUploading}
          />

          <Button 
            type="submit" 
            size="sm"
            disabled={(!input.trim() && uploadedImages.length === 0) || isStreaming || isUploading} 
            className={cn(
              "flex-shrink-0 rounded-full bg-primary hover:bg-primary/90",
              isCompact ? "h-8 w-8 p-0" : "h-10 w-10 p-0"
            )}
          >
            {isStreaming ? (
              <Loader2 className={cn("animate-spin", isCompact ? "h-4 w-4" : "h-5 w-5")} />
            ) : (
              <Send className={isCompact ? "h-4 w-4" : "h-5 w-5"} />
            )}
          </Button>
        </div>
      </form>
    </div>
  );

  if (messages.length === 0) {
    return (
      <div className="flex flex-col h-screen items-center justify-center px-4">
        <div className="w-full max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Ikamba AI</h1>
            <p className="text-muted-foreground text-sm">Advanced AI for University Students</p>
          </div>
          <InputBar />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <ScrollArea className="flex-1 px-4 lg:px-8" ref={scrollRef}>
        <div className="max-w-3xl mx-auto py-6 space-y-4 pb-32">
          {messages.map((message, index) => (
            <MessageBubble 
              key={message.id || index} 
              message={message} 
              className="animate-fade-in-up" 
              style={{ animationDelay: index * 30 + 'ms' }} 
            />
          ))}
          {isStreaming && (
            <div className="flex items-center gap-2 text-muted-foreground pl-12">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Thinking...</span>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent pt-6 pb-4 px-4">
        <div className="max-w-2xl mx-auto">
          <InputBar isCompact />
        </div>
      </div>
    </div>
  );
}
