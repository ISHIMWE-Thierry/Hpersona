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
  getRecentRecipients,
  sendPaymentProofReceivedEmail,
  CURRENCY_CONFIG,
  COUNTRY_CONFIG 
} from '@/lib/ikamba-remit';

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
async function getRemitContext(userId?: string) {
  try {
    const [rates, receivers, adjustments, recentRecipients] = await Promise.all([
      fetchLiveRatesFromAPI(),
      getActivePaymentReceivers(),
      fetchRateAdjustments(),
      userId ? getRecentRecipients(userId) : Promise.resolve([])
    ]);
    
    // Calculate example transfer for context (this uses adjustments internally)
    const exampleCalc = await calculateTransfer(10000, 'RUB', 'RWF');
    
    return { 
      rates, 
      receivers,
      adjustments,
      recentRecipients,
      exampleCalc,
      timestamp: new Date().toISOString() 
    };
  } catch (error) {
    console.error('Failed to fetch remit context:', error);
    return { rates: {}, receivers: [], adjustments: {}, recentRecipients: [], exampleCalc: null, timestamp: new Date().toISOString() };
  }
}

// Build dynamic AI context with real data
async function buildIkambaContext(userId?: string) {
  const context = await getRemitContext(userId);
  
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

  return `
LIVE EXCHANGE RATES (${context.timestamp}):
${ratesList || 'Rates temporarily unavailable'}

PAYMENT RECEIVERS (where users send money to Ikamba):
${receiversList || 'Receivers temporarily unavailable'}
${exampleText}
${recentRecipientsText}
`;
}

// Ikamba Remit Knowledge Base - Concise version
const IKAMBA_REMIT_KNOWLEDGE = `
CORRIDORS: RUB/TRY to RWF, UGX, KES, TZS, BIF, NGN, ETB, XOF, ZAR
           RWF to RUB (reverse corridor available)

FEE STRUCTURE:
- RUB → Africa: 100 RUB fixed fee (deducted from send amount before conversion)
- RWF → RUB: NO fixed fee, BUT 100 RUB payout fee (deducted from receive amount AFTER conversion)
- Other corridors: 0 fees

CALCULATION FORMULAS:
1. RUB → RWF (normal):
   Fee = 100 RUB
   Net = sendAmount - 100
   Receive = Net × rate
   Example: 10,000 RUB → RWF at rate 14.5
   Net = 10,000 - 100 = 9,900 RUB
   Receive = 9,900 × 14.5 = 143,550 RWF

2. RWF → RUB (reverse - DIFFERENT!):
   Fee = 0 RWF (no send fee)
   Raw = sendAmount × rate
   Payout Fee = 100 RUB (deducted from receive)
   Receive = Raw - 100 RUB
   Example: 100,000 RWF → RUB at rate 0.069 (1 RWF = 0.069 RUB)
   Raw = 100,000 × 0.069 = 6,900 RUB
   Receive = 6,900 - 100 = 6,800 RUB

DELIVERY: Mobile Money (5-30 min), Bank (1-3 days)
COUNTRIES: Rwanda +250 RWF MTN | Uganda +256 UGX MTN/Airtel | Kenya +254 KES M-Pesa | Tanzania +255 TZS M-Pesa | Russia +7 RUB Bank
`;

// General AI Identity with Remittance capability
const IKAMBA_AI_IDENTITY = `You are Ikamba AI - a helpful, knowledgeable assistant that can help with ANY topic.

CAPABILITIES:
- General knowledge, math, science, coding, writing, analysis
- Money transfers to Africa (Ikamba Remit service)

MATH FORMATTING (IMPORTANT):
- For inline math, use single dollar signs: $e^{ix} = \\cos x + i\\sin x$
- For display/block math, use double dollar signs on separate lines:
$$
e^{i\\pi} + 1 = 0
$$
- NEVER use \\[ \\] or \\( \\) - only use $ and $$
- Always escape backslashes in LaTeX: \\cos, \\sin, \\frac, \\pi, etc.

RESPONSE STYLE:
- Be helpful and conversational
- Use markdown for formatting (headers, lists, code blocks)
- For math derivations, show step by step with proper LaTeX

MONEY TRANSFER MODE:
When user wants to send money (mentions "send money", "transfer", amounts with currencies like RUB/USD to African countries):
- Switch to remittance assistant mode
- Be brief and efficient
- Use these tags to render UI boxes:

REMITTANCE TAGS:
[[TRANSFER:sendAmount:sendCurrency:fee:netAmount:rate:receiveAmount:receiveCurrency]]
[[PAYMENT:amount:currency:accountNumber:accountHolder:provider:]]
[[RECIPIENT:name:phone:receiveAmount:receiveCurrency:provider:bank:accountNumber:country]]
[[SUCCESS:orderId:senderName:senderEmail:recipientName:amount:currency:receiveAmount:receiveCurrency]]
[[RECIPIENTS:name1|phone1|||country1,name2|phone2|||country2]]

REMITTANCE FLOW (when in transfer mode):
1. Amount + country → Show [[TRANSFER:...]], ask "Recipient name?"
2. Name → "Mobile Money or Bank?"
3. Method → If Mobile: "Provider? MTN/Airtel/M-Pesa" | If Bank: "Bank name?"
4. Provider/Bank → "Recipient phone?"
5. Phone → "Your phone number for updates?"
6. Sender phone → "Payment method? Sberbank/Cash"
7. Payment chosen → Show summary, ask "Confirm?"
8. Confirmed → Call create_transfer_order, show [[PAYMENT:...]] and [[RECIPIENT:...]]

${IKAMBA_REMIT_KNOWLEDGE}`;

const ADVANCED_THINKING_PROMPT = `You are Ikamba AI - a highly capable assistant with deep reasoning abilities.

CAPABILITIES:
- Complex problem solving, math, science, coding, analysis
- Step-by-step reasoning for difficult problems
- Money transfers to Africa (Ikamba Remit)

MATH FORMATTING (CRITICAL):
- Inline math: $expression$ (e.g., $e^{ix} = \\cos x + i\\sin x$)
- Block math: 
$$
expression
$$
- NEVER use \\[ \\] or \\( \\) brackets
- Escape backslashes: \\cos, \\sin, \\frac, \\sum, \\int, \\pi, \\theta

RESPONSE APPROACH:
- Think through problems carefully
- Show your reasoning process
- Use proper markdown and LaTeX formatting
- Be thorough but clear

For MONEY TRANSFERS - use these tags:
[[TRANSFER:sendAmount:sendCurrency:fee:netAmount:rate:receiveAmount:receiveCurrency]]
[[PAYMENT:amount:currency:cardNumber:cardholderName:bankName:]]
[[RECIPIENT:name:phone:receiveAmount:receiveCurrency:provider:bank:accountNumber:country]]

${IKAMBA_REMIT_KNOWLEDGE}`;

export async function POST(req: NextRequest) {
  try {
    const { messages, mode = 'gpt', userInfo, systemHint } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid request body', { status: 400 });
    }

    // Fetch live rates and payment receivers for context
    const liveContext = await buildIkambaContext(userInfo?.userId);
    
    // Build user context for the AI
    let userContext = '';
    if (userInfo) {
      userContext = `\n\nLOGGED IN USER:\n- User ID: ${userInfo.userId}\n- Email: ${userInfo.email || 'not set'}\n- Name: ${userInfo.displayName || 'not set'}\n\nWhen creating orders, use this user's ID and email.`;
    }
    
    // Add custom system hint if provided (e.g., WhatsApp style instructions)
    const customHint = systemHint ? `\n\n--- SPECIAL INSTRUCTIONS ---\n${systemHint}\n---\n` : '';
    
    // Choose system prompt based on mode and inject live data
    const basePrompt = mode === 'thinking' 
      ? ADVANCED_THINKING_PROMPT
      : IKAMBA_AI_IDENTITY;
    
    const systemPrompt = `${basePrompt}

--- LIVE DATA ---
${liveContext}
---${userContext}${customHint}

NEVER DUPLICATE TEXT. Say each thing ONCE only.
When user confirms, call create_transfer_order function.`;

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
    if (hasRecentImage && hasPaymentContext && userInfo?.userId) {
      console.log('Detected image upload in payment context - calling upload_payment_proof');
      console.log('Image data type:', typeof latestUserImage);
      console.log('Image data starts with:', latestUserImage?.substring(0, 100));
      
      // Pass conversation context to handler
      const result = await handleFunctionCall(
        'upload_payment_proof', 
        { userId: userInfo.userId, conversationContext: currentTransactionContext }, 
        userInfo, 
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

    // First call - check if AI wants to use tools
    const initialResponse = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: messagesWithSystem,
      tools: tools,
      tool_choice: 'auto',
      temperature: 0, // Use 0 for strict format compliance
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
        
        // Pass userInfo and latestUserImage to the function handler
        const result = await handleFunctionCall(functionName, functionArgs, userInfo, latestUserImage);
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
        temperature: 0, // Use 0 for strict format compliance
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
    // We need to make a streaming call since initial was non-streaming
    const streamingResponse = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: messagesWithSystem,
      temperature: 0, // Use 0 for strict format compliance
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
