'use client';

import { useState } from 'react';
import { Copy, Check, Calculator, ArrowRight, ArrowDownUp, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TransferSummaryBoxProps {
  sendAmount: string;
  sendCurrency: string;
  fee: string;
  netAmount: string;
  rate: string;
  receiveAmount: string;
  receiveCurrency: string;
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

// Helper to safely format numbers that might already contain commas or be strings
function formatNumber(value: string | number): string {
  if (!value) return '0';
  // Remove existing commas if string
  const cleanValue = String(value).replace(/,/g, '');
  const num = Number(cleanValue);
  return isNaN(num) ? '0' : num.toLocaleString();
}

export function TransferSummaryBox({
  sendAmount,
  sendCurrency,
  fee,
  netAmount,
  rate,
  receiveAmount,
  receiveCurrency,
  className,
}: TransferSummaryBoxProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className={cn(
      "rounded-xl border border-border/60 bg-card/95 backdrop-blur-sm overflow-hidden my-2 sm:my-3 shadow-sm",
      className
    )}>
      {/* Header - Collapsible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-primary/5 border-b border-border/40 transition-colors hover:bg-primary/10"
      >
        <div className="flex items-center gap-2">
          <Calculator className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
          <span className="text-xs sm:text-sm font-medium">Transfer Calculation</span>
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
        {/* Compact Summary - Mobile First */}
        <div className="p-3 sm:p-4">
          {/* Main Transfer Visual */}
          <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4 pb-3 border-b border-border/40">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-xs text-muted-foreground">You Send</p>
              <p className="text-base sm:text-lg font-bold truncate">
                {formatNumber(sendAmount)} <span className="text-xs sm:text-sm font-medium text-muted-foreground">{sendCurrency}</span>
              </p>
            </div>
            <div className="flex-shrink-0 p-1.5 rounded-full bg-primary/10">
              <ArrowDownUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1 text-right">
              <p className="text-[10px] sm:text-xs text-muted-foreground">They Get</p>
              <p className="text-base sm:text-lg font-bold text-primary truncate">
                {formatNumber(receiveAmount)} <span className="text-xs sm:text-sm font-medium text-muted-foreground">{receiveCurrency}</span>
              </p>
            </div>
          </div>

          {/* Exchange Rate - Highlighted */}
          <div className="flex items-center justify-center gap-2 py-1.5 sm:py-2 px-3 bg-muted/30 rounded-lg mb-3">
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">
              1 {sendCurrency} = {rate} {receiveCurrency}
            </p>
          </div>

          {/* Fee Details - Compact grid on mobile */}
          <div className="grid grid-cols-2 gap-2 sm:space-y-0 sm:grid-cols-3">
            {/* Fee */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20 col-span-1">
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">Fee</p>
                <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
                  -{formatNumber(fee)} {sendCurrency}
                </p>
              </div>
            </div>

            {/* Net Amount */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20 col-span-1">
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">Net</p>
                <p className="text-xs sm:text-sm font-medium truncate">
                  {formatNumber(netAmount)} {sendCurrency}
                </p>
              </div>
            </div>

            {/* Receive Amount - Full width on mobile */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-primary/5 border border-primary/20 col-span-2 sm:col-span-1">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground">Final Amount</p>
                <p className="text-sm sm:text-base font-bold text-primary truncate">
                  {formatNumber(receiveAmount)} {receiveCurrency}
                </p>
              </div>
              <CopyButton value={String(receiveAmount).replace(/,/g, '')} label="receive amount" size="sm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Parse transfer summary from AI message
export function parseTransferSummary(content: string): TransferSummaryBoxProps | null {
  // Look for [[TRANSFER:sendAmount:sendCurrency:fee:netAmount:rate:receiveAmount:receiveCurrency]]
  const transferMatch = content.match(/\[\[TRANSFER:([^:]+):([^:]+):([^:]+):([^:]+):([^:]+):([^:]+):([^\]]+)\]\]/);
  
  if (transferMatch) {
    return {
      sendAmount: transferMatch[1],
      sendCurrency: transferMatch[2],
      fee: transferMatch[3],
      netAmount: transferMatch[4],
      rate: transferMatch[5],
      receiveAmount: transferMatch[6],
      receiveCurrency: transferMatch[7],
    };
  }

  return null;
}

// Extract transfer summary and clean content
export function extractTransferFromContent(content: string): {
  cleanContent: string;
  transferSummary: TransferSummaryBoxProps | null;
} {
  const transferMatch = content.match(/\[\[TRANSFER:[^\]]+\]\]/);
  if (transferMatch) {
    const transferSummary = parseTransferSummary(content);
    const cleanContent = content.replace(/\[\[TRANSFER:[^\]]+\]\]/g, '').trim();
    return { cleanContent, transferSummary };
  }

  return { cleanContent: content, transferSummary: null };
}
