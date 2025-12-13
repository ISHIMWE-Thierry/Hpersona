'use client';

import { useState } from 'react';
import { Copy, Check, CreditCard, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaymentDetailsBoxProps {
  amount: string;
  currency: string;
  accountNumber: string;
  accountHolder: string;
  provider?: string;
  className?: string;
}

function CopyButton({ value, label }: { value: string; label: string }) {
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
      className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
      title={`Copy ${label}`}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

export function PaymentDetailsBox({
  amount,
  currency,
  accountNumber,
  accountHolder,
  provider,
  className,
}: PaymentDetailsBoxProps) {
  return (
    <div className={cn(
      "rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden my-3",
      className
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/5 border-b border-border/40">
        <Wallet className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Payment Details</span>
      </div>

      {/* Amount Box */}
      <div className="p-4 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Amount to Pay</p>
            <p className="text-2xl font-bold text-foreground">
              {amount} <span className="text-base font-semibold text-muted-foreground">{currency}</span>
            </p>
          </div>
          <CopyButton value={amount} label="amount" />
        </div>
      </div>

      {/* Account Details Box */}
      <div className="p-4 space-y-3">
        {/* Account/Card Number */}
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">
              {provider?.toLowerCase().includes('sber') || provider?.toLowerCase().includes('bank') 
                ? 'Card Number (Pay to this card)' 
                : provider 
                  ? `${provider} Number` 
                  : 'Account/Card Number'}
            </p>
            <p className="text-base font-mono font-medium truncate">{accountNumber}</p>
          </div>
          <CopyButton value={accountNumber} label="card number" />
        </div>

        {/* Cardholder - Recipient of payment (Ikamba) */}
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">Cardholder (Pay to)</p>
            <p className="text-base font-medium truncate">{accountHolder}</p>
          </div>
          <CopyButton value={accountHolder} label="account holder" />
        </div>

        {/* Provider/Bank */}
        {provider && (
          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground mb-1">Bank</p>
              <p className="text-base font-medium truncate">{provider}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer - Important reminder about payment proof */}
      <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-900">
        <div className="flex items-start gap-2">
          <span className="text-amber-600 dark:text-amber-400 text-sm">⚠️</span>
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Upload Payment Proof Required
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Send screenshot or PDF receipt after payment. We cannot process without proof.
            </p>
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
