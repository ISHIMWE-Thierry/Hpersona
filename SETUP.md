# ChatGPT Clone - Setup Instructions

## ⚡ Quick Setup (5 minutes)

Your app now has **Firebase Authentication** and **Firestore Database** integrated!

## 🔥 Firebase Configuration Required

### Step 1: Get Your Service Account Key

1. Go to **[Firebase Console](https://console.firebase.google.com/)**
2. Select your project: **ikamba-1c669**
3. Click the gear icon ⚙️ → **Project Settings**
4. Navigate to **Service Accounts** tab
5. Click **Generate New Private Key** button
6. Download the JSON file
7. **IMPORTANT**: Rename it to `firebase_config.json` and place it in your project root folder

Your Firebase config from the code you shared:
```javascript
apiKey: "AIzaSyDQaB0pa-264W5TrjykZ9nbWSvWOh9-smY"
authDomain: "ikamba-1c669.firebaseapp.com"
projectId: "ikamba-1c669"
```

### Step 2: Enable Required Services

#### Enable Firestore Database:
1. In Firebase Console → **Firestore Database**
2. Click **Create Database**
3. Choose **Start in production mode**
4. Select your preferred location
5. Click **Enable**

#### Enable Email Authentication:
1. In Firebase Console → **Authentication**
2. Click **Get Started**
3. Go to **Sign-in method** tab
4. Click on **Email/Password**
5. Toggle **Enable** switch
6. Click **Save**

### Step 3: Verify Installation

Check if Firebase is installed:
```bash
python3 -c "import firebase_admin; print('✓ Firebase installed!')"
```

If you see an error, install it:
```bash
python3 -m pip install firebase-admin --user
```

## 🚀 Run Your App

```bash
python3 -m streamlit run app.py
```

## ✨ What's Been Added

### 🔐 Authentication System
- ✅ **Sign Up**: Users can create accounts with email/password
- ✅ **Login**: Secure authentication with Firebase
- ✅ **Logout**: Clean session management
- ✅ **Session Persistence**: Users stay logged in

### 💾 Data Persistence
- ✅ **Save Conversations**: All chats automatically saved to Firestore
- ✅ **Load History**: Access previous conversations from sidebar
- ✅ **Auto-Save**: Every message automatically backed up
- ✅ **User-Specific**: Each user's data is private and isolated

### 💬 Enhanced Chat Features
- ✅ **Multiple Conversations**: Create unlimited chat threads
- ✅ **Conversation History**: See your last 5 conversations in sidebar
- ✅ **Continue Chats**: Click any conversation to continue where you left off
- ✅ **New Chat**: Start fresh conversations anytime

## 📊 Your Firestore Database Structure

When users sign up and chat, this structure is created automatically:

```
users/
  └── {user_id}/                    # Unique user ID from Firebase Auth
      ├── email: "user@example.com"
      ├── display_name: "John Doe"
      ├── created_at: 2025-12-13
      └── conversations/             # User's chat history
          └── {conversation_id}/     # Unique conversation ID
              ├── messages: [
              │   {
              │     role: "user",
              │     content: "Hello!"
              │   },
              │   {
              │     role: "assistant",
              │     content: "Hi! How can I help?"
              │   }
              ├── created_at: 2025-12-13 10:30:00
              └── updated_at: 2025-12-13 10:35:00
```

## 🎯 How to Use

### First Time Setup:
1. Run the app: `python3 -m streamlit run app.py`
2. Click **Sign Up** tab
3. Enter email, name, and password
4. Click **Sign Up** button
5. Start chatting!

### Returning Users:
1. Run the app
2. Enter email and password in **Login** tab
3. Click **Login**
4. Your previous conversations appear in sidebar!

## 🔒 Security Features

### Already Implemented:
- ✅ Passwords hashed by Firebase (never stored in plain text)
- ✅ User data isolated per account
- ✅ Secure Firebase Admin SDK
- ✅ Environment variables for sensitive keys
- ✅ `.gitignore` prevents committing secrets

### Files Protected (Don't Commit These):
```
firebase_config.json   # Your Firebase credentials
.env                   # Your OpenAI API key
```

## 🎨 UI Updates

The app maintains the ChatGPT dark theme with new auth features:
- Login/Signup page before chat access
- User email displayed in sidebar
- Logout button at bottom of sidebar
- Conversation history with clickable items
- Loading states during auth operations

## 🐛 Common Issues & Solutions

### ❌ "Could not load firebase_config.json"
**Solution**: Make sure you downloaded the service account key and saved it as `firebase_config.json` in the project root.

### ❌ "Module 'firebase_admin' not found"
**Solution**: Run `python3 -m pip install firebase-admin --user`

### ❌ "Email already exists"
**Solution**: The email is already registered. Use the Login tab instead.

### ❌ "Login failed"
**Solution**: 
- Check email/password are correct
- Ensure Email/Password auth is enabled in Firebase Console
- Verify firebase_config.json is valid

### ❌ "Permission denied" in Firestore
**Solution**: Your Firestore is in production mode. For testing, update rules:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 📱 Test Your Setup

1. **Create Account**:
   - Sign up with test email
   - Check Firebase Console → Authentication to see new user

2. **Send Messages**:
   - Type a message to GPT-4
   - Check Firebase Console → Firestore to see saved conversation

3. **Load History**:
   - Create multiple conversations
   - Logout and login again
   - Verify conversations appear in sidebar

## 🔧 Configuration Options

### Change AI Model (app.py, line ~335):
```python
ChatOpenAI(
    model_name="gpt-4o",     # Try: "gpt-3.5-turbo", "gpt-4-turbo"
    temperature=0.7,          # 0.0 = focused, 1.0 = creative
)
```

### Adjust Conversation History Count (app.py, line ~382):
```python
conversations = FirebaseManager.get_conversations(user_id, limit=10)  # Show more/less
```

## 📚 Files Modified/Created

### New Files:
- ✅ `firebase_manager.py` - Firebase operations
- ✅ `firebase_config.json` - Your credentials (download from Firebase)
- ✅ `FIREBASE_SETUP.md` - Detailed setup guide
- ✅ `.gitignore` - Protects sensitive files

### Modified Files:
- ✅ `app.py` - Added auth UI and Firestore integration
- ✅ `requirements.txt` - Added firebase-admin

## 🎉 You're All Set!

Once you complete the Firebase setup:
1. Your users can create accounts
2. All conversations are saved securely
3. Users can access their chat history anytime
4. Everything syncs with Firebase cloud

Need help? Check `FIREBASE_SETUP.md` for more details!
