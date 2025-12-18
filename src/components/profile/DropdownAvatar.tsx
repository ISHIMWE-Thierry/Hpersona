'use client';

import { RefreshCcw, LogOut, User, Settings, HelpCircle, ExternalLink, CreditCard, History, BadgeCheck, ShieldCheck, MessageCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useState } from 'react';

const APP_VERSION = '1.0.0';

// Profile Modal Component
function ProfileModal({ 
  isOpen, 
  onClose, 
  profile 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  profile: any;
}) {
  if (!isOpen) return null;

  const initials = (profile.displayName || profile.fullName || profile.email || 'U')
    .split(' ')
    .map((part: string) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in-95">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
        
        <div className="text-center mb-6">
          <Avatar 
            className="h-20 w-20 mx-auto mb-4"
            style={profile.avatarColor ? { backgroundColor: profile.avatarColor } : undefined}
          >
            <AvatarImage 
              src={profile.avatarUrl || profile.photoURL || undefined} 
              alt={profile.displayName || 'User'} 
            />
            <AvatarFallback className="text-2xl font-semibold bg-primary/10 text-primary">
              {profile.avatarEmoji || initials}
            </AvatarFallback>
          </Avatar>
          <h2 className="text-xl font-bold">
            {profile.displayName || profile.fullName || 'User'}
          </h2>
          <p className="text-muted-foreground text-sm">{profile.email}</p>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">Phone</span>
            <span className="font-medium">{profile.phone || 'Not set'}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">Country</span>
            <span className="font-medium">{profile.country || 'Not set'}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-muted-foreground">Member since</span>
            <span className="font-medium">
              {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'N/A'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DropdownAvatar() {
  const { profile, loading, refresh } = useUserProfile();
  const { signOut } = useAuth();
  const [showProfile, setShowProfile] = useState(false);

  if (loading) {
    return (
      <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
    );
  }

  if (!profile) {
    return null;
  }

  const initials = (profile.displayName || profile.fullName || profile.email || 'U')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <ProfileModal 
        isOpen={showProfile} 
        onClose={() => setShowProfile(false)} 
        profile={profile} 
      />
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="group relative inline-flex cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            <Avatar 
              className="h-10 w-10 transition-opacity group-hover:opacity-90"
              style={profile.avatarColor ? { backgroundColor: profile.avatarColor } : undefined}
            >
              <AvatarImage 
                src={profile.avatarUrl || profile.photoURL || undefined} 
                alt={profile.displayName || profile.fullName || 'User avatar'} 
              />
              <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">
                {profile.avatarEmoji || initials}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-[320px] overflow-hidden p-0">
          {/* Profile Header with Gradient - matching Ikamba Remit style */}
          <div className="relative overflow-hidden bg-gradient-to-br from-primary/70 via-primary/80 to-primary/60 backdrop-blur-xl px-4 pb-4 pt-5">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
            <div className="relative z-10">
              <div className="flex items-start gap-3">
                <Avatar 
                  className="h-14 w-14 border-2 border-white/40 cursor-pointer ring-2 ring-white/20 backdrop-blur-sm transition-all hover:ring-white/40 hover:scale-105"
                  onClick={() => setShowProfile(true)}
                  style={profile.avatarColor ? { backgroundColor: profile.avatarColor } : undefined}
                >
                  <AvatarImage 
                    src={profile.avatarUrl || profile.photoURL || undefined} 
                    alt={profile.displayName || profile.fullName || 'User avatar'} 
                  />
                  <AvatarFallback className="text-base font-semibold bg-white/25 backdrop-blur-sm text-white">
                    {profile.avatarEmoji || initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight text-white drop-shadow-sm truncate">
                    {profile.displayName || profile.fullName || 'User'}
                  </p>
                  {profile.email && (
                    <p className="text-xs text-white/80 truncate mt-0.5">{profile.email}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-2">
                    <Badge variant="secondary" className="gap-1 bg-white/25 backdrop-blur-md text-xs font-medium text-white border-white/30 shadow-sm">
                      {profile.kycVerified ? (
                        <>
                          <BadgeCheck className="h-3 w-3" />
                          Verified
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-3 w-3" />
                          Member
                        </>
                      )}
                    </Badge>
                  </div>
                  {profile.createdAt && (
                    <p className="text-[10px] text-white/70 mt-1.5">
                      Member since {new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <DropdownMenuSeparator className="my-0" />
          <div className="py-1">
            <DropdownMenuItem 
              onClick={() => setShowProfile(true)} 
              className="mx-1 gap-3 cursor-pointer"
            >
              <User className="h-4 w-4 text-primary" />
              <span className="font-medium">View Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => window.open('https://ikambaremit.com/settings', '_blank')} 
              className="mx-1 gap-3 cursor-pointer"
            >
              <Settings className="h-4 w-4 text-primary" />
              <span className="font-medium">Settings</span>
              <ExternalLink className="ml-auto h-3 w-3 opacity-60" />
            </DropdownMenuItem>
          </div>

          {/* Ikamba Remit Links */}
          <DropdownMenuSeparator className="my-0" />
          <div className="py-1">
            <DropdownMenuItem 
              onClick={() => window.open('https://ikambaremit.com/transactions', '_blank')} 
              className="mx-1 gap-3 cursor-pointer"
            >
              <History className="h-4 w-4 text-primary" />
              <span className="font-medium">Transaction History</span>
              <ExternalLink className="ml-auto h-3 w-3 opacity-60" />
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => window.open('https://ikambaremit.com/send', '_blank')} 
              className="mx-1 gap-3 cursor-pointer"
            >
              <CreditCard className="h-4 w-4 text-primary" />
              <span className="font-medium">Send Money</span>
              <ExternalLink className="ml-auto h-3 w-3 opacity-60" />
            </DropdownMenuItem>
          </div>

          {/* Support */}
          <DropdownMenuSeparator className="my-0" />
          <div className="py-1">
            <DropdownMenuItem 
              onClick={() => window.open('https://wa.me/250788123456', '_blank')} 
              className="mx-1 gap-3 cursor-pointer text-green-600 hover:text-green-600 hover:bg-green-50 focus:text-green-600 focus:bg-green-50 dark:text-green-500 dark:hover:bg-green-950/20 dark:focus:bg-green-950/20"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="font-medium">WhatsApp Support</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => window.open('mailto:support@ikamba.com?subject=Support Request', '_blank')} 
              className="mx-1 gap-3 cursor-pointer"
            >
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Email Support</span>
              <ExternalLink className="ml-auto h-3 w-3 opacity-60" />
            </DropdownMenuItem>
          </div>

          {/* Logout */}
          <DropdownMenuSeparator className="my-0" />
          <div className="py-1">
            <DropdownMenuItem 
              onClick={() => signOut()} 
              className="mx-1 gap-3 cursor-pointer text-destructive hover:text-destructive hover:bg-destructive/10 focus:text-destructive focus:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
              <span className="font-medium">Log out</span>
            </DropdownMenuItem>
          </div>

          {/* Version footer */}
          <div className="border-t border-border px-4 py-2 bg-muted/30">
            <p className="text-[10px] text-muted-foreground text-center">
              Ikamba AI v{APP_VERSION}
            </p>
          </div>
        </DropdownMenuContent>
    </DropdownMenu>
    </>
  );
}
