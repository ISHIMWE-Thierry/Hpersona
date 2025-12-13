# Ikamba AI - ChatGPT-like Web App

An elegant, responsive AI chat application with elite UI design built with React, Firebase, and modern web technologies.

## Features

- 💬 **ChatGPT-inspired Interface**: Clean, modern chat UI with streaming responses
- 🎨 **Elite Design**: White & blue color scheme with premium animations
- 📱 **Fully Responsive**: Perfect on mobile, tablet, and desktop
- 🔐 **Firebase Authentication**: Email/password and Google sign-in
- 💾 **Conversation History**: Persistent chats saved in Firestore
- ⚡ **Real-time Updates**: Live conversation synchronization
- 🌙 **Modern Stack**: Vite + React + TypeScript + Tailwind CSS + Firebase

## Quick Start

1. **Firebase Setup** (Required):
   ```bash
   # Follow the complete guide in FIREBASE_SETUP.md
   ```
   
2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Start Development Server**:
   ```bash
   npm run dev
   ```

## ⚠️ Important: Firestore Index Required

After Firebase setup, you'll need to create a Firestore index:

### Quick Fix (When You See the Error):
1. Sign in to the app
2. Check browser console for the index creation link
3. Click the link - it opens Firebase Console with index pre-configured
4. Click "Create Index" button
5. Wait 1-2 minutes for build completion
6. Refresh your app

### Or Create Manually:
- Go to Firebase Console → Firestore → Indexes
- Create index with:
  - Collection: `conversations`
  - Fields: `userId` (Ascending), `updatedAt` (Descending)

**Why?** Firebase requires indexes for queries combining `where()` and `orderBy()` on different fields.

See `FIREBASE_SETUP.md` Step 6 for detailed instructions.

## Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run linting checks
```

## Project Structure

```
src/
├── components/
│   ├── auth/         # Authentication screens
│   ├── chat/         # Chat interface components
│   ├── layout/       # Layout components (Sidebar)
│   └── ui/           # Shadcn/ui components
├── contexts/         # React contexts (Auth)
├── lib/              # Firebase configuration
└── types/            # TypeScript type definitions
```

## Troubleshooting

### "Firebase index required" Error
- This is expected on first use
- Check browser console for auto-generated index creation link
- Click link → Create Index → Wait 1-2 minutes → Refresh
- See FIREBASE_SETUP.md Step 6 for details

### "Firebase: Error (auth/invalid-api-key)"
- Verify all Firebase config values in your project
- Check that Authentication is enabled in Firebase Console
- Ensure Firebase project is active

### Messages Not Appearing
- Verify Firestore index is created (see above)
- Check Firestore security rules allow user access
- Check browser console for specific errors

## Next Steps

- 🤖 **Add Real AI**: Replace demo responses with OpenAI, Anthropic, or Blink SDK AI
- 🎨 **Customize Design**: Edit `src/index.css` for your color scheme
- 🚀 **Deploy**: Use Firebase Hosting or your preferred platform
- ✨ **Enhance Features**: Add file uploads, voice input, conversation sharing

## Support

For detailed setup instructions, see `FIREBASE_SETUP.md`