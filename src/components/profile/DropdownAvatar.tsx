'use client';

import { RefreshCcw, LogOut, User, Settings, HelpCircle } from 'lucide-react';
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

export function DropdownAvatar() {
  const { profile, loading, refresh } = useUserProfile();
  const { signOut } = useAuth();

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
          <DropdownMenuItem className="cursor-pointer">
            <User className="mr-2 h-4 w-4" />
            <span>View profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
        </div>

        <DropdownMenuSeparator />

        <div className="p-1">
          <DropdownMenuItem className="cursor-pointer">
            <HelpCircle className="mr-2 h-4 w-4" />
            <span>Support</span>
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
  );
}
