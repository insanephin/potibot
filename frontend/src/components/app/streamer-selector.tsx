import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, User } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import type { SearchableStreamer } from '@/types/app'
import type { Streamer } from '@/types/app'
import { menuItemClassName } from '@/components/shared/panel'
import { officialMarkUrl } from '@/lib/app-constants'
import { cn } from '@/lib/utils'

const triggerClassName =
  'flex h-10 items-center gap-2 rounded-full border border-border bg-card outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50'

type StreamerSelectorProps = {
  streamer: Streamer | null
  searchQuery: string
  filteredStreamers: SearchableStreamer[]
  onSearchQueryChange: (value: string) => void
}

export function StreamerSelector({
  streamer,
  searchQuery,
  filteredStreamers,
  onSearchQueryChange,
}: StreamerSelectorProps) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {streamer ? (
        <PopoverTrigger className={cn(triggerClassName, 'pr-4 pl-1')}>
          <Avatar className="size-8">
            <AvatarImage src={streamer.avatarUrl} alt={streamer.name} />
            <AvatarFallback>
              <User className="size-4" />
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{streamer.name}</span>
          {streamer.isPartner && (
            <img
              src={streamer.officialMarkUrl}
              alt="official mark"
              className="size-4 shrink-0 rounded-full object-cover"
            />
          )}
          {streamer.label && <span className="text-sm text-muted-foreground">{streamer.label}</span>}
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
      ) : (
        <PopoverTrigger
          className={cn(triggerClassName, 'w-44 px-4 text-muted-foreground hover:text-foreground sm:w-56 md:w-72')}
        >
          <Search className="size-4 shrink-0" />
          <span className="truncate text-sm">
            <span className="hidden sm:inline">스트리머를 검색해 보세요</span>
            <span className="sm:hidden">스트리머 검색</span>
          </span>
        </PopoverTrigger>
      )}
      <PopoverContent align="start" className="w-72">
        <div className="p-1">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="예) 치지직"
              name="streamer-search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="h-9 pl-8 text-sm"
            />
          </div>
        </div>

        <div className="-mx-1.5 max-h-48 overflow-auto border-t border-border px-1.5 pt-1">
          {searchQuery.trim() ? (
            filteredStreamers.length > 0 ? (
              <div className="flex flex-col gap-1">
                {filteredStreamers.map((streamerItem) => (
                  <button
                    key={streamerItem.channelId ?? streamerItem.name}
                    type="button"
                    onClick={() => {
                      if (streamerItem.channelId) {
                        setOpen(false)
                        onSearchQueryChange('')
                        navigate(`/${encodeURIComponent(streamerItem.channelId)}`)
                        return
                      }
                      onSearchQueryChange(streamerItem.name)
                    }}
                    className={menuItemClassName}
                  >
                    <img
                      src={streamerItem.avatarUrl}
                      alt={streamerItem.name}
                      className="size-6 rounded-full object-cover"
                    />
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{streamerItem.name}</span>
                      {streamerItem.isPartner && (
                        <img
                          src={officialMarkUrl}
                          alt="official mark"
                          className="size-4 shrink-0 rounded-full object-cover"
                        />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-2.5 py-3 text-sm text-muted-foreground">등록되지 않은 스트리머입니다.</p>
            )
          ) : (
            <p className="px-2.5 py-3 text-sm text-muted-foreground">스트리머 이름을 검색해 보세요.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
