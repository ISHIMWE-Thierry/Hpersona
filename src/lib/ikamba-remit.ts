// Ikamba Remit Integration
// This module connects Ikamba AI with Ikamba Remit services
// Database structure aligned with blink-1 Firestore schema
// Supports AI-assisted order creation with full user details

import { db, storage } from './firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc,
  setDoc,
  query, 
  where, 
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  collectionGroup,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// ============================================
// USER PROFILE TYPES (aligned with blink-1)
// ============================================

// User profile interface from Firestore users collection
export interface UserProfile {
  id: string;
  email: string | null;
  displayName?: string | null;
  fullName?: string | null;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string | null;
  phone?: string;  // Alternative field name
  photoURL?: string | null;
  avatarUrl?: string | null;
  avatarColor?: string;
  avatarEmoji?: string;
  country?: string;
  countryCode?: string;
  role?: 'user' | 'admin' | 'agent';
  kycStatus?: 'none' | 'pending' | 'verified' | 'rejected';
  kycVerified?: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  lastLogin?: Date | string;
  preferredCurrency?: string;
  language?: string;
}

// Sender details extracted from user profile for orders
export interface SenderDetails {
  userId: string;
  senderName: string;
  senderEmail: string;
  senderPhone?: string;
  senderCountry?: string;
}

// Types aligned with blink-1 database schema
export interface ExchangeRate {
  id: string;
  pair: string;  // e.g., "RUB_RWF"
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  midMarketRate: number;
  customerRate: number;
  margin: number;
  source?: string;
  fetchedAt: Date;
}

export interface RateAdjustment {
  id: string;
  pair: string;
  adjustment: number;  // Percentage adjustment
  margin?: number;
  effectiveRate?: number;
  updatedAt: Date;
}

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  country: string;
  countryCode: string;
  flag?: string;
  isActive: boolean;
  decimalPlaces: number;
}

export interface Recipient {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  email?: string;
  country: string;
  currency: string;
  paymentMethod: 'mobile_money' | 'bank_transfer';
  bankDetails?: {
    bankName: string;
    accountNumber: string;
    swiftCode?: string;
  };
  mobileProvider?: string;
  createdAt: Date;
}

export interface TransferOrder {
  id?: string;
  transactionId?: string;
  userId: string;
  // Sender details (from user profile)
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  senderCountry?: string;
  // Recipient details
  recipientId?: string;
  recipientName: string;
  recipientPhone: string;
  recipientCountry: string;
  recipientBank?: string;
  recipientAccountNumber?: string;
  mobileProvider?: string;
  // Transfer details
  fromCurrency: string;
  toCurrency: string;
  sendAmount: number;
  receiveAmount: number;
  exchangeRate: number;
  fee: number;
  payoutFee?: number;
  totalAmount: number;
  paymentMethod: 'card' | 'bank_transfer' | 'mobile_wallet' | 'cash';
  deliveryMethod: 'mobile_money' | 'bank_transfer' | 'cash_pickup';
  status: TransactionStatus;
  date: Date;
  createdAt?: Date;
  updatedAt?: Date;
  createdByAI?: boolean;
  notes?: string;
  paymentProofUrl?: string;
}

// Active payment receiver information
export interface PaymentReceiver {
  currency: string;
  name: string;
  type: 'bank' | 'mobile_money';
  accountNumber: string;
  accountHolder: string;
  provider?: string;
  isActive: boolean;
}

// App data from Firestore (payment methods and settings)
export interface AppData {
  under10kbanknumber?: string;
  under10kholdername?: string;
  mtnrwfcard?: string;
  mtnrwfcardholder?: string;
  mtnugxcard?: string;
  mtnugxcardholder?: string;
  kesmmpesakenya?: string;
  kesmmpesakenyaholder?: string;
  airtelugxcard?: string;
  airtelugxcardholder?: string;
  wavexofcard?: string;
  wavexofcardholder?: string;
  orangexofcard?: string;
  orangexofcardholder?: string;
  cashDiscount?: number;
}

// Transaction statuses from blink-1
export type TransactionStatus = 
  | 'draft'
  | 'pending_payment'
  | 'awaiting_confirmation'
  | 'processing'
  | 'sent'
  | 'delivered'
  | 'completed'
  | 'failed'
  | 'cancelled';

// Delivery option from Firestore deliveryOptions collection
export interface DeliveryOption {
  id: string;           // Document ID like "RWF_bank_axon_tunga"
  currency: string;     // e.g., "RWF"
  type: 'bank' | 'mobile_money' | 'cash';
  name: string;         // e.g., "AXON Tunga" or "MTN Mobile Money"
  provider?: string;    // Provider name for mobile money
  createdAt?: Date;
  createdBy?: string;
}

// Parsed delivery options grouped by currency and type
export interface DeliveryOptionsMap {
  [currency: string]: {
    bank: string[];      // List of bank names
    mobile_money: string[]; // List of mobile money providers
    cash: string[];      // List of cash pickup options
  };
}

// Collection names matching blink-1 Firestore structure
const COLLECTIONS = {
  RATES: 'rates',
  RATE_ADJUSTMENTS: 'rateAdjustments',
  USERS: 'users',
  TRANSACTIONS: 'transactions',  // Nested under users/{userId}/transactions
  RECIPIENTS: 'recipients',
  PAYMENT_ACCOUNTS: 'paymentAccounts',
  FEE_CONFIGS: 'feeConfigs',
  APP_DATA: 'appdata',
  MAIL: 'mail', // For Firebase email extension
  DELIVERY_OPTIONS: 'deliveryOptions', // Delivery methods per currency
};

// External API for live exchange rates (same as blink-1)
const RATES_API_URL = 'https://fetchcurrencyrates-gifrwai7ra-uc.a.run.app';

// Email API endpoints (blink-1 cloud functions)
const USER_EMAIL_API = 'https://sendemail-gifrwai7ra-uc.a.run.app';
const ADMIN_EMAIL = 'ikambaventures@gmail.com';

// Currency configuration from blink-1
export const CURRENCY_CONFIG: Record<string, Currency> = {
  RUB: { code: 'RUB', name: 'Russian Ruble', symbol: '₽', country: 'Russia', countryCode: 'RU', isActive: true, decimalPlaces: 2 },
  RWF: { code: 'RWF', name: 'Rwandan Franc', symbol: 'Rwf', country: 'Rwanda', countryCode: 'RW', isActive: true, decimalPlaces: 0 },
  UGX: { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', country: 'Uganda', countryCode: 'UG', isActive: true, decimalPlaces: 0 },
  TZS: { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', country: 'Tanzania', countryCode: 'TZ', isActive: true, decimalPlaces: 0 },
  KES: { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', country: 'Kenya', countryCode: 'KE', isActive: true, decimalPlaces: 2 },
  TRY: { code: 'TRY', name: 'Turkish Lira', symbol: '₺', country: 'Turkey', countryCode: 'TR', isActive: true, decimalPlaces: 2 },
  BIF: { code: 'BIF', name: 'Burundian Franc', symbol: 'FBu', country: 'Burundi', countryCode: 'BI', isActive: true, decimalPlaces: 0 },
  NGN: { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', country: 'Nigeria', countryCode: 'NG', isActive: true, decimalPlaces: 2 },
  ETB: { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br', country: 'Ethiopia', countryCode: 'ET', isActive: true, decimalPlaces: 2 },
  XOF: { code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA', country: 'West Africa', countryCode: 'XOF', isActive: true, decimalPlaces: 0 },
  ZAR: { code: 'ZAR', name: 'South African Rand', symbol: 'R', country: 'South Africa', countryCode: 'ZA', isActive: true, decimalPlaces: 2 },
  SLE: { code: 'SLE', name: 'Sierra Leonean Leone', symbol: 'Le', country: 'Sierra Leone', countryCode: 'SL', isActive: true, decimalPlaces: 2 },
};

// Country to currency mapping with delivery methods
export const COUNTRY_CONFIG: Record<string, { 
  currency: string; 
  name: string; 
  phonePrefix: string;
  deliveryMethods: string[];
  mobileProviders?: string[];
  language?: string;
}> = {
  RW: { currency: 'RWF', name: 'Rwanda', phonePrefix: '+250', deliveryMethods: ['mobile_money', 'bank'], mobileProviders: ['MTN', 'Airtel'], language: 'rw' },
  RU: { currency: 'RUB', name: 'Russia', phonePrefix: '+7', deliveryMethods: ['bank', 'cash'], language: 'ru' },
  UG: { currency: 'UGX', name: 'Uganda', phonePrefix: '+256', deliveryMethods: ['mobile_money', 'bank'], mobileProviders: ['MTN', 'Airtel'], language: 'sw' },
  TZ: { currency: 'TZS', name: 'Tanzania', phonePrefix: '+255', deliveryMethods: ['mobile_money', 'bank'], mobileProviders: ['M-Pesa', 'Airtel', 'Tigo'], language: 'sw' },
  KE: { currency: 'KES', name: 'Kenya', phonePrefix: '+254', deliveryMethods: ['mobile_money', 'bank'], mobileProviders: ['M-Pesa', 'Airtel'], language: 'sw' },
  TR: { currency: 'TRY', name: 'Turkey', phonePrefix: '+90', deliveryMethods: ['bank'], language: 'tr' },
  BI: { currency: 'BIF', name: 'Burundi', phonePrefix: '+257', deliveryMethods: ['mobile_money'], mobileProviders: ['Lumicash', 'Ecocash'], language: 'rw' },
  NG: { currency: 'NGN', name: 'Nigeria', phonePrefix: '+234', deliveryMethods: ['bank', 'mobile_money'], mobileProviders: ['OPay', 'Palmpay'], language: 'en' },
  ET: { currency: 'ETB', name: 'Ethiopia', phonePrefix: '+251', deliveryMethods: ['bank', 'mobile_money'], mobileProviders: ['Telebirr'], language: 'am' },
  ZA: { currency: 'ZAR', name: 'South Africa', phonePrefix: '+27', deliveryMethods: ['bank', 'mobile_money'], mobileProviders: ['FNB', 'Capitec'], language: 'en' },
  SL: { currency: 'SLE', name: 'Sierra Leone', phonePrefix: '+232', deliveryMethods: ['mobile_money', 'bank'], mobileProviders: ['Orange'], language: 'en' },
};

// Currency to country mapping
export const CURRENCY_TO_COUNTRY: Record<string, string> = {
  RWF: 'RW', UGX: 'UG', TZS: 'TZ', KES: 'KE', RUB: 'RU', TRY: 'TR',
  BIF: 'BI', NGN: 'NG', ETB: 'ET', ZAR: 'ZA', SLE: 'SL', XOF: 'XOF'
};

// Fee configuration from blink-1
const FEE_CONFIG = {
  FIXED_FEE_RUB: 100,      // Fixed fee for RUB transfers
  PAYOUT_FEE_RUB: 100,     // Payout fee when receiving in RUB
  DEFAULT_FEE_PERCENT: 0,  // Default percentage fee
  DEFAULT_MARGIN: 0.02,    // 2% margin on rates
};

// Rate cache for performance
let apiRatesCache: Record<string, number> | null = null;
let apiRatesCacheTimestamp: number | null = null;
let rateAdjustmentsCache: Map<string, number> = new Map();
let rateAdjustmentsCacheTimestamp: number | null = null;
let appDataCache: AppData | null = null;
let userProfileCache: Map<string, { profile: UserProfile; timestamp: number }> = new Map();
let deliveryOptionsCache: DeliveryOptionsMap | null = null;
let deliveryOptionsCacheTimestamp: number | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch delivery options from Firestore deliveryOptions collection
 * Document IDs are like "RWF_bank_axon_tunga", "RUB_cash_pickup", "XOF_mobile_mtn_mobile_money"
 */
export async function fetchDeliveryOptions(): Promise<DeliveryOptionsMap> {
  // Check cache first
  if (deliveryOptionsCache && deliveryOptionsCacheTimestamp && 
      Date.now() - deliveryOptionsCacheTimestamp < CACHE_TTL) {
    return deliveryOptionsCache;
  }

  try {
    const optionsRef = collection(db, COLLECTIONS.DELIVERY_OPTIONS);
    const snapshot = await getDocs(optionsRef);
    
    const optionsMap: DeliveryOptionsMap = {};
    
    snapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      const docId = docSnapshot.id; // e.g., "RWF_bank_axon_tunga"
      
      // Parse document ID to extract currency and type
      // Format: CURRENCY_type_name (e.g., RWF_bank_axon_tunga, XOF_mobile_mtn_mobile_money)
      const parts = docId.split('_');
      if (parts.length < 2) return;
      
      const currency = data.currency || parts[0].toUpperCase();
      const type = data.type || parts[1]; // 'bank', 'mobile', 'cash'
      const name = data.name || parts.slice(2).join(' ');
      
      // Initialize currency entry if not exists
      if (!optionsMap[currency]) {
        optionsMap[currency] = {
          bank: [],
          mobile_money: [],
          cash: [],
        };
      }
      
      // Normalize type and add to appropriate array
      if (type === 'bank' && name && !optionsMap[currency].bank.includes(name)) {
        optionsMap[currency].bank.push(name);
      } else if ((type === 'mobile' || type === 'mobile_money') && name && !optionsMap[currency].mobile_money.includes(name)) {
        optionsMap[currency].mobile_money.push(name);
      } else if (type === 'cash' && name && !optionsMap[currency].cash.includes(name)) {
        optionsMap[currency].cash.push(name);
      }
    });
    
    // Update cache
    deliveryOptionsCache = optionsMap;
    deliveryOptionsCacheTimestamp = Date.now();
    
    console.log('Fetched delivery options:', JSON.stringify(optionsMap, null, 2));
    return optionsMap;
  } catch (error) {
    console.error('Error fetching delivery options:', error);
    // Return empty map on error
    return {};
  }
}

/**
 * Get delivery options for a specific currency
 */
export async function getDeliveryOptionsForCurrency(currency: string): Promise<{
  bank: string[];
  mobile_money: string[];
  cash: string[];
  hasOptions: boolean;
}> {
  const allOptions = await fetchDeliveryOptions();
  const currencyUpper = currency.toUpperCase();
  
  if (allOptions[currencyUpper]) {
    return {
      ...allOptions[currencyUpper],
      hasOptions: true,
    };
  }
  
  return {
    bank: [],
    mobile_money: [],
    cash: [],
    hasOptions: false,
  };
}

/**
 * Format delivery options for AI context
 */
export async function formatDeliveryOptionsForAI(): Promise<string> {
  const allOptions = await fetchDeliveryOptions();
  
  const lines: string[] = [];
  for (const [currency, options] of Object.entries(allOptions)) {
    const parts: string[] = [];
    
    if (options.bank.length > 0) {
      parts.push(`Bank: ${options.bank.join(', ')}`);
    }
    if (options.mobile_money.length > 0) {
      parts.push(`Mobile Money: ${options.mobile_money.join(', ')}`);
    }
    if (options.cash.length > 0) {
      parts.push(`Cash: ${options.cash.join(', ')}`);
    }
    
    if (parts.length > 0) {
      lines.push(`${currency}: ${parts.join(' | ')}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Fetch rate adjustments from Firestore (for server-side use)
 * This fetches directly instead of using real-time listeners
 */
export async function fetchRateAdjustments(): Promise<Record<string, number>> {
  // Check cache first
  if (rateAdjustmentsCache.size > 0 && rateAdjustmentsCacheTimestamp && 
      Date.now() - rateAdjustmentsCacheTimestamp < CACHE_TTL) {
    return Object.fromEntries(rateAdjustmentsCache);
  }

  try {
    const adjustmentsRef = collection(db, COLLECTIONS.RATE_ADJUSTMENTS);
    const snapshot = await getDocs(adjustmentsRef);
    
    const newCache = new Map<string, number>();
    
    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const rawKey = (typeof data.pair === 'string' && data.pair) || docSnap.id;
      // Normalize key to format like "RUB_RWF"
      const normalizedKey = rawKey?.toUpperCase().replace(/[^A-Z_]/g, '_');
      const adjustment = data.adjustment ?? data.value ?? data.delta ?? 0;
      
      if (normalizedKey && typeof adjustment === 'number') {
        newCache.set(normalizedKey, adjustment);
      }
    });
    
    rateAdjustmentsCache = newCache;
    rateAdjustmentsCacheTimestamp = Date.now();
    
    console.log('Fetched rate adjustments:', Object.fromEntries(newCache));
    return Object.fromEntries(newCache);
  } catch (error) {
    console.error('Error fetching rate adjustments:', error);
    return Object.fromEntries(rateAdjustmentsCache); // Return cached if fetch fails
  }
}

// ============================================
// EMAIL SERVICE FUNCTIONS
// ============================================

interface TransactionEmailData {
  userId: string;
  senderName: string;
  senderTel: string;
  senderEmail: string;
  amountToSendMinusFee: string;
  baseCurrency: string;
  recipientName: string;
  transfermethod: string;
  transferCurrency: string;
  receiverGets: string;
  fee: string;
  amountToPay: string;
  recipientsPhone: string;
  recipientBankAcc: string;
  rateUsed: string;
  modeOfPayment: string;
  orderId?: string;
}

/**
 * Send email by adding to mail collection (Firebase Email Extension processes this)
 */
async function sendEmail(to: string, subject: string, textMessage: string, htmlMessage: string): Promise<string | null> {
  try {
    const emailData = {
      to: [to],
      message: {
        subject: subject,
        text: textMessage,
        html: htmlMessage,
      },
    };
    const mailRef = collection(db, COLLECTIONS.MAIL);
    const docRef = await addDoc(mailRef, emailData);
    console.log('Email document created with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error adding email document:', error);
    return null;
  }
}

/**
 * Send receipt email to user via Firebase mail collection
 */
export async function sendEmailToUser(transactionData: TransactionEmailData): Promise<boolean> {
  try {
    if (!transactionData.senderEmail || !transactionData.senderName || !transactionData.receiverGets) {
      console.error('Missing required transaction properties for user email');
      return false;
    }

    const subject = `✅ Transfer Order Received - ${transactionData.baseCurrency} to ${transactionData.transferCurrency}`;
    const textMessage = `Your transfer order has been received. Amount: ${transactionData.amountToPay} ${transactionData.baseCurrency}. Recipient: ${transactionData.recipientName} will receive ${transactionData.receiverGets} ${transactionData.transferCurrency}.`;
    
    const htmlMessage = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #10b981;">✅ Transfer Order Received</h2>
        <p>Hi ${transactionData.senderName},</p>
        <p>Your transfer order has been received and is being processed.</p>
        
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Order Details</h3>
          <p><strong>Amount to Pay:</strong> ${transactionData.amountToPay} ${transactionData.baseCurrency}</p>
          <p><strong>Fee:</strong> ${transactionData.fee}</p>
          <p><strong>Recipient:</strong> ${transactionData.recipientName}</p>
          <p><strong>Recipient Phone:</strong> ${transactionData.recipientsPhone}</p>
          <p><strong>Amount to Receive:</strong> ${transactionData.receiverGets} ${transactionData.transferCurrency}</p>
          <p><strong>Delivery Method:</strong> ${transactionData.transfermethod}</p>
          <p><strong>Exchange Rate:</strong> ${transactionData.rateUsed}</p>
        </div>
        
        <p>Once we confirm your payment, we'll process the transfer immediately.</p>
        <p style="color: #666; font-size: 12px;">Thank you for using Ikamba Remit!</p>
      </div>
    `;

    // Use Firebase mail collection (processed by Trigger Email extension)
    const emailId = await sendEmail(transactionData.senderEmail, subject, textMessage, htmlMessage);
    
    console.log('User receipt email queued with ID:', emailId);
    return emailId !== null;
  } catch (error) {
    console.error('Error sending user receipt email:', error);
    return false;
  }
}

/**
 * Send new order notification email to admin
 */
export async function sendAdminNotificationEmail(transactionData: TransactionEmailData): Promise<boolean> {
  try {
    const subject = `NEW ORDER!!! ${transactionData.baseCurrency} → ${transactionData.transferCurrency}`;
    const textMessage = 'New transaction order received.';
    const htmlMessage = `
      <div style="font-family: Arial, sans-serif;">
        <h2 style="color: #10b981;">🆕 New Transfer Order</h2>
        
        <h3>Sender Information:</h3>
        <p>
          <strong>Sender ID:</strong> ${transactionData.userId}<br>
          <strong>Sender Name:</strong> ${transactionData.senderName}<br>
          <strong>Sender Phone:</strong> ${transactionData.senderTel}<br>
          <strong>Sender Email:</strong> ${transactionData.senderEmail}
        </p>
        
        <h3>Transaction Details:</h3>
        <p>
          <strong>Amount:</strong> ${transactionData.amountToPay} ${transactionData.baseCurrency}<br>
          <strong>Mode of Payment:</strong> ${transactionData.modeOfPayment}<br>
          <strong>Fee:</strong> ${transactionData.fee}
        </p>
        
        <h3>Recipient Information:</h3>
        <p>
          <strong>Recipient Name:</strong> ${transactionData.recipientName}<br>
          <strong>Recipient Phone:</strong> ${transactionData.recipientsPhone}<br>
          <strong>Recipient Account:</strong> ${transactionData.recipientBankAcc}<br>
          <strong>Amount to Receive:</strong> ${transactionData.receiverGets} ${transactionData.transferCurrency}<br>
          <strong>Mode of Transfer:</strong> ${transactionData.transfermethod}
        </p>
        
        <h3>Exchange Details:</h3>
        <p>
          <strong>Exchange Rate:</strong> ${transactionData.rateUsed}
        </p>
        
        <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
          Created via Ikamba AI Assistant
        </p>
      </div>
    `;

    const result = await sendEmail(ADMIN_EMAIL, subject, textMessage, htmlMessage);
    return result !== null;
  } catch (error) {
    console.error('Failed to send admin notification email:', error);
    return false;
  }
}

/**
 * Send payment proof received confirmation email to user
 */
export async function sendPaymentProofReceivedEmail(
  senderEmail: string,
  senderName: string,
  orderId: string,
  amount: string,
  currency: string,
  recipientName: string,
  receiveAmount: string,
  receiveCurrency: string
): Promise<boolean> {
  try {
    if (!senderEmail) {
      console.error('No email provided for payment proof confirmation');
      return false;
    }

    const subject = `Payment Proof Received - Order ${orderId}`;
    const textMessage = `Hi ${senderName}, we have received your payment proof for order ${orderId}. Your transfer is now being processed.`;
    const htmlMessage = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0;">Payment Received!</h1>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px; color: #374151;">
            Hi <strong>${senderName}</strong>,
          </p>
          
          <p style="font-size: 16px; color: #374151;">
            We have received your payment proof and your transfer is now being processed.
          </p>
          
          <div style="background: white; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
            <h3 style="color: #10b981; margin-top: 0;">Order Summary</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Order Reference:</td>
                <td style="padding: 8px 0; font-weight: bold; text-align: right;">${orderId}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Amount Sent:</td>
                <td style="padding: 8px 0; font-weight: bold; text-align: right;">${amount} ${currency}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Recipient:</td>
                <td style="padding: 8px 0; font-weight: bold; text-align: right;">${recipientName}</td>
              </tr>
              <tr style="border-top: 1px solid #e5e7eb;">
                <td style="padding: 12px 0 8px; color: #6b7280;">Amount to Receive:</td>
                <td style="padding: 12px 0 8px; font-weight: bold; text-align: right; color: #10b981; font-size: 18px;">${receiveAmount} ${receiveCurrency}</td>
              </tr>
            </table>
          </div>
          
          <div style="background: #fef3c7; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              <strong>Processing Time:</strong> Mobile Money transfers typically complete within 5-30 minutes. Bank transfers may take 1-3 business days.
            </p>
          </div>
          
          <p style="font-size: 14px; color: #6b7280;">
            You will receive another notification once your transfer has been completed.
          </p>
        </div>
        
        <div style="background: #1f2937; padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            Ikamba Remit - Fast & Secure Money Transfers
          </p>
        </div>
      </div>
    `;

    const result = await sendEmail(senderEmail, subject, textMessage, htmlMessage);
    console.log('Payment proof confirmation email sent to:', senderEmail);
    return result !== null;
  } catch (error) {
    console.error('Failed to send payment proof confirmation email:', error);
    return false;
  }
}

// ============================================
// USER PROFILE FUNCTIONS
// ============================================

/**
 * Get user profile from Firestore users collection
 * Returns full user details including name, email, phone, etc.
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    // Check cache first
    const cached = userProfileCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.profile;
    }

    const userDocRef = doc(db, COLLECTIONS.USERS, userId);
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      console.log(`User profile not found for userId: ${userId}`);
      return null;
    }
    
    const data = userDoc.data();
    const profile: UserProfile = {
      id: userDoc.id,
      email: data.email || null,
      displayName: data.displayName || data.display_name || null,
      fullName: data.fullName || data.full_name || data.name || null,
      firstName: data.firstName || data.first_name,
      lastName: data.lastName || data.last_name,
      phoneNumber: data.phoneNumber || data.phone_number || data.phone || null,
      phone: data.phone,
  photoURL: data.photoURL || data.photo_url || data.avatarUrl || data.avatar_url || null,
  avatarUrl: data.avatarUrl || data.avatar_url || data.photoURL || null,
  avatarColor: data.avatarColor || data.avatar_color,
  avatarEmoji: data.avatarEmoji || data.avatar_emoji,
      country: data.country,
      countryCode: data.countryCode || data.country_code,
      role: data.role || 'user',
      kycStatus: data.kycStatus || data.kyc_status || 'none',
      kycVerified: data.kycVerified || data.kyc_verified || false,
      preferredCurrency: data.preferredCurrency || data.preferred_currency,
      language: data.language || data.lang,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      lastLogin: data.lastLogin || data.last_login,
    };
    
    // Cache the profile
    userProfileCache.set(userId, { profile, timestamp: Date.now() });
    
    return profile;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

/**
 * Create or update user profile in Firestore
 * Used when syncing auth user data
 */
export async function upsertUserProfile(
  userId: string, 
  userData: Partial<UserProfile>
): Promise<boolean> {
  try {
    const userDocRef = doc(db, COLLECTIONS.USERS, userId);
    const userDoc = await getDoc(userDocRef);
    
    const now = new Date().toISOString();
    const profileData = {
      ...userData,
      updatedAt: now,
      lastLogin: now,
    };
    
    if (!userDoc.exists()) {
      // Create new user document
      await setDoc(userDocRef, {
        ...profileData,
        id: userId,
        createdAt: now,
        role: 'user',
      });
    } else {
      // Update existing
      await updateDoc(userDocRef, profileData);
    }
    
    // Clear cache for this user
    userProfileCache.delete(userId);
    
    return true;
  } catch (error) {
    console.error('Error upserting user profile:', error);
    return false;
  }
}

// ============================================
// WHATSAPP AUTHENTICATION FUNCTIONS
// ============================================

// Cache for WhatsApp verified sessions
const whatsappSessionCache = new Map<string, { userId: string; verified: boolean; timestamp: number }>();
const WHATSAPP_SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Find user by email address
 */
export async function findUserByEmail(email: string): Promise<UserProfile | null> {
  try {
    const usersRef = collection(db, COLLECTIONS.USERS);
    const q = query(usersRef, where('email', '==', email.toLowerCase().trim()), limit(1));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }
    
    const userDoc = snapshot.docs[0];
    const data = userDoc.data();
    
    return {
      id: userDoc.id,
      email: data.email || null,
      displayName: data.displayName || data.display_name || null,
      fullName: data.fullName || data.full_name || data.name || null,
      firstName: data.firstName || data.first_name,
      lastName: data.lastName || data.last_name,
      phoneNumber: data.phoneNumber || data.phone_number || data.phone || null,
      phone: data.phone,
      photoURL: data.photoURL || data.photo_url || data.avatarUrl || data.avatar_url || null,
      avatarUrl: data.avatarUrl || data.avatar_url || data.photoURL || null,
      avatarColor: data.avatarColor || data.avatar_color,
      avatarEmoji: data.avatarEmoji || data.avatar_emoji,
      country: data.country,
      countryCode: data.countryCode || data.country_code,
      role: data.role || 'user',
      kycStatus: data.kycStatus || data.kyc_status || 'none',
      kycVerified: data.kycVerified || data.kyc_verified || false,
      preferredCurrency: data.preferredCurrency || data.preferred_currency,
      language: data.language || data.lang,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      lastLogin: data.lastLogin || data.last_login,
    };
  } catch (error) {
    console.error('Error finding user by email:', error);
    return null;
  }
}

/**
 * Find user by phone number (checks multiple phone fields)
 */
export async function findUserByPhone(phoneNumber: string): Promise<UserProfile | null> {
  try {
    // Normalize phone number - remove spaces, dashes
    const normalizedPhone = phoneNumber.replace(/[\s-]/g, '');
    const phoneVariants = [
      normalizedPhone,
      normalizedPhone.replace('+', ''),
      '+' + normalizedPhone.replace('+', ''),
    ];
    
    const usersRef = collection(db, COLLECTIONS.USERS);
    
    // Try different phone fields
    for (const variant of phoneVariants) {
      // Check phoneNumber field
      let q = query(usersRef, where('phoneNumber', '==', variant), limit(1));
      let snapshot = await getDocs(q);
      if (!snapshot.empty) {
        return getUserProfile(snapshot.docs[0].id);
      }
      
      // Check phone field
      q = query(usersRef, where('phone', '==', variant), limit(1));
      snapshot = await getDocs(q);
      if (!snapshot.empty) {
        return getUserProfile(snapshot.docs[0].id);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding user by phone:', error);
    return null;
  }
}

/**
 * Generate a 6-digit verification code
 */
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store verification code for WhatsApp user
 */
export async function createWhatsAppVerification(
  whatsappPhone: string, 
  email: string
): Promise<{ code: string; expiresAt: Date } | null> {
  try {
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    const verificationRef = doc(db, 'whatsappVerifications', whatsappPhone);
    await setDoc(verificationRef, {
      code,
      email: email.toLowerCase().trim(),
      whatsappPhone,
      createdAt: serverTimestamp(),
      expiresAt: expiresAt.toISOString(),
      verified: false,
    });
    
    return { code, expiresAt };
  } catch (error) {
    console.error('Error creating WhatsApp verification:', error);
    return null;
  }
}

/**
 * Verify WhatsApp code and link to user account
 */
export async function verifyWhatsAppCode(
  whatsappPhone: string, 
  code: string
): Promise<{ success: boolean; userId?: string; message: string }> {
  try {
    const verificationRef = doc(db, 'whatsappVerifications', whatsappPhone);
    const verificationDoc = await getDoc(verificationRef);
    
    if (!verificationDoc.exists()) {
      return { success: false, message: 'No verification pending. Please request a new code.' };
    }
    
    const data = verificationDoc.data();
    
    // Check if expired
    if (new Date(data.expiresAt) < new Date()) {
      return { success: false, message: 'Code expired. Please request a new code.' };
    }
    
    // Check if code matches
    if (data.code !== code) {
      return { success: false, message: 'Invalid code. Please try again.' };
    }
    
    // Find user by email
    const user = await findUserByEmail(data.email);
    if (!user) {
      return { success: false, message: 'Account not found. Please sign up on ikambaai.com first.' };
    }
    
    // Update user profile with WhatsApp phone
    const userRef = doc(db, COLLECTIONS.USERS, user.id);
    await updateDoc(userRef, {
      whatsappPhone: whatsappPhone,
      whatsappVerified: true,
      whatsappVerifiedAt: serverTimestamp(),
    });
    
    // Mark verification as completed
    await updateDoc(verificationRef, {
      verified: true,
      verifiedAt: serverTimestamp(),
      linkedUserId: user.id,
    });
    
    // Cache the session
    whatsappSessionCache.set(whatsappPhone, {
      userId: user.id,
      verified: true,
      timestamp: Date.now(),
    });
    
    return { success: true, userId: user.id, message: 'Verified! You can now make transfers.' };
  } catch (error) {
    console.error('Error verifying WhatsApp code:', error);
    return { success: false, message: 'Verification failed. Please try again.' };
  }
}

/**
 * Check if WhatsApp user is verified/authenticated
 */
export async function checkWhatsAppAuth(whatsappPhone: string): Promise<{
  isVerified: boolean;
  userId?: string;
  userProfile?: UserProfile | null;
}> {
  try {
    // Check cache first
    const cached = whatsappSessionCache.get(whatsappPhone);
    if (cached && cached.verified && Date.now() - cached.timestamp < WHATSAPP_SESSION_TTL) {
      const profile = await getUserProfile(cached.userId);
      return { isVerified: true, userId: cached.userId, userProfile: profile };
    }
    
    // Check if phone is linked to any user
    const usersRef = collection(db, COLLECTIONS.USERS);
    const q = query(
      usersRef, 
      where('whatsappPhone', '==', whatsappPhone),
      where('whatsappVerified', '==', true),
      limit(1)
    );
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const userDoc = snapshot.docs[0];
      const profile = await getUserProfile(userDoc.id);
      
      // Cache the session
      whatsappSessionCache.set(whatsappPhone, {
        userId: userDoc.id,
        verified: true,
        timestamp: Date.now(),
      });
      
      return { isVerified: true, userId: userDoc.id, userProfile: profile };
    }
    
    return { isVerified: false };
  } catch (error) {
    console.error('Error checking WhatsApp auth:', error);
    return { isVerified: false };
  }
}

/**
 * Get delivery methods and mobile providers for a currency/country
 */
export function getDeliveryMethodsForCurrency(currency: string): {
  deliveryMethods: string[];
  mobileProviders: string[];
  country: string;
} {
  const countryCode = CURRENCY_TO_COUNTRY[currency.toUpperCase()];
  const config = countryCode ? COUNTRY_CONFIG[countryCode] : null;
  
  if (config) {
    return {
      deliveryMethods: config.deliveryMethods,
      mobileProviders: config.mobileProviders || [],
      country: config.name,
    };
  }
  
  // Default fallback
  return {
    deliveryMethods: ['mobile_money', 'bank'],
    mobileProviders: ['MTN', 'Airtel'],
    country: 'Unknown',
  };
}

/**
 * Update user profile with new information
 */
export async function updateUserProfile(
  userId: string, 
  updates: Partial<UserProfile>
): Promise<boolean> {
  try {
    const userRef = doc(db, COLLECTIONS.USERS, userId);
    await updateDoc(userRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error updating user profile:', error);
    return false;
  }
}

/**
 * Get missing required fields for a user to complete an order
 */
export function getMissingUserFields(profile: UserProfile | null): string[] {
  const missing: string[] = [];
  if (!profile) return ['all user data'];
  
  if (!profile.displayName && !profile.fullName) missing.push('name');
  if (!profile.email) missing.push('email');
  if (!profile.phoneNumber && !profile.phone) missing.push('phone');
  
  return missing;
}

/**
 * Build user context for AI with all available data
 */
export function buildUserContextForAI(profile: UserProfile | null): string {
  if (!profile) return 'USER: Not authenticated';
  
  const name = profile.displayName || profile.fullName || 'Unknown';
  const email = profile.email || 'Not set';
  const phone = profile.phoneNumber || profile.phone || 'Not set';
  const country = profile.country || 'Not set';
  
  const missing = getMissingUserFields(profile);
  const missingText = missing.length > 0 ? `\nMISSING: ${missing.join(', ')} - ASK USER` : '';
  
  return `USER: ${name} | Email: ${email} | Phone: ${phone} | Country: ${country}${missingText}`;
}

/**
 * Send verification code email for WhatsApp linking
 */
export async function sendWhatsAppVerificationEmail(
  email: string,
  code: string,
  whatsappPhone: string
): Promise<boolean> {
  try {
    console.log('[sendWhatsAppVerificationEmail] Sending to:', email, 'Code:', code);
    
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #25D366;">🔐 WhatsApp Verification</h2>
        <p>You're linking your WhatsApp (${whatsappPhone}) to your Ikamba account.</p>
        <div style="background: #f0f0f0; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #128C7E;">${code}</span>
        </div>
        <p>Send this code to our WhatsApp bot to complete verification.</p>
        <p style="color: #666; font-size: 12px;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
      </div>
    `;
    
    const subject = `🔐 Your Ikamba WhatsApp Verification Code: ${code}`;
    const textMessage = `Your WhatsApp verification code is: ${code}. This code expires in 10 minutes.`;
    
    // Use Firebase mail collection (processed by Trigger Email extension)
    const emailId = await sendEmail(email, subject, textMessage, htmlBody);
    
    console.log('[sendWhatsAppVerificationEmail] Email queued with ID:', emailId);
    
    return emailId !== null;
  } catch (error) {
    console.error('[sendWhatsAppVerificationEmail] Error:', error);
    return false;
  }
}

// ============================================
// SENDER DETAILS EXTRACTION
// ============================================

/**
 * Extract sender details from user profile for order creation
 */
export function extractSenderDetails(profile: UserProfile | null, userId: string): SenderDetails {
  if (!profile) {
    return {
      userId,
      senderName: 'Unknown',
      senderEmail: '',
    };
  }
  
  // Build sender name from available fields
  let senderName = profile.fullName || profile.displayName || '';
  if (!senderName && (profile.firstName || profile.lastName)) {
    senderName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  }
  if (!senderName && profile.email) {
    senderName = profile.email.split('@')[0]; // Use email prefix as fallback
  }
  
  return {
    userId,
    senderName: senderName || 'Unknown',
    senderEmail: profile.email || '',
    senderPhone: profile.phoneNumber || profile.phone || undefined,
    senderCountry: profile.country || profile.countryCode || undefined,
  };
}

/**
 * Get user's preferred currency based on profile country
 */
export function getUserPreferredCurrency(profile: UserProfile | null): string {
  if (profile?.preferredCurrency) {
    return profile.preferredCurrency;
  }
  
  if (profile?.countryCode) {
    const countryConfig = COUNTRY_CONFIG[profile.countryCode];
    if (countryConfig) {
      return countryConfig.currency;
    }
  }
  
  // Default to RUB (most common source currency)
  return 'RUB';
}

/**
 * Initialize rate adjustments listener for real-time updates
 */
export function initRateAdjustmentsListener(): () => void {
  const adjustmentsRef = collection(db, COLLECTIONS.RATE_ADJUSTMENTS);
  
  const unsubscribe = onSnapshot(adjustmentsRef, (snapshot) => {
    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const rawKey = (typeof data.pair === 'string' && data.pair) || docSnap.id;
      const normalizedKey = rawKey?.toUpperCase().replace(/[^A-Z_]/g, '_');
      const adjustment = data.adjustment ?? data.value ?? data.delta ?? 0;
      if (normalizedKey && typeof adjustment === 'number') {
        rateAdjustmentsCache.set(normalizedKey, adjustment);
      }
    });
    console.log('Rate adjustments updated:', Object.fromEntries(rateAdjustmentsCache));
  });
  
  return unsubscribe;
}

/**
 * Fetch live exchange rates from API (same as blink-1)
 */
export async function fetchLiveRatesFromAPI(): Promise<Record<string, number>> {
  // Check cache first
  if (apiRatesCache && apiRatesCacheTimestamp && Date.now() - apiRatesCacheTimestamp < CACHE_TTL) {
    return apiRatesCache;
  }

  try {
    const response = await fetch(RATES_API_URL);
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const rates = await response.json();
    apiRatesCache = rates;
    apiRatesCacheTimestamp = Date.now();
    console.log('Fetched live rates from API:', Object.keys(rates).length, 'pairs');
    return rates;
  } catch (error) {
    console.error('Error fetching live rates from API:', error);
    if (apiRatesCache) {
      console.warn('Using cached rates due to API error');
      return apiRatesCache;
    }
    throw error;
  }
}

/**
 * Fetch all available exchange rates (from API with adjustments)
 */
export async function getExchangeRates(): Promise<ExchangeRate[]> {
  try {
    // Fetch both rates and adjustments in parallel
    const [apiRates, adjustments] = await Promise.all([
      fetchLiveRatesFromAPI(),
      fetchRateAdjustments()
    ]);
    
    const rates: ExchangeRate[] = [];
    
    // Convert API response to ExchangeRate objects
    for (const [key, rawValue] of Object.entries(apiRates)) {
      // Parse value (API returns strings)
      const value = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue as string);
      if (isNaN(value) || value <= 0) continue;
      
      // Parse key like "RUBRWF" to get from/to currencies
      const from = key.slice(0, 3).toUpperCase();
      const to = key.slice(3).toUpperCase();
      
      if (!CURRENCY_CONFIG[from] || !CURRENCY_CONFIG[to]) continue;
      
      const pair = `${from}_${to}`;
      const reversePair = `${to}_${from}`;
      const midMarketRate = value;
      
      // Apply adjustment following blink-1 logic
      const directAdjustment = adjustments[pair];
      const reverseAdjustment = adjustments[reversePair];
      
      let adjustedMid = midMarketRate;
      
      if (typeof directAdjustment === 'number' && directAdjustment !== 0) {
        adjustedMid = Math.max(midMarketRate + directAdjustment, 0.000001);
      } else if (typeof reverseAdjustment === 'number' && reverseAdjustment !== 0) {
        // Reverse: invert, add adjustment, invert back
        const invertedRate = Math.max(1 / midMarketRate, 0.000001);
        const adjustedInverted = Math.max(invertedRate + reverseAdjustment, 0.000001);
        adjustedMid = Math.max(1 / adjustedInverted, 0.000001);
      }
      
      rates.push({
        id: pair,
        pair,
        fromCurrency: from,
        toCurrency: to,
        rate: adjustedMid * (1 + FEE_CONFIG.DEFAULT_MARGIN),
        midMarketRate: adjustedMid,
        customerRate: adjustedMid * (1 + FEE_CONFIG.DEFAULT_MARGIN),
        margin: FEE_CONFIG.DEFAULT_MARGIN,
        source: 'api',
        fetchedAt: new Date(),
      });
    }
    
    return rates;
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    return [];
  }
}

/**
 * Get exchange rate for a specific currency pair with real-time adjustments from API
 */
export async function getExchangeRate(from: string, to: string): Promise<{ 
  rate: number; 
  midMarketRate: number;
  customerRate: number;
  adjustedRate: number; 
  margin: number;
  adjustment: number;
} | null> {
  try {
    const cleanFrom = from.toUpperCase();
    const cleanTo = to.toUpperCase();
    const pair = `${cleanFrom}_${cleanTo}`;
    const directKey = `${cleanFrom}${cleanTo}`;
    const inverseKey = `${cleanTo}${cleanFrom}`;
    
    // Fetch both rates and adjustments
    const [apiRates, adjustments] = await Promise.all([
      fetchLiveRatesFromAPI(),
      fetchRateAdjustments()
    ]);
    
    let midMarketRate: number | null = null;
    
    // Try direct rate (API returns strings, need to parse)
    const directVal = apiRates[directKey];
    if (directVal !== undefined && directVal !== null) {
      const parsed = typeof directVal === 'number' ? directVal : parseFloat(directVal);
      if (!isNaN(parsed) && parsed > 0) {
        midMarketRate = parsed;
      }
    }
    
    // Try inverse rate if direct not found
    if (midMarketRate === null) {
      const inverseVal = apiRates[inverseKey];
      if (inverseVal !== undefined && inverseVal !== null) {
        const parsed = typeof inverseVal === 'number' ? inverseVal : parseFloat(inverseVal);
        if (!isNaN(parsed) && parsed > 0) {
          midMarketRate = 1 / parsed;
        }
      }
    }
    
    if (midMarketRate === null) {
      console.warn(`No rate found for pair: ${pair} (tried ${directKey} and ${inverseKey})`);
      return null;
    }
    
    // Apply adjustment from Firestore (key format: RUB_RWF or RWF_RUB)
    // Following blink-1 logic: try direct adjustment first, then reverse
    const directAdjustment = adjustments[pair];
    const reverseAdjustment = adjustments[`${cleanTo}_${cleanFrom}`];
    
    let adjustedMid = midMarketRate;
    let appliedAdjustment = 0;
    
    if (typeof directAdjustment === 'number' && directAdjustment !== 0) {
      // Direct adjustment: simply add to mid-market rate
      adjustedMid = Math.max(midMarketRate + directAdjustment, 0.000001);
      appliedAdjustment = directAdjustment;
      console.log(`Applied direct adjustment for ${pair}: ${directAdjustment} (mid: ${midMarketRate} -> ${adjustedMid})`);
    } else if (typeof reverseAdjustment === 'number' && reverseAdjustment !== 0) {
      // Reverse adjustment: invert rate, add adjustment, invert back (blink-1 logic)
      const invertedRate = Math.max(1 / midMarketRate, 0.000001);
      const adjustedInverted = Math.max(invertedRate + reverseAdjustment, 0.000001);
      adjustedMid = Math.max(1 / adjustedInverted, 0.000001);
      appliedAdjustment = reverseAdjustment;
      console.log(`Applied reverse adjustment for ${pair}: ${reverseAdjustment} (inverted: ${invertedRate} -> ${adjustedInverted}, mid: ${midMarketRate} -> ${adjustedMid})`);
    }
    
    const customerRate = adjustedMid * (1 + FEE_CONFIG.DEFAULT_MARGIN);
    
    return {
      rate: customerRate,
      midMarketRate: adjustedMid,
      customerRate,
      adjustedRate: customerRate,
      margin: FEE_CONFIG.DEFAULT_MARGIN,
      adjustment: appliedAdjustment,
    };
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    return null;
  }
}

/**
 * Get active payment receivers from appdata collection
 */
export async function getActivePaymentReceivers(): Promise<PaymentReceiver[]> {
  try {
    const appdataRef = collection(db, COLLECTIONS.APP_DATA);
    const snapshot = await getDocs(appdataRef);
    
    if (snapshot.empty) {
      console.warn('No appdata found');
      return [];
    }
    
    const appData = snapshot.docs[0].data() as AppData;
    appDataCache = appData;
    
    const receivers: PaymentReceiver[] = [];
    
    // Sberbank (RUB)
    if (appData.under10kbanknumber && appData.under10kholdername) {
      receivers.push({
        currency: 'RUB',
        name: 'Sberbank',
        type: 'bank',
        accountNumber: appData.under10kbanknumber,
        accountHolder: appData.under10kholdername,
        isActive: true,
      });
    }
    
    // MTN Mobile Money Rwanda (RWF)
    if (appData.mtnrwfcard && appData.mtnrwfcardholder) {
      receivers.push({
        currency: 'RWF',
        name: 'MTN Mobile Money',
        type: 'mobile_money',
        provider: 'MTN',
        accountNumber: appData.mtnrwfcard,
        accountHolder: appData.mtnrwfcardholder,
        isActive: true,
      });
    }
    
    // MTN Mobile Money Uganda (UGX)
    if (appData.mtnugxcard && appData.mtnugxcardholder) {
      receivers.push({
        currency: 'UGX',
        name: 'MTN Mobile Money',
        type: 'mobile_money',
        provider: 'MTN',
        accountNumber: appData.mtnugxcard,
        accountHolder: appData.mtnugxcardholder,
        isActive: true,
      });
    }
    
    // M-Pesa Kenya (KES)
    if (appData.kesmmpesakenya && appData.kesmmpesakenyaholder) {
      receivers.push({
        currency: 'KES',
        name: 'M-Pesa',
        type: 'mobile_money',
        provider: 'Safaricom',
        accountNumber: appData.kesmmpesakenya,
        accountHolder: appData.kesmmpesakenyaholder,
        isActive: true,
      });
    }
    
    // Airtel Money Uganda (UGX)
    if (appData.airtelugxcard && appData.airtelugxcardholder) {
      receivers.push({
        currency: 'UGX',
        name: 'Airtel Money',
        type: 'mobile_money',
        provider: 'Airtel',
        accountNumber: appData.airtelugxcard,
        accountHolder: appData.airtelugxcardholder,
        isActive: true,
      });
    }
    
    // Wave XOF
    if (appData.wavexofcard && appData.wavexofcardholder) {
      receivers.push({
        currency: 'XOF',
        name: 'Wave',
        type: 'mobile_money',
        provider: 'Wave',
        accountNumber: appData.wavexofcard,
        accountHolder: appData.wavexofcardholder,
        isActive: true,
      });
    }
    
    // Orange Money XOF
    if (appData.orangexofcard && appData.orangexofcardholder) {
      receivers.push({
        currency: 'XOF',
        name: 'Orange Money',
        type: 'mobile_money',
        provider: 'Orange',
        accountNumber: appData.orangexofcard,
        accountHolder: appData.orangexofcardholder,
        isActive: true,
      });
    }
    
    return receivers;
  } catch (error) {
    console.error('Error fetching payment receivers:', error);
    return [];
  }
}

/**
 * Get payment receiver for a specific currency
 */
export async function getPaymentReceiverForCurrency(currency: string): Promise<PaymentReceiver | null> {
  const receivers = await getActivePaymentReceivers();
  return receivers.find(r => r.currency === currency.toUpperCase()) || null;
}

/**
 * Fetch all supported currencies
 */
export function getSupportedCurrencies(): Currency[] {
  return Object.values(CURRENCY_CONFIG);
}

/**
 * Get country information by code
 */
export function getCountryInfo(countryCode: string) {
  return COUNTRY_CONFIG[countryCode.toUpperCase()] || null;
}

/**
 * Calculate fee based on blink-1 fee logic
 */
export function calculateFee(sendAmount: number, fromCurrency: string, toCurrency: string): { fixedFee: number; payoutFee: number; totalFee: number } {
  let fixedFee = 0;
  let payoutFee = 0;
  
  // Fixed fee for RUB transfers
  if (fromCurrency.toUpperCase() === 'RUB') {
    fixedFee = FEE_CONFIG.FIXED_FEE_RUB;
  }
  
  // Payout fee when receiving in RUB
  if (toCurrency.toUpperCase() === 'RUB') {
    payoutFee = FEE_CONFIG.PAYOUT_FEE_RUB;
  }
  
  return {
    fixedFee,
    payoutFee,
    totalFee: fixedFee + payoutFee,
  };
}

/**
 * Calculate complete transfer details
 */
export async function calculateTransfer(
  sendAmount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<{
  sendAmount: number;
  netAmount: number;
  receiveAmount: number;
  exchangeRate: number;
  adjustedRate: number;
  fee: number;
  payoutFee: number;
  totalAmount: number;
  fromCurrencyInfo: Currency;
  toCurrencyInfo: Currency;
} | null> {
  const rateInfo = await getExchangeRate(fromCurrency, toCurrency);
  if (!rateInfo) {
    console.error(`No rate available for ${fromCurrency} to ${toCurrency}`);
    return null;
  }
  
  const fromInfo = CURRENCY_CONFIG[fromCurrency.toUpperCase()];
  const toInfo = CURRENCY_CONFIG[toCurrency.toUpperCase()];
  
  if (!fromInfo || !toInfo) {
    console.error(`Currency not supported: ${fromCurrency} or ${toCurrency}`);
    return null;
  }
  
  const fees = calculateFee(sendAmount, fromCurrency, toCurrency);
  
  // Different calculation for RWF → RUB (reverse corridor)
  // Normal: Fee deducted from send amount, then multiply by rate
  // Reverse (to RUB): No send fee, multiply by rate, then deduct payout fee from receive
  
  let netAmount: number;
  let receiveAmount: number;
  
  if (toCurrency.toUpperCase() === 'RUB' && fromCurrency.toUpperCase() !== 'RUB') {
    // RWF → RUB: No send fee, payout fee deducted from receive
    netAmount = sendAmount; // No fee on send side
    const rawReceive = netAmount * rateInfo.adjustedRate;
    receiveAmount = rawReceive - fees.payoutFee; // Deduct 100 RUB payout fee
    console.log(`[calculateTransfer] RWF→RUB: send=${sendAmount}, raw=${rawReceive}, payoutFee=${fees.payoutFee}, receive=${receiveAmount}`);
  } else {
    // Normal: RUB → RWF and other corridors
    netAmount = sendAmount - fees.fixedFee;
    receiveAmount = netAmount * rateInfo.adjustedRate;
    console.log(`[calculateTransfer] Normal: send=${sendAmount}, fee=${fees.fixedFee}, net=${netAmount}, receive=${receiveAmount}`);
  }
  
  const totalAmount = sendAmount; // User pays the full sendAmount
  
  // Round based on currency decimal places
  const roundedReceive = toInfo.decimalPlaces === 0 
    ? Math.floor(receiveAmount) 
    : Math.round(receiveAmount * Math.pow(10, toInfo.decimalPlaces)) / Math.pow(10, toInfo.decimalPlaces);
  
  return {
    sendAmount,
    netAmount,
    receiveAmount: roundedReceive,
    exchangeRate: rateInfo.rate,
    adjustedRate: rateInfo.adjustedRate,
    fee: fees.fixedFee,
    payoutFee: fees.payoutFee,
    totalAmount,
    fromCurrencyInfo: fromInfo,
    toCurrencyInfo: toInfo,
  };
}

/**
 * Create a new transfer order (AI-assisted)
 * Creates transaction in users/{userId}/transactions subcollection (blink-1 structure)
 */
/**
 * Validate transfer order before creation
 */
export interface OrderValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  paymentReceiver?: PaymentReceiver;
  calculatedDetails?: Awaited<ReturnType<typeof calculateTransfer>>;
}

export async function validateTransferOrder(order: Partial<TransferOrder>): Promise<OrderValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Required field validation
  if (!order.userId) errors.push('User ID is required');
  if (!order.recipientName) errors.push('Recipient name is required');
  if (!order.recipientPhone) errors.push('Recipient phone number is required');
  if (!order.fromCurrency) errors.push('Source currency is required');
  if (!order.toCurrency) errors.push('Destination currency is required');
  if (!order.sendAmount || order.sendAmount <= 0) errors.push('Valid send amount is required');
  
  // Currency validation
  if (order.fromCurrency && !CURRENCY_CONFIG[order.fromCurrency.toUpperCase()]) {
    errors.push(`Unsupported source currency: ${order.fromCurrency}`);
  }
  if (order.toCurrency && !CURRENCY_CONFIG[order.toCurrency.toUpperCase()]) {
    errors.push(`Unsupported destination currency: ${order.toCurrency}`);
  }
  
  // Phone validation (basic)
  if (order.recipientPhone && !/^\+?[0-9]{8,15}$/.test(order.recipientPhone.replace(/\s/g, ''))) {
    warnings.push('Phone number format may be invalid. Please verify.');
  }
  
  // Check if payment receiver exists for source currency
  let paymentReceiver: PaymentReceiver | null = null;
  if (order.fromCurrency) {
    paymentReceiver = await getPaymentReceiverForCurrency(order.fromCurrency);
    if (!paymentReceiver) {
      errors.push(`No active payment receiver for ${order.fromCurrency}. Cannot process transfer.`);
    }
  }
  
  // Calculate transfer details
  let calculatedDetails: Awaited<ReturnType<typeof calculateTransfer>> = null;
  if (order.fromCurrency && order.toCurrency && order.sendAmount && order.sendAmount > 0) {
    calculatedDetails = await calculateTransfer(order.sendAmount, order.fromCurrency, order.toCurrency);
    if (!calculatedDetails) {
      errors.push(`Exchange rate not available for ${order.fromCurrency} to ${order.toCurrency}`);
    }
  }
  
  // Amount validation
  if (calculatedDetails) {
    if (order.sendAmount && order.sendAmount < 100) {
      warnings.push('Minimum recommended transfer amount is 100 in source currency');
    }
    if (order.sendAmount && order.sendAmount > 500000) {
      warnings.push('Transfer amount exceeds typical limits. May require additional verification.');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    paymentReceiver: paymentReceiver || undefined,
    calculatedDetails: calculatedDetails || undefined,
  };
}

// Input type for creating orders - only what caller needs to provide
export interface CreateOrderInput {
  userId: string;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  senderCountry?: string;
  recipientId?: string;
  recipientName: string;
  recipientPhone: string;
  recipientCountry?: string;
  recipientBank?: string;
  recipientAccountNumber?: string;
  mobileProvider?: string;
  fromCurrency: string;
  toCurrency: string;
  sendAmount: number;
  paymentMethod?: 'card' | 'bank_transfer' | 'mobile_wallet' | 'cash' | string;
  deliveryMethod?: 'mobile_money' | 'bank_transfer' | 'cash_pickup' | string;
  notes?: string;
}

/**
 * Create a new transfer order (AI-assisted) with full validation
 * Creates transaction in users/{userId}/transactions subcollection (blink-1 structure)
 * Auto-fetches sender details from user profile if not provided
 */
export async function createTransferOrder(order: CreateOrderInput): Promise<{ 
  success: boolean; 
  orderId?: string; 
  transactionId?: string;
  error?: string;
  validation?: OrderValidation;
  senderDetails?: SenderDetails;
  paymentInstructions?: {
    receiver: PaymentReceiver;
    amount: number;
    currency: string;
    reference: string;
    instructions: string;
  };
}> {
  try {
    // Cast to Partial<TransferOrder> for validation
    const orderForValidation = order as Partial<TransferOrder>;
    const validation = await validateTransferOrder(orderForValidation);
    
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.errors.join('; '),
        validation,
      };
    }
    
    if (!order.userId) {
      return { success: false, error: 'User ID is required' };
    }
    
    // Fetch user profile for sender details
    const userProfile = await getUserProfile(order.userId);
    const senderDetails = extractSenderDetails(userProfile, order.userId);
    
    // Get calculated details if not provided
    const calcDetails = validation.calculatedDetails || await calculateTransfer(
      order.sendAmount,
      order.fromCurrency,
      order.toCurrency
    );
    
    if (!calcDetails) {
      return { success: false, error: 'Failed to calculate transfer details' };
    }
    
    // Create transaction in user's subcollection (blink-1 structure)
    const userTransactionsRef = collection(db, COLLECTIONS.USERS, order.userId, COLLECTIONS.TRANSACTIONS);
    
    const now = Timestamp.now(); // Use Firestore Timestamp for proper sorting
    const nowString = new Date().toISOString();
    const transactionData = {
      // User/Sender information
      userId: order.userId,
      senderName: order.senderName || senderDetails.senderName,
      senderEmail: order.senderEmail || senderDetails.senderEmail,
      senderPhone: order.senderPhone || senderDetails.senderPhone || '',
      senderCountry: order.senderCountry || senderDetails.senderCountry || '',
      sendername: order.senderName || senderDetails.senderName, // blink-1 legacy field
      senderemail: order.senderEmail || senderDetails.senderEmail, // blink-1 legacy field
      sendertel: order.senderPhone || senderDetails.senderPhone || '', // blink-1 legacy field
      // Recipient information
      recipientId: order.recipientId || '',
      recipientName: order.recipientName,
      recipientPhone: order.recipientPhone,
      recipientCountry: order.recipientCountry || '',
      recipientBank: order.recipientBank || '',
      recipientAccountNumber: order.recipientAccountNumber || '',
      mobileProvider: order.mobileProvider || '',
      recipientsfname: order.recipientName, // blink-1 legacy field
      recipientsphone: order.recipientPhone, // blink-1 legacy field
      recipientbankacc: order.recipientAccountNumber || '', // blink-1 legacy field
      // Currency and amounts
      fromCurrency: order.fromCurrency.toUpperCase(),
      toCurrency: order.toCurrency.toUpperCase(),
      basecurrency: order.fromCurrency.toUpperCase(), // blink-1 legacy field
      transfercurrency: order.toCurrency.toUpperCase(), // blink-1 legacy field
      sendAmount: order.sendAmount,
      receiveAmount: calcDetails.receiveAmount,
      recivergets: calcDetails.receiveAmount, // blink-1 legacy field
      amounttopay: `${calcDetails.totalAmount} ${order.fromCurrency.toUpperCase()}`, // blink-1 legacy field
      exchangeRate: calcDetails.exchangeRate,
      rate: calcDetails.exchangeRate, // Alias for compatibility
      rateused: `${calcDetails.exchangeRate} ${order.toCurrency.toUpperCase()}`, // blink-1 legacy field
      fee: calcDetails.fee,
      payoutFee: calcDetails.payoutFee,
      totalAmount: calcDetails.totalAmount,
      // Payment and delivery
      paymentMethod: order.paymentMethod || 'bank_transfer',
      deliveryMethod: order.deliveryMethod || 'mobile_money',
      modeofpayment: order.paymentMethod || 'bank_transfer', // blink-1 legacy field
      transfermethod: order.deliveryMethod || 'mobile_money', // blink-1 legacy field
      // Status and timestamps - IMPORTANT: use 'Pending' to match blink-1
      status: 'pending_payment' as TransactionStatus,
      transactionstatus: 'Pending', // blink-1 uses this field with capital P
      date: now, // Firestore Timestamp for proper sorting in blink-1
      createdAt: nowString,
      updatedAt: nowString,
      // AI metadata
      createdByAI: true,
      notes: order.notes || 'Created via Ikamba AI Assistant',
      source: 'ikamba_ai',
      appVersion: '1.1.1', // blink-1 compatibility
    };
    
    const docRef = await addDoc(userTransactionsRef, transactionData);
    
    // Update with transactionId (blink-1 convention)
    await updateDoc(docRef, { transactionId: docRef.id });
    
    // Prepare payment instructions with detailed guidance
    let paymentInstructions;
    if (validation.paymentReceiver) {
      const receiver = validation.paymentReceiver;
      let instructionsText = '';
      
      if (receiver.type === 'bank') {
        instructionsText = `Please transfer ${calcDetails.totalAmount} ${order.fromCurrency.toUpperCase()} to:\n` +
          `Bank: ${receiver.provider || receiver.name}\n` +
          `Account: ${receiver.accountNumber}\n` +
          `Holder: ${receiver.accountHolder}\n` +
          `Reference: ${docRef.id}`;
      } else {
        instructionsText = `Please send ${calcDetails.totalAmount} ${order.fromCurrency.toUpperCase()} to:\n` +
          `${receiver.provider || receiver.name}: ${receiver.accountNumber}\n` +
          `Holder: ${receiver.accountHolder}\n` +
          `Reference: ${docRef.id}`;
      }
      
      paymentInstructions = {
        receiver,
        amount: calcDetails.totalAmount,
        currency: order.fromCurrency.toUpperCase(),
        reference: docRef.id,
        instructions: instructionsText,
      };
    }
    
    // Send notification emails (non-blocking)
    const emailData: TransactionEmailData = {
      userId: order.userId,
      senderName: order.senderName || senderDetails.senderName,
      senderTel: order.senderPhone || senderDetails.senderPhone || '',
      senderEmail: order.senderEmail || senderDetails.senderEmail,
      amountToSendMinusFee: String(calcDetails.netAmount || order.sendAmount - calcDetails.fee),
      baseCurrency: order.fromCurrency.toUpperCase(),
      recipientName: order.recipientName,
      transfermethod: order.deliveryMethod || 'mobile_money',
      transferCurrency: order.toCurrency.toUpperCase(),
      receiverGets: String(calcDetails.receiveAmount),
      fee: String(calcDetails.fee),
      amountToPay: String(calcDetails.totalAmount),
      recipientsPhone: order.recipientPhone || '',
      recipientBankAcc: order.recipientAccountNumber || '',
      rateUsed: String(calcDetails.adjustedRate),
      modeOfPayment: order.paymentMethod || 'bank_transfer',
    };
    
    // Send emails in background (don't block order creation)
    Promise.all([
      sendAdminNotificationEmail(emailData).catch(e => console.error('Admin email failed:', e)),
      sendEmailToUser(emailData).catch(e => console.error('User email failed:', e)),
    ]).then(() => {
      console.log('Order notification emails sent successfully');
    });
    
    return {
      success: true,
      orderId: docRef.id,
      transactionId: docRef.id,
      validation,
      senderDetails,
      paymentInstructions,
    };
  } catch (error) {
    console.error('Error creating transfer order:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create order',
    };
  }
}

/**
 * Get user's transfer history from users/{userId}/transactions
 */
export async function getUserTransfers(userId: string, maxResults = 50): Promise<TransferOrder[]> {
  try {
    const userTransactionsRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.TRANSACTIONS);
    const q = query(
      userTransactionsRef,
      orderBy('date', 'desc'),
      limit(maxResults)
    );
    
    const snapshot = await getDocs(q);
    const orders: TransferOrder[] = [];
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      orders.push({
        id: docSnap.id,
        transactionId: data.transactionId || docSnap.id,
        userId: data.userId || userId,
        recipientId: data.recipientId,
        recipientName: data.recipientName || data.recipientsfname || data.recipient_name,
        recipientPhone: data.recipientPhone || data.recipientsphone || data.recipient_phone,
        recipientCountry: data.recipientCountry || data.recipient_country || data.transferCurrency,
        recipientBank: data.recipientBank || data.bank || data.bankName,
        recipientAccountNumber: data.recipientAccountNumber || data.recipientBankAccount || data.accountNumber,
        mobileProvider: data.mobileProvider || data.transfermethod || data.provider,
        fromCurrency: data.fromCurrency || data.baseCurrency || data.from_currency,
        toCurrency: data.toCurrency || data.transferCurrency || data.to_currency,
        sendAmount: data.sendAmount || data.amountToPay || data.send_amount || data.amount,
        receiveAmount: data.receiveAmount || data.receive_amount,
        exchangeRate: data.exchangeRate || data.rate || data.exchange_rate,
        fee: data.fee || 0,
        payoutFee: data.payoutFee || 0,
        totalAmount: data.totalAmount || data.total_amount || 0,
        paymentMethod: data.paymentMethod || data.payment_method || 'card',
        deliveryMethod: data.deliveryMethod || data.delivery_method || 'mobile_money',
        status: data.status || data.transactionstatus?.toLowerCase() || 'pending_payment',
        date: data.date ? new Date(data.date) : (data.createdAt ? new Date(data.createdAt) : new Date()),
        createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined,
        createdByAI: data.createdByAI || false,
        notes: data.notes,
        paymentProofUrl: data.paymentProofUrl,
      });
    });
    
    return orders;
  } catch (error) {
    console.error('Error fetching user transfers:', error);
    return [];
  }
}

/**
 * Normalize phone number for deduplication
 */
function normalizePhone(phone: string | undefined): string {
  if (!phone) return '';
  // Remove all non-digits except leading +
  let normalized = phone.replace(/[^\d+]/g, '');
  // Remove leading + for comparison
  if (normalized.startsWith('+')) {
    normalized = normalized.substring(1);
  }
  // Remove common country codes for deduplication (250 for Rwanda, etc.)
  if (normalized.startsWith('250') && normalized.length > 9) {
    normalized = normalized.substring(3);
  }
  if (normalized.startsWith('256') && normalized.length > 9) {
    normalized = normalized.substring(3);
  }
  // Remove leading 0 if present
  if (normalized.startsWith('0')) {
    normalized = normalized.substring(1);
  }
  return normalized;
}

/**
 * Get recent recipients for a user based on transaction history
 * Deduplicates based on normalized name + phone
 */
export async function getRecentRecipients(userId: string, limitCount = 5): Promise<any[]> {
  try {
    const transfers = await getUserTransfers(userId, 50); // Fetch last 50 to find unique recipients
    const uniqueRecipients = new Map<string, any>();
    
    // Map currency to country
    const currencyToCountry: Record<string, string> = {
      'RWF': 'Rwanda',
      'UGX': 'Uganda',
      'KES': 'Kenya',
      'TZS': 'Tanzania',
      'BIF': 'Burundi',
      'NGN': 'Nigeria',
      'ETB': 'Ethiopia',
      'XOF': 'West Africa',
      'ZAR': 'South Africa',
      'SLE': 'Sierra Leone',
    };
    
    for (const t of transfers) {
      if (!t.recipientName) continue;
      
      // Normalize name (trim, lowercase for comparison)
      const normalizedName = t.recipientName.trim().toLowerCase();
      const normalizedPhone = normalizePhone(t.recipientPhone);
      
      // Create a unique key based on normalized name and phone
      // Use just the last 6 digits of phone for matching (handles country code variations)
      const phoneKey = normalizedPhone.slice(-6) || 'noPhone';
      const key = `${normalizedName}-${phoneKey}`;
      
      if (!uniqueRecipients.has(key)) {
        // Format phone nicely for display (prefer version with country code)
        let displayPhone = t.recipientPhone || '';
        if (displayPhone && !displayPhone.startsWith('+') && displayPhone.length >= 9) {
          // Add country code if missing and phone looks complete
          if (displayPhone.startsWith('07') || displayPhone.startsWith('06')) {
            displayPhone = '+250' + displayPhone.substring(1); // Rwanda
          } else if (displayPhone.startsWith('07') && displayPhone.length === 10) {
            // Could be Uganda
            displayPhone = '+256' + displayPhone.substring(1);
          }
        }
        
        // Derive country from currency if not set
        let country = t.recipientCountry;
        if (!country || country === t.toCurrency) {
          country = currencyToCountry[t.toCurrency] || 'Unknown';
        }
        
        uniqueRecipients.set(key, {
          name: t.recipientName.trim(),
          phone: displayPhone,
          accountNumber: t.recipientAccountNumber,
          bank: t.recipientBank,
          provider: t.mobileProvider,
          country: country,
          currency: t.toCurrency,
          lastTransferDate: t.date,
          deliveryMethod: t.deliveryMethod
        });
      }
      
      if (uniqueRecipients.size >= limitCount) break;
    }
    
    return Array.from(uniqueRecipients.values());
  } catch (error) {
    console.error('Error fetching recent recipients:', error);
    return [];
  }
}

/**
 * Get all recent transactions (admin view)
 */
export async function getAllRecentTransactions(maxResults = 100): Promise<TransferOrder[]> {
  try {
    const q = query(
      collectionGroup(db, COLLECTIONS.TRANSACTIONS),
      orderBy('date', 'desc'),
      limit(maxResults)
    );
    
    const snapshot = await getDocs(q);
    const orders: TransferOrder[] = [];
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const parentDoc = docSnap.ref.parent.parent;
      const pathUserId = parentDoc ? parentDoc.id : '';
      
      orders.push({
        id: docSnap.id,
        transactionId: data.transactionId || docSnap.id,
        userId: data.userId || pathUserId,
        recipientName: data.recipientName || data.recipient_name,
        recipientPhone: data.recipientPhone || data.recipient_phone,
        recipientCountry: data.recipientCountry || data.recipient_country,
        fromCurrency: data.fromCurrency || data.from_currency,
        toCurrency: data.toCurrency || data.to_currency,
        sendAmount: data.sendAmount || data.send_amount || data.amount,
        receiveAmount: data.receiveAmount || data.receive_amount,
        exchangeRate: data.exchangeRate || data.exchange_rate || data.rate,
        fee: data.fee || 0,
        totalAmount: data.totalAmount || data.total_amount || 0,
        paymentMethod: data.paymentMethod || data.payment_method || 'card',
        deliveryMethod: data.deliveryMethod || data.delivery_method || 'mobile_money',
        status: data.status || 'pending_payment',
        date: data.date ? new Date(data.date) : new Date(),
        createdByAI: data.createdByAI || false,
      });
    });
    
    return orders;
  } catch (error) {
    console.error('Error fetching all transactions:', error);
    return [];
  }
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currencyCode: string): string {
  const currency = CURRENCY_CONFIG[currencyCode.toUpperCase()];
  if (currency) {
    return `${amount.toLocaleString(undefined, { 
      minimumFractionDigits: currency.decimalPlaces,
      maximumFractionDigits: currency.decimalPlaces 
    })} ${currencyCode}`;
  }
  return `${amount.toLocaleString()} ${currencyCode}`;
}

/**
 * Get transaction status description
 */
export function getStatusDescription(status: TransactionStatus): string {
  const statusDescriptions: Record<TransactionStatus, string> = {
    draft: 'Transfer is being prepared',
    pending_payment: 'Waiting for payment',
    awaiting_confirmation: 'Payment being verified',
    processing: 'Transfer is being processed',
    sent: 'Money has been sent',
    delivered: 'Money delivered to recipient',
    completed: 'Transfer completed successfully',
    failed: 'Transfer failed',
    cancelled: 'Transfer was cancelled',
  };
  return statusDescriptions[status] || 'Unknown status';
}

/**
 * Get Ikamba Remit information for AI context
 */
export async function getIkambaRemitContext(): Promise<string> {
  const rates = await getExchangeRates();
  const currencies = getSupportedCurrencies();
  
  // Format rates with fee information
  const ratesList = rates.length > 0 
    ? rates.map(r => {
        const fees = calculateFee(1000, r.fromCurrency, r.toCurrency);
        const feeInfo = fees.totalFee > 0 ? ` (Fee: ${formatCurrency(fees.fixedFee, r.fromCurrency)})` : ' (No transfer fee)';
        return `- ${r.fromCurrency} to ${r.toCurrency}: 1 ${r.fromCurrency} = ${r.rate.toFixed(4)} ${r.toCurrency}${feeInfo}`;
      }).join('\n')
    : '- Rates are being loaded from the database';

  const context = `
IKAMBA REMIT - INTERNATIONAL MONEY TRANSFER SERVICE

Ikamba Remit is a fast, secure, and affordable money transfer service that allows users to send money internationally, especially to African countries.

SUPPORTED CURRENCIES:
${currencies.map(c => `- ${c.code} (${c.name}) - ${c.country}`).join('\n')}

SUPPORTED COUNTRIES:
${Object.entries(COUNTRY_CONFIG).map(([code, info]) => `- ${info.name} (${code}) - Currency: ${info.currency}, Phone: ${info.phonePrefix}`).join('\n')}

CURRENT EXCHANGE RATES:
${ratesList}

FEE STRUCTURE:
- RUB Transfers: Fixed fee of ${formatCurrency(FEE_CONFIG.FIXED_FEE_RUB, 'RUB')} per transfer
- Payout to RUB: Additional ${formatCurrency(FEE_CONFIG.PAYOUT_FEE_RUB, 'RUB')} payout fee
- Other currencies: No transfer fee (competitive rates include small margin)

TRANSFER FLOW - Step by Step:

Step 1: SELECT AMOUNT
- Enter the amount you want to send
- Choose sending currency (e.g., RUB, TRY)
- Choose receiving currency (e.g., RWF, KES, UGX)
- System calculates receive amount automatically

Step 2: ADD RECIPIENT
- Enter recipient's full name (as on ID)
- Enter recipient's phone number with country code
- Select delivery country
- Choose delivery method:
  * Mobile Money (MTN, M-Pesa, Airtel Money)
  * Bank Transfer
  * Cash Pickup

Step 3: PAYMENT
- Choose payment method:
  * Card payment
  * Bank transfer
  * Mobile wallet
- Upload payment proof (screenshot/receipt)

Step 4: CONFIRMATION
- Review all transfer details
- Submit for processing
- Receive transaction reference number

Step 5: DELIVERY
- Track status in real-time
- Recipient notified via SMS
- Money delivered within:
  * Mobile Money: 5-30 minutes
  * Bank Transfer: 1-3 business days
  * Cash Pickup: Same day

TRANSACTION STATUSES:
- draft: Transfer being prepared
- pending_payment: Awaiting your payment
- awaiting_confirmation: Verifying payment
- processing: Transfer in progress
- sent: Money dispatched
- delivered: Received by recipient
- completed: Successfully finished
- failed: Transfer unsuccessful
- cancelled: Transfer cancelled

HOW AI CAN HELP:
1. Check current exchange rates between currencies
2. Calculate exact amounts (send/receive/fees)
3. Explain transfer process step by step
4. Help prepare transfer details
5. Track transfer status
6. Answer questions about supported countries/currencies

EXAMPLE CALCULATIONS:
- Send 10,000 RUB to Rwanda: Fee 100 RUB, total 10,100 RUB
- The recipient receives amount calculated at current exchange rate
- Rates are updated regularly for best value
`;

  return context;
}

// ============================================
// PAYMENT PROOF UPLOAD (aligned with blink-1)
// ============================================

/**
 * Upload payment proof image/PDF to Firebase Storage
 * and save reference to transaction document
 * @param userId - User ID
 * @param transactionId - Transaction ID  
 * @param file - File to upload (image or PDF)
 * @param base64Data - Base64 encoded file data (alternative to File)
 * @returns Object with success status and download URL
 */
export async function uploadPaymentProof(
  userId: string,
  transactionId: string,
  file?: File,
  base64Data?: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!storage) {
      return { success: false, error: 'Firebase Storage not initialized' };
    }
    
    if (!userId || !transactionId) {
      return { success: false, error: 'Missing userId or transactionId' };
    }

    let fileData: Blob;
    let fileName: string;
    let contentType: string;

    if (file) {
      fileData = file;
      fileName = file.name;
      contentType = file.type;
    } else if (base64Data) {
      // Handle different data URL formats
      console.log('[uploadPaymentProof] Processing image data');
      console.log('[uploadPaymentProof] Data length:', base64Data.length);
      console.log('[uploadPaymentProof] First 100 chars:', base64Data.substring(0, 100));
      console.log('[uploadPaymentProof] Starts with data:', base64Data.startsWith('data:'));
      console.log('[uploadPaymentProof] Starts with blob:', base64Data.startsWith('blob:'));
      console.log('[uploadPaymentProof] Starts with http:', base64Data.startsWith('http'));
      
      // Check if it's a Firebase Storage URL
      if (base64Data.includes('firebasestorage.googleapis.com')) {
        console.log('[uploadPaymentProof] Detected Firebase Storage URL');
        try {
          const response = await fetch(base64Data, {
            method: 'GET',
            headers: {
              'Accept': 'image/*'
            }
          });
          if (!response.ok) {
            console.error('[uploadPaymentProof] Firebase fetch failed:', response.status, response.statusText);
            // For Firebase URLs, if fetch fails, we can just copy the URL
            // since the image is already in Firebase Storage
            console.log('[uploadPaymentProof] Using direct URL copy instead');
            
            // Just use the existing URL - create a minimal payload
            const storagePath = `payment-proofs/${userId}/${transactionId}/imported_proof.png`;
            
            // Create PaymentProof document pointing to existing image
            await addDoc(collection(db, 'paymentProofs'), {
              transactionId,
              userId,
              storagePath: base64Data, // Use the original Firebase Storage URL
              amountPaid: 0,
              paymentReference: '',
              status: 'pending',
              uploadedAt: new Date().toISOString(),
              notes: 'Uploaded via Ikamba AI (linked from chat)',
            });
            
            // Update transaction document
            const transactionRef = doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.TRANSACTIONS, transactionId);
            
            const transactionSnap = await getDoc(transactionRef);
            if (transactionSnap.exists()) {
              const currentData = transactionSnap.data();
              const currentProofs = currentData.paymentProofUrls || [];
              
              await updateDoc(transactionRef, {
                paymentProofUrl: base64Data,
                paymentProofUrls: [...currentProofs, base64Data],
                updatedAt: Timestamp.now(),
                status: 'awaiting_confirmation',
                transactionstatus: 'Awaiting Confirmation'
              });
            } else {
              // Fallback if transaction not found (shouldn't happen if ID is valid)
              await updateDoc(transactionRef, {
                paymentProofUrl: base64Data,
                paymentProofUrls: [base64Data],
                updatedAt: Timestamp.now(),
                status: 'awaiting_confirmation',
                transactionstatus: 'Awaiting Confirmation'
              }).catch(e => console.error('Failed to update transaction:', e));
            }
            
            console.log('[uploadPaymentProof] Success using existing URL:', base64Data);
            return { success: true, url: base64Data };
          }
          fileData = await response.blob();
          contentType = fileData.type || 'image/png';
          console.log('[uploadPaymentProof] Firebase Storage fetch success, blob size:', fileData.size);
        } catch (fetchError) {
          console.error('[uploadPaymentProof] Firebase Storage fetch error:', fetchError);
          // Still try to use the URL directly
          console.log('[uploadPaymentProof] Using direct URL as fallback');
          
          await addDoc(collection(db, 'paymentProofs'), {
            transactionId,
            userId,
            storagePath: base64Data,
            amountPaid: 0,
            paymentReference: '',
            status: 'pending',
            uploadedAt: new Date().toISOString(),
            notes: 'Uploaded via Ikamba AI (linked from chat)',
          });
          
          const transactionRef = doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.TRANSACTIONS, transactionId);
          
          const transactionSnap = await getDoc(transactionRef);
          if (transactionSnap.exists()) {
            const currentData = transactionSnap.data();
            const currentProofs = currentData.paymentProofUrls || [];
            
            await updateDoc(transactionRef, {
              paymentProofUrl: base64Data,
              paymentProofUrls: [...currentProofs, base64Data],
              updatedAt: Timestamp.now(),
              status: 'awaiting_confirmation',
              transactionstatus: 'Awaiting Confirmation'
            });
          } else {
            await updateDoc(transactionRef, {
              paymentProofUrl: base64Data,
              paymentProofUrls: [base64Data],
              updatedAt: Timestamp.now(),
              status: 'awaiting_confirmation',
              transactionstatus: 'Awaiting Confirmation'
            }).catch(e => console.error('Failed to update transaction:', e));
          }
          
          return { success: true, url: base64Data };
        }
        
        // Generate filename
        const ext = contentType.split('/')[1]?.split(';')[0] || 'png';
        fileName = `proof_${Date.now()}.${ext}`;
        
      } else if (base64Data.startsWith('data:')) {
        // Check if it's a data URL with base64
        const matches = base64Data.match(/^data:([^;,]+)[^,]*,(.+)$/);
        if (!matches) {
          console.error('Failed to parse data URL:', base64Data.substring(0, 100));
          return { success: false, error: 'Invalid data URL format' };
        }
        contentType = matches[1];
        const dataContent = matches[2];
        
        // Check if it's base64 encoded
        const isBase64 = base64Data.includes(';base64,');
        
        if (isBase64) {
          const byteCharacters = atob(dataContent);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          fileData = new Blob([byteArray], { type: contentType });
        } else {
          // URL encoded data
          const decoded = decodeURIComponent(dataContent);
          fileData = new Blob([decoded], { type: contentType });
        }
      } else if (base64Data.startsWith('blob:')) {
        // Handle blob URLs - need to fetch the blob
        try {
          const response = await fetch(base64Data);
          fileData = await response.blob();
          contentType = fileData.type || 'image/png';
        } catch (fetchError) {
          console.error('Failed to fetch blob URL:', fetchError);
          return { success: false, error: 'Could not process image. Please try uploading again.' };
        }
      } else if (base64Data.startsWith('http')) {
        // Handle regular URLs - fetch and convert
        try {
          const response = await fetch(base64Data);
          fileData = await response.blob();
          contentType = fileData.type || 'image/png';
        } catch (fetchError) {
          console.error('Failed to fetch image URL:', fetchError);
          return { success: false, error: 'Could not download image. Please try uploading again.' };
        }
      } else {
        // Assume it's raw base64 without header
        try {
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          fileData = new Blob([byteArray], { type: 'image/png' });
          contentType = 'image/png';
        } catch (decodeError) {
          console.error('Failed to decode base64:', decodeError);
          return { success: false, error: 'Invalid image format' };
        }
      }
      
      // Generate filename based on content type
      const ext = contentType.split('/')[1]?.split(';')[0] || 'png';
      fileName = `proof_${Date.now()}.${ext}`;
    } else {
      return { success: false, error: 'No file or base64 data provided' };
    }

    // Upload to Firebase Storage with path matching blink-1 structure
    const storagePath = `payment-proofs/${userId}/${transactionId}/${fileName}`;
    const storageRef = ref(storage, storagePath);
    
    await uploadBytes(storageRef, fileData, { contentType });
    const downloadURL = await getDownloadURL(storageRef);

    // Create PaymentProof document (same collection as blink-1)
    await addDoc(collection(db, 'paymentProofs'), {
      transactionId,
      userId,
      storagePath: downloadURL,
      amountPaid: 0, // Will be filled in by AI or admin
      paymentReference: '',
      status: 'pending',
      uploadedAt: new Date().toISOString(),
      notes: 'Uploaded via Ikamba AI',
    });

    // Update transaction document with proof URL
    const transactionRef = doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.TRANSACTIONS, transactionId);
    
    // Verify transaction exists
    const transactionSnap = await getDoc(transactionRef);
    if (transactionSnap.exists()) {
      const currentData = transactionSnap.data();
      const currentProofs = currentData.paymentProofUrls || [];
      
      await updateDoc(transactionRef, {
        paymentProofUrl: downloadURL,
        paymentProofUrls: [...currentProofs, downloadURL],
        updatedAt: Timestamp.now(),
        status: 'awaiting_confirmation', // Update status so admin sees it
        transactionstatus: 'Awaiting Confirmation' // blink-1 legacy field
      });
      console.log('Transaction updated with proof and status set to awaiting_confirmation');
    } else {
      console.error(`Transaction ${transactionId} not found for user ${userId}`);
      // We still return success because the proof was uploaded to storage and paymentProofs collection
    }

    console.log('Payment proof uploaded:', downloadURL);
    return { success: true, url: downloadURL };
  } catch (error) {
    console.error('Error uploading payment proof:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to upload proof' 
    };
  }
}

/**
 * Get user's transaction history (for AI context)
 */
export async function getUserTransactionHistory(
  userId: string, 
  maxTransactions: number = 5
): Promise<Array<{
  id: string;
  recipientName: string;
  amount: number;
  currency: string;
  receiveAmount: number;
  receiveCurrency: string;
  status: string;
  date: string;
  hasProof: boolean;
  adminTransferProofUrl?: string;
}>> {
  try {
    const transactionsRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.TRANSACTIONS);
    const q = query(transactionsRef, orderBy('date', 'desc'), limit(maxTransactions));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return [];
    
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      let dateStr = '';
      if (data.date?.toDate) {
        dateStr = data.date.toDate().toISOString();
      } else if (data.createdAt) {
        dateStr = data.createdAt;
      }
      
      return {
        id: docSnap.id,
        recipientName: data.recipientName || data.recipientsfname || 'Unknown',
        amount: data.sendAmount || 0,
        currency: data.fromCurrency || data.basecurrency || 'RUB',
        receiveAmount: data.receiveAmount || data.recivergets || 0,
        receiveCurrency: data.toCurrency || data.transfercurrency || 'RWF',
        status: data.status || data.transactionstatus || 'pending',
        date: dateStr,
        hasProof: !!(data.paymentProofUrl || data.paymentProofUrls?.length),
        adminTransferProofUrl: data.adminTransferProofUrl,
      };
    });
  } catch (error) {
    console.error('Error getting transaction history:', error);
    return [];
  }
}

/**
 * Get the most recent transaction for a user (for attaching payment proof)
 * Can optionally match by recipient name for accuracy
 */
export async function getLatestUserTransaction(
  userId: string, 
  matchRecipient?: string
): Promise<{ id: string; data: any } | null> {
  try {
    const transactionsRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.TRANSACTIONS);
    
    // Fetch more transactions to find the right one
    const q = query(transactionsRef, orderBy('date', 'desc'), limit(10));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log('[getLatestUserTransaction] No transactions found');
      return null;
    }
    
    // If we have a recipient name to match, find the most recent matching one
    if (matchRecipient) {
      const normalizedMatch = matchRecipient.toLowerCase().trim();
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const recipientName = (data.recipientName || data.recipientsfname || '').toLowerCase().trim();
        if (recipientName === normalizedMatch) {
          console.log('[getLatestUserTransaction] Found matching recipient:', matchRecipient, '-> txn:', docSnap.id);
          return { id: docSnap.id, data };
        }
      }
      console.log('[getLatestUserTransaction] No match for recipient:', matchRecipient);
    }
    
    // Find the most recent by comparing actual timestamps
    let latestDoc = snapshot.docs[0];
    let latestTime = 0;
    
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      let docTime = 0;
      
      // Handle different date formats
      if (data.date?.toDate) {
        docTime = data.date.toDate().getTime();
      } else if (data.date?.seconds) {
        docTime = data.date.seconds * 1000;
      } else if (typeof data.date === 'string') {
        docTime = new Date(data.date).getTime();
      } else if (data.createdAt) {
        const createdTime = typeof data.createdAt === 'string' 
          ? new Date(data.createdAt).getTime()
          : data.createdAt?.toDate?.()?.getTime() || data.createdAt?.seconds * 1000 || 0;
        docTime = createdTime;
      }
      
      if (docTime > latestTime) {
        latestTime = docTime;
        latestDoc = docSnap;
      }
    }
    
    console.log('[getLatestUserTransaction] Found transaction:', latestDoc.id);
    console.log('[getLatestUserTransaction] Recipient:', latestDoc.data().recipientName || latestDoc.data().recipientsfname);
    
    return { id: latestDoc.id, data: latestDoc.data() };
  } catch (error) {
    console.error('Error getting latest transaction:', error);
    return null;
  }
}

/**
 * Get transaction by ID - searches across all users
 * Transaction IDs are unique, so we can find them by searching
 */
export async function getTransactionById(
  transactionId: string,
  userId?: string
): Promise<{
  id: string;
  userId: string;
  status: string;
  amount: number;
  currency: string;
  receiveAmount: number;
  receiveCurrency: string;
  recipientName: string;
  recipientPhone: string;
  deliveryMethod: string;
  provider?: string;
  bank?: string;
  createdAt: string;
  updatedAt?: string;
  adminTransferProofUrl?: string;
  paymentProofUrl?: string;
  statusHistory?: Array<{ status: string; timestamp: string }>;
} | null> {
  try {
    // If we have a userId, search directly in their transactions
    if (userId) {
      const txnRef = doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.TRANSACTIONS, transactionId);
      const txnDoc = await getDoc(txnRef);
      
      if (txnDoc.exists()) {
        const data = txnDoc.data();
        return formatTransactionResponse(txnDoc.id, userId, data);
      }
    }
    
    // Search across all users using collectionGroup
    const transactionsQuery = query(
      collectionGroup(db, COLLECTIONS.TRANSACTIONS),
      where('__name__', '==', transactionId),
      limit(1)
    );
    
    // Alternative: search by transactionId field if document ID doesn't match
    const byIdQuery = query(
      collectionGroup(db, COLLECTIONS.TRANSACTIONS),
      where('transactionId', '==', transactionId),
      limit(1)
    );
    
    // Try document ID match first
    let snapshot = await getDocs(transactionsQuery);
    
    if (snapshot.empty) {
      // Try transactionId field
      snapshot = await getDocs(byIdQuery);
    }
    
    if (snapshot.empty) {
      // Last resort: search by partial ID match in recent transactions
      const recentQuery = query(
        collectionGroup(db, COLLECTIONS.TRANSACTIONS),
        orderBy('date', 'desc'),
        limit(100)
      );
      const recentSnapshot = await getDocs(recentQuery);
      
      for (const docSnap of recentSnapshot.docs) {
        if (docSnap.id === transactionId || 
            docSnap.id.includes(transactionId) ||
            docSnap.data().transactionId === transactionId) {
          const pathParts = docSnap.ref.path.split('/');
          const foundUserId = pathParts[1]; // users/{userId}/transactions/{txnId}
          return formatTransactionResponse(docSnap.id, foundUserId, docSnap.data());
        }
      }
      
      console.log('[getTransactionById] Transaction not found:', transactionId);
      return null;
    }
    
    const txnDoc = snapshot.docs[0];
    const pathParts = txnDoc.ref.path.split('/');
    const foundUserId = pathParts[1];
    
    return formatTransactionResponse(txnDoc.id, foundUserId, txnDoc.data());
  } catch (error) {
    console.error('Error getting transaction by ID:', error);
    return null;
  }
}

/**
 * Format transaction data for AI response
 */
function formatTransactionResponse(id: string, userId: string, data: any): {
  id: string;
  userId: string;
  status: string;
  amount: number;
  currency: string;
  receiveAmount: number;
  receiveCurrency: string;
  recipientName: string;
  recipientPhone: string;
  deliveryMethod: string;
  provider?: string;
  bank?: string;
  createdAt: string;
  updatedAt?: string;
  adminTransferProofUrl?: string;
  paymentProofUrl?: string;
  statusHistory?: Array<{ status: string; timestamp: string }>;
} {
  // Parse date
  let createdAt = '';
  if (data.date?.toDate) {
    createdAt = data.date.toDate().toISOString();
  } else if (data.date?.seconds) {
    createdAt = new Date(data.date.seconds * 1000).toISOString();
  } else if (typeof data.date === 'string') {
    createdAt = data.date;
  } else if (data.createdAt) {
    createdAt = typeof data.createdAt === 'string' 
      ? data.createdAt 
      : data.createdAt?.toDate?.()?.toISOString() || '';
  }
  
  return {
    id,
    userId,
    status: data.status || 'pending',
    amount: data.amount || data.amountToPay || 0,
    currency: data.currency || data.baseCurrency || 'RUB',
    receiveAmount: data.receiveAmount || data.receiverGets || 0,
    receiveCurrency: data.receiveCurrency || data.transferCurrency || 'RWF',
    recipientName: data.recipientName || data.recipientsfname || '',
    recipientPhone: data.recipientPhone || data.recipientsPhone || '',
    deliveryMethod: data.deliveryMethod || data.transfermethod || '',
    provider: data.provider || data.mobileProvider || '',
    bank: data.bank || data.recipientBank || '',
    createdAt,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || '',
    adminTransferProofUrl: data.adminTransferProofUrl || '',
    paymentProofUrl: data.paymentProofUrl || '',
    statusHistory: data.statusHistory || [],
  };
}

/**
 * Get status emoji for transaction status
 */
export function getStatusEmoji(status: string): string {
  const statusEmojis: Record<string, string> = {
    draft: '📝',
    pending: '⏳',
    pending_payment: '⏳',
    awaiting_confirmation: '🔄',
    processing: '⚙️',
    sent: '✈️',
    delivered: '📬',
    completed: '✅',
    failed: '❌',
    cancelled: '🚫',
    refunded: '💰',
  };
  return statusEmojis[status] || '❓';
}

/**
 * Get user transactions filtered by status
 * @param userId - User ID to fetch transactions for
 * @param statusFilter - Filter by status: 'pending', 'completed', 'cancelled', 'processing', or 'all'
 * @param maxTransactions - Maximum number of transactions to return
 */
export async function getUserTransactionsByStatus(
  userId: string,
  statusFilter: 'pending' | 'completed' | 'cancelled' | 'processing' | 'all' = 'all',
  maxTransactions: number = 10
): Promise<Array<{
  id: string;
  status: string;
  amount: number;
  currency: string;
  receiveAmount: number;
  receiveCurrency: string;
  recipientName: string;
  recipientPhone: string;
  date: string;
  hasTransferProof: boolean;
  hasPaymentProof: boolean;
}>> {
  try {
    const transactionsRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.TRANSACTIONS);
    
    // Map filter to actual status values
    const statusMap: Record<string, string[]> = {
      pending: ['pending', 'pending_payment', 'awaiting_confirmation', 'draft'],
      processing: ['processing', 'sent'],
      completed: ['completed', 'delivered'],
      cancelled: ['cancelled', 'failed', 'refunded'],
      all: [],
    };
    
    let q;
    const statusValues = statusMap[statusFilter] || [];
    
    if (statusFilter !== 'all' && statusValues.length > 0) {
      // Filter by status
      q = query(
        transactionsRef, 
        where('status', 'in', statusValues),
        orderBy('date', 'desc'), 
        limit(maxTransactions)
      );
    } else {
      // Get all transactions
      q = query(transactionsRef, orderBy('date', 'desc'), limit(maxTransactions));
    }
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return [];
    
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data() as any;
      let dateStr = '';
      if (data.date?.toDate) {
        dateStr = data.date.toDate().toISOString();
      } else if (data.date?.seconds) {
        dateStr = new Date(data.date.seconds * 1000).toISOString();
      } else if (typeof data.date === 'string') {
        dateStr = data.date;
      } else if (data.createdAt) {
        dateStr = typeof data.createdAt === 'string' 
          ? data.createdAt 
          : data.createdAt?.toDate?.()?.toISOString() || '';
      }
      
      return {
        id: docSnap.id,
        status: data.status || data.transactionstatus || 'pending',
        amount: data.sendAmount || data.amount || data.amountToPay || 0,
        currency: data.fromCurrency || data.basecurrency || data.currency || 'RUB',
        receiveAmount: data.receiveAmount || data.recivergets || 0,
        receiveCurrency: data.toCurrency || data.transfercurrency || data.receiveCurrency || 'RWF',
        recipientName: data.recipientName || data.recipientsfname || 'Unknown',
        recipientPhone: data.recipientPhone || data.recipientsPhone || '',
        date: dateStr,
        hasTransferProof: !!data.adminTransferProofUrl,
        hasPaymentProof: !!(data.paymentProofUrl || data.paymentProofUrls?.length),
      };
    });
  } catch (error) {
    console.error('Error getting transactions by status:', error);
    return [];
  }
}

// Export FEE_CONFIG for external use
export { FEE_CONFIG };
