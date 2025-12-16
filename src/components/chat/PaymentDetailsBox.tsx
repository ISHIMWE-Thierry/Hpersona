'use client';

import { useState } from 'react';
import { Copy, Check, CreditCard, Wallet, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaymentDetailsBoxProps {
  amount: string;
  currency: string;
  accountNumber: string;
  accountHolder: string;
  provider?: string;
  className?: string;
}

function CopyButton({ value, label, size = 'default' }: { value: string; label: string; size?: 'default' | 'sm' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "flex items-center gap-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition-colors active:scale-95",
        size === 'sm' ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
      )}
      title={`Copy ${label}`}
    >
      {copied ? (
        <>
          <Check className={size === 'sm' ? "h-2.5 w-2.5" : "h-3 w-3"} />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <Copy className={size === 'sm' ? "h-2.5 w-2.5" : "h-3 w-3"} />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

// Format number with commas
function formatNumber(value: string | number): string {
  if (!value) return '0';
  const cleanValue = String(value).replace(/,/g, '');
  const num = Number(cleanValue);
  return isNaN(num) ? String(value) : num.toLocaleString();
}

// Format card number with spaces
function formatCardNumber(num: string): string {
  const clean = num.replace(/\s/g, '');
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

export function PaymentDetailsBox({
  amount,
  currency,
  accountNumber,
  accountHolder,
  provider,
  className,
}: PaymentDetailsBoxProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className={cn(
      "rounded-xl border border-border/60 bg-card/95 backdrop-blur-sm overflow-hidden my-2 sm:my-3 shadow-sm",
      className
    )}>
      {/* Header - Collapsible on mobile */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-primary/5 border-b border-border/40 transition-colors hover:bg-primary/10"
      >
        <div className="flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
          <span className="text-xs sm:text-sm font-medium">Payment Details</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] sm:text-xs text-muted-foreground sm:hidden">
            {isExpanded ? 'Hide' : 'Show'}
          </span>
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground sm:hidden" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground sm:hidden" />
          )}
        </div>
      </button>

      <div className={cn(
        "transition-all duration-200 overflow-hidden",
        isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0 sm:max-h-[500px] sm:opacity-100"
      )}>
        {/* Amount Box - Prominent display */}
        <div className="p-3 sm:p-4 border-b border-border/40 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">Amount to Pay</p>
              <p className="text-xl sm:text-2xl font-bold text-foreground truncate">
                {formatNumber(amount)} <span className="text-sm sm:text-base font-semibold text-muted-foreground">{currency}</span>
              </p>
            </div>
            <CopyButton value={amount.replace(/,/g, '')} label="amount" />
          </div>
        </div>

        {/* Account Details Box - Compact on mobile */}
        <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
          {/* Account/Card Number - Most important, highlighted */}
          <div className="p-2.5 sm:p-3 rounded-lg bg-muted/50 border border-border/40">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">
                  {provider?.toLowerCase().includes('sber') || provider?.toLowerCase().includes('bank') 
                    ? 'Card Number' 
                    : provider 
                      ? `${provider} Number` 
                      : 'Account/Card Number'}
                </p>
                <p className="text-sm sm:text-base font-mono font-bold text-primary break-all">
                  {formatCardNumber(accountNumber)}
                </p>
              </div>
              <CopyButton value={accountNumber.replace(/\s/g, '')} label="card number" size="sm" />
            </div>
          </div>

          {/* Cardholder - Recipient of payment (Ikamba) */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">Cardholder Name</p>
              <p className="text-sm sm:text-base font-medium truncate">{accountHolder}</p>
            </div>
            <CopyButton value={accountHolder} label="account holder" size="sm" />
          </div>

          {/* Provider/Bank */}
          {provider && (
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">Bank</p>
                <p className="text-sm sm:text-base font-medium truncate">{provider}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer - Important reminder about payment proof */}
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-900">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-medium text-amber-800 dark:text-amber-300">
                Upload Payment Proof
              </p>
              <p className="text-[10px] sm:text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Send screenshot after payment to complete your transfer.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper to parse payment details from AI message content
export function parsePaymentDetails(content: string): PaymentDetailsBoxProps | null {
  // Look for payment pattern in AI response
  // Format: [[PAYMENT:amount:currency:accountNumber:accountHolder:provider:reference]]
  const paymentMatch = content.match(/\[\[PAYMENT:([^:]+):([^:]+):([^:]+):([^:]+):([^:]*):([^\]]*)\]\]/);
  
  if (paymentMatch) {
    return {
      amount: paymentMatch[1],
      currency: paymentMatch[2],
      accountNumber: paymentMatch[3],
      accountHolder: paymentMatch[4],
      provider: paymentMatch[5] || undefined,
    };
  }

  // Improved natural pattern detection for payment instructions
  // Look for "Pay to:" or "Payment Details:" sections
  const hasPaymentSection = /pay\s*to:|payment\s*details:|send\s*to:|transfer\s*to:/i.test(content);
  
  if (!hasPaymentSection) {
    return null;
  }

  // Extract amount - look for patterns like "Amount: 4,000 RUB" or "4000 RUB"
  const amountMatch = content.match(/Amount[:\s]*([0-9,]+(?:\.\d+)?)\s*(\w{3})/i) ||
                      content.match(/([0-9,]+(?:\.\d+)?)\s*(RUB|USD|EUR|TRY)\b/i);
  
  // Extract account/card number - various formats
  const accountMatch = content.match(/(?:Account|Card|Number)[:\s]*(\d[\d\s-]{8,})/i) ||
                       content.match(/(?:Sberbank|Tinkoff|VTB)[:\s]*(\d[\d\s-]{8,})/i) ||
                       content.match(/(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})/);
  
  // Extract holder name
  const holderMatch = content.match(/(?:Holder|Name|Cardholder|Recipient)[:\s]*([A-Za-z\s]+?)(?:\n|$|Bank|Account)/i);
  
  // Extract bank/provider
  const providerMatch = content.match(/(?:Bank|Provider|Via)[:\s]*([^\n]+)/i) ||
                        content.match(/(Sberbank|Tinkoff|VTB|Alfa-Bank)/i);

  // Only return if we have the essential fields
  if (amountMatch && accountMatch) {
    return {
      amount: amountMatch[1].replace(/,/g, ''),
      currency: amountMatch[2]?.toUpperCase() || 'RUB',
      accountNumber: accountMatch[1].replace(/[\s-]/g, ''),
      accountHolder: holderMatch?.[1]?.trim() || 'Ikamba Ventures',
      provider: providerMatch?.[1]?.trim(),
    };
  }

  return null;
}

// Extract payment details and clean content
export function extractPaymentFromContent(content: string): {
  cleanContent: string;
  paymentDetails: PaymentDetailsBoxProps | null;
} {
  // Check for explicit payment marker first
  const paymentMatch = content.match(/\[\[PAYMENT:[^\]]+\]\]/);
  if (paymentMatch) {
    const paymentDetails = parsePaymentDetails(content);
    // Remove the [[PAYMENT:...]] tag from displayed content
    const cleanContent = content.replace(/\[\[PAYMENT:[^\]]+\]\]/g, '').trim();
    return { cleanContent, paymentDetails };
  }

  // Check if this looks like a payment instruction message
  const hasPayTo = /pay\s*to|payment\s*details|send\s*payment|send\s*to|transfer\s*to|order\s*confirmed/i.test(content);
  
  // Look for amount pattern
  const hasAmount = /amount[:\s]*[\d,]+/i.test(content) || /[\d,]+\s*RUB/i.test(content);
  
  // Look for account/card pattern - numbers with 10+ digits
  const hasAccount = /(?:account|card|number)[:\s]*[\d\s+-]+/i.test(content) || 
                     /\d{10,}/i.test(content) ||
                     /\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/i.test(content);

  if (hasPayTo && hasAmount && hasAccount) {
    const paymentDetails = parsePaymentDetails(content);
    // Don't remove the text, just enhance it with the payment box
    return { cleanContent: content, paymentDetails };
  }

  return { cleanContent: content, paymentDetails: null };
}
