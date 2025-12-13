import { Message } from '@/types/chat';
import { cn } from '@/lib/utils';
import { User, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { PaymentDetailsBox, extractPaymentFromContent } from './PaymentDetailsBox';
import { TransferSummaryBox, extractTransferFromContent } from './TransferSummaryBox';
import { OrderSuccessBox, extractSuccessFromContent } from './OrderSuccessBox';
import { RecentRecipientsBox, extractRecipientsFromContent } from './RecentRecipientsBox';
import { CopyableValue } from './CopyableValue';

interface MessageBubbleProps {
  message: Message;
  className?: string;
  style?: React.CSSProperties;
  onSelectRecipient?: (recipient: any, index: number) => void;
}

// Process content to render copyable tags as React components
function renderContentWithCopyables(content: string): React.ReactNode {
  // First, check if there are any [[COPY:...]] tags
  if (!content.includes('[[COPY:')) {
    return content;
  }

  const parts: React.ReactNode[] = [];
  const lines = content.split('\n');
  
  lines.forEach((line, lineIndex) => {
    const regex = /\[\[COPY:([^:]+):([^\]]+)\]\]/g;
    let lastIndex = 0;
    let match;
    const lineParts: React.ReactNode[] = [];
    let partKey = 0;

    while ((match = regex.exec(line)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        lineParts.push(line.slice(lastIndex, match.index));
      }
      
      // Add the copyable component
      const label = match[1];
      const value = match[2];
      lineParts.push(
        <CopyableValue key={`${lineIndex}-${partKey++}`} label={label} value={value} />
      );
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text on this line
    if (lastIndex < line.length) {
      lineParts.push(line.slice(lastIndex));
    }
    
    // If line had copyable parts, render them; otherwise just the line
    if (lineParts.length > 0) {
      parts.push(
        <div key={lineIndex} className="flex flex-wrap items-center gap-1 my-1">
          {lineParts}
        </div>
      );
    } else {
      parts.push(<div key={lineIndex}>{line || '\u00A0'}</div>);
    }
  });

  return <>{parts}</>;
}

export function MessageBubble({ message, className, style, onSelectRecipient }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  
  // Extract transfer summary from assistant messages
  const { cleanContent: contentAfterTransfer, transferSummary } = !isUser 
    ? extractTransferFromContent(message.content)
    : { cleanContent: message.content, transferSummary: null };
  
  // Extract payment details from assistant messages
  const { cleanContent: contentAfterPayment, paymentDetails } = !isUser 
    ? extractPaymentFromContent(contentAfterTransfer)
    : { cleanContent: contentAfterTransfer, paymentDetails: null };
  
  // Extract success details from assistant messages
  const { cleanContent: contentAfterSuccess, successDetails } = !isUser 
    ? extractSuccessFromContent(contentAfterPayment)
    : { cleanContent: contentAfterPayment, successDetails: null };
  
  // Extract recent recipients from assistant messages
  const { cleanContent, recipients } = !isUser 
    ? extractRecipientsFromContent(contentAfterSuccess)
    : { cleanContent: contentAfterSuccess, recipients: null };
  
  // Check if content has copyable tags
  const hasCopyableTags = cleanContent.includes('[[COPY:');
  
  // Clean the content for display (remove COPY tags if we're rendering them separately)
  const displayContent = hasCopyableTags 
    ? cleanContent.replace(/\[\[COPY:[^\]]+\]\]/g, '') // Will be rendered by renderContentWithCopyables
    : cleanContent;

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
          <>
            {/* If content has copyable tags, render with special handling */}
            {hasCopyableTags ? (
              <div className="text-sm leading-relaxed space-y-1">
                {renderContentWithCopyables(cleanContent)}
              </div>
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
                  {cleanContent}
                </ReactMarkdown>
              </div>
            )}
            
            {/* Transfer Summary Box */}
            {transferSummary && (
              <TransferSummaryBox
                sendAmount={transferSummary.sendAmount}
                sendCurrency={transferSummary.sendCurrency}
                fee={transferSummary.fee}
                netAmount={transferSummary.netAmount}
                rate={transferSummary.rate}
                receiveAmount={transferSummary.receiveAmount}
                receiveCurrency={transferSummary.receiveCurrency}
              />
            )}
            
            {/* Payment Details Box with copy buttons */}
            {paymentDetails && (
              <PaymentDetailsBox
                amount={paymentDetails.amount}
                currency={paymentDetails.currency}
                accountNumber={paymentDetails.accountNumber}
                accountHolder={paymentDetails.accountHolder}
                provider={paymentDetails.provider}
              />
            )}
            
            {/* Order Success Box */}
            {successDetails && (
              <OrderSuccessBox
                orderId={successDetails.orderId}
                senderName={successDetails.senderName}
                senderEmail={successDetails.senderEmail}
                recipientName={successDetails.recipientName}
                amount={successDetails.amount}
                currency={successDetails.currency}
                receiveAmount={successDetails.receiveAmount}
                receiveCurrency={successDetails.receiveCurrency}
              />
            )}
            
            {/* Recent Recipients Box */}
            {recipients && recipients.length > 0 && (
              <RecentRecipientsBox
                recipients={recipients}
                onSelect={onSelectRecipient}
              />
            )}
          </>
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
