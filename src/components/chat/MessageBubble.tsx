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
import { OrderFlowBox, extractOrderFlowFromContent } from './OrderFlowBox';
import { QuickRepliesBox, extractQuickRepliesFromContent, detectQuestionReplies } from './QuickRepliesBox';
import { CopyableValue } from './CopyableValue';

interface MessageBubbleProps {
  message: Message;
  className?: string;
  style?: React.CSSProperties;
  onSelectRecipient?: (recipient: any, index: number) => void;
  onSubmitOrder?: (orderData: any) => void;
  onQuickReply?: (value: string) => void;
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

// Clean all remaining tags from content that weren't properly parsed
function cleanAllTags(content: string): string {
  return content
    // Remove any [[TAG:...]] patterns
    .replace(/\[\[[A-Z_]+:[^\]]*\]\]?/gi, '')
    // Remove any standalone ]] or [[
    .replace(/\]\]/g, '')
    .replace(/\[\[/g, '')
    // Clean up multiple spaces and newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function MessageBubble({ message, className, style, onSelectRecipient, onSubmitOrder, onQuickReply }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  
  // Extract order flow from assistant messages
  const { cleanContent: contentAfterOrder, orderData } = !isUser 
    ? extractOrderFlowFromContent(message.content)
    : { cleanContent: message.content, orderData: null };
  
  // Extract transfer summary from assistant messages
  const { cleanContent: contentAfterTransfer, transferSummary } = !isUser 
    ? extractTransferFromContent(contentAfterOrder)
    : { cleanContent: contentAfterOrder, transferSummary: null };
  
  // Extract payment details from assistant messages
  const { cleanContent: contentAfterPayment, paymentDetails } = !isUser 
    ? extractPaymentFromContent(contentAfterTransfer)
    : { cleanContent: contentAfterTransfer, paymentDetails: null };
  
  // Extract success details from assistant messages
  const { cleanContent: contentAfterSuccess, successDetails } = !isUser 
    ? extractSuccessFromContent(contentAfterPayment)
    : { cleanContent: contentAfterPayment, successDetails: null };
  
  // Extract recent recipients from assistant messages
  const { cleanContent: contentAfterRecipients, recipients } = !isUser 
    ? extractRecipientsFromContent(contentAfterSuccess)
    : { cleanContent: contentAfterSuccess, recipients: null };
  
  // Extract quick replies from assistant messages
  const { cleanContent: contentAfterReplies, quickReplies: explicitReplies } = !isUser 
    ? extractQuickRepliesFromContent(contentAfterRecipients)
    : { cleanContent: contentAfterRecipients, quickReplies: null };
  
  // Auto-detect quick replies from questions
  const autoReplies = !isUser && !explicitReplies ? detectQuestionReplies(contentAfterReplies) : null;
  const quickReplies = explicitReplies || autoReplies;
  
  // Final cleanup - remove any remaining tags
  const cleanContent = cleanAllTags(contentAfterReplies);
  
  // Check if content has copyable tags
  const hasCopyableTags = cleanContent.includes('[[COPY:');
  
  // Clean the content for display (remove COPY tags if we're rendering them separately)
  const displayContent = hasCopyableTags 
    ? cleanContent.replace(/\[\[COPY:[^\]]+\]\]/g, '') // Will be rendered by renderContentWithCopyables
    : cleanContent;

  return (
    <div
      className={cn(
        "flex gap-2 sm:gap-4 group w-full",
        isUser && "justify-end",
        className
      )}
      style={style}
    >
      {!isUser && (
        <div className="flex-shrink-0 h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-primary/20 flex items-center justify-center">
          <Bot className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-primary" />
        </div>
      )}
      
      <div
        className={cn(
          "max-w-[calc(100%-3rem)] sm:max-w-[80%] rounded-xl sm:rounded-2xl px-3 py-2 sm:px-4 sm:py-3 transition-all overflow-hidden",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted/50 glass border border-border"
        )}
      >
        {/* Display images if present */}
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
            {message.images.map((imageUrl, index) => (
              <img
                key={index}
                src={imageUrl}
                alt={`Attachment ${index + 1}`}
                className="max-w-full max-h-48 sm:max-h-64 rounded-lg object-cover border border-border/50"
              />
            ))}
          </div>
        )}

        {/* Display reasoning if present (for O1 models) */}
        {message.reasoning && (
          <div className="mb-2 sm:mb-3 p-2 sm:p-3 rounded-lg bg-background/50 border border-border/50">
            <p className="text-[10px] sm:text-xs font-medium text-muted-foreground mb-1">🧠 Reasoning Process:</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground/80 whitespace-pre-wrap">{message.reasoning}</p>
          </div>
        )}

        {/* Render content with markdown and math support */}
        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-xs sm:text-sm leading-relaxed">
            {message.content}
          </p>
        ) : (
          <>
            {/* If content has copyable tags, render with special handling */}
            {hasCopyableTags ? (
              <div className="text-xs sm:text-sm leading-relaxed space-y-1 break-words overflow-wrap-anywhere">
                {renderContentWithCopyables(cleanContent)}
              </div>
            ) : (
              <div className="prose prose-xs sm:prose-sm dark:prose-invert max-w-none prose-p:my-0.5 sm:prose-p:my-1 prose-headings:my-1 sm:prose-headings:my-2 prose-ul:my-0.5 sm:prose-ul:my-1 prose-ol:my-0.5 sm:prose-ol:my-1 prose-li:my-0 sm:prose-li:my-0.5 prose-pre:bg-background/50 prose-pre:border prose-pre:border-border prose-code:text-primary prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none text-xs sm:text-sm break-words [overflow-wrap:anywhere]">
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
                        <pre className="overflow-x-auto p-2 sm:p-3 rounded-lg text-[10px] sm:text-xs">
                          <code className={className} {...props}>
                            {children}
                          </code>
                        </pre>
                      );
                    },
                    // Better paragraph handling
                    p({ children }) {
                      return <p className="mb-2 last:mb-0 break-words">{children}</p>;
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
            
            {/* Order Flow Box */}
            {orderData && onSubmitOrder && (
              <OrderFlowBox
                sendAmount={orderData.sendAmount}
                sendCurrency={orderData.sendCurrency}
                receiveAmount={orderData.receiveAmount}
                receiveCurrency={orderData.receiveCurrency}
                rate={orderData.rate}
                fee={orderData.fee}
                onSubmitOrder={onSubmitOrder}
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
            
            {/* Quick Reply Buttons */}
            {quickReplies && quickReplies.length > 0 && onQuickReply && (
              <QuickRepliesBox
                replies={quickReplies}
                onSelect={(reply) => onQuickReply(reply.value)}
              />
            )}
          </>
        )}
        {message.timestamp && (
          <span className={cn(
            "text-[10px] sm:text-xs mt-0.5 sm:mt-1 block",
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
        <div className="flex-shrink-0 h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-secondary/20 flex items-center justify-center">
          <User className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-secondary" />
        </div>
      )}
    </div>
  );
}
