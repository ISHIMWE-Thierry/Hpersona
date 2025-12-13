'use client';

import { useState } from 'react';
import { Copy, Check, Calculator, ArrowRight } from 'lucide-react';
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
  return (
    <div className={cn(
      "rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden my-3",
      className
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/5 border-b border-border/40">
        <Calculator className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Transfer Calculation</span>
      </div>

      {/* Summary Grid */}
      <div className="p-4 space-y-3">
        {/* Send Amount */}
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">You Send</p>
            <p className="text-lg font-semibold">
              {formatNumber(sendAmount)} <span className="text-sm font-medium text-muted-foreground">{sendCurrency}</span>
            </p>
          </div>
          <CopyButton value={String(sendAmount)} label="send amount" />
        </div>

        {/* Fee */}
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">Fee</p>
            <p className="text-base font-medium text-muted-foreground">
              -{formatNumber(fee)} <span className="text-xs">{sendCurrency}</span>
            </p>
          </div>
          <CopyButton value={String(fee)} label="fee" />
        </div>

        {/* Net Amount */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">Net Amount</p>
            <p className="text-base font-medium">
              {formatNumber(netAmount)} <span className="text-xs text-muted-foreground">{sendCurrency}</span>
            </p>
          </div>
          <CopyButton value={String(netAmount)} label="net amount" />
        </div>

        {/* Exchange Rate */}
        <div className="flex items-center gap-2 py-2 px-3 bg-muted/30 rounded-lg">
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">
            Exchange Rate: 1 {sendCurrency} = {rate} {receiveCurrency}
          </p>
        </div>

        {/* Receive Amount */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">Recipient Gets</p>
            <p className="text-xl font-bold text-primary">
              {formatNumber(receiveAmount)} <span className="text-base font-semibold text-muted-foreground">{receiveCurrency}</span>
            </p>
          </div>
          <CopyButton value={String(receiveAmount)} label="receive amount" />
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
