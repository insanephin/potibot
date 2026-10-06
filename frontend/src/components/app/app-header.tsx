import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, LayoutDashboard, LogOut, User as UserIcon } from 'lucide-react'
import { menuItemClassName } from '@/components/shared/panel'
import { ThemeToggle } from '@/components/theme-toggle'
import { buttonVariants } from '@/components/ui/button-variants'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { logout, type CurrentUser } from '@/api/user'
import { loginUrl } from '@/api/client'
import { appName, defaultProfileImageUrl } from '@/lib/app-constants'
import type { Route } from '@/types/app'

function UserMenu({ user, route }: { user: CurrentUser; route: Route }) {
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      window.location.href = '/'
    }
  }

  return (
    <Popover>
      <PopoverTrigger className="flex h-10 items-center gap-1 rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring/50">
        <Avatar className="size-10">
          <AvatarImage src={user.channel_image_url || defaultProfileImageUrl} alt={user.channel_name || appName} />
          <AvatarFallback>
            <UserIcon className="size-5" />
          </AvatarFallback>
        </Avatar>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48">
        <button
          type="button"
          onClick={() => navigate(route === 'dashboard' ? '/' : '/dashboard')}
          className={menuItemClassName}
        >
          <LayoutDashboard className="size-4" />
          {route === 'dashboard' ? '홈으로' : '대시보드'}
        </button>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className={`${menuItemClassName} text-destructive hover:bg-destructive/10`}
        >
          <LogOut className="size-4" />
          로그아웃
        </button>
      </PopoverContent>
    </Popover>
  )
}

function LoginButton() {
  return (
    <a href={loginUrl()} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
      <img src="/chzzk/black.png" alt="Chzzk" className="h-4 w-auto object-contain dark:hidden" />
      <img src="/chzzk/white.png" alt="Chzzk" className="hidden h-4 w-auto object-contain dark:block" />
      로그인
    </a>
  )
}

type AppHeaderProps = {
  streamerSelector: ReactNode
  user: CurrentUser | null
  route: Route
}

export function AppHeader({ streamerSelector, user, route }: AppHeaderProps) {
  return (
    <header className="flex h-20 items-center justify-between">
      {streamerSelector}
      <div className="flex items-center gap-3">
        <ThemeToggle />
        {user ? <UserMenu user={user} route={route} /> : <LoginButton />}
      </div>
    </header>
  )
}
