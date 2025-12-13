# Firebase Setup Guide for Ikamba AI

This guide will help you set up Firebase for the Ikamba AI chat application.

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add Project" or "Create a project"
3. Enter project name: `ikamba-ai` (or your preferred name)
4. (Optional) Enable Google Analytics
5. Click "Create Project"

## Step 2: Register Your Web App

1. In your Firebase project, click the **Web icon** (</>) to register a web app
2. Enter app nickname: `Ikamba AI Web`
3. Check "Also set up Firebase Hosting" (optional)
4. Click "Register app"
5. **Save the configuration** - you'll need these values

## Step 3: Enable Authentication

1. In Firebase Console, go to **Authentication** → **Get Started**
2. Click on **Sign-in method** tab
3. Enable the following providers:
   - **Email/Password**: Click → Enable → Save
   - **Google**: Click → Enable → Add your email as test user → Save

## Step 4: Create Firestore Database

1. In Firebase Console, go to **Firestore Database** → **Create database**
2. Choose **Start in production mode** (we'll set up rules next)
3. Select your preferred location (closest to your users)
4. Click "Enable"

## Step 5: Set Up Firestore Security Rules

1. In Firestore Database, go to **Rules** tab
2. Replace the rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Conversations collection
    match /conversations/{conversationId} {
      // Users can only read/write their own conversations
      allow read, write: if request.auth != null 
        && request.auth.uid == resource.data.userId;
      
      // Allow create if the userId matches the authenticated user
      allow create: if request.auth != null 
        && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

3. Click **Publish**

## Step 6: Create Firestore Index (REQUIRED)

The app requires a composite index for efficient conversation queries. You have two options:

### Option A: Automatic Index Creation (Recommended)

1. Start the app and sign in
2. When you see the "Firebase index required" error, check the browser console
3. Click the auto-generated link in the console that looks like:
   ```
   https://console.firebase.google.com/v1/r/project/YOUR-PROJECT/firestore/indexes?create_composite=...
   ```
4. This will open Firebase Console with the index pre-configured
5. Click **Create Index** button
6. Wait 1-2 minutes for the index to build
7. Refresh your app

### Option B: Manual Index Creation

1. Go to Firebase Console → **Firestore Database** → **Indexes** tab
2. Click **Create Index**
3. Configure the index:
   - **Collection ID**: `conversations`
   - **Fields to index**:
     - Field: `userId`, Order: Ascending
     - Field: `updatedAt`, Order: Descending
   - **Query scope**: Collection
4. Click **Create**
5. Wait 1-2 minutes for the index to build

**Why is this needed?** Firebase requires a composite index when you query with both `where()` and `orderBy()` on different fields. This index allows the app to efficiently fetch your conversations sorted by most recent first.

## Step 7: Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and fill in your Firebase configuration:
   - Go to Firebase Console → Project Settings → General
   - Scroll down to "Your apps" section
   - Copy each value and paste into `.env`

Example `.env` file:
```
VITE_FIREBASE_API_KEY=AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567
VITE_FIREBASE_AUTH_DOMAIN=ikamba-ai.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ikamba-ai
VITE_FIREBASE_STORAGE_BUCKET=ikamba-ai.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123def456ghi789
```

## Step 8: Test Your Setup

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open the app in your browser
3. Try signing up with email/password
4. Create a new chat and send a message
5. Check Firestore Database to see the data

## Firestore Data Structure

The app uses the following structure:

```
conversations/
  └── {conversationId}
      ├── id: string
      ├── title: string
      ├── userId: string (Firebase Auth UID)
      ├── createdAt: timestamp
      ├── updatedAt: timestamp
      └── messages: array
          ├── id: string
          ├── role: "user" | "assistant"
          ├── content: string
          └── timestamp: date
```

## Optional: Integrate Real AI

The app currently uses demo responses. To integrate real AI:

### Option 1: OpenAI API
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Only for testing
});

const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: userMessage }],
  stream: true
});
```

### Option 2: Blink SDK AI
```typescript
import { createClient } from '@blinkdotnew/sdk';

const blink = createClient({ 
  projectId: 'your-project-id',
  authRequired: false 
});

await blink.ai.streamText(
  { prompt: userMessage },
  (chunk) => {
    // Handle streaming response
    setStreamingText(prev => prev + chunk);
  }
);
```

### Option 3: Firebase Functions + OpenAI (Secure)
Create a Firebase Function that calls OpenAI API server-side to keep your API key secure.

## Troubleshooting

**Error: "Firebase: Error (auth/popup-blocked)"**
- Allow popups in your browser for Google Sign-In

**Error: "Missing or insufficient permissions"**
- Check Firestore security rules
- Make sure user is authenticated

**Messages not showing**
- Check browser console for errors
- Verify Firestore data structure
- Check that userId matches authenticated user

**App not loading**
- Verify all environment variables are set correctly
- Check that Firebase project is active
- Clear browser cache and reload

## Support

For issues or questions:
- Check Firebase Console → Functions/Firestore logs
- Review browser console for errors
- Ensure all Firebase services are enabled

---

**Next Steps:**
- Deploy to production using Firebase Hosting
- Add real AI integration (OpenAI, Anthropic, etc.)
- Implement message editing and deletion
- Add file upload capabilities
- Create conversation sharing feature
