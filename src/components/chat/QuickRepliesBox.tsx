'use client';

import { cn } from '@/lib/utils';

interface QuickReply {
  label: string;
  value: string;
}

interface QuickRepliesBoxProps {
  replies: QuickReply[];
  onSelect?: (reply: QuickReply) => void;
  className?: string;
}

export function QuickRepliesBox({ 
  replies, 
  onSelect,
  className 
}: QuickRepliesBoxProps) {
  if (!replies || replies.length === 0) return null;

  return (
    <div className={cn(
      "mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2",
      className
    )}>
      {replies.map((reply, index) => (
        <button
          key={`${reply.value}-${index}`}
          onClick={() => onSelect?.(reply)}
          className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-primary/10 hover:bg-primary/20 active:bg-primary/30 border border-primary/30 text-xs sm:text-sm font-medium text-primary transition-all active:scale-95"
        >
          {reply.label}
        </button>
      ))}
    </div>
  );
}

// Extract quick replies from AI content
// Format: [[QUICK_REPLIES:label1|value1,label2|value2,...]]
// Or simpler: [[REPLIES:Yes,No,Maybe]]
export function extractQuickRepliesFromContent(content: string): {
  cleanContent: string;
  quickReplies: QuickReply[] | null;
} {
  let cleanContent = content;
  let quickReplies: QuickReply[] = [];
  
  // Format 1: [[QUICK_REPLIES:label1|value1,label2|value2]]
  const fullRegex = /\[\[QUICK_REPLIES:([\s\S]*?)\]\]/g;
  let match;
  
  while ((match = fullRegex.exec(content)) !== null) {
    try {
      const data = match[1];
      const entries = data.split(',');
      
      entries.forEach(entry => {
        const parts = entry.split('|');
        if (parts[0]?.trim()) {
          quickReplies.push({
            label: parts[0].trim(),
            value: parts[1]?.trim() || parts[0].trim(),
          });
        }
      });
    } catch (error) {
      console.error('Error parsing quick replies:', error);
    }
  }
  
  // Format 2: [[REPLIES:Yes,No,Maybe]]
  const simpleRegex = /\[\[REPLIES:([\s\S]*?)\]\]/g;
  
  while ((match = simpleRegex.exec(content)) !== null) {
    try {
      const data = match[1];
      const entries = data.split(',');
      
      entries.forEach(entry => {
        const value = entry.trim();
        if (value) {
          quickReplies.push({ label: value, value });
        }
      });
    } catch (error) {
      console.error('Error parsing simple replies:', error);
    }
  }
  
  // Clean tags from content
  cleanContent = cleanContent
    .replace(/\[\[QUICK_REPLIES:[\s\S]*?\]\]/g, '')
    .replace(/\[\[REPLIES:[\s\S]*?\]\]/g, '')
    .trim();
  
  return { 
    cleanContent, 
    quickReplies: quickReplies.length > 0 ? quickReplies : null 
  };
}

// Detect if AI is asking a yes/no question and auto-generate quick replies
export function detectQuestionReplies(content: string): QuickReply[] | null {
  const lowerContent = content.toLowerCase();
  
  // Don't show quick replies if asking for specific data
  if (
    lowerContent.includes('how much') ||
    lowerContent.includes('what amount') ||
    lowerContent.includes('specify the amount') ||
    lowerContent.includes('phone number') ||
    lowerContent.includes('full name') ||
    lowerContent.includes('recipient') && lowerContent.includes('name') ||
    lowerContent.includes('your name')
  ) {
    return null; // User needs to type, not tap
  }
  
  // Yes/No confirmation questions - only for final confirmation
  if (
    (lowerContent.includes('confirm') && lowerContent.includes('?')) ||
    lowerContent.includes('proceed with the transfer') ||
    lowerContent.includes('is this correct')
  ) {
    return [
      { label: 'Yes, confirm', value: 'Yes' },
      { label: 'No, cancel', value: 'No' },
    ];
  }
  
  // Delivery method questions
  if (
    lowerContent.includes('mobile money or bank') ||
    lowerContent.includes('delivery method')
  ) {
    return [
      { label: 'Mobile Money', value: 'Mobile Money' },
      { label: 'Bank Transfer', value: 'Bank Transfer' },
    ];
  }
  
  // Mobile provider questions
  if (
    lowerContent.includes('mtn') ||
    lowerContent.includes('airtel') ||
    lowerContent.includes('m-pesa') ||
    lowerContent.includes('provider')
  ) {
    return [
      { label: 'MTN', value: 'MTN' },
      { label: 'Airtel', value: 'Airtel' },
      { label: 'M-Pesa', value: 'M-Pesa' },
    ];
  }
  
  // Payment method questions
  if (
    lowerContent.includes('sberbank') ||
    lowerContent.includes('payment method') ||
    lowerContent.includes('how will you pay')
  ) {
    return [
      { label: 'Sberbank', value: 'Sberbank' },
      { label: 'Cash', value: 'Cash' },
    ];
  }
  
  return null;
}
