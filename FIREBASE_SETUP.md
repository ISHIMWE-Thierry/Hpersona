# Firebase Setup Guide

## Step 1: Get Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **ikamba-1c669**
3. Click on the ⚙️ gear icon (Project Settings)
4. Go to the **Service Accounts** tab
5. Click **Generate New Private Key**
6. Download the JSON file
7. Save it as `firebase_config.json` in your project root directory

## Step 2: Enable Firebase Services

### Enable Firestore
1. In Firebase Console, go to **Firestore Database**
2. Click **Create Database**
3. Choose **Start in production mode**
4. Select your location and click **Enable**

### Enable Authentication
1. In Firebase Console, go to **Authentication**
2. Click **Get Started**
3. Go to **Sign-in method** tab
4. Enable **Email/Password** authentication
5. Click **Save**

## Step 3: Install Dependencies

Run this command to install Firebase Admin SDK:

```bash
python3 -m pip install firebase-admin --user
```

## Step 4: Update firebase_config.json

Replace the placeholder `firebase_config.json` with your downloaded service account key file.

The file should look like this:
```json
{
  "type": "service_account",
  "project_id": "ikamba-1c669",
  "private_key_id": "your-actual-key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...your key...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@ikamba-1c669.iam.gserviceaccount.com",
  "client_id": "your-client-id",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "your-cert-url"
}
```

## Step 5: Run the App

```bash
python3 -m streamlit run app.py
```

## Features Implemented

### 🔐 Authentication
- ✅ User signup with email/password
- ✅ User login
- ✅ Logout functionality
- ✅ Session management

### 💾 Data Storage
- ✅ Save conversations to Firestore
- ✅ Load conversation history
- ✅ Auto-save on every message
- ✅ User-specific data isolation

### 💬 Chat Features
- ✅ Multiple conversation threads
- ✅ Conversation history in sidebar
- ✅ Load previous conversations
- ✅ Create new chats
- ✅ Auto-save conversations

## Firestore Data Structure

```
users/
  └── {user_id}/
      ├── email: string
      ├── display_name: string
      ├── created_at: timestamp
      └── conversations/
          └── {conversation_id}/
              ├── messages: array
              ├── created_at: timestamp
              └── updated_at: timestamp
```

## Security Notes

⚠️ **IMPORTANT**: 
- Never commit `firebase_config.json` to version control
- Add it to `.gitignore`
- Keep your service account key secure
- In production, use Firebase Authentication REST API for login (current implementation is simplified)

## Troubleshooting

### Error: "Could not load firebase_config.json"
- Make sure the file exists in the project root
- Check that it's a valid JSON file
- Verify the file path is correct

### Error: "Permission denied"
- Check Firestore security rules
- Make sure your service account has proper permissions
- Verify the project ID matches your Firebase project

### Authentication Issues
- Ensure Email/Password auth is enabled in Firebase Console
- Check that passwords meet minimum requirements (6+ characters)
- Verify user email doesn't already exist when signing up

## Next Steps

1. Set up Firestore security rules for production
2. Implement password reset functionality
3. Add email verification
4. Implement proper Firebase Auth REST API for login
5. Add conversation search/filter
6. Add ability to delete conversations
7. Implement conversation sharing
