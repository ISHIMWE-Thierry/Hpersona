import { NextRequest, NextResponse } from 'next/server';

// Hardcode the verify token for reliability
const WEBHOOK_VERIFY_TOKEN = 'ikamba_verify_token';

// Get config at runtime to ensure env vars are loaded
function getConfig() {
  return {
    token: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://hpersona.vercel.app',
  };
}

// Store conversation context (in production, use Redis or database)
const conversationContexts = new Map<string, any[]>();

// Verify webhook (GET request from Meta)
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('WhatsApp webhook verification attempt:', { mode, token, challenge });

  // Check if this is a verification request
  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    console.log('WhatsApp webhook verified successfully');
    // Return challenge as plain text
    return new Response(challenge || '', { 
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  console.log('WhatsApp webhook verification failed:', { 
    expectedToken: WEBHOOK_VERIFY_TOKEN, 
    receivedToken: token 
  });
  return new NextResponse('Forbidden', { status: 403 });
}

// Handle incoming messages (POST request from Meta)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('WhatsApp webhook received:', JSON.stringify(body, null, 2));

    // Extract message data
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      // This might be a status update, not a message
      return NextResponse.json({ status: 'ok' });
    }

    const message = messages[0];
    const from = message.from; // User's phone number
    const messageType = message.type;
    const timestamp = message.timestamp;

    // Get or create conversation context
    let context = conversationContexts.get(from) || [];

    // Handle different message types
    let userMessage = '';
    let imageUrl = '';

    if (messageType === 'text') {
      userMessage = message.text?.body || '';
    } else if (messageType === 'image') {
      // Handle image (payment proof)
      const mediaId = message.image?.id;
      if (mediaId) {
        imageUrl = await getMediaUrl(mediaId);
        userMessage = message.image?.caption || 'Payment proof uploaded';
      }
    } else if (messageType === 'interactive') {
      // Handle button/list responses
      const interactive = message.interactive;
      if (interactive?.type === 'button_reply') {
        userMessage = interactive.button_reply?.title || '';
      } else if (interactive?.type === 'list_reply') {
        userMessage = interactive.list_reply?.title || '';
      }
    }

    if (!userMessage && !imageUrl) {
      return NextResponse.json({ status: 'ok' });
    }

    // Add user message to context
    context.push({
      role: 'user',
      content: userMessage,
      images: imageUrl ? [imageUrl] : undefined,
      timestamp: new Date(parseInt(timestamp) * 1000),
    });

    // Keep only last 20 messages for context
    if (context.length > 20) {
      context = context.slice(-20);
    }

    // Call Ikamba AI API
    const aiResponse = await callIkambaAI(context, from);

    // Add AI response to context
    context.push({
      role: 'assistant',
      content: aiResponse.text,
      timestamp: new Date(),
    });

    // Save context
    conversationContexts.set(from, context);

    // Send response back to WhatsApp
    await sendWhatsAppMessage(from, aiResponse);

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// Call our Ikamba AI API
async function callIkambaAI(messages: any[], userId: string): Promise<{
  text: string;
  paymentDetails?: any;
  recipientDetails?: any;
  transferSummary?: any;
}> {
  try {
    const config = getConfig();
    const baseUrl = config.appUrl;
    
    console.log('Calling Ikamba AI at:', `${baseUrl}/api/chat`);
    
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
          images: m.images,
        })),
        mode: 'gpt',
        userInfo: {
          userId: `whatsapp_${userId}`,
          email: null,
          displayName: `WhatsApp User ${userId.slice(-4)}`,
        },
      }),
    });

    if (!response.ok) {
      throw new Error('AI API error');
    }

    // Handle streaming response
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              fullText += parsed.content;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    // Parse special tags from response
    const result = parseAIResponse(fullText);
    return result;
  } catch (error) {
    console.error('Error calling Ikamba AI:', error);
    return {
      text: 'Sorry, I encountered an error. Please try again or contact support.',
    };
  }
}

// Parse AI response to extract special formatting
function parseAIResponse(text: string): {
  text: string;
  paymentDetails?: any;
  recipientDetails?: any;
  transferSummary?: any;
} {
  let cleanText = text;
  let paymentDetails: any = null;
  let recipientDetails: any = null;
  let transferSummary: any = null;

  // Extract [[TRANSFER:...]] tag
  const transferMatch = text.match(/\[\[TRANSFER:([^:]+):([^:]+):([^:]+):([^:]+):([^:]+):([^:]+):([^\]]+)\]\]/);
  if (transferMatch) {
    transferSummary = {
      sendAmount: transferMatch[1],
      sendCurrency: transferMatch[2],
      fee: transferMatch[3],
      netAmount: transferMatch[4],
      rate: transferMatch[5],
      receiveAmount: transferMatch[6],
      receiveCurrency: transferMatch[7],
    };
    cleanText = cleanText.replace(/\[\[TRANSFER:[^\]]+\]\]/g, '');
  }

  // Extract [[PAYMENT:...]] tag
  const paymentMatch = text.match(/\[\[PAYMENT:([^:]+):([^:]+):([^:]+):([^:]+):([^:]*):([^\]]*)\]\]/);
  if (paymentMatch) {
    paymentDetails = {
      amount: paymentMatch[1],
      currency: paymentMatch[2],
      accountNumber: paymentMatch[3],
      accountHolder: paymentMatch[4],
      provider: paymentMatch[5],
    };
    cleanText = cleanText.replace(/\[\[PAYMENT:[^\]]+\]\]/g, '');
  }

  // Extract [[RECIPIENT:...]] tag
  const recipientMatch = text.match(/\[\[RECIPIENT:([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^\]]*)\]\]/);
  if (recipientMatch) {
    recipientDetails = {
      name: recipientMatch[1],
      phone: recipientMatch[2],
      amount: recipientMatch[3],
      currency: recipientMatch[4],
      provider: recipientMatch[5],
    };
    cleanText = cleanText.replace(/\[\[RECIPIENT:[^\]]+\]\]/g, '');
  }

  // Clean up any remaining tags
  cleanText = cleanText
    .replace(/\[\[[A-Z_]+:[^\]]*\]\]/gi, '')
    .replace(/\]\]/g, '')
    .replace(/\[\[/g, '')
    .trim();

  return { text: cleanText, paymentDetails, recipientDetails, transferSummary };
}

// Get media URL from WhatsApp
async function getMediaUrl(mediaId: string): Promise<string> {
  try {
    const config = getConfig();
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
        },
      }
    );

    const data = await response.json();
    return data.url || '';
  } catch (error) {
    console.error('Error getting media URL:', error);
    return '';
  }
}

// Send message back to WhatsApp user
async function sendWhatsAppMessage(to: string, response: {
  text: string;
  paymentDetails?: any;
  recipientDetails?: any;
  transferSummary?: any;
}) {
  const { text, paymentDetails, recipientDetails, transferSummary } = response;

  // Format message for WhatsApp
  let formattedMessage = text;

  // Add transfer summary if present
  if (transferSummary) {
    formattedMessage = `💰 *Transfer Summary*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `Send: *${Number(transferSummary.sendAmount).toLocaleString()} ${transferSummary.sendCurrency}*\n` +
      `Fee: ${transferSummary.fee} ${transferSummary.sendCurrency}\n` +
      `Rate: 1 ${transferSummary.sendCurrency} = ${transferSummary.rate} ${transferSummary.receiveCurrency}\n` +
      `Receive: *${Number(transferSummary.receiveAmount).toLocaleString()} ${transferSummary.receiveCurrency}*\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      formattedMessage;
  }

  // Add payment details if present
  if (paymentDetails) {
    formattedMessage += `\n\n💳 *Payment Details*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `Amount: *${Number(paymentDetails.amount).toLocaleString()} ${paymentDetails.currency}*\n` +
      `Bank: ${paymentDetails.provider || 'Sberbank'}\n` +
      `Card: \`${paymentDetails.accountNumber}\`\n` +
      `Name: ${paymentDetails.accountHolder}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `_Copy card number and pay, then send screenshot_`;
  }

  // Add recipient details if present
  if (recipientDetails) {
    formattedMessage += `\n\n👤 *Recipient Details*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `Name: ${recipientDetails.name}\n` +
      `Phone: ${recipientDetails.phone}\n` +
      `Receives: *${Number(recipientDetails.amount).toLocaleString()} ${recipientDetails.currency}*\n` +
      `Via: ${recipientDetails.provider || 'Mobile Money'}\n` +
      `━━━━━━━━━━━━━━━━━━`;
  }

  // Send text message
  await sendTextMessage(to, formattedMessage);

  // If payment details present, also send interactive buttons
  if (paymentDetails) {
    await sendInteractiveMessage(to, {
      type: 'button',
      body: {
        text: 'After payment, tap "I Paid" to confirm or send your payment screenshot.',
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'paid', title: '✅ I Paid' } },
          { type: 'reply', reply: { id: 'cancel', title: '❌ Cancel' } },
        ],
      },
    });
  }
}

// Send text message via WhatsApp API
async function sendTextMessage(to: string, text: string) {
  const config = getConfig();
  
  console.log('Sending WhatsApp message to:', to);
  console.log('Using phone ID:', config.phoneId);
  console.log('Token exists:', !!config.token);
  
  try {
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${config.phoneId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'text',
          text: { 
            body: text,
            preview_url: false,
          },
        }),
      }
    );
    
    const result = await response.json();
    console.log('WhatsApp API response:', result);
    
    if (!response.ok) {
      console.error('WhatsApp API error:', result);
    }
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
  }
}

// Send interactive message (buttons/lists)
async function sendInteractiveMessage(to: string, interactive: any) {
  const config = getConfig();
  
  try {
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${config.phoneId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'interactive',
          interactive: interactive,
        }),
      }
    );
    
    const result = await response.json();
    console.log('WhatsApp interactive API response:', result);
  } catch (error) {
    console.error('Error sending interactive message:', error);
  }
}
