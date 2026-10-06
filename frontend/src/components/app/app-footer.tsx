import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { copyrightHolder } from '@/lib/app-constants'
import { cn } from '@/lib/utils'

const linkClassName =
  'rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

const services = [
  { label: 'Spotify', href: 'https://www.spotify.com' },
  { label: '치지직', href: 'https://chzzk.naver.com' },
]

const legalLinks = [
  { label: '이용약관', to: '/terms' },

  { label: '개인정보처리방침', to: '/privacy', emphasized: true },
]

function Dot() {
  return (
    <span aria-hidden="true" className="text-muted-foreground/40">
      ·
    </span>
  )
}

function DotList({ children }: { children: ReactNode[] }) {
  return (
    <>
      {children.map((child, index) => (
        <Fragment key={index}>
          {index > 0 && <Dot />}
          {child}
        </Fragment>
      ))}
    </>
  )
}

export function AppFooter() {
  return (
    <footer className="flex shrink-0 flex-col-reverse items-center gap-1.5 px-1 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:gap-4">
      <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-center sm:justify-start sm:text-left">
        <span>
          © {new Date().getFullYear()} {copyrightHolder}
        </span>
        <Dot />
        <span>
          {services.map((service, index) => (
            <Fragment key={service.href}>
              {index > 0 && '·'}
              <a href={service.href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
                {service.label}
              </a>
            </Fragment>
          ))}{' '}
          공식 서비스가 아닙니다
        </span>
      </p>
      <nav aria-label="약관 및 정책" className="flex shrink-0 items-center gap-x-1.5">
        <DotList>
          {legalLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={cn(linkClassName, link.emphasized && 'font-semibold text-foreground/80')}
            >
              {link.label}
            </Link>
          ))}
        </DotList>
      </nav>
    </footer>
  )
}
