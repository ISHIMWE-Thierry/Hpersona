import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Paperclip, X, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Message } from '@/types/chat';
import { MessageBubble } from './MessageBubble';
import { EmptyState } from './EmptyState';
import { uploadImage, validateImageFile } from '@/lib/storage';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { AIModel, AI_MODELS } from '@/lib/openai';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ChatInterfaceProps {
  messages: Message[];
  isStreaming: boolean;
  onSendMessage: (content: string, images?: string[]) => void;
  selectedModel?: AIModel;
  onModelChange?: (model: AIModel) => void;
}

export function ChatInterface({ messages, isStreaming, onSendMessage, selectedModel = 'gpt-4o', onModelChange }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

    onSendMessage(input.trim() || 'Analyze this image', uploadedImages);
    setInput('');
    setUploadedImages([]);
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    // Check if model supports vision
    const currentModel = AI_MODELS.find(m => m.id === selectedModel);
    if (!currentModel?.supportsVision) {
      toast.error('Selected model does not support image analysis. Switch to GPT-4o or GPT-4o Mini.');
      return;
    }

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
      toast.success(`${validUrls.length} image(s) uploaded`);
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

  return (
    <div className="flex flex-col h-screen">
      {/* Header with Model Selection */}
      <div className="border-b border-border bg-background/80 backdrop-blur-sm px-4 lg:px-8 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Model:</span>
            <Select value={selectedModel} onValueChange={(value) => onModelChange?.(value as AIModel)}>
              <SelectTrigger className="w-[200px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_MODELS.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{model.name}</span>
                      <span className="text-xs text-muted-foreground">{model.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {AI_MODELS.find(m => m.id === selectedModel)?.supportsVision && (
              <span className="flex items-center gap-1">
                <ImageIcon className="h-3 w-3" />
                Vision
              </span>
            )}
            {AI_MODELS.find(m => m.id === selectedModel)?.supportsReasoning && (
              <span>🧠 Reasoning</span>
            )}
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea 
        className="flex-1 px-4 lg:px-8" 
        ref={scrollRef}
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-w-3xl mx-auto py-8 space-y-6">
            {messages.map((message, index) => (
              <MessageBubble 
                key={message.id || index} 
                message={message}
                className="animate-fade-in-up"
                style={{ animationDelay: `${index * 50}ms` }}
              />
            ))}
            {isStreaming && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">AI is thinking...</span>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 lg:px-8 py-4">
          {/* Image Previews */}
          {uploadedImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {uploadedImages.map((url, index) => (
                <div key={index} className="relative group">
                  <img 
                    src={url} 
                    alt={`Upload ${index + 1}`}
                    className="h-20 w-20 object-cover rounded-lg border border-border"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(index)}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="relative">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message Ikamba AI..."
              className="min-h-[52px] max-h-[200px] pl-12 pr-12 resize-none bg-muted/50 border-border focus:border-primary transition-colors"
              disabled={isStreaming || isUploading}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming || isUploading || !AI_MODELS.find(m => m.id === selectedModel)?.supportsVision}
              className="absolute left-2 bottom-2 h-8 w-8"
              title="Upload images (vision models only)"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </Button>
            <Button
              type="submit"
              size="icon"
              disabled={(!input.trim() && uploadedImages.length === 0) || isStreaming || isUploading}
              className="absolute right-2 bottom-2 h-8 w-8 bg-primary hover:bg-primary/90"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Ikamba AI can make mistakes. Check important info.
          </p>
        </div>
      </div>
    </div>
  );
}
