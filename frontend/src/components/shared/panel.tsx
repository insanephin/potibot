import type { ComponentType, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-5">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </div>
  )
}

type EmptyStateProps = {
  icon?: ComponentType<{ className?: string }>
  title: string
  description?: ReactNode
  className?: string

  loading?: boolean
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, className, loading = false, action }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center', className)}>
      {Icon && (
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className={cn('size-6', loading && 'animate-spin')} />
        </div>
      )}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function LoadingOverlay({ show }: { show: boolean }) {
  return (
    <div
      role="status"
      aria-label="불러오는 중"
      aria-hidden={!show}
      className={cn(
        'fixed inset-0 z-40 flex items-center justify-center bg-background/40 backdrop-blur-md transition-opacity duration-300',
        show ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  )
}

type SegmentedItem<T extends string> = { key: T; label: string; badge?: number }

type SegmentedProps<T extends string> = {
  items: SegmentedItem<T>[]
  value: T
  onChange: (value: T) => void

  stretch?: boolean
}

export function Segmented<T extends string>({ items, value, onChange, stretch = false }: SegmentedProps<T>) {
  return (
    <div className={cn('flex gap-1 rounded-lg bg-muted p-1', stretch && 'flex-1')}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={cn(
            'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
            stretch && 'flex-1 md:flex-none',
            value === item.key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {item.label}
          {item.badge ? <Badge tone="solid">{item.badge > 99 ? '99+' : item.badge}</Badge> : null}
        </button>
      ))}
    </div>
  )
}

const badgeTones = {
  solid: 'bg-primary text-primary-foreground',
  primary: 'bg-primary/15 text-primary',
  muted: 'bg-muted text-muted-foreground',
}

export function Badge({ tone = 'muted', children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-2 text-xs font-medium tabular-nums',
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  )
}

export const menuItemClassName =
  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted'
