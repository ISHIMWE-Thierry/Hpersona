import { ShieldCheck, Mail, Phone, Globe, RefreshCcw, User2, Languages, CalendarRange, LogOut } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

const kycTone: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; }> = {
  verified: { label: 'KYC verified', variant: 'default' },
  pending: { label: 'KYC pending', variant: 'secondary' },
  rejected: { label: 'KYC rejected', variant: 'destructive' },
  none: { label: 'KYC not started', variant: 'outline' },
};

export function UserProfileCard() {
  const { profile, loading, error, refresh } = useUserProfile();
  const { signOut } = useAuth();

  if (loading) {
    return (
      <Card className="shadow-sm border-border/60">
        <CardHeader className="flex flex-row items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (!profile) {
    return (
      <Card className="shadow-sm border-destructive/30">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Profile unavailable</CardTitle>
          <Button size="icon" variant="outline" onClick={refresh}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {error || 'Sign in to see your profile details.'}
        </CardContent>
      </Card>
    );
  }

  const initials = (profile.displayName || profile.fullName || profile.email || 'U')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const kycState = kycTone[profile.kycStatus || 'none'];

  return (
    <Card className="shadow-sm border-border/60 bg-card/80 backdrop-blur">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-full">
                <Avatar className="h-11 w-11 sm:h-12 sm:w-12" style={profile.avatarColor ? { backgroundColor: profile.avatarColor } : undefined}>
                  <AvatarImage src={profile.avatarUrl || profile.photoURL || undefined} alt={profile.displayName || profile.fullName || 'User avatar'} />
                  <AvatarFallback className="text-base font-semibold">
                    {profile.avatarEmoji || initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8" style={profile.avatarColor ? { backgroundColor: profile.avatarColor } : undefined}>
                    <AvatarImage src={profile.avatarUrl || profile.photoURL || undefined} alt={profile.displayName || profile.fullName || 'User avatar'} />
                    <AvatarFallback className="text-xs font-semibold">
                      {profile.avatarEmoji || initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium leading-tight truncate max-w-[160px]">
                      {profile.displayName || profile.fullName || 'Your profile'}
                    </p>
                    {profile.email && (
                      <p className="text-xs text-muted-foreground truncate max-w-[160px]">
                        {profile.email}
                      </p>
                    )}
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs flex-col items-start leading-relaxed whitespace-normal">
                {profile.country || profile.countryCode ? (
                  <span className="text-muted-foreground">
                    {profile.country || profile.countryCode}
                    {profile.preferredCurrency && ` · Prefers ${profile.preferredCurrency}`}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No country set</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => refresh()} className="text-sm">
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => signOut()} className="text-sm text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-lg font-semibold truncate max-w-[200px] sm:max-w-xs">
              {profile.displayName || profile.fullName || 'Your profile'}
            </CardTitle>
            <p className="text-xs sm:text-sm text-muted-foreground truncate max-w-[220px] sm:max-w-xs">
              {profile.email || 'No email on file'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
          <Badge variant={kycState.variant} className="text-xs px-2 py-1 flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            <span>{kycState.label}</span>
          </Badge>
          <Button variant="ghost" size="icon" title="Refresh profile" onClick={refresh} className="h-8 w-8">
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>{profile.email || '—'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span>{profile.phoneNumber || profile.phone || 'Add a phone number'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span>{profile.country || profile.countryCode || 'Country not set'}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <User2 className="h-4 w-4 text-muted-foreground" />
            <span>{profile.firstName || profile.lastName ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : 'Name not set'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 text-muted-foreground" />
            <span>{profile.language || 'Language not set'}</span>
          </div>
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            <span>
              {profile.createdAt
                ? typeof profile.createdAt === 'string'
                  ? profile.createdAt
                  : format(new Date(profile.createdAt), 'dd MMM yyyy')
                : 'Joined date unknown'}
            </span>
          </div>
          {profile.preferredCurrency && (
            <div className="flex items-center gap-2">
              <Separator orientation="vertical" className="h-4" />
              <span className="text-muted-foreground">Prefers {profile.preferredCurrency}</span>
            </div>
          )}
        </div>
      </CardContent>

      {error && (
        <div className="px-6 pb-4 text-xs text-destructive flex items-center gap-2">
          <RefreshCcw className="h-3.5 w-3.5" />
          <span>{error}</span>
        </div>
      )}
    </Card>
  );
}
