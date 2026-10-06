import { Music2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function TrackArt({ src, className }: { src?: string | null; className?: string }) {
  return (
    <div
      className={cn('flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted', className)}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <Music2 className="size-4 text-muted-foreground" />
      )}
    </div>
  )
}

type TrackRowProps = {
  index?: ReactNode
  imageUrl?: string | null
  title: string
  subtitle?: ReactNode

  trailing?: ReactNode
  highlighted?: boolean
}

export function TrackRow({ index, imageUrl, title, subtitle, trailing, highlighted = false }: TrackRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
        highlighted ? 'bg-primary/10' : 'hover:bg-muted/50',
      )}
    >
      {index !== undefined && (
        <span className="w-6 shrink-0 text-center text-xs font-medium text-muted-foreground tabular-nums">{index}</span>
      )}
      <TrackArt src={imageUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">{trailing}</div>}
    </div>
  )
}

export function TrackList({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto p-3">{children}</div>
}
