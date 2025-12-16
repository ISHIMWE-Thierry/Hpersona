'use client';

import { useState, useCallback, useMemo } from 'react';
import { 
  ArrowRight, 
  Check, 
  ChevronDown, 
  Building2, 
  Smartphone, 
  User, 
  Phone, 
  CreditCard,
  Wallet,
  ArrowDownUp,
  Loader2,
  Copy,
  Info,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ============================================================================
// TYPES
// ============================================================================

type OrderStep = 'amount' | 'delivery' | 'recipient' | 'payment' | 'confirm';

interface Recipient {
  name: string;
  phone?: string;
  provider?: string;
  bank?: string;
  accountNumber?: string;
  country?: string;
}

interface OrderFlowBoxProps {
  // Calculation data from AI
  sendAmount?: string;
  sendCurrency?: string;
  fee?: string;
  netAmount?: string;
  rate?: string;
  receiveAmount?: string;
  receiveCurrency?: string;
  // Recent recipients
  recentRecipients?: Recipient[];
  // Callbacks
  onSubmitOrder?: (orderData: OrderData) => void;
  onStepChange?: (step: OrderStep) => void;
  className?: string;
}

interface OrderData {
  sendAmount: string;
  sendCurrency: string;
  receiveCurrency: string;
  receiveAmount: string;
  deliveryMethod: 'mobile_money' | 'bank';
  recipientName: string;
  recipientPhone?: string;
  recipientBank?: string;
  recipientAccountNumber?: string;
  mobileProvider?: string;
  senderPhone: string;
  paymentMethod: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DELIVERY_OPTIONS = [
  { 
    id: 'mobile_money', 
    label: 'Mobile Money', 
    icon: Smartphone, 
    description: 'MTN, Airtel, M-Pesa',
    hint: 'Instant - 10 mins'
  },
  { 
    id: 'bank', 
    label: 'Bank Transfer', 
    icon: Building2, 
    description: 'Direct to bank account',
    hint: '1-3 hours'
  },
];

const MOBILE_PROVIDERS: Record<string, string[]> = {
  RWF: ['MTN Momo', 'Airtel Money'],
  UGX: ['MTN Momo Uganda', 'Airtel Money Uganda'],
  KES: ['M-Pesa', 'Airtel Money Kenya'],
  TZS: ['M-Pesa', 'Airtel Money'],
  NGN: ['MTN Mobile Money', 'Airtel'],
  XOF: ['MTN Mobile Money', 'Orange Money', 'Wave'],
  ZAR: ['FNB Pay', 'Capitec Pay'],
};

const BANKS: Record<string, string[]> = {
  RWF: ['Bank of Kigali', 'Equity Bank', 'I&M Bank', 'Access Bank'],
  UGX: ['Stanbic Bank', 'Equity Bank', 'DFCU', 'Centenary Bank'],
  KES: ['Equity Bank', 'KCB Bank', 'Cooperative Bank', 'NCBA'],
  RUB: ['Sberbank', 'Tinkoff', 'VTB', 'Alfa-Bank'],
};

const PAYMENT_METHODS = [
  { id: 'Sber', label: 'Sberbank Card', icon: CreditCard, badge: 'Popular' },
  { id: 'Cash', label: 'Cash Pickup', icon: Wallet, badge: '1% off' },
];

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function ProgressBar({ currentStep, steps }: { currentStep: number; steps: string[] }) {
  return (
    <div className="w-full mb-4">
      <div className="flex justify-between text-xs mb-2">
        {steps.map((step, index) => (
          <span
            key={step}
            className={cn(
              "transition-colors",
              index <= currentStep 
                ? "text-primary font-medium" 
                : "text-muted-foreground"
            )}
          >
            {step}
          </span>
        ))}
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all duration-300 rounded-full"
          style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

function CopyButton({ value, size = 'sm' }: { value: string; size?: 'sm' | 'xs' }) {
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
        "flex items-center gap-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition-colors",
        size === 'sm' ? "px-2 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]"
      )}
    >
      {copied ? (
        <>
          <Check className={size === 'sm' ? "h-3 w-3" : "h-2.5 w-2.5"} />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className={size === 'sm' ? "h-3 w-3" : "h-2.5 w-2.5"} />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OrderFlowBox({
  sendAmount = '',
  sendCurrency = 'RUB',
  fee = '100',
  netAmount = '',
  rate = '',
  receiveAmount = '',
  receiveCurrency = 'RWF',
  recentRecipients = [],
  onSubmitOrder,
  onStepChange,
  className,
}: OrderFlowBoxProps) {
  // Step state
  const [currentStep, setCurrentStep] = useState<OrderStep>('delivery');
  const stepIndex = ['delivery', 'recipient', 'payment', 'confirm'].indexOf(currentStep);

  // Form state
  const [deliveryMethod, setDeliveryMethod] = useState<'mobile_money' | 'bank' | null>(null);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedBank, setSelectedBank] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available options based on currency
  const providers = useMemo(() => 
    MOBILE_PROVIDERS[receiveCurrency] || ['MTN Momo', 'Airtel Money'],
    [receiveCurrency]
  );

  const banks = useMemo(() => 
    BANKS[receiveCurrency] || ['Bank of Kigali', 'Equity Bank'],
    [receiveCurrency]
  );

  // Navigation
  const goToStep = useCallback((step: OrderStep) => {
    setCurrentStep(step);
    onStepChange?.(step);
  }, [onStepChange]);

  const goBack = useCallback(() => {
    const steps: OrderStep[] = ['delivery', 'recipient', 'payment', 'confirm'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      goToStep(steps[currentIndex - 1]);
    }
  }, [currentStep, goToStep]);

  // Handle recipient selection from recent
  const handleSelectRecipient = useCallback((recipient: Recipient) => {
    setRecipientName(recipient.name);
    if (recipient.phone) {
      setRecipientPhone(recipient.phone);
      setDeliveryMethod('mobile_money');
      if (recipient.provider) setSelectedProvider(recipient.provider);
    }
    if (recipient.accountNumber) {
      setAccountNumber(recipient.accountNumber);
      setDeliveryMethod('bank');
      if (recipient.bank) setSelectedBank(recipient.bank);
    }
  }, []);

  // Form validation
  const isDeliveryValid = deliveryMethod !== null;
  
  const isRecipientValid = useMemo(() => {
    if (!recipientName.trim()) return false;
    if (deliveryMethod === 'mobile_money') {
      return recipientPhone.length >= 9 && selectedProvider !== '';
    }
    if (deliveryMethod === 'bank') {
      return accountNumber.length >= 5 && selectedBank !== '';
    }
    return false;
  }, [recipientName, deliveryMethod, recipientPhone, selectedProvider, accountNumber, selectedBank]);

  const isPaymentValid = paymentMethod !== '' && senderPhone.length >= 9;

  // Submit order
  const handleSubmit = useCallback(async () => {
    if (!isPaymentValid || !isRecipientValid) return;
    
    setIsSubmitting(true);
    
    const orderData: OrderData = {
      sendAmount,
      sendCurrency,
      receiveCurrency,
      receiveAmount,
      deliveryMethod: deliveryMethod!,
      recipientName,
      recipientPhone: deliveryMethod === 'mobile_money' ? recipientPhone : undefined,
      recipientBank: deliveryMethod === 'bank' ? selectedBank : undefined,
      recipientAccountNumber: deliveryMethod === 'bank' ? accountNumber : undefined,
      mobileProvider: deliveryMethod === 'mobile_money' ? selectedProvider : undefined,
      senderPhone,
      paymentMethod,
    };

    try {
      await onSubmitOrder?.(orderData);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    sendAmount, sendCurrency, receiveCurrency, receiveAmount,
    deliveryMethod, recipientName, recipientPhone, accountNumber,
    selectedProvider, selectedBank, senderPhone, paymentMethod,
    isPaymentValid, isRecipientValid, onSubmitOrder
  ]);

  // Format number with commas
  const formatNumber = (value: string | number): string => {
    if (!value) return '0';
    const cleanValue = String(value).replace(/,/g, '');
    const num = Number(cleanValue);
    return isNaN(num) ? '0' : num.toLocaleString();
  };

  return (
    <div className={cn(
      "rounded-xl border border-border/60 bg-card/95 backdrop-blur-sm overflow-hidden my-3",
      className
    )}>
      {/* Header with Amount Summary */}
      <div className="p-3 sm:p-4 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border/40">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-full bg-primary/20">
              <ArrowDownUp className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-sm font-semibold">Send Money</span>
          </div>
          {rate && (
            <span className="text-[10px] sm:text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
              Rate: 1 {sendCurrency} = {rate} {receiveCurrency}
            </span>
          )}
        </div>
        
        {/* Compact amount display */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">You send</p>
            <p className="text-base sm:text-lg font-bold truncate">
              {formatNumber(sendAmount)} <span className="text-sm font-medium text-muted-foreground">{sendCurrency}</span>
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0 text-right">
            <p className="text-xs text-muted-foreground">They receive</p>
            <p className="text-base sm:text-lg font-bold text-primary truncate">
              {formatNumber(receiveAmount)} <span className="text-sm font-medium text-muted-foreground">{receiveCurrency}</span>
            </p>
          </div>
        </div>
        
        {/* Fee display */}
        {fee && (
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
            <Info className="h-3 w-3" />
            Fee: {formatNumber(fee)} {sendCurrency}
          </p>
        )}
      </div>

      {/* Progress Bar */}
      <div className="px-3 sm:px-4 pt-3">
        <ProgressBar 
          currentStep={stepIndex} 
          steps={['Delivery', 'Recipient', 'Payment', 'Confirm']} 
        />
      </div>

      {/* Step Content */}
      <div className="p-3 sm:p-4 pt-2">
        {/* STEP 1: Delivery Method */}
        {currentStep === 'delivery' && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">How should they receive the money?</Label>
            
            <div className="grid grid-cols-1 gap-2">
              {DELIVERY_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = deliveryMethod === option.id;
                
                return (
                  <button
                    key={option.id}
                    onClick={() => setDeliveryMethod(option.id as any)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left",
                      isSelected 
                        ? "border-primary bg-primary/5" 
                        : "border-border hover:border-primary/50 hover:bg-muted/30"
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-full",
                      isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                      {option.hint}
                    </span>
                    {isSelected && (
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Recent Recipients */}
            {recentRecipients.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border/40">
                <Label className="text-xs text-muted-foreground mb-2 block">Recent Recipients</Label>
                <div className="space-y-1.5">
                  {recentRecipients.slice(0, 3).map((recipient, index) => (
                    <button
                      key={`${recipient.name}-${index}`}
                      onClick={() => {
                        handleSelectRecipient(recipient);
                        goToStep('recipient');
                      }}
                      className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <User className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{recipient.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {recipient.phone || recipient.accountNumber}
                        </p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button 
              onClick={() => goToStep('recipient')}
              disabled={!isDeliveryValid}
              className="w-full mt-3"
              size="sm"
            >
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* STEP 2: Recipient Details */}
        {currentStep === 'recipient' && (
          <div className="space-y-3">
            <button 
              onClick={goBack}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
            >
              <ChevronDown className="h-3 w-3 rotate-90" />
              Back
            </button>

            <div className="space-y-3">
              {/* Recipient Name */}
              <div>
                <Label className="text-xs mb-1.5 block">Recipient's Full Name</Label>
                <Input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Enter full name"
                  className="h-10"
                />
              </div>

              {/* Mobile Money Fields */}
              {deliveryMethod === 'mobile_money' && (
                <>
                  <div>
                    <Label className="text-xs mb-1.5 block">Mobile Provider</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {providers.map((provider) => (
                        <button
                          key={provider}
                          onClick={() => setSelectedProvider(provider)}
                          className={cn(
                            "p-2 rounded-lg border text-xs font-medium transition-all",
                            selectedProvider === provider
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border hover:border-primary/50"
                          )}
                        >
                          {provider}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-xs mb-1.5 block">Phone Number</Label>
                    <Input
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 780123456"
                      className="h-10 font-mono"
                      type="tel"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Enter without country code
                    </p>
                  </div>
                </>
              )}

              {/* Bank Fields */}
              {deliveryMethod === 'bank' && (
                <>
                  <div>
                    <Label className="text-xs mb-1.5 block">Bank</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {banks.map((bank) => (
                        <button
                          key={bank}
                          onClick={() => setSelectedBank(bank)}
                          className={cn(
                            "p-2 rounded-lg border text-xs font-medium transition-all",
                            selectedBank === bank
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border hover:border-primary/50"
                          )}
                        >
                          {bank}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-xs mb-1.5 block">Account Number</Label>
                    <Input
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="Enter account number"
                      className="h-10 font-mono"
                    />
                  </div>
                </>
              )}
            </div>

            <Button 
              onClick={() => goToStep('payment')}
              disabled={!isRecipientValid}
              className="w-full mt-3"
              size="sm"
            >
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* STEP 3: Payment Method */}
        {currentStep === 'payment' && (
          <div className="space-y-3">
            <button 
              onClick={goBack}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
            >
              <ChevronDown className="h-3 w-3 rotate-90" />
              Back
            </button>

            <div className="space-y-3">
              {/* Your Phone Number */}
              <div>
                <Label className="text-xs mb-1.5 block">Your Phone Number</Label>
                <Input
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter your phone number"
                  className="h-10"
                  type="tel"
                />
              </div>

              {/* Payment Method */}
              <div>
                <Label className="text-xs mb-1.5 block">How will you pay?</Label>
                <div className="space-y-2">
                  {PAYMENT_METHODS.map((method) => {
                    const Icon = method.icon;
                    const isSelected = paymentMethod === method.id;
                    
                    return (
                      <button
                        key={method.id}
                        onClick={() => setPaymentMethod(method.id)}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left",
                          isSelected 
                            ? "border-primary bg-primary/5" 
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <div className={cn(
                          "p-2 rounded-full",
                          isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{method.label}</p>
                        </div>
                        {method.badge && (
                          <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            {method.badge}
                          </span>
                        )}
                        {isSelected && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <Button 
              onClick={() => goToStep('confirm')}
              disabled={!isPaymentValid}
              className="w-full mt-3"
              size="sm"
            >
              Review Order
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* STEP 4: Confirmation */}
        {currentStep === 'confirm' && (
          <div className="space-y-3">
            <button 
              onClick={goBack}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
            >
              <ChevronDown className="h-3 w-3 rotate-90" />
              Back
            </button>

            <div className="rounded-lg border border-border/60 bg-muted/30 overflow-hidden">
              {/* Summary Header */}
              <div className="p-3 bg-primary/5 border-b border-border/40">
                <p className="text-sm font-semibold">Order Summary</p>
              </div>
              
              {/* Summary Details */}
              <div className="p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Send</span>
                  <span className="font-medium">{formatNumber(sendAmount)} {sendCurrency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fee</span>
                  <span className="font-medium">-{formatNumber(fee)} {sendCurrency}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border/40">
                  <span className="text-muted-foreground">Recipient gets</span>
                  <span className="font-bold text-primary">{formatNumber(receiveAmount)} {receiveCurrency}</span>
                </div>
              </div>
            </div>

            {/* Recipient Info */}
            <div className="rounded-lg border border-border/60 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">Recipient</p>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{recipientName}</p>
                  <p className="text-xs text-muted-foreground">
                    {deliveryMethod === 'mobile_money' 
                      ? `${selectedProvider} • ${recipientPhone}`
                      : `${selectedBank} • ${accountNumber}`
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Payment Info */}
            <div className="rounded-lg border border-border/60 p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Payment Method</p>
              <p className="font-medium text-sm">{paymentMethod === 'Sber' ? 'Sberbank Card' : 'Cash Pickup'}</p>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p className="text-xs">
                After confirming, you'll receive payment details. Please keep them safe.
              </p>
            </div>

            <Button 
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full mt-3"
              size="sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Order...
                </>
              ) : (
                <>
                  Confirm & Get Payment Details
                  <Check className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PARSER
// ============================================================================

// Parse order flow from AI content
// Format: [[ORDER:sendAmount:sendCurrency:fee:netAmount:rate:receiveAmount:receiveCurrency]]
export function extractOrderFlowFromContent(content: string): {
  cleanContent: string;
  orderData: {
    sendAmount: string;
    sendCurrency: string;
    fee: string;
    netAmount: string;
    rate: string;
    receiveAmount: string;
    receiveCurrency: string;
  } | null;
} {
  const orderRegex = /\[\[ORDER:([^:]+):([^:]+):([^:]+):([^:]+):([^:]+):([^:]+):([^\]]+)\]\]/;
  const match = content.match(orderRegex);
  
  if (!match) {
    return { cleanContent: content, orderData: null };
  }
  
  const cleanContent = content.replace(orderRegex, '').trim();
  
  return {
    cleanContent,
    orderData: {
      sendAmount: match[1],
      sendCurrency: match[2],
      fee: match[3],
      netAmount: match[4],
      rate: match[5],
      receiveAmount: match[6],
      receiveCurrency: match[7],
    },
  };
}
