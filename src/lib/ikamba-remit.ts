// Ikamba Remit Integration
// This module connects Ikamba AI with Ikamba Remit services
// Database structure aligned with blink-1 Firestore schema
// Supports AI-assisted order creation with full user details

import { db } from './firebase';
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
  collectionGroup
} from 'firebase/firestore';

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

// Country to currency mapping
export const COUNTRY_CONFIG: Record<string, { currency: string; name: string; phonePrefix: string }> = {
  RW: { currency: 'RWF', name: 'Rwanda', phonePrefix: '+250' },
  RU: { currency: 'RUB', name: 'Russia', phonePrefix: '+7' },
  UG: { currency: 'UGX', name: 'Uganda', phonePrefix: '+256' },
  TZ: { currency: 'TZS', name: 'Tanzania', phonePrefix: '+255' },
  KE: { currency: 'KES', name: 'Kenya', phonePrefix: '+254' },
  TR: { currency: 'TRY', name: 'Turkey', phonePrefix: '+90' },
  BI: { currency: 'BIF', name: 'Burundi', phonePrefix: '+257' },
  NG: { currency: 'NGN', name: 'Nigeria', phonePrefix: '+234' },
  ET: { currency: 'ETB', name: 'Ethiopia', phonePrefix: '+251' },
  ZA: { currency: 'ZAR', name: 'South Africa', phonePrefix: '+27' },
  SL: { currency: 'SLE', name: 'Sierra Leone', phonePrefix: '+232' },
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
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
 * Send receipt email to user via Postmark Cloud Function
 */
export async function sendEmailToUser(transactionData: TransactionEmailData): Promise<boolean> {
  try {
    if (!transactionData.senderEmail || !transactionData.senderName || !transactionData.receiverGets) {
      console.error('Missing required transaction properties for user email');
      return false;
    }

    const appDatav2 = {
      senderemail: transactionData.senderEmail,
      sendername: transactionData.senderName,
      sendertel: transactionData.senderTel,
      amounttopay: transactionData.amountToPay,
      basecurrency: transactionData.baseCurrency,
      transfercurrency: transactionData.transferCurrency,
      recivergets: transactionData.receiverGets,
      recipientsfname: transactionData.recipientName,
    };

    const response = await fetch(USER_EMAIL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientName: transactionData.recipientName,
        senderCurrency: transactionData.baseCurrency,
        appDatav2,
      }),
    });

    if (!response.ok) {
      console.error('Error from User Email Cloud Function:', response.status);
      return false;
    }

    console.log('User receipt email sent successfully');
    return true;
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
      const adjustment = adjustments[pair] || 0;
      const midMarketRate = value;
      const adjustedMid = midMarketRate + adjustment;
      
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
    
    // Apply adjustment from Firestore (key format: RUB_RWF)
    const adjustment = adjustments[pair] || 0;
    const adjustedMid = midMarketRate + adjustment;
    const customerRate = adjustedMid * (1 + FEE_CONFIG.DEFAULT_MARGIN);
    
    if (adjustment !== 0) {
      console.log(`Applied adjustment for ${pair}: ${adjustment} (mid: ${midMarketRate} -> ${adjustedMid})`);
    }
    
    return {
      rate: customerRate,
      midMarketRate: adjustedMid,
      customerRate,
      adjustedRate: customerRate,
      margin: FEE_CONFIG.DEFAULT_MARGIN,
      adjustment,
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
  
  // Fee is DEDUCTED from send amount: netAmount = sendAmount - fee
  // receiveAmount = netAmount × rate
  const netAmount = sendAmount - fees.fixedFee;
  const receiveAmount = netAmount * rateInfo.adjustedRate;
  const totalAmount = sendAmount; // User pays the full sendAmount, fee is deducted internally
  
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
    
    const now = new Date().toISOString();
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
      date: now,
      createdAt: now,
      updatedAt: now,
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
        recipientName: data.recipientName || data.recipient_name,
        recipientPhone: data.recipientPhone || data.recipient_phone,
        recipientCountry: data.recipientCountry || data.recipient_country,
        fromCurrency: data.fromCurrency || data.from_currency,
        toCurrency: data.toCurrency || data.to_currency,
        sendAmount: data.sendAmount || data.send_amount || data.amount,
        receiveAmount: data.receiveAmount || data.receive_amount,
        exchangeRate: data.exchangeRate || data.exchange_rate || data.rate,
        fee: data.fee || 0,
        payoutFee: data.payoutFee || 0,
        totalAmount: data.totalAmount || data.total_amount || 0,
        paymentMethod: data.paymentMethod || data.payment_method || 'card',
        deliveryMethod: data.deliveryMethod || data.delivery_method || 'mobile_money',
        status: data.status || 'pending_payment',
        date: data.date ? new Date(data.date) : new Date(),
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
    return `${currency.symbol}${amount.toLocaleString(undefined, { 
      minimumFractionDigits: currency.decimalPlaces,
      maximumFractionDigits: currency.decimalPlaces 
    })}`;
  }
  return `${currencyCode} ${amount.toLocaleString()}`;
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
${currencies.map(c => `- ${c.code} (${c.name}) ${c.symbol} - ${c.country}`).join('\n')}

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

// Export FEE_CONFIG for external use
export { FEE_CONFIG };
