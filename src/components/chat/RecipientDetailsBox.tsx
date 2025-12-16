'use client';

import { useState } from 'react';
import { Copy, Check, User, Phone, Smartphone, Building2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecipientDetailsBoxProps {
  recipientName: string;
  recipientPhone: string;
  receiveAmount: string;
  receiveCurrency: string;
  provider?: string; // MTN, Airtel, M-Pesa, etc.
  bank?: string;
  accountNumber?: string;
  country?: string;
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
        "flex items-center gap-1 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 transition-colors active:scale-95",
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

export function RecipientDetailsBox({
  recipientName,
  recipientPhone,
  receiveAmount,
  receiveCurrency,
  provider,
  bank,
  accountNumber,
  country,
  className,
}: RecipientDetailsBoxProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isMobileMoney = provider && !bank;
  const isBank = bank && accountNumber;

  return (
    <div className={cn(
      "rounded-xl border border-blue-200 dark:border-blue-900 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 overflow-hidden my-2 sm:my-3 shadow-sm",
      className
    )}>
      {/* Header - Collapsible on mobile */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-blue-100 dark:bg-blue-900/50 border-b border-blue-200 dark:border-blue-800 transition-colors hover:bg-blue-200/50 dark:hover:bg-blue-900/70"
      >
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-xs sm:text-sm font-medium text-blue-800 dark:text-blue-200">Recipient Details</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 sm:hidden">
            {isExpanded ? 'Hide' : 'Show'}
          </span>
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 sm:hidden" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 sm:hidden" />
          )}
        </div>
      </button>

      <div className={cn(
        "transition-all duration-200 overflow-hidden",
        isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0 sm:max-h-[500px] sm:opacity-100"
      )}>
        {/* Amount to Receive - Highlighted */}
        <div className="p-3 sm:p-4 border-b border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-100/50 to-transparent dark:from-blue-900/30">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 mb-0.5 sm:mb-1">Recipient Will Receive</p>
              <p className="text-xl sm:text-2xl font-bold text-blue-800 dark:text-blue-200 truncate">
                {formatNumber(receiveAmount)} <span className="text-sm sm:text-base font-semibold text-blue-600 dark:text-blue-400">{receiveCurrency}</span>
              </p>
            </div>
            <CopyButton value={receiveAmount.replace(/,/g, '')} label="amount" />
          </div>
        </div>

        {/* Recipient Details */}
        <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
          {/* Recipient Name */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <div>
                <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">Recipient Name</p>
                <p className="text-sm sm:text-base font-medium truncate">{recipientName}</p>
              </div>
            </div>
            <CopyButton value={recipientName} label="name" size="sm" />
          </div>

          {/* Phone Number - Highlighted for Mobile Money */}
          <div className="p-2.5 sm:p-3 rounded-lg bg-white/50 dark:bg-black/20 border border-blue-200/50 dark:border-blue-800/50">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">Phone Number</p>
                  <p className="text-sm sm:text-base font-mono font-bold text-blue-700 dark:text-blue-300">
                    {recipientPhone}
                  </p>
                </div>
              </div>
              <CopyButton value={recipientPhone.replace(/\s/g, '')} label="phone" size="sm" />
            </div>
          </div>

          {/* Delivery Method - Mobile Money or Bank */}
          {isMobileMoney && (
            <div className="flex items-center justify-between pt-2 border-t border-blue-200/50 dark:border-blue-800/50">
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <Smartphone className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">Delivery via</p>
                  <p className="text-sm sm:text-base font-medium">{provider} Mobile Money</p>
                </div>
              </div>
            </div>
          )}

          {isBank && (
            <>
              <div className="flex items-center justify-between pt-2 border-t border-blue-200/50 dark:border-blue-800/50">
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">Bank</p>
                    <p className="text-sm sm:text-base font-medium">{bank}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">Account Number</p>
                  <p className="text-sm sm:text-base font-mono font-medium">{accountNumber}</p>
                </div>
                <CopyButton value={accountNumber} label="account" size="sm" />
              </div>
            </>
          )}

          {/* Country */}
          {country && (
            <div className="pt-2 border-t border-blue-200/50 dark:border-blue-800/50">
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Destination: <span className="font-medium text-foreground">{country}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper to parse recipient details from AI message content
// Format: [[RECIPIENT:name:phone:amount:currency:provider:bank:accountNumber:country]]
export function parseRecipientDetails(content: string): RecipientDetailsBoxProps | null {
  const recipientMatch = content.match(/\[\[RECIPIENT:([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^\]]*)\]\]/);
  
  if (recipientMatch) {
    return {
      recipientName: recipientMatch[1],
      recipientPhone: recipientMatch[2],
      receiveAmount: recipientMatch[3],
      receiveCurrency: recipientMatch[4],
      provider: recipientMatch[5] || undefined,
      bank: recipientMatch[6] || undefined,
      accountNumber: recipientMatch[7] || undefined,
      country: recipientMatch[8] || undefined,
    };
  }

  // Also try to parse from natural language patterns
  // Look for "Recipient: Name (+phone) will receive X currency via Provider"
  const naturalMatch = content.match(/Recipient:\s*([^\(]+)\s*\(([^\)]+)\)\s*will\s*receive\s*([0-9,]+)\s*(\w{3})\s*via\s*(.+?)(?:\.|$)/i);
  
  if (naturalMatch) {
    const deliveryMethod = naturalMatch[5].trim();
    const isMobileMoney = /MTN|Airtel|M-Pesa|Mobile Money/i.test(deliveryMethod);
    
    return {
      recipientName: naturalMatch[1].trim(),
      recipientPhone: naturalMatch[2].trim(),
      receiveAmount: naturalMatch[3].replace(/,/g, ''),
      receiveCurrency: naturalMatch[4].toUpperCase(),
      provider: isMobileMoney ? deliveryMethod.replace(/Mobile Money/i, '').trim() : undefined,
      bank: !isMobileMoney ? deliveryMethod : undefined,
    };
  }

  return null;
}

// Extract recipient details and clean content
export function extractRecipientFromContent(content: string): {
  cleanContent: string;
  recipientDetails: RecipientDetailsBoxProps | null;
} {
  let cleanContent = content;
  
  // Check for explicit recipient marker
  const recipientMatch = content.match(/\[\[RECIPIENT:[^\]]*\]\]?/);
  if (recipientMatch) {
    const recipientDetails = parseRecipientDetails(content);
    cleanContent = content.replace(/\[\[RECIPIENT:[^\]]*\]\]?/g, '').trim();
    return { cleanContent, recipientDetails };
  }

  // Try natural language parsing
  const naturalDetails = parseRecipientDetails(content);
  if (naturalDetails) {
    // Remove the natural language recipient line
    cleanContent = content.replace(/Recipient:\s*[^\(]+\s*\([^\)]+\)\s*will\s*receive\s*[0-9,]+\s*\w{3}\s*via\s*.+?(?:\.|$)/gi, '').trim();
    return { cleanContent, recipientDetails: naturalDetails };
  }

  return { cleanContent, recipientDetails: null };
}
