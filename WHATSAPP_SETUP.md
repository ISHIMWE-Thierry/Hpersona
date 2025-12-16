# WhatsApp Integration Setup Guide

This guide will help you integrate Ikamba AI with WhatsApp so users can send money through WhatsApp messages.

## Prerequisites

1. A Meta (Facebook) Business Account
2. A phone number for WhatsApp Business (can be a virtual number)
3. Your Hpersona app deployed on Vercel

## Step 1: Create Meta App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Click "My Apps" → "Create App"
3. Select "Business" as the app type
4. Fill in your app details and create

## Step 2: Set Up WhatsApp Business

1. In your Meta app dashboard, click "Add Product"
2. Find "WhatsApp" and click "Set Up"
3. Go to "WhatsApp" → "Getting Started" in the left menu

## Step 3: Get Your Credentials

From the WhatsApp Getting Started page, you'll need:

### Temporary Access Token
- Copy the "Temporary access token" (valid for 24 hours)
- For production, create a permanent System User token

### Phone Number ID
- Under "From", you'll see a test phone number
- Copy the "Phone number ID" (not the phone number itself)

### Webhook Verify Token
- You create this yourself (any string you want)
- Example: `ikamba_verify_token`

## Step 4: Configure Environment Variables

Add these to your `.env.local` and Vercel environment variables:

```env
# WhatsApp Business API
WHATSAPP_ACCESS_TOKEN=your_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_VERIFY_TOKEN=ikamba_verify_token

# App URL (for webhook to call AI API)
NEXT_PUBLIC_APP_URL=https://hpersona.vercel.app
```

## Step 5: Configure Webhook in Meta

1. In your Meta app, go to "WhatsApp" → "Configuration"
2. Click "Edit" on the Webhook section
3. Enter:
   - **Callback URL**: `https://hpersona.vercel.app/api/whatsapp/webhook`
   - **Verify Token**: `ikamba_verify_token` (or whatever you set)
4. Click "Verify and Save"
5. Subscribe to webhook fields:
   - ✅ `messages`
   - ✅ `message_status` (optional, for delivery receipts)

## Step 6: Add Test Phone Number

1. Go to "WhatsApp" → "Getting Started"
2. Under "To", add your phone number for testing
3. You'll receive a verification code via WhatsApp

## Step 7: Test the Integration

1. Send a message to the WhatsApp Business number
2. Try: "I want to send 5000 RUB to Rwanda"
3. The AI should respond with transfer details

## Production Setup

For production, you need:

### 1. Permanent Access Token
- Go to "Business Settings" in Meta Business Suite
- Create a System User with "WhatsApp Business" permissions
- Generate a permanent token

### 2. Verified Business
- Submit your business for verification
- Required to send messages to users who haven't messaged you first

### 3. Phone Number Registration
- Register your own business phone number
- Or purchase a virtual number through Meta

### 4. Message Templates (Optional)
For sending proactive messages (like transaction updates):
- Create message templates in Meta Business Manager
- Templates must be approved before use

## WhatsApp Message Flow

```
User: "I want to send money to Kenya"
Bot: 💰 Transfer Summary
     Send: 10,000 RUB
     Receive: 145,000 KES
     
     Recipient name?

User: "John Doe"
Bot: Mobile Money or Bank?

User: "Mobile Money"
Bot: Provider? MTN/Airtel/M-Pesa

User: "M-Pesa"
Bot: Recipient phone number?

User: "+254712345678"
Bot: Your phone number for updates?

... and so on
```

## Features Supported

✅ Text messages
✅ Image uploads (payment proofs)
✅ Interactive buttons
✅ Rich formatting (bold, code blocks)
✅ Transfer summaries
✅ Payment details with copyable card numbers
✅ Recipient details

## Troubleshooting

### Webhook not verifying
- Check that `WHATSAPP_VERIFY_TOKEN` matches what you entered in Meta
- Ensure webhook URL is correct and accessible

### Messages not received
- Check webhook subscription is active
- Verify access token is valid
- Check Vercel function logs for errors

### Messages not sending
- Verify phone number is added to sandbox
- Check access token permissions
- Ensure phone number ID is correct

## Cost Estimation

Meta WhatsApp Cloud API pricing:
- **Business-initiated**: $0.0147 - $0.0802 per message
- **User-initiated**: First 1,000/month free, then $0.0049 - $0.0294

For most use cases, you'll primarily receive user-initiated messages (free tier covers most small businesses).

## Security Notes

1. Never expose your access token
2. Validate webhook requests using signature verification
3. Rate limit your API to prevent abuse
4. Store conversation context securely (consider Redis/database instead of in-memory)

## Support

For issues with:
- WhatsApp API: [Meta Developer Support](https://developers.facebook.com/support/)
- Ikamba Integration: Contact your development team
