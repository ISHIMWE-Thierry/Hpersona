'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CopyableValueProps {
  label: string;
  value: string;
  suffix?: string;
  className?: string;
}

export function CopyableValue({ label, value, suffix, className }: CopyableValueProps) {
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
    <div className={cn(
      "inline-flex items-center gap-2 bg-primary/5 hover:bg-primary/10 rounded-lg px-2 py-1 transition-colors group/copy cursor-pointer",
      className
    )} onClick={handleCopy}>
      <span className="text-muted-foreground text-sm">{label}:</span>
      <span className="font-mono font-semibold text-foreground">{value}</span>
      {suffix && <span className="text-muted-foreground text-sm">{suffix}</span>}
      <button
        className="opacity-0 group-hover/copy:opacity-100 transition-opacity p-0.5 rounded hover:bg-primary/20"
        title="Copy"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

// Parse content and extract copyable values
export function parseCopyableTags(content: string): {
  cleanContent: string;
  copyableItems: Array<{ label: string; value: string; fullMatch: string }>;
} {
  const copyableItems: Array<{ label: string; value: string; fullMatch: string }> = [];
  
  // Match [[COPY:label:value]] pattern
  const regex = /\[\[COPY:([^:]+):([^\]]+)\]\]/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    copyableItems.push({
      label: match[1],
      value: match[2],
      fullMatch: match[0],
    });
  }
  
  // Don't remove the tags from content - we'll render them specially
  return { cleanContent: content, copyableItems };
}

// Render content with copyable values inline
export function renderWithCopyables(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\[\[COPY:([^:]+):([^\]]+)\]\]/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(content)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      parts.push(<span key={key++}>{textBefore}</span>);
    }
    
    // Add the copyable component
    const label = match[1];
    const value = match[2];
    parts.push(
      <CopyableValue key={key++} label={label} value={value} />
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(<span key={key++}>{content.slice(lastIndex)}</span>);
  }
  
  return parts;
}
