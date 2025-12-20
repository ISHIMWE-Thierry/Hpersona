import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { 
  calculateTransfer, 
  getActivePaymentReceivers, 
  getPaymentReceiverForCurrency,
  fetchLiveRatesFromAPI,
  fetchRateAdjustments,
  getUserProfile,
  extractSenderDetails,
  createTransferOrder,
  uploadPaymentProof,
  getLatestUserTransaction,
  getUserTransactionHistory,
  getUserTransactionsByStatus,
  getStatusEmoji,
  getRecentRecipients,
  sendPaymentProofReceivedEmail,
  sendEmailToUser,
  checkWhatsAppAuth,
  findUserByEmail,
  createWhatsAppVerification,
  verifyWhatsAppCode,
  sendWhatsAppVerificationEmail,
  getDeliveryMethodsForCurrency,
  updateUserProfile,
  getMissingUserFields,
  buildUserContextForAI,
  formatDeliveryOptionsForAI,
  getDeliveryOptionsForCurrency,
  getTransactionById,
  getStatusDescription,
  CURRENCY_CONFIG,
  COUNTRY_CONFIG,
  CURRENCY_TO_COUNTRY
} from '@/lib/ikamba-remit';

// OpenAI GPT-4.1 for all AI tasks
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Tools/Functions for OpenAI to call
const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_transfer_order',
      description: 'MUST call when user says "yes" to confirm a transfer. Creates the order in database and returns payment details.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'User ID (use "guest" if not logged in)' },
          senderName: { type: 'string', description: 'Sender full name' },
          senderEmail: { type: 'string', description: 'Sender email address' },
          senderPhone: { type: 'string', description: 'Sender phone number (required for order updates)' },
          recipientName: { type: 'string', description: 'Recipient full name' },
          recipientPhone: { type: 'string', description: 'Recipient phone number' },
          recipientAccountNumber: { type: 'string', description: 'Recipient bank account (if bank transfer)' },
          recipientBank: { type: 'string', description: 'Recipient bank name (if bank transfer)' },
          mobileProvider: { type: 'string', description: 'Mobile money provider (MTN, Airtel, M-Pesa)' },
          fromCurrency: { type: 'string', description: 'Source currency code (e.g., RUB)' },
          toCurrency: { type: 'string', description: 'Target currency code (e.g., RWF)' },
          sendAmount: { type: 'number', description: 'Amount to send in source currency' },
          paymentMethod: { type: 'string', description: 'How user will pay (Sberbank, Cash)' },
          deliveryMethod: { type: 'string', description: 'How recipient gets money (mobile_money, bank)' },
        },
        required: ['userId', 'senderName', 'senderPhone', 'recipientName', 'recipientPhone', 'fromCurrency', 'toCurrency', 'sendAmount', 'paymentMethod', 'deliveryMethod'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'upload_payment_proof',
      description: 'MUST call when user uploads ANY image after payment details were shown. Do NOT describe the image - just call this function to upload it as payment proof.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'User ID' },
          transactionId: { type: 'string', description: 'Transaction ID (optional, will use latest)' },
        },
        required: ['userId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_whatsapp_verification',
      description: 'Call when a WhatsApp user wants to link their account. Sends a verification code to their email.',
      parameters: {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'User email address to send verification code' },
          whatsappPhone: { type: 'string', description: 'WhatsApp phone number of the user' },
        },
        required: ['email', 'whatsappPhone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verify_whatsapp_code',
      description: 'Verify the 6-digit code sent to email to link WhatsApp account',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '6-digit verification code from email' },
          whatsappPhone: { type: 'string', description: 'WhatsApp phone number of the user' },
        },
        required: ['code', 'whatsappPhone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_user_profile',
      description: 'Update user profile with new information (name, phone, country). Call this when user provides missing info.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'User ID to update' },
          displayName: { type: 'string', description: 'User full name' },
          phoneNumber: { type: 'string', description: 'User phone number' },
          country: { type: 'string', description: 'User country code (RW, UG, KE, etc.)' },
        },
        required: ['userId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_delivery_methods',
      description: 'Get available delivery methods and mobile providers for a currency/country',
      parameters: {
        type: 'object',
        properties: {
          currency: { type: 'string', description: 'Currency code (RWF, UGX, KES, etc.)' },
        },
        required: ['currency'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_transaction_status',
      description: 'Check the status of a transaction by its ID. Use when user asks about their transfer status and provides a transaction ID.',
      parameters: {
        type: 'object',
        properties: {
          transactionId: { type: 'string', description: 'The transaction ID to look up' },
          userId: { type: 'string', description: 'Optional user ID to search within' },
        },
        required: ['transactionId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_transactions_by_status',
      description: 'Get list of user transactions filtered by status. Use when user asks about their pending, completed, cancelled, or all orders.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'User ID to get transactions for' },
          status: { 
            type: 'string', 
            description: 'Filter by status: pending, completed, cancelled, processing, or all',
            enum: ['pending', 'completed', 'cancelled', 'processing', 'all']
          },
          limit: { type: 'number', description: 'Maximum number of transactions to return (default 10)' },
        },
        required: ['userId'],
      },
    },
  },
];

// Handle function calls from AI (userInfo passed from request, imageData for proof uploads)
async function handleFunctionCall(
  name: string, 
  args: any, 
  userInfo?: { userId: string; email: string; displayName: string; phone?: string },
  imageData?: string
): Promise<string> {
  if (name === 'create_transfer_order') {
    try {
      // Use logged in user info if available, otherwise use AI-provided data
      const userId = userInfo?.userId || args.userId || 'guest';
      const senderEmail = userInfo?.email || args.senderEmail || '';
      const senderName = args.senderName || userInfo?.displayName || 'Guest';
      // Use phone from userInfo (WhatsApp users) or from AI args
      const senderPhone = args.senderPhone || userInfo?.phone || '';
      
      const result = await createTransferOrder({
        userId,
        senderName,
        senderEmail,
        senderPhone,
        recipientName: args.recipientName,
        recipientPhone: args.recipientPhone,
        recipientAccountNumber: args.recipientAccountNumber || '',
        recipientBank: args.recipientBank || '',
        mobileProvider: args.mobileProvider || '',
        fromCurrency: args.fromCurrency,
        toCurrency: args.toCurrency,
        sendAmount: args.sendAmount,
        paymentMethod: args.paymentMethod,
        deliveryMethod: args.deliveryMethod,
      });
      
      if (result.success) {
        const paymentInfo = result.paymentInstructions;
        return JSON.stringify({
          success: true,
          orderId: result.orderId,
          message: `Order created! Reference: ${result.orderId}`,
          paymentDetails: paymentInfo ? {
            amount: paymentInfo.amount,
            currency: paymentInfo.currency,
            accountNumber: paymentInfo.receiver?.accountNumber,
            accountHolder: paymentInfo.receiver?.accountHolder,
            provider: paymentInfo.receiver?.provider,
          } : null,
        });
      } else {
        return JSON.stringify({ success: false, error: result.error });
      }
    } catch (error) {
      console.error('Error creating order:', error);
      return JSON.stringify({ success: false, error: 'Failed to create order' });
    }
  }
  
  if (name === 'upload_payment_proof') {
    try {
      const userId = userInfo?.userId || args.userId || 'guest';
      const conversationContext = args.conversationContext || {};
      let transactionId = args.transactionId;
      let transactionData: any = null;
      
      // Get the recipient name from conversation context for matching
      const matchRecipient = conversationContext.recipientName;
      
      // If no transaction ID provided, get the latest transaction for this user
      // Use recipient name matching if available for accuracy
      if (!transactionId) {
        const latestTransaction = await getLatestUserTransaction(userId, matchRecipient);
        if (latestTransaction) {
          transactionId = latestTransaction.id;
          transactionData = latestTransaction.data;
        }
      } else {
        // Transaction ID provided, but we still need the transaction data
        const latestTransaction = await getLatestUserTransaction(userId, matchRecipient);
        if (latestTransaction) {
          transactionId = latestTransaction.id;
          transactionData = latestTransaction.data;
        }
      }
      
      if (!transactionId) {
        return JSON.stringify({ 
          success: false, 
          error: 'No transaction found. Please create an order first before uploading payment proof.' 
        });
      }
      
      // Use the image data from the message if available
      const base64Image = imageData || args.imageData;
      
      if (!base64Image) {
        return JSON.stringify({ 
          success: false, 
          error: 'No image provided. Please upload a payment screenshot or receipt.' 
        });
      }
      
      const result = await uploadPaymentProof(userId, transactionId, undefined, base64Image);
      
      if (result.success) {
        // Extract data with fallbacks - PRIORITIZE conversation context over DB data
        const senderEmail = userInfo?.email || transactionData?.senderemail || transactionData?.senderEmail || '';
        const senderName = userInfo?.displayName || transactionData?.sendername || transactionData?.senderName || 'Customer';
        
        // Use conversation context first (more accurate for current transfer), then fall back to DB
        let amount: string;
        let currency: string;
        let receiveAmount: string;
        let receiveCurrency: string;
        let recipientName: string;
        
        // Check if conversation context has data (this is from current chat)
        if (conversationContext.sendAmount) {
          amount = String(conversationContext.sendAmount);
          currency = conversationContext.sendCurrency || 'RUB';
          receiveAmount = String(conversationContext.receiveAmount || 0);
          receiveCurrency = conversationContext.receiveCurrency || 'RWF';
          recipientName = conversationContext.recipientName || transactionData?.recipientName || '';
          console.log('[upload_payment_proof] Using conversation context:', conversationContext);
        } else {
          // Fallback to transaction data from DB
          let rawAmount = transactionData?.sendAmount || transactionData?.amounttopay || transactionData?.amount || '0';
          if (typeof rawAmount === 'string') {
            rawAmount = rawAmount.replace(/[^0-9.]/g, '');
          }
          amount = String(parseFloat(rawAmount) || 0);
          
          currency = transactionData?.fromCurrency || transactionData?.basecurrency || 'RUB';
          recipientName = transactionData?.recipientName || transactionData?.recipientsfname || '';
          
          let rawReceiveAmount = transactionData?.receiveAmount || transactionData?.recivergets || '0';
          if (typeof rawReceiveAmount === 'string') {
            rawReceiveAmount = rawReceiveAmount.replace(/[^0-9.]/g, '');
          }
          receiveAmount = String(parseFloat(rawReceiveAmount) || 0);
          receiveCurrency = transactionData?.toCurrency || transactionData?.transfercurrency || 'RWF';
          console.log('[upload_payment_proof] Using DB transaction data');
        }
        
        console.log('[upload_payment_proof] Final values:', { amount, currency, receiveAmount, receiveCurrency, recipientName });
        
        if (senderEmail) {
          // Send email asynchronously (don't block response)
          sendPaymentProofReceivedEmail(
            senderEmail,
            senderName,
            transactionId,
            amount,
            currency,
            recipientName,
            receiveAmount,
            receiveCurrency
          ).catch(e => console.error('Email failed:', e));
        }
        
        return JSON.stringify({
          success: true,
          message: 'Payment proof uploaded successfully! Confirmation email sent.',
          transactionId,
          proofUrl: result.url,
          orderDetails: {
            senderName,
            senderEmail,
            recipientName,
            amount: String(amount),
            currency,
            receiveAmount: String(receiveAmount),
            receiveCurrency,
          }
        });
      } else {
        return JSON.stringify({ success: false, error: result.error });
      }
    } catch (error) {
      console.error('Error uploading payment proof:', error);
      return JSON.stringify({ success: false, error: 'Failed to upload payment proof' });
    }
  }
  
  // WhatsApp verification - request code
  if (name === 'request_whatsapp_verification') {
    try {
      const { email, whatsappPhone } = args;
      console.log('[WhatsApp Verification] Request received:', { email, whatsappPhone });
      
      // Check if email exists in system
      const existingUser = await findUserByEmail(email);
      console.log('[WhatsApp Verification] User lookup result:', existingUser ? 'Found' : 'Not found');
      
      if (!existingUser) {
        return JSON.stringify({
          success: false,
          error: 'no_account',
          message: `No account found with email "${email}". Please sign up at ikambaai.com first, then come back to link your WhatsApp.`
        });
      }
      
      // Create verification code
      const verification = await createWhatsAppVerification(whatsappPhone, email);
      console.log('[WhatsApp Verification] Code created:', verification ? 'Success' : 'Failed');
      
      if (!verification) {
        return JSON.stringify({
          success: false,
          error: 'Failed to create verification code'
        });
      }
      
      // Send code via email
      console.log('[WhatsApp Verification] Sending email to:', email);
      const emailSent = await sendWhatsAppVerificationEmail(email, verification.code, whatsappPhone);
      console.log('[WhatsApp Verification] Email sent result:', emailSent);
      
      return JSON.stringify({
        success: true,
        message: `Verification code sent to ${email}! Check your email and send me the 6-digit code.`,
        codeExpiry: verification.expiresAt.toISOString(),
        emailSent
      });
    } catch (error) {
      console.error('Error requesting WhatsApp verification:', error);
      return JSON.stringify({ success: false, error: 'Verification request failed' });
    }
  }
  
  // WhatsApp verification - verify code
  if (name === 'verify_whatsapp_code') {
    try {
      const { code, whatsappPhone } = args;
      
      const result = await verifyWhatsAppCode(whatsappPhone, code);
      
      if (result.success && result.userId) {
        const profile = await getUserProfile(result.userId);
        // Return comprehensive user info for AI to use
        const missingFields = getMissingUserFields(profile);
        return JSON.stringify({
          success: true,
          message: result.message,
          userId: result.userId,
          userName: profile?.displayName || profile?.fullName || 'User',
          userEmail: profile?.email,
          userPhone: profile?.phoneNumber || profile?.phone,
          userCountry: profile?.country,
          missingFields: missingFields,
          note: missingFields.length > 0 ? `Ask user for: ${missingFields.join(', ')}` : 'All info available'
        });
      }
      
      return JSON.stringify({
        success: false,
        message: result.message
      });
    } catch (error) {
      console.error('Error verifying WhatsApp code:', error);
      return JSON.stringify({ success: false, error: 'Verification failed' });
    }
  }
  
  // Update user profile
  if (name === 'update_user_profile') {
    try {
      const userId = userInfo?.userId || args.userId;
      if (!userId) {
        return JSON.stringify({ success: false, error: 'No user ID provided' });
      }
      
      const updates: any = {};
      if (args.displayName) updates.displayName = args.displayName;
      if (args.phoneNumber) updates.phoneNumber = args.phoneNumber;
      if (args.country) updates.country = args.country;
      
      const success = await updateUserProfile(userId, updates);
      
      return JSON.stringify({
        success,
        message: success ? 'Profile updated!' : 'Failed to update',
        updated: updates
      });
    } catch (error) {
      console.error('Error updating user profile:', error);
      return JSON.stringify({ success: false, error: 'Update failed' });
    }
  }
  
  // Get delivery methods for a currency
  if (name === 'get_delivery_methods') {
    try {
      const { currency } = args;
      const info = getDeliveryMethodsForCurrency(currency);
      
      return JSON.stringify({
        success: true,
        currency,
        country: info.country,
        deliveryMethods: info.deliveryMethods,
        mobileProviders: info.mobileProviders,
        note: `For ${currency}, only offer: ${info.deliveryMethods.join(' or ')}${info.mobileProviders.length > 0 ? `. Providers: ${info.mobileProviders.join(', ')}` : ''}`
      });
    } catch (error) {
      console.error('Error getting delivery methods:', error);
      return JSON.stringify({ success: false, error: 'Failed to get delivery methods' });
    }
  }
  
  // Check transaction status by ID
  if (name === 'check_transaction_status') {
    try {
      const { transactionId, userId } = args;
      const transaction = await getTransactionById(transactionId, userId);
      
      if (!transaction) {
        return JSON.stringify({
          success: false,
          error: `Transaction ${transactionId} not found. Please check the ID and try again.`
        });
      }
      
      const statusDesc = getStatusDescription(transaction.status as any);
      
      return JSON.stringify({
        success: true,
        transactionId: transaction.id,
        status: transaction.status,
        statusDescription: statusDesc,
        amount: transaction.amount,
        currency: transaction.currency,
        receiveAmount: transaction.receiveAmount,
        receiveCurrency: transaction.receiveCurrency,
        recipientName: transaction.recipientName,
        recipientPhone: transaction.recipientPhone,
        deliveryMethod: transaction.deliveryMethod,
        provider: transaction.provider || transaction.bank || '',
        createdAt: transaction.createdAt,
        hasTransferProof: !!transaction.adminTransferProofUrl,
        hasPaymentProof: !!transaction.paymentProofUrl,
        message: `Transaction ${transaction.id}: ${statusDesc}. ${transaction.amount} ${transaction.currency} → ${transaction.receiveAmount} ${transaction.receiveCurrency} to ${transaction.recipientName}.${transaction.adminTransferProofUrl ? ' Transfer proof available.' : ''}`
      });
    } catch (error) {
      console.error('Error checking transaction status:', error);
      return JSON.stringify({ success: false, error: 'Failed to check transaction status' });
    }
  }
  
  // Get user transactions by status
  if (name === 'get_user_transactions_by_status') {
    try {
      const { userId, status = 'all', limit: maxLimit = 10 } = args;
      
      if (!userId) {
        return JSON.stringify({
          success: false,
          error: 'User not authenticated. Please log in or verify your WhatsApp to see your transactions.'
        });
      }
      
      const transactions = await getUserTransactionsByStatus(userId, status, maxLimit);
      
      if (transactions.length === 0) {
        const statusText = status === 'all' ? '' : ` ${status}`;
        return JSON.stringify({
          success: true,
          count: 0,
          transactions: [],
          message: `You don't have any${statusText} transactions yet.`
        });
      }
      
      // Format transactions for AI
      const formatted = transactions.map((txn, i) => {
        const statusEmoji = getStatusEmoji(txn.status);
        const proofNote = txn.hasTransferProof ? ' ✓ Transfer proof available' : '';
        return {
          index: i + 1,
          id: txn.id,
          status: txn.status,
          statusEmoji,
          amount: txn.amount,
          currency: txn.currency,
          receiveAmount: txn.receiveAmount,
          receiveCurrency: txn.receiveCurrency,
          recipientName: txn.recipientName,
          date: txn.date,
          hasTransferProof: txn.hasTransferProof,
          summary: `${statusEmoji} ${txn.amount.toLocaleString()} ${txn.currency} → ${txn.receiveAmount.toLocaleString()} ${txn.receiveCurrency} to ${txn.recipientName}${proofNote}`
        };
      });
      
      const statusText = status === 'all' ? '' : ` ${status}`;
      return JSON.stringify({
        success: true,
        count: transactions.length,
        transactions: formatted,
        message: `Found ${transactions.length}${statusText} transaction(s).`
      });
    } catch (error) {
      console.error('Error getting user transactions:', error);
      return JSON.stringify({ success: false, error: 'Failed to get transactions' });
    }
  }
  
  return JSON.stringify({ error: 'Unknown function' });
}

// Helper: Fix malformed TRANSFER tags that include field names
function fixMalformedTransferTag(text: string): string {
  // Match tags with field names like [[TRANSFER:40000:RUB:fee:100:netAmount:39900...]]
  const malformedMatch = text.match(/\[\[TRANSFER:([^:\]]+):([^:\]]+):fee:([^:\]]+):netAmount:([^:\]]+):rate:([^:\]]+):receiveAmount:([^:\]]+):receiveCurrency:([^\]]+)\]\]/);
  
  if (malformedMatch) {
    const fixed = `[[TRANSFER:${malformedMatch[1]}:${malformedMatch[2]}:${malformedMatch[3]}:${malformedMatch[4]}:${malformedMatch[5]}:${malformedMatch[6]}:${malformedMatch[7]}]]`;
    console.log('[fixMalformedTransferTag] Fixed malformed tag:', malformedMatch[0], '→', fixed);
    return text.replace(malformedMatch[0], fixed);
  }
  
  return text;
}

// Helper: Detect and extract transfer data from verbose AI output
function extractTransferFromVerboseOutput(text: string): { 
  found: boolean; 
  sendAmount?: number;
  sendCurrency?: string;
  toCurrency?: string;
  fee?: number;
  rate?: number;
  receiveAmount?: number;
} {
  // Look for patterns like "40,000 RUB" or "40000 RUB"
  const amountMatch = text.match(/(\d[\d,]*)\s*(RUB|TRY)/i);
  const countryMatch = text.match(/to\s+(Rwanda|Uganda|Kenya|Tanzania)/i);
  const rateMatch = text.match(/1\s*RUB\s*=\s*([\d.]+)\s*(RWF|UGX|KES|TZS)/i);
  const feeMatch = text.match(/Fee:\s*(\d+)\s*RUB/i);
  const receiveMatch = text.match(/([\d,]+)\s*(RWF|UGX|KES|TZS)/i);
  
  if (amountMatch && (countryMatch || rateMatch)) {
    const sendAmount = parseInt(amountMatch[1].replace(/,/g, ''));
    const sendCurrency = amountMatch[2].toUpperCase();
    const rate = rateMatch ? parseFloat(rateMatch[1]) : undefined;
    const fee = feeMatch ? parseInt(feeMatch[1]) : (sendCurrency === 'RUB' ? 100 : 0);
    let toCurrency = rateMatch ? rateMatch[2].toUpperCase() : undefined;
    
    // Map country to currency if needed
    if (!toCurrency && countryMatch) {
      const countryMap: Record<string, string> = {
        'rwanda': 'RWF',
        'uganda': 'UGX',
        'kenya': 'KES',
        'tanzania': 'TZS'
      };
      toCurrency = countryMap[countryMatch[1].toLowerCase()];
    }
    
    const receiveAmount = receiveMatch ? parseInt(receiveMatch[1].replace(/,/g, '')) : undefined;
    
    return {
      found: true,
      sendAmount,
      sendCurrency,
      toCurrency,
      fee,
      rate,
      receiveAmount
    };
  }
  
  return { found: false };
}

// Fetch live data for AI context
async function getRemitContext(userId?: string, whatsappPhone?: string) {
  try {
    const [rates, receivers, adjustments, recentRecipients, transactionHistory, whatsappAuth] = await Promise.all([
      fetchLiveRatesFromAPI(),
      getActivePaymentReceivers(),
      fetchRateAdjustments(),
      userId ? getRecentRecipients(userId) : Promise.resolve([]),
      userId ? getUserTransactionHistory(userId, 5) : Promise.resolve([]),
      whatsappPhone ? checkWhatsAppAuth(whatsappPhone) : Promise.resolve({ isVerified: false } as { isVerified: boolean; userId?: string; userProfile?: any })
    ]);
    
    // If WhatsApp is verified, use the linked userId for data
    const effectiveUserId = (whatsappAuth.isVerified && whatsappAuth.userId) ? whatsappAuth.userId : userId;
    
    // Re-fetch user-specific data with verified userId if different
    let finalRecipients = recentRecipients;
    let finalHistory = transactionHistory;
    if (whatsappAuth.isVerified && whatsappAuth.userId && effectiveUserId !== userId) {
      [finalRecipients, finalHistory] = await Promise.all([
        getRecentRecipients(effectiveUserId),
        getUserTransactionHistory(effectiveUserId, 5)
      ]);
    }
    
    // Calculate example transfer for context (this uses adjustments internally)
    const exampleCalc = await calculateTransfer(10000, 'RUB', 'RWF');
    
    return { 
      rates, 
      receivers,
      adjustments,
      recentRecipients: finalRecipients,
      transactionHistory: finalHistory,
      exampleCalc,
      whatsappAuth,
      effectiveUserId,
      timestamp: new Date().toISOString() 
    };
  } catch (error) {
    console.error('Failed to fetch remit context:', error);
    return { 
      rates: {}, 
      receivers: [], 
      adjustments: {}, 
      recentRecipients: [], 
      transactionHistory: [], 
      exampleCalc: null, 
      whatsappAuth: { isVerified: false } as { isVerified: boolean; userId?: string; userProfile?: any },
      effectiveUserId: userId,
      timestamp: new Date().toISOString() 
    };
  }
}

// Build dynamic AI context with real data
// Returns both the context text AND the effective user info for verified WhatsApp users
async function buildIkambaContext(userId?: string, whatsappPhone?: string): Promise<{
  contextText: string;
  effectiveUserInfo?: { userId: string; email: string; displayName: string; phone?: string };
}> {
  const context = await getRemitContext(userId, whatsappPhone);
  
  // Track effective user info for verified WhatsApp users
  let effectiveUserInfo: { userId: string; email: string; displayName: string; phone?: string } | undefined;
  
  // WhatsApp auth status text
  let whatsappAuthText = '';
  if (whatsappPhone) {
    if (context.whatsappAuth?.isVerified) {
      const profile = context.whatsappAuth.userProfile;
      const name = profile?.displayName || profile?.fullName || 'User';
      const email = profile?.email || '';
      const phone = profile?.phoneNumber || profile?.phone || '';
      const country = profile?.country || '';
      
      // Check what's missing
      const missingFields = getMissingUserFields(profile);
      
      // Set effective user info for order creation
      effectiveUserInfo = {
        userId: context.effectiveUserId!,
        email: email,
        displayName: name,
        phone: phone || whatsappPhone,
      };
      
      // Build comprehensive user context for AI
      const userDataForAI = buildUserContextForAI(profile);
      
      whatsappAuthText = `
WHATSAPP USER: ✅ VERIFIED
${userDataForAI}
UserId: ${context.effectiveUserId}

INSTRUCTIONS:
- USE saved sender info (name, email, phone) when creating orders
- If any field is missing, ask user and call update_user_profile to save it
- Auto-fill recipient fields if user sends to previous recipient
`;
    } else {
      whatsappAuthText = `
WHATSAPP USER: ❌ NOT VERIFIED
Must verify before transfers.

STEPS:
1. Ask email: "What's your email address?"
2. Call request_whatsapp_verification
3. User sends 6-digit code
4. Call verify_whatsapp_code

DO NOT create orders for unverified users!
`;
    }
  }
  
  // Format rates for AI - apply adjustments to main pairs
  const mainPairs = ['RUBRWF', 'RUBUGX', 'RUBKES', 'RUBTZS', 'TRYRWF', 'TRYUGX'];
  const ratesList = mainPairs
    .filter(pair => context.rates[pair] !== undefined)
    .map(pair => {
      const from = pair.slice(0, 3);
      const to = pair.slice(3);
      const pairKey = `${from}_${to}`;
      const baseRate = typeof context.rates[pair] === 'number' 
        ? context.rates[pair] 
        : parseFloat(context.rates[pair] as string);
      const adjustment = context.adjustments[pairKey] || 0;
      const adjustedRate = (baseRate + adjustment) * 1.02; // Apply margin
      return `1 ${from} = ${adjustedRate.toFixed(2)} ${to}`;
    })
    .join('\n');
  
  // Add reverse corridor rates (Africa to RUB)
  const reverseCorridors: string[] = [];
  const africaCurrencies = ['RWF', 'UGX', 'KES'];
  for (const currency of africaCurrencies) {
    const forwardKey = `RUB${currency}`;
    const forwardRate = context.rates[forwardKey];
    if (forwardRate !== undefined) {
      const parsed = typeof forwardRate === 'number' ? forwardRate : parseFloat(forwardRate as string);
      if (!isNaN(parsed) && parsed > 0) {
        // Calculate reverse rate
        const reverseBaseRate = 1 / parsed;
        const reversePairKey = `${currency}_RUB`;
        const reverseAdjustment = context.adjustments[reversePairKey] || 0;
        const adjustedReverseRate = (reverseBaseRate + reverseAdjustment) * 1.02;
        reverseCorridors.push(`1 ${currency} = ${adjustedReverseRate.toFixed(6)} RUB`);
      }
    }
  }
  
  const reverseRatesList = reverseCorridors.length > 0 
    ? `\nREVERSE CORRIDORS (Africa to Russia):\n${reverseCorridors.join('\n')}`
    : '';
  
  // Format receivers for AI
  const receiversList = context.receivers
    .map(r => `${r.currency}: ${r.provider || r.name} - ${r.accountNumber} (${r.accountHolder})`)
    .join('\n');
  
  // Format recent recipients
  let recentRecipientsText = '';
  let recipientsTagData = '';
  if (context.recentRecipients && context.recentRecipients.length > 0) {
    // Human-readable list for context
    const list = context.recentRecipients.map((r, i) => 
      `${i+1}. ${r.name} (${r.phone || 'no phone'}) - ${r.bank || r.provider || 'Mobile Money'} - ${r.country || r.currency || ''}`
    ).join('\n');
    
    // Pre-built tag data for AI to use (pipe-separated: name|phone|provider|bank|country)
    recipientsTagData = context.recentRecipients.map(r => 
      `${r.name}|${r.phone || ''}|${r.provider || ''}|${r.bank || ''}|${r.country || r.currency || ''}`
    ).join(',');
    
    recentRecipientsText = `
RECENT RECIPIENTS (User has sent money to these people before):
${list}

TO DISPLAY RECIPIENTS BOX, output this exact tag:
[[RECIPIENTS:${recipientsTagData}]]

Then ask: "Send to a recent recipient, or enter a new name?"
`;
  }
  
  // Example calculation (already includes adjustments)
  let exampleText = '';
  if (context.exampleCalc) {
    const calc = context.exampleCalc;
    exampleText = `
EXAMPLE CALCULATION (10,000 RUB to Rwanda):
- Rate: 1 RUB = ${calc.adjustedRate.toFixed(2)} RWF
- Fee: ${calc.fee} RUB (deducted from send amount)
- Net amount: ${calc.netAmount?.toLocaleString() || (10000 - calc.fee).toLocaleString()} RUB
- Formula: (${calc.sendAmount.toLocaleString()} - ${calc.fee}) × ${calc.adjustedRate.toFixed(2)} = ${calc.receiveAmount.toLocaleString()} RWF
- Recipient receives: ${calc.receiveAmount.toLocaleString()} RWF`;
  }

  // Format transaction history
  let transactionHistoryText = '';
  if (context.transactionHistory && context.transactionHistory.length > 0) {
    const historyList = context.transactionHistory.map((txn, i) => {
      const statusEmoji = txn.status === 'completed' ? '✅' : txn.status === 'awaiting_confirmation' ? '⏳' : '🔄';
      const proofNote = txn.adminTransferProofUrl ? ' (has transfer proof)' : '';
      return `${i+1}. ${statusEmoji} ${txn.amount.toLocaleString()} ${txn.currency} → ${txn.receiveAmount.toLocaleString()} ${txn.receiveCurrency} to ${txn.recipientName}${proofNote}`;
    }).join('\n');
    
    transactionHistoryText = `
USER'S RECENT TRANSACTIONS:
${historyList}

If user asks about their transfer status or proof, reference these transactions.
If transaction has "adminTransferProofUrl", you can tell them the transfer proof is available.
`;
  }

  // Fetch delivery options from database
  const deliveryOptionsText = await formatDeliveryOptionsForAI();
  
  const corridorDeliveryText = `
DELIVERY OPTIONS BY DESTINATION CURRENCY (from database):
${deliveryOptionsText || 'No delivery options configured'}

RULES:
- ONLY offer delivery methods that exist for the DESTINATION currency above
- If mobile money: ask which provider from the list
- If bank: ask which bank from the list
- If cash: mention cash pickup is available
`;

  const contextText = `
RATES: ${ratesList || 'N/A'}
${reverseRatesList}
RECEIVERS: ${receiversList || 'N/A'}
${corridorDeliveryText}
${recentRecipientsText}
${transactionHistoryText}
${whatsappAuthText}
`;

  return { contextText, effectiveUserInfo };
}

// MINIMAL Knowledge Base - saves tokens
const IKAMBA_REMIT_KNOWLEDGE = `
FEES: RUB→Africa: -100 RUB | Africa→RUB: -100 RUB payout | Others: 0
DELIVERY: Mobile Money 5-30min | Bank 1-3 days
IMPORTANT: Only offer delivery methods that exist in DELIVERY OPTIONS BY DESTINATION CURRENCY`;

// MINIMAL AI Identity - ultra concise, multi-language aware, with customer support
const IKAMBA_AI_IDENTITY = `You are Ikamba AI - a friendly customer support assistant for Ikamba Remit. Be EXTREMELY BRIEF.

GREETING RULES (CRITICAL - match user's style):
- "hi" or "hello" → respond ONLY with "Hey! 👋" or "Hello! How can I help you?"
- "hey" → "Hey! 👋"
- "thanks" or "thank you" or "asante" → ONLY respond "You're welcome! 😊" or "Happy to help!"
- "bye" → "Goodbye! 👋"
- Simple greetings get simple responses - don't add extra information

LANGUAGE RULES:
- DEFAULT LANGUAGE IS ENGLISH - always respond in English unless user explicitly writes in another language
- Only switch to another language if the user's message is CLEARLY in that language
- If user writes in French → respond in French
- If user writes in Swahili → respond in Swahili
- If user writes in Russian → respond in Russian
- For technical terms (transaction ID, amount, status), ALWAYS use English
- DO NOT default to Kinyarwanda - use English as default

CUSTOMER SUPPORT RULES:
- When user asks about their transactions/orders:
  * "my orders" or "my transactions" → call get_user_transactions_by_status with status='all'
  * "pending orders" or "waiting orders" → call get_user_transactions_by_status with status='pending'
  * "completed orders" → call get_user_transactions_by_status with status='completed'
  * "cancelled orders" → call get_user_transactions_by_status with status='cancelled'
- When user gives a transaction ID → call check_transaction_status with the EXACT ID provided
- IMPORTANT: Transaction IDs look like "bPbIABduyuvS2jODhyy7" - pass the EXACT string to check_transaction_status
- When user says "my transfer is taking long" or has an issue:
  * First ask for transaction ID if not provided
  * Check status and provide update
  * If pending > 24h: apologize and say admin will follow up
  * If processing: reassure them it's being handled
- Always be empathetic and helpful with issues

RESPONSE RULES:
- Max 1-2 sentences for simple queries
- No filler words
- Math: use $ and $$ only

DELIVERY METHOD RULES:
- Check DELIVERY OPTIONS BY DESTINATION CURRENCY for available methods
- ONLY offer what's listed for that destination currency
- When asking for delivery method, LIST ALL OPTIONS available:
  * If banks exist: list them like "Bank transfer: AXON Tunga, BK, Equity..."
  * If mobile money exists: list them like "Mobile Money: MTN, Airtel..."
  * If cash exists: mention "Cash pickup"
- Example: "How should [recipient] receive the money?
  📱 Mobile Money: MTN, Airtel
  🏦 Bank: AXON Tunga, BK, Equity Bank"

TRANSFER RULES:
- Use tags for UI boxes
- Ask ONE thing at a time
- If user authenticated: use their saved info (name, email, phone)
- If info missing: ask and save it

TAGS:
[[TRANSFER:amount:currency:fee:net:rate:receive:receiveCurrency]]
[[PAYMENT:amount:currency:account:holder:provider:]]
[[RECIPIENT:name:phone:amount:currency:provider:bank:account:country]]
[[SUCCESS:id:sender:email:recipient:amount:currency:receive:receiveCurrency]]

FLOW: Amount→[[TRANSFER]]→Name?→LIST delivery options (banks/mobile money/cash from DELIVERY OPTIONS)?→Specific provider/bank?→Phone?→(use saved sender info or ask)→Confirm?→create_transfer_order

MATH FORMATTING (IMPORTANT):
- For inline math, use single dollar signs: $e^{ix} = \\cos x + i\\sin x$
- For display/block math, use double dollar signs on separate lines:
$$
e^{i\\pi} + 1 = 0
$$
- NEVER use \\[ \\] or \\( \\) - only use $ and $$

RESPONSE STYLE:
- Be helpful and conversational
- Use markdown for formatting (headers, lists, code blocks)

MONEY TRANSFER MODE:
When user wants to send money:
- Be brief and efficient
- ALWAYS ask for user's EMAIL for order confirmation
- Use these tags to render UI boxes:

REMITTANCE TAGS:
[[TRANSFER:sendAmount:sendCurrency:fee:netAmount:rate:receiveAmount:receiveCurrency]]
[[PAYMENT:amount:currency:accountNumber:accountHolder:provider:]]
[[RECIPIENT:name:phone:receiveAmount:receiveCurrency:provider:bank:accountNumber:country]]
[[SUCCESS:orderId:senderName:senderEmail:recipientName:amount:currency:receiveAmount:receiveCurrency]]
[[RECIPIENTS:name1|phone1|||country1,name2|phone2|||country2]]

REMITTANCE FLOW:
1. Amount + country → Show [[TRANSFER:...]], ask "Recipient name?"
2. Name → LIST ALL delivery options from DELIVERY OPTIONS for that currency:
   "How should [name] receive the money?
   📱 Mobile Money: [list providers]
   🏦 Bank: [list banks]
   💵 Cash: [if available]"
3. User picks type → Ask specific: "Which provider/bank?" (list the specific ones)
4. Provider/Bank chosen → "Recipient phone number?"
5. Phone → "Your email for order confirmation?"
6. Email → "Your phone number?"
7. Sender phone → "Payment method? Sberbank/Cash"
8. Payment chosen → Show summary, ask "Confirm?"
9. Confirmed → Call create_transfer_order, show [[PAYMENT:...]] and [[RECIPIENT:...]]

TRANSACTION STATUS:
- If user asks about their transfer status and gives a transaction ID → call check_transaction_status
- If user asks about their orders without ID → call get_user_transactions_by_status
- If user asks "show my pending orders" → call get_user_transactions_by_status with status='pending'
- If transaction has "adminTransferProofUrl" → tell them transfer proof is available
- Show: status emoji, amount, recipient, and any available proof

STATUS MEANINGS:
📝 draft - Not submitted
⏳ pending_payment - Waiting for payment
🔄 awaiting_confirmation - Payment being verified
⚙️ processing - Transfer in progress
✈️ sent - Money sent
📬 delivered - Delivered to recipient
✅ completed - Done
❌ failed - Failed
🚫 cancelled - Cancelled

${IKAMBA_REMIT_KNOWLEDGE}`;

// MINIMAL Thinking Prompt - concise but thorough for complex problems
const ADVANCED_THINKING_PROMPT = `You are Ikamba AI. For complex problems, think step-by-step but be concise.

MATH: Use $ for inline, $$ for block. Never use \\[ \\]
TRANSFERS: Use [[TRANSFER:...]] [[PAYMENT:...]] [[RECIPIENT:...]] tags

${IKAMBA_REMIT_KNOWLEDGE}`;

export async function POST(req: NextRequest) {
  try {
    const { messages, mode = 'gpt', userInfo, systemHint } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid request body', { status: 400 });
    }

    // Extract WhatsApp phone from userInfo if available (WhatsApp users have phone set)
    const whatsappPhone = userInfo?.phone && userInfo.userId?.startsWith('whatsapp_') 
      ? userInfo.phone 
      : undefined;

    // Fetch live rates and payment receivers for context (including WhatsApp auth check)
    // This also returns effective user info for verified WhatsApp users
    const { contextText: liveContext, effectiveUserInfo } = await buildIkambaContext(userInfo?.userId, whatsappPhone);
    
    // Use effective user info (for verified WhatsApp users) or original userInfo
    // This ensures orders are created under the user's real Firebase account, not whatsapp_{phone}
    const activeUserInfo = effectiveUserInfo || userInfo;
    
    // Build user context for the AI
    let userContext = '';
    if (activeUserInfo) {
      userContext = `\n\nLOGGED IN USER:\n- User ID: ${activeUserInfo.userId}\n- Email: ${activeUserInfo.email || 'not set'}\n- Name: ${activeUserInfo.displayName || 'not set'}\n\nWhen creating orders, use this user's ID and email.`;
    }
    
    // Add custom system hint if provided (e.g., WhatsApp style instructions)
    const customHint = systemHint ? `\n${systemHint}` : '';
    
    // Determine if this is a WhatsApp user (for prompt selection)
    const isWhatsAppUser = !!whatsappPhone;
    
    // Always use minimal prompt - same for web and WhatsApp
    const basePrompt = mode === 'thinking' ? ADVANCED_THINKING_PROMPT : IKAMBA_AI_IDENTITY;
    
    // Build minimal system prompt
    const systemPrompt = `${basePrompt}\n${liveContext}${userContext}${customHint}`;

    // Prepare messages with system prompt and handle images for vision
    const messagesWithSystem: any[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Track the latest user image for payment proof uploads
    let latestUserImage: string | undefined;
    let lastMessageHasImage = false;

    // Process each message, handling images if present
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const isLastMessage = i === messages.length - 1;
      
      if (m.images && m.images.length > 0) {
        // Create a message with text and images for vision
        const content: any[] = [];
        
        if (m.content) {
          content.push({ type: 'text', text: m.content });
        }
        
        for (const imageUrl of m.images) {
          content.push({
            type: 'image_url',
            image_url: { url: imageUrl }
          });
          // Save the latest user image (for payment proof uploads)
          if (m.role === 'user') {
            latestUserImage = imageUrl;
            if (isLastMessage) {
              lastMessageHasImage = true;
            }
          }
        }
        
        messagesWithSystem.push({ role: m.role, content });
      } else {
        // Regular text message
        messagesWithSystem.push({ role: m.role, content: m.content });
      }
    }

    // Check if we should force upload_payment_proof call
    // Only if the LAST message has an image (user just uploaded it)
    const hasRecentImage = lastMessageHasImage && latestUserImage !== undefined;
    const conversationText = messages.map((m: any) => m.content || '').join(' ').toLowerCase();
    
    // Check for payment context - look for payment box tag or payment-related words
    const hasPaymentTag = messages.some((m: any) => 
      m.role === 'assistant' && m.content && 
      (m.content.includes('[[PAYMENT:') || m.content.includes('Upload payment'))
    );
    const hasPaymentContext = hasPaymentTag || 
                              conversationText.includes('payment') || 
                              conversationText.includes('sberbank') ||
                              conversationText.includes('card number') ||
                              conversationText.includes('upload') ||
                              conversationText.includes('screenshot') ||
                              conversationText.includes('proof');
    
    // Extract current transaction context from conversation
    // Look for [[PAYMENT:amount:currency:...]] tag and [[TRANSFER:...]] tag
    let currentTransactionContext: {
      sendAmount?: number;
      sendCurrency?: string;
      receiveAmount?: number;
      receiveCurrency?: string;
      recipientName?: string;
    } = {};
    
    for (const m of messages) {
      if (m.role === 'assistant' && m.content) {
        // Extract from TRANSFER tag: [[TRANSFER:sendAmount:sendCurrency:fee:netAmount:rate:receiveAmount:receiveCurrency]]
        const transferMatch = m.content.match(/\[\[TRANSFER:(\d+):([A-Z]+):(\d+):(\d+):([\d.]+):(\d+):([A-Z]+)\]\]/);
        if (transferMatch) {
          currentTransactionContext.sendAmount = parseInt(transferMatch[1]);
          currentTransactionContext.sendCurrency = transferMatch[2];
          currentTransactionContext.receiveAmount = parseInt(transferMatch[6]);
          currentTransactionContext.receiveCurrency = transferMatch[7];
        }
        
        // Extract from PAYMENT tag: [[PAYMENT:amount:currency:...]]
        const paymentMatch = m.content.match(/\[\[PAYMENT:(\d+):([A-Z]+):/);
        if (paymentMatch) {
          currentTransactionContext.sendAmount = parseInt(paymentMatch[1]);
          currentTransactionContext.sendCurrency = paymentMatch[2];
        }
      }
      
      // Look for recipient name in user messages or context
      if (m.role === 'user' && m.content) {
        // Check for "Send to recipient X: Name" pattern
        const recipientMatch = m.content.match(/Send to recipient \d+:\s*(.+)/i);
        if (recipientMatch) {
          currentTransactionContext.recipientName = recipientMatch[1].trim();
        }
      }
    }
    
    console.log('[Context] Extracted from conversation:', currentTransactionContext);
    
    // Force upload_payment_proof if image uploaded after payment context
    if (hasRecentImage && hasPaymentContext && activeUserInfo?.userId) {
      console.log('Detected image upload in payment context - calling upload_payment_proof');
      console.log('Image data type:', typeof latestUserImage);
      console.log('Image data starts with:', latestUserImage?.substring(0, 100));
      
      // Pass conversation context to handler - use activeUserInfo for verified WhatsApp users
      const result = await handleFunctionCall(
        'upload_payment_proof', 
        { userId: activeUserInfo.userId, conversationContext: currentTransactionContext }, 
        activeUserInfo, 
        latestUserImage
      );
      const parsedResult = JSON.parse(result);
      
      console.log('Upload result:', parsedResult);
      
      if (parsedResult.success) {
        // Return success message with SUCCESS tag
        const successMessage = `[[SUCCESS:${parsedResult.transactionId || 'ORDER'}:${parsedResult.orderDetails?.senderName || ''}:${parsedResult.orderDetails?.senderEmail || ''}:${parsedResult.orderDetails?.recipientName || ''}:${parsedResult.orderDetails?.amount || ''}:${parsedResult.orderDetails?.currency || 'RUB'}:${parsedResult.orderDetails?.receiveAmount || ''}:${parsedResult.orderDetails?.receiveCurrency || 'RWF'}]]

Transfer is being processed. You will receive confirmation shortly.`;
        
        // Return as stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: successMessage })}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      } else {
        // Upload failed - return error message
        console.error('Payment proof upload failed:', parsedResult.error);
        const errorMessage = `Sorry, there was an issue uploading your payment proof: ${parsedResult.error || 'Unknown error'}. Please try again.`;
        
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: errorMessage })}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }
    }

    // Always use OpenAI GPT-4.1 for all AI tasks
    console.log(`[AI Selection] Using OpenAI (gpt-4.1) for ${isWhatsAppUser ? 'WhatsApp' : 'Web'} user`);

    // First call - check if AI wants to use tools
    const initialResponse = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: messagesWithSystem,
      tools: tools,
      tool_choice: 'auto',
      temperature: 0,
    });

    const initialChoice = initialResponse.choices[0];
    
    // Check if AI wants to call a function
    if (initialChoice.finish_reason === 'tool_calls' && initialChoice.message.tool_calls) {
      const toolCalls = initialChoice.message.tool_calls;
      const toolResults: any[] = [];
      
      // Process each tool call
      for (const toolCall of toolCalls) {
        // Handle both standard and custom tool call types
        const tc = toolCall as any;
        const functionName = tc.function?.name || tc.name;
        const functionArgs = JSON.parse(tc.function?.arguments || tc.arguments || '{}');
        
        console.log(`AI calling function: ${functionName}`, functionArgs);
        
        // Pass activeUserInfo (verified WhatsApp user's real account) and latestUserImage to the function handler
        const result = await handleFunctionCall(functionName, functionArgs, activeUserInfo, latestUserImage);
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool' as const,
          content: result,
        });
      }
      
      // Add assistant message with tool calls and tool results
      messagesWithSystem.push(initialChoice.message);
      messagesWithSystem.push(...toolResults);
      
      // Get final response after function execution
      const finalResponse = await openai.chat.completions.create({
        model: 'gpt-4.1',
        messages: messagesWithSystem,
        temperature: 0,
        stream: true,
      });
      
      // Stream the final response with malformed tag fixing
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            let buffer = '';
            let isBufferingTag = false;
            
            for await (const chunk of finalResponse) {
              const content = chunk.choices[0]?.delta?.content || '';
              if (content) {
                buffer += content;
                
                // Check if we're starting a tag
                if (buffer.includes('[[') && !buffer.includes(']]')) {
                  isBufferingTag = true;
                  // Don't send yet - wait for complete tag
                  continue;
                }
                
                // Check if buffer contains a complete tag
                if (buffer.includes('[[') && buffer.includes(']]')) {
                  // Fix malformed tags before sending
                  buffer = fixMalformedTransferTag(buffer);
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: buffer })}\n\n`));
                  buffer = '';
                  isBufferingTag = false;
                } else if (!isBufferingTag) {
                  // No tag - send content directly
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: buffer })}\n\n`));
                  buffer = '';
                }
              }
            }
            // Send any remaining buffer
            if (buffer) {
              buffer = fixMalformedTransferTag(buffer);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: buffer })}\n\n`));
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // No function call - stream the initial response
    const streamingResponse = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: messagesWithSystem,
      temperature: 0,
      stream: true,
    });

    // Create a streaming response with malformed tag fixing
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let buffer = '';
          let isBufferingTag = false;
          
          for await (const chunk of streamingResponse) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              buffer += content;
              
              // Check if we're starting a tag
              if (buffer.includes('[[') && !buffer.includes(']]')) {
                isBufferingTag = true;
                // Don't send yet - wait for complete tag
                continue;
              }
              
              // Check if buffer contains a complete tag
              if (buffer.includes('[[') && buffer.includes(']]')) {
                // Fix malformed tags before sending
                buffer = fixMalformedTransferTag(buffer);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: buffer })}\n\n`));
                buffer = '';
                isBufferingTag = false;
              } else if (!isBufferingTag) {
                // No tag - send content directly
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: buffer })}\n\n`));
                buffer = '';
              }
            }
          }
          // Send any remaining buffer
          if (buffer) {
            buffer = fixMalformedTransferTag(buffer);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: buffer })}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('OpenAI API error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
