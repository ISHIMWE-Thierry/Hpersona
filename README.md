# Hpersona - ChatGPT Clone

A professional ChatGPT clone built with Next.js 14, TypeScript, Firebase, and OpenAI API.

## ✨ Features

- 🚀 Next.js 14 with App Router
- 💬 Real-time streaming responses from GPT-4
- 🔐 Firebase Authentication (Email/Password)
- 💾 Firestore Database for conversation history
- 🎨 ChatGPT-style dark theme
- 📱 Fully responsive design
- ⚡ Server-Side Rendering & Edge Runtime
- 🎯 TypeScript for type safety

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

The `.env.local` file is already configured with your OpenAI API key and Firebase settings.

### 3. Enable Firebase Services

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **ikamba-1c669**
3. Enable **Firestore Database** (Start in production mode)
4. Enable **Authentication** → **Email/Password**

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001)

## 📁 Project Structure

```
app/
├── api/chat/route.ts      # OpenAI streaming API endpoint
├── layout.tsx              # Root layout with AuthProvider
├── page.tsx                # Main chat page
└── globals.css             # Global styles

components/
├── ChatInterface.tsx       # Main chat UI component
├── AuthModal.tsx           # Login/Signup modal
└── Sidebar.tsx             # Conversation history sidebar

contexts/
└── AuthContext.tsx         # Firebase authentication context

lib/
└── firebase.ts             # Firebase configuration
```

## 🎨 Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: Firebase Auth
- **Database**: Firestore
- **AI**: OpenAI GPT-4 API
- **Icons**: Lucide React

## 🚢 Deploy to Vercel

### 1. Push to GitHub

```bash
git add .
git commit -m "ChatGPT clone with Next.js"
git push origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com)
2. Import your repository
3. Add environment variable:
   - `OPENAI_API_KEY`: Your OpenAI API key
4. Deploy!

## 🔧 Configuration

### Change AI Model

Edit `app/api/chat/route.ts`:

```typescript
model: 'gpt-4o',        // Change to gpt-3.5-turbo, gpt-4-turbo, etc.
temperature: 0.7,        // Adjust creativity (0.0-1.0)
```

### Customize Colors

Edit `app/globals.css` or use Tailwind classes:

- Background: `#343541`
- Sidebar: `#202123`
- Accent: `#10a37f`
- Text: `#ececf1`

## 📝 Features

### Authentication
- Sign up with email/password
- Login with existing account
- Secure session management
- Logout functionality

### Chat
- Send messages to GPT-4
- Real-time streaming responses
- Message history
- Auto-scroll to latest message

### Conversations
- Save conversations to Firestore
- Load previous conversations
- Create new chats
- Conversation titles from first message

## 🐛 Troubleshooting

### OpenAI API Errors
- Verify `OPENAI_API_KEY` is set correctly
- Check you have API credits
- Ensure you have access to GPT-4

### Firebase Errors
- Enable Firestore Database in Firebase Console
- Enable Email/Password authentication
- Check Firebase configuration values

### Build Errors
- Run `npm install` to install all dependencies
- Delete `.next` folder and rebuild
- Check Node.js version (14+ required)

## 📄 License

MIT License - feel free to use for your projects!

## 🎉 Credits

Built with ❤️ using:
- [Next.js](https://nextjs.org/)
- [Firebase](https://firebase.google.com/)
- [OpenAI](https://openai.com/)
- [Tailwind CSS](https://tailwindcss.com/)
