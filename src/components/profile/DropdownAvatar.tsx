'use client';

import { RefreshCcw, LogOut, User, Settings, HelpCircle, ExternalLink } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

        <DropdownMenuContent align="end" className="w-64">
          {/* User info header */}
          <div className="flex gap-3 border-b border-border p-3">
            <Avatar 
              className="h-10 w-10"
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
            <div className="flex flex-col justify-center min-w-0">
              <p className="text-sm font-semibold truncate">
                {profile.displayName || profile.fullName || 'Your profile'}
              </p>
              {profile.email && (
                <p className="text-xs text-muted-foreground truncate">
                  {profile.email}
                </p>
              )}
            </div>
          </div>

          {/* Menu items */}
          <div className="p-1">
            <DropdownMenuItem 
              onClick={() => setShowProfile(true)} 
              className="cursor-pointer"
            >
              <User className="mr-2 h-4 w-4" />
              <span>View profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => toast.info('Settings coming soon!')} 
              className="cursor-pointer"
            >
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
          </div>

          <DropdownMenuSeparator />

          <div className="p-1">
            <DropdownMenuItem 
              onClick={() => window.open('mailto:support@ikamba.com?subject=Support Request', '_blank')} 
              className="cursor-pointer"
            >
              <HelpCircle className="mr-2 h-4 w-4" />
              <span>Support</span>
              <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => refresh()} className="cursor-pointer">
              <RefreshCcw className="mr-2 h-4 w-4" />
              <span>Refresh profile</span>
            </DropdownMenuItem>
          </div>

        <DropdownMenuSeparator />

        <div className="p-1">
          <DropdownMenuItem 
            onClick={() => signOut()} 
            className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  );
}
