import { Message } from '@/types/chat';
import { cn } from '@/lib/utils';
import { User, Bot } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  className?: string;
  style?: React.CSSProperties;
}

export function MessageBubble({ message, className, style }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        "flex gap-4 group",
        isUser && "justify-end",
        className
      )}
      style={style}
    >
      {!isUser && (
        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
          <Bot className="h-5 w-5 text-primary" />
        </div>
      )}
      
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 transition-all",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted/50 glass border border-border"
        )}
      >
        {/* Display images if present */}
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {message.images.map((imageUrl, index) => (
              <img
                key={index}
                src={imageUrl}
                alt={`Attachment ${index + 1}`}
                className="max-w-full max-h-64 rounded-lg object-cover border border-border/50"
              />
            ))}
          </div>
        )}

        {/* Display reasoning if present (for O1 models) */}
        {message.reasoning && (
          <div className="mb-3 p-3 rounded-lg bg-background/50 border border-border/50">
            <p className="text-xs font-medium text-muted-foreground mb-1">🧠 Reasoning Process:</p>
            <p className="text-xs text-muted-foreground/80 whitespace-pre-wrap">{message.reasoning}</p>
          </div>
        )}

        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {message.content}
        </p>
        {message.timestamp && (
          <span className={cn(
            "text-xs mt-1 block",
            isUser ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {new Date(message.timestamp).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-secondary/20 flex items-center justify-center">
          <User className="h-5 w-5 text-secondary" />
        </div>
      )}
    </div>
  );
}
