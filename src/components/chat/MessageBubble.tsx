import { Message } from '@/types/chat';
import { cn } from '@/lib/utils';
import { User, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

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

        {/* Render content with markdown and math support */}
        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {message.content}
          </p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:bg-background/50 prose-pre:border prose-pre:border-border prose-code:text-primary prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                // Custom rendering for code blocks
                code({ node, inline, className, children, ...props }: any) {
                  return inline ? (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  ) : (
                    <pre className="overflow-x-auto p-3 rounded-lg">
                      <code className={className} {...props}>
                        {children}
                      </code>
                    </pre>
                  );
                },
                // Better paragraph handling
                p({ children }) {
                  return <p className="mb-2 last:mb-0">{children}</p>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
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
