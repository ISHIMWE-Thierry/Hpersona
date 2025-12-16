import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export const metadata: Metadata = {
  title: "Ikamba AI - Send Money to Africa Instantly",
  description: "Send money to Rwanda, Kenya, and more with AI-powered assistance. Fast, secure, and easy international transfers.",
  keywords: ["money transfer", "send money to Africa", "Rwanda", "Kenya", "remittance", "AI assistant"],
  authors: [{ name: "Ikamba" }],
  creator: "Ikamba",
  publisher: "Ikamba",
  applicationName: "Ikamba AI",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Ikamba AI",
    title: "Ikamba AI - Send Money to Africa Instantly",
    description: "Send money to Rwanda, Kenya, and more with AI-powered assistance. Fast, secure, and easy international transfers.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ikamba AI - Send Money to Africa Instantly",
    description: "Send money to Rwanda, Kenya, and more with AI-powered assistance.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
