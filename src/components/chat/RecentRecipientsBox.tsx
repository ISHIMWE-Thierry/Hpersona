'use client';

import { User, Phone, Building2, Smartphone, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Recipient {
  name: string;
  phone?: string;
  provider?: string;
  bank?: string;
  country?: string;
}

interface RecentRecipientsBoxProps {
  recipients: Recipient[];
  onSelect?: (recipient: Recipient, index: number) => void;
  className?: string;
}

export function RecentRecipientsBox({ 
  recipients, 
  onSelect,
  className 
}: RecentRecipientsBoxProps) {
  if (!recipients || recipients.length === 0) return null;

  return (
    <div className={cn(
      "mt-2 sm:mt-3 rounded-xl overflow-hidden border border-border/50 bg-gradient-to-br from-primary/5 to-secondary/5",
      className
    )}>
      {/* Header */}
      <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-primary/10 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-full bg-primary/20">
            <User className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary" />
          </div>
          <span className="text-xs sm:text-sm font-medium text-foreground">Recent Recipients</span>
        </div>
      </div>

      {/* Recipients List */}
      <div className="divide-y divide-border/30">
        {recipients.map((recipient, index) => (
          <button
            key={`${recipient.name}-${recipient.phone}-${index}`}
            onClick={() => onSelect?.(recipient, index + 1)}
            className="w-full px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3 hover:bg-primary/5 active:bg-primary/10 transition-colors text-left group"
          >
            {/* Number Badge */}
            <div className="flex-shrink-0 h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-[10px] sm:text-xs font-bold text-primary">{index + 1}</span>
            </div>

            {/* Recipient Info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-foreground truncate">
                {recipient.name}
              </p>
              <div className="flex items-center gap-2 sm:gap-3 mt-0.5">
                {recipient.phone && (
                  <span className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
                    <Phone className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    <span className="truncate max-w-[80px] sm:max-w-none">{recipient.phone}</span>
                  </span>
                )}
                {recipient.provider && (
                  <span className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
                    <Smartphone className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    <span className="truncate max-w-[60px] sm:max-w-none">{recipient.provider}</span>
                  </span>
                )}
                {recipient.bank && (
                  <span className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
                    <Building2 className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    <span className="truncate max-w-[60px] sm:max-w-none">{recipient.bank}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Arrow */}
            <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
          </button>
        ))}
      </div>

      {/* Footer hint */}
      <div className="px-3 sm:px-4 py-1.5 sm:py-2 bg-muted/30 border-t border-border/30">
        <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
          Tap to send, or type a new name
        </p>
      </div>
    </div>
  );
}

// Extract recent recipients from AI content
// Format: [[RECIPIENTS:name1|phone1|provider1,name2|phone2|provider2,...]]
export function extractRecipientsFromContent(content: string): {
  cleanContent: string;
  recipients: Recipient[] | null;
} {
  const recipientsRegex = /\[\[RECIPIENTS:(.*?)\]\]/;
  const match = content.match(recipientsRegex);
  
  if (!match) {
    return { cleanContent: content, recipients: null };
  }
  
  try {
    const recipientData = match[1];
    const recipientEntries = recipientData.split(',');
    
    const recipients: Recipient[] = recipientEntries.map(entry => {
      const [name, phone, provider, bank, country] = entry.split('|');
      return {
        name: name?.trim() || '',
        phone: phone?.trim() || undefined,
        provider: provider?.trim() || undefined,
        bank: bank?.trim() || undefined,
        country: country?.trim() || undefined,
      };
    }).filter(r => r.name); // Filter out empty entries
    
    const cleanContent = content.replace(recipientsRegex, '').trim();
    
    return { cleanContent, recipients: recipients.length > 0 ? recipients : null };
  } catch (error) {
    console.error('Error parsing recipients:', error);
    return { cleanContent: content, recipients: null };
  }
}
