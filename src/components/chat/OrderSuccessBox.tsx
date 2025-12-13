'use client';

import { CheckCircle, Mail, Clock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

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
      "rounded-xl border border-green-200 dark:border-green-900 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 overflow-hidden my-3",
      className
    )}>
      {/* Success Header */}
      <div className="flex items-center gap-3 px-4 py-4 bg-green-100 dark:bg-green-900/50 border-b border-green-200 dark:border-green-800">
        <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center">
          <CheckCircle className="h-6 w-6 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-green-800 dark:text-green-200">Payment Proof Received!</h3>
          <p className="text-sm text-green-600 dark:text-green-400">Your transfer is being processed</p>
        </div>
      </div>

      {/* Order Details */}
      <div className="p-4 space-y-3">
        {/* Reference */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Order Reference</span>
          <span className="font-mono font-semibold text-green-700 dark:text-green-300">{orderId}</span>
        </div>

        {/* Transfer Summary */}
        {hasValidAmounts && (
          <div className="flex items-center justify-center gap-3 py-3 bg-white/50 dark:bg-black/20 rounded-lg">
            <div className="text-center">
              <p className="text-lg font-bold">{formattedSendAmount}</p>
              <p className="text-xs text-muted-foreground">{currency || 'RUB'}</p>
            </div>
            <ArrowRight className="h-5 w-5 text-green-500" />
            <div className="text-center">
              <p className="text-lg font-bold text-green-600 dark:text-green-400">{formattedReceiveAmount}</p>
              <p className="text-xs text-muted-foreground">{receiveCurrency || 'RWF'}</p>
            </div>
          </div>
        )}

        {/* Recipient */}
        {recipientName && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Recipient</span>
            <span className="font-medium">{recipientName}</span>
          </div>
        )}

        {/* Email Notification */}
        {senderEmail && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-100/50 dark:bg-green-900/30 rounded-lg px-3 py-2">
            <Mail className="h-4 w-4" />
            <span>Confirmation email sent to {senderEmail}</span>
          </div>
        )}

        {/* Processing Time */}
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/30 rounded-lg px-3 py-2">
          <Clock className="h-4 w-4" />
          <span>Processing time: 5-30 minutes for Mobile Money</span>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-green-100/50 dark:bg-green-900/30 border-t border-green-200 dark:border-green-800">
        <p className="text-xs text-center text-green-700 dark:text-green-300">
          You will receive another notification once your transfer is complete.
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
