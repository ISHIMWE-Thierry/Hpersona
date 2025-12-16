# Ikamba AI - Deployment Guide

## 🚀 Quick Deploy to Vercel (Recommended)

### Option 1: Deploy via Vercel Dashboard

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Prepare for deployment"
   git push origin main
   ```

2. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub repository
   - Vercel will auto-detect Next.js

3. **Configure Environment Variables**
   
   In Vercel Dashboard → Project Settings → Environment Variables, add:

   | Variable | Value |
   |----------|-------|
   | `OPENAI_API_KEY` | Your OpenAI API key |
   | `NEXT_PUBLIC_FIREBASE_API_KEY` | Your Firebase API key |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | your-project.firebaseapp.com |
   | `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | https://your-project-default-rtdb.firebaseio.com |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | your-project-id |
   | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | your-project.appspot.com |
   | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Your sender ID |
   | `NEXT_PUBLIC_FIREBASE_APP_ID` | Your app ID |
   | `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | G-XXXXXXXXXX |

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Your app is live! 🎉

### Option 2: Deploy via CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy (follow prompts)
vercel

# Deploy to production
vercel --prod
```

---

## 🔒 Security Checklist

- [ ] Never commit `.env.local` to version control
- [ ] Use `.env.example` as a template
- [ ] Rotate API keys periodically
- [ ] Enable Firebase security rules
- [ ] Set up Firebase App Check (optional)

---

## 🌐 Custom Domain

1. Go to Vercel Dashboard → Project → Settings → Domains
2. Add your domain (e.g., `ai.ikamba.com`)
3. Update DNS records as instructed
4. SSL certificate is automatic

---

## 📊 Firebase Configuration

### Update Firebase Auth Domains

1. Go to Firebase Console → Authentication → Settings
2. Add your Vercel domain to "Authorized domains":
   - `your-app.vercel.app`
   - `your-custom-domain.com`

### Update Firebase Storage CORS (if needed)

Create `cors.json`:
```json
[
  {
    "origin": ["https://your-app.vercel.app", "https://your-domain.com"],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "maxAgeSeconds": 3600
  }
]
```

Apply with:
```bash
gsutil cors set cors.json gs://your-project.appspot.com
```

---

## 🔧 Troubleshooting

### Build Fails
- Check environment variables are set
- Run `npm run build` locally first
- Check for TypeScript errors: `npx tsc --noEmit`

### API Routes Not Working
- Verify `OPENAI_API_KEY` is set in Vercel
- Check function logs in Vercel dashboard
- Ensure API route files are in `app/api/`

### Authentication Issues
- Verify Firebase domain is authorized
- Check browser console for errors
- Ensure all Firebase env vars are set

---

## 📦 Build Information

- **Framework**: Next.js 16
- **Node Version**: 18.x or 20.x
- **Build Command**: `npm run build`
- **Output Directory**: `.next`

---

## 🔄 Continuous Deployment

Vercel automatically deploys:
- **Production**: On push to `main` branch
- **Preview**: On pull requests

To disable auto-deploy:
1. Vercel Dashboard → Settings → Git
2. Toggle off "Auto-deploy"
