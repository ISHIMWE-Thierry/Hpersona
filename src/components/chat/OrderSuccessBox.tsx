'use client';

import { CheckCircle, Mail, Clock, ArrowRight, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface OrderSuccessBoxProps {
  orderId: string;
  senderName?: string;
  senderEmail?: string;
  recipientName?: string;
  amount?: string;
  currency?: string;
  receiveAmount?: string;
  receiveCurrency?: string;
  className?: string;
}

// Helper to safely format numbers, handling NaN and empty strings
function formatAmount(value: string | undefined): string {
  if (!value || value === '' || value === '0') return '0';
  
  // Remove commas first
  const cleanValue = String(value).replace(/,/g, '');
  const num = Number(cleanValue);
  
  if (isNaN(num)) return '0';
  return num.toLocaleString();
}

// Copy button component
function CopyRefButton({ value }: { value: string }) {
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
      className="ml-2 p-1 rounded hover:bg-green-200/50 dark:hover:bg-green-800/50 transition-colors"
      title="Copy reference"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
      )}
    </button>
  );
}

export function OrderSuccessBox({
  orderId,
  senderName,
  senderEmail,
  recipientName,
  amount,
  currency,
  receiveAmount,
  receiveCurrency,
  className,
}: OrderSuccessBoxProps) {
  const formattedSendAmount = formatAmount(amount);
  const formattedReceiveAmount = formatAmount(receiveAmount);
  const hasValidAmounts = formattedSendAmount !== '0' && formattedReceiveAmount !== '0';
  
  return (
    <div className={cn(
      "rounded-xl border border-green-200 dark:border-green-900 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 overflow-hidden my-2 sm:my-3 shadow-sm",
      className
    )}>
      {/* Success Header - Compact on mobile */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-4 bg-green-100 dark:bg-green-900/50 border-b border-green-200 dark:border-green-800">
        <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
          <CheckCircle className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-sm sm:text-base text-green-800 dark:text-green-200">Payment Proof Received!</h3>
          <p className="text-xs sm:text-sm text-green-600 dark:text-green-400">Your transfer is being processed</p>
        </div>
      </div>

      {/* Order Details */}
      <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
        {/* Reference - Highlighted */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-white/50 dark:bg-black/20">
          <span className="text-xs sm:text-sm text-muted-foreground">Reference</span>
          <div className="flex items-center">
            <span className="font-mono text-xs sm:text-sm font-semibold text-green-700 dark:text-green-300">{orderId}</span>
            <CopyRefButton value={orderId} />
          </div>
        </div>

        {/* Transfer Summary - Compact on mobile */}
        {hasValidAmounts && (
          <div className="flex items-center justify-center gap-2 sm:gap-3 py-2 sm:py-3 bg-white/50 dark:bg-black/20 rounded-lg">
            <div className="text-center min-w-0">
              <p className="text-base sm:text-lg font-bold truncate">{formattedSendAmount}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">{currency || 'RUB'}</p>
            </div>
            <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
            <div className="text-center min-w-0">
              <p className="text-base sm:text-lg font-bold text-green-600 dark:text-green-400 truncate">{formattedReceiveAmount}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">{receiveCurrency || 'RWF'}</p>
            </div>
          </div>
        )}

        {/* Recipient */}
        {recipientName && (
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm text-muted-foreground">Recipient</span>
            <span className="font-medium text-xs sm:text-sm truncate max-w-[150px] sm:max-w-none">{recipientName}</span>
          </div>
        )}

        {/* Email Notification */}
        {senderEmail && (
          <div className="flex items-center gap-2 text-xs sm:text-sm text-green-600 dark:text-green-400 bg-green-100/50 dark:bg-green-900/30 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2">
            <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
            <span className="truncate">Confirmation sent to {senderEmail}</span>
          </div>
        )}

        {/* Processing Time */}
        <div className="flex items-center gap-2 text-xs sm:text-sm text-amber-600 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/30 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2">
          <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
          <span>Processing: 5-30 mins for Mobile Money</span>
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 sm:px-4 py-2 sm:py-3 bg-green-100/50 dark:bg-green-900/30 border-t border-green-200 dark:border-green-800">
        <p className="text-[10px] sm:text-xs text-center text-green-700 dark:text-green-300">
          You'll be notified when your transfer is complete
        </p>
      </div>
    </div>
  );
}

// Parse success message from AI
export function parseSuccessDetails(content: string): OrderSuccessBoxProps | null {
  // Look for [[SUCCESS:orderId:senderName:senderEmail:recipientName:amount:currency:receiveAmount:receiveCurrency]]
  const successMatch = content.match(/\[\[SUCCESS:([^:]+):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^\]]*)\]\]/);
  
  if (successMatch) {
    return {
      orderId: successMatch[1],
      senderName: successMatch[2] || undefined,
      senderEmail: successMatch[3] || undefined,
      recipientName: successMatch[4] || undefined,
      amount: successMatch[5] || undefined,
      currency: successMatch[6] || undefined,
      receiveAmount: successMatch[7] || undefined,
      receiveCurrency: successMatch[8] || undefined,
    };
  }

  return null;
}

// Extract success details and clean content
export function extractSuccessFromContent(content: string): {
  cleanContent: string;
  successDetails: OrderSuccessBoxProps | null;
} {
  const successMatch = content.match(/\[\[SUCCESS:[^\]]+\]\]/);
  if (successMatch) {
    const successDetails = parseSuccessDetails(content);
    const cleanContent = content.replace(/\[\[SUCCESS:[^\]]+\]\]/g, '').trim();
    return { cleanContent, successDetails };
  }

  return { cleanContent: content, successDetails: null };
}
