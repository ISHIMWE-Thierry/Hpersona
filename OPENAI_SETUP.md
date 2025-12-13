# OpenAI Integration Setup Guide

This guide will help you integrate OpenAI API with your Ikamba AI app, enabling real AI responses, image analysis, and advanced reasoning capabilities.

---

## 📋 Prerequisites

1. **OpenAI API Key**: Get one from [OpenAI Platform](https://platform.openai.com/api-keys)
2. **Blink Edge Functions**: Used to securely call OpenAI API (API key never exposed to browser)
3. **Firebase Storage**: Already configured for image uploads

---

## 🚀 Quick Setup (3 Steps)

### Step 1: Add OpenAI API Key to Secrets

Your OpenAI API key must be stored securely in Blink's secret vault, **not** in `.env` files.

```bash
# In Blink chat, run:
"Add OPENAI_API_KEY secret"
```

Paste your OpenAI API key when prompted. It should start with `sk-proj-...` or `sk-...`.

⚠️ **IMPORTANT**: Never add `VITE_` or `NEXT_PUBLIC_` prefix to API keys! Those prefixes expose secrets to the browser.

---

### Step 2: Deploy the OpenAI Edge Function

The edge function (`functions/openai-chat/index.ts`) is already created. Deploy it:

**Using Blink Chat:**
```
"Deploy openai-chat edge function"
```

**Manual Deployment (if needed):**
Use the `blink_deploy_function` tool with:
- **function_name**: `openai-chat`
- **entrypoint_file_path**: `functions/openai-chat/index.ts`
- **verify_jwt**: `false` (allows unauthenticated access for testing)

After deployment, you'll receive a **Function URL** like:
```
https://openai-chat-[project-id].functions.blink.new
```

**✅ Copy this URL!** You'll need it in Step 3.

---

### Step 3: Configure Function URL in App

Open `src/App.tsx` and find line ~38:

```typescript
// Check for deployed OpenAI function
useEffect(() => {
  // This URL will be set after deploying the edge function
  // For now, leave it null to show setup instructions
  const url = null; // Replace with your function URL after deployment
  if (url) {
    openaiClient.setFunctionUrl(url);
    setFunctionUrl(url);
  }
}, []);
```

Replace `null` with your deployed function URL:

```typescript
const url = "https://openai-chat-[your-project].functions.blink.new";
```

**Save and deploy** the updated app.

---

## ✅ Verification

After setup, test the integration:

1. **Sign in** to Ikamba AI
2. **Select a model** from the dropdown (GPT-4o, GPT-4o Mini, O1 Preview, etc.)
3. **Send a message** - you should see real AI responses!
4. **Upload an image** (with GPT-4o or GPT-4o Mini) - test vision capabilities
5. **Try O1 Preview** - see advanced reasoning for complex problems

---

## 🎯 Available Models

| Model | Description | Features |
|-------|-------------|----------|
| **GPT-4o** | Most capable model | ✅ Vision, ✅ Voice, ✅ Fast |
| **GPT-4o Mini** | Fast and affordable | ✅ Vision, ⚡ Fastest, 💰 Cheap |
| **O1 Preview** | Advanced reasoning | 🧠 Complex problems, ❌ No vision |
| **O1 Mini** | Fast reasoning | 🧠 Coding & math, ⚡ Faster |

### Model Selection Tips:

- **General chat**: GPT-4o Mini (fastest, cheapest)
- **Image analysis**: GPT-4o or GPT-4o Mini
- **Complex reasoning**: O1 Preview (math, coding, logic)
- **Quick code**: O1 Mini

---

## 📸 Image Upload Features

### Supported Formats
- PNG, JPG, JPEG, WebP, GIF
- Max size: 10MB per image
- Multiple images per message

### How to Use

1. **Select a vision-capable model** (GPT-4o or GPT-4o Mini)
2. **Click the paperclip icon** (📎) in the input area
3. **Choose images** from your device
4. **Add optional text** or just send images
5. **AI analyzes** and responds!

### Example Prompts with Images:
- "What's in this image?"
- "Describe this photo in detail"
- "Extract text from this screenshot"
- "What breed is this dog?"
- "Solve this math problem" (upload photo of problem)

---

## 🧠 Reasoning Models (O1)

### What are O1 Models?

OpenAI's O1 models use **extended thinking** before responding. They:
- Show their reasoning process
- Solve complex problems step-by-step
- Excel at math, coding, and logic

### When to Use O1:

✅ **Use O1 for:**
- Complex math problems
- Advanced coding challenges
- Multi-step logic puzzles
- Scientific reasoning
- Strategy & planning

❌ **Don't use O1 for:**
- Simple questions (slower & more expensive)
- Image analysis (O1 doesn't support vision)
- Quick responses (use GPT-4o Mini instead)

### Example O1 Prompts:
- "Write a sorting algorithm with O(n log n) complexity and explain why"
- "Solve this calculus problem step by step: ∫(x² + 3x)dx"
- "Design a database schema for a multi-tenant SaaS app"
- "Find the bug in this code: [paste code]"

---

## 🔧 Troubleshooting

### Issue: "OpenAI function not deployed"

**Solution:**
1. Check console for deployment instructions
2. Run `blink_deploy_function` with correct parameters
3. Copy the returned URL
4. Update `src/App.tsx` line ~38

---

### Issue: "Failed to get AI response"

**Possible causes:**
1. **API key invalid**: Check your OpenAI dashboard
2. **No credits**: Add payment method to OpenAI account
3. **Rate limit**: Wait a few seconds and retry
4. **Model not available**: Try switching models

**Check OpenAI usage:**
Visit [OpenAI Usage Dashboard](https://platform.openai.com/usage)

---

### Issue: Image upload fails

**Possible causes:**
1. **File too large**: Reduce image size (max 10MB)
2. **Wrong model**: Switch to GPT-4o or GPT-4o Mini
3. **Firebase Storage**: Check Firebase console for errors

**Solution:**
- Compress images before uploading
- Ensure Firebase Storage is enabled
- Check browser console for detailed errors

---

### Issue: Images not showing in messages

**Check:**
1. Firebase Storage rules allow reads
2. Image URLs are accessible (open in new tab)
3. CORS is properly configured

**Firebase Storage Rules:**
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /chat-images/{userId}/{imageId} {
      allow read: if true; // Public read
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 💰 Cost Optimization

### Model Pricing (as of 2024):

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| GPT-4o | $2.50 | $10.00 |
| GPT-4o Mini | $0.15 | $0.60 |
| O1 Preview | $15.00 | $60.00 |
| O1 Mini | $3.00 | $12.00 |

### Cost-Saving Tips:

1. **Use GPT-4o Mini** for general chat (16x cheaper than GPT-4o)
2. **Reserve O1** for complex problems only
3. **Set max_tokens** to limit response length
4. **Implement rate limiting** to prevent abuse
5. **Cache common responses** to avoid repeated API calls

---

## 🔒 Security Best Practices

### ✅ DO:
- Store API keys in Blink secrets (never in code)
- Use edge functions for API calls (server-side only)
- Implement rate limiting per user
- Set reasonable max_tokens limits
- Monitor usage in OpenAI dashboard

### ❌ DON'T:
- Never expose API keys with `VITE_` or `NEXT_PUBLIC_` prefix
- Don't store API keys in `.env` files that get committed
- Don't allow unlimited API calls (implement quotas)
- Don't skip input validation (prevent prompt injection)

---

## 📊 Monitoring & Analytics

### Track Usage:

1. **OpenAI Dashboard**: [platform.openai.com/usage](https://platform.openai.com/usage)
   - View costs per model
   - Set spending limits
   - Monitor rate limits

2. **Blink Function Logs**:
   ```
   Use blink_function_logs tool
   ```
   - Check for errors
   - Monitor response times
   - Debug API issues

3. **Firebase Analytics**:
   - Track conversation counts
   - Monitor user engagement
   - Measure feature usage

---

## 🚨 Rate Limits

OpenAI enforces rate limits based on your tier:

| Tier | Requests/min | Tokens/min |
|------|--------------|------------|
| Free | 3 | 200,000 |
| Tier 1 | 3,500 | 200,000 |
| Tier 2 | 5,000 | 2,000,000 |
| Tier 3+ | Higher | Higher |

**If you hit rate limits:**
1. Implement request queuing
2. Add exponential backoff retry logic
3. Upgrade your OpenAI tier
4. Optimize prompts to use fewer tokens

---

## 📚 Additional Resources

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [OpenAI Cookbook](https://cookbook.openai.com/)
- [Model Pricing](https://openai.com/api/pricing/)
- [Firebase Storage Guide](https://firebase.google.com/docs/storage)
- [Blink Edge Functions](https://blink.new/docs/edge-functions)

---

## 💬 Support

Need help? Check:
1. **Console errors** - Look for detailed error messages
2. **Function logs** - Use `blink_function_logs` tool
3. **OpenAI status** - [status.openai.com](https://status.openai.com)
4. **Blink Discord** - Ask the community
5. **Create ticket** - Click user icon → Help → Create ticket

---

## 🎉 Next Steps

Once OpenAI is working:

1. **Customize prompts** - Add system messages in `openai.ts`
2. **Add conversation memory** - Implement context window management
3. **Enable voice input** - Use Web Speech API
4. **Add file attachments** - PDF, DOCX analysis
5. **Implement RAG** - Connect to your knowledge base
6. **Multi-language support** - Auto-detect and translate

Enjoy building with Ikamba AI! 🚀
