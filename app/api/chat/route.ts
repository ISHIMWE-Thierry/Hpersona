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
      description: 'Create a money transfer order when user confirms (says yes). Only call this after user explicitly confirms the transfer details.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'User ID (use "guest" if not logged in)' },
          senderName: { type: 'string', description: 'Sender full name' },
          senderEmail: { type: 'string', description: 'Sender email address' },
          senderPhone: { type: 'string', description: 'Sender phone number' },
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
        required: ['userId', 'senderName', 'recipientName', 'recipientPhone', 'fromCurrency', 'toCurrency', 'sendAmount', 'paymentMethod', 'deliveryMethod'],
      },
    },
  },
];

// Handle function calls from AI
async function handleFunctionCall(name: string, args: any): Promise<string> {
  if (name === 'create_transfer_order') {
    try {
      const result = await createTransferOrder({
        userId: args.userId || 'guest',
        senderName: args.senderName,
        senderEmail: args.senderEmail || '',
        senderPhone: args.senderPhone || '',
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
  return JSON.stringify({ error: 'Unknown function' });
}

// Fetch live data for AI context
async function getRemitContext() {
  try {
    const [rates, receivers, adjustments] = await Promise.all([
      fetchLiveRatesFromAPI(),
      getActivePaymentReceivers(),
      fetchRateAdjustments()
    ]);
    
    // Calculate example transfer for context (this uses adjustments internally)
    const exampleCalc = await calculateTransfer(10000, 'RUB', 'RWF');
    
    return { 
      rates, 
      receivers,
      adjustments,
      exampleCalc,
      timestamp: new Date().toISOString() 
    };
  } catch (error) {
    console.error('Failed to fetch remit context:', error);
    return { rates: {}, receivers: [], adjustments: {}, exampleCalc: null, timestamp: new Date().toISOString() };
  }
}

// Build dynamic AI context with real data
async function buildIkambaContext() {
  const context = await getRemitContext();
  
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
`;
}

// Ikamba Remit Knowledge Base - Concise version
const IKAMBA_REMIT_KNOWLEDGE = `
=== IKAMBA REMIT SERVICE ===

CORRIDORS: RUB/TRY to RWF, UGX, KES, TZS, BIF, NGN, ETB, XOF, ZAR
FEES: RUB transfers = 100 RUB fixed. Others = no fee.
DELIVERY: Mobile Money (5-30 min), Bank (1-3 days)

COUNTRIES:
- Rwanda: +250, RWF, MTN Mobile Money, Bank Transfer
- Uganda: +256, UGX, MTN/Airtel Money
- Kenya: +254, KES, M-Pesa
- Tanzania: +255, TZS, M-Pesa/Tigo/Airtel
`;

// Ikamba AI Identity - Strict step-by-step flow
const IKAMBA_AI_IDENTITY = `You are Ikamba AI - money transfer assistant.

STRICT RULES:
- NO emojis
- NO explanations
- NEVER mix text with numbers in same line
- Numbers on separate lines
- Ask permission before next step
- One question per message

=== STEP RESPONSES (COPY EXACT FORMAT) ===

STEP 1:
How much RUB to send?
Which country?

STEP 2 (show calculation on separate lines):
Amount: 4,000 RUB
Fee: 100 RUB
Net: 3,900 RUB
Rate: 17.25
Receive: 67,275 RWF

Receiver's full name?

STEP 3:
Got it.
Mobile Money or Bank?

STEP 4a:
Provider?
MTN / Airtel / M-Pesa

STEP 4b:
Which bank?

STEP 5:
Phone number?

STEP 5b:
Account number?

STEP 6:
How will you pay?
Sberbank / Cash

STEP 7:
Order summary:

Send: 4,000 RUB
Fee: 100 RUB
To: John Doe
Phone: +250788123456
Receives: 67,275 RWF
Via: MTN
Payment: Sberbank

Confirm? (yes/no)

STEP 8 (only after yes):
Pay to:
[account from LIVE DATA]

Amount: 4,000 RUB

Send payment screenshot.

STEP 9:
Received.
Reference: IKB123456
Processing: 5-30 minutes

=== FORMAT RULES ===
- Put labels and values on same line with colon
- Each data point on its own line
- Blank line before questions
- Never write "4000 RUB to Rwanda" - separate them
- Never explain calculations

${IKAMBA_REMIT_KNOWLEDGE}`;

const ADVANCED_THINKING_PROMPT = `You are Ikamba AI in Advanced Thinking Mode - developed by Ikamba AI.

PhD-level academic assistant for mathematics, physics, computer science, engineering, economics, and formal logic.

Rules:
1. Never use emojis
2. Show complete mathematical rigor
3. Use $ for inline math, $$ for block math

${IKAMBA_REMIT_KNOWLEDGE}

For money transfers: Follow the EXACT same step sequence as regular mode.
Formula: receiveAmount = (sendAmount - 100) × rate
One question per message. Never skip steps. Never show payment before confirmation.

LATEX FORMAT:
- Inline: $x^2 + y^2 = r^2$
- Block: $$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$`;

export async function POST(req: NextRequest) {
  try {
    const { messages, mode = 'gpt' } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid request body', { status: 400 });
    }

    // Fetch live rates and payment receivers for context
    const liveContext = await buildIkambaContext();
    
    // Choose system prompt based on mode and inject live data
    const basePrompt = mode === 'thinking' 
      ? ADVANCED_THINKING_PROMPT
      : IKAMBA_AI_IDENTITY;
    
    const systemPrompt = `${basePrompt}

--- LIVE DATA (use these actual rates, not examples) ---
${liveContext}
--- END LIVE DATA ---

IMPORTANT: When user says "yes" to confirm an order, call create_transfer_order function with all collected details.`;

    // Prepare messages with system prompt and handle images for vision
    const messagesWithSystem: any[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Process each message, handling images if present
    for (const m of messages) {
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
        }
        
        messagesWithSystem.push({ role: m.role, content });
      } else {
        // Regular text message
        messagesWithSystem.push({ role: m.role, content: m.content });
      }
    }

    // First call - check if AI wants to use tools
    const initialResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messagesWithSystem,
      tools: tools,
      tool_choice: 'auto',
      temperature: mode === 'thinking' ? 0.3 : 0.8,
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
        
        const result = await handleFunctionCall(functionName, functionArgs);
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
        model: 'gpt-4o',
        messages: messagesWithSystem,
        temperature: mode === 'thinking' ? 0.3 : 0.8,
        stream: true,
      });
      
      // Stream the final response
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of finalResponse) {
              const content = chunk.choices[0]?.delta?.content || '';
              if (content) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
              }
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
      model: 'gpt-4o',
      messages: messagesWithSystem,
      temperature: mode === 'thinking' ? 0.3 : 0.8,
      stream: true,
    });

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamingResponse) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
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
