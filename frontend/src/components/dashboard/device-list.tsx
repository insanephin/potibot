import { useState } from 'react'
import { Check, ChevronDown, Globe, Laptop, MonitorSpeaker, RefreshCw } from 'lucide-react'
import { menuItemClassName } from '@/components/shared/panel'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { SpotifyDevice } from '@/api/spotify'
import { cn } from '@/lib/utils'

const deviceIcon = (device: SpotifyDevice) => (device.name.includes('Web Player') ? Globe : Laptop)

type DeviceListProps = {
  devices: SpotifyDevice[]
  onSelect: (device: SpotifyDevice) => void
  onRefresh: () => void
}

function DeviceList({ devices, onSelect, onRefresh }: DeviceListProps) {
  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex items-center justify-between pl-2.5">
        <span className="text-xs font-medium text-muted-foreground">PC · 웹 플레이어</span>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRefresh} aria-label="기기 목록 새로고침">
          <RefreshCw />
        </Button>
      </div>
      {devices.length === 0 ? (
        <p className="px-2.5 py-3 text-center text-xs leading-5 text-muted-foreground">
          사용 가능한 기기가 없습니다.
          <br />
          PC의 Spotify 앱이나 웹 플레이어를 열어 주세요.
        </p>
      ) : (
        devices.map((device) => {
          const Icon = deviceIcon(device)
          return (
            <button
              key={device.id}
              type="button"
              onClick={() => onSelect(device)}
              className={cn(menuItemClassName, device.is_active && 'text-primary')}
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{device.name}</span>
              {device.is_active && <Check className="size-4 shrink-0" />}
            </button>
          )
        })
      )}
    </div>
  )
}

type DevicePickerProps = DeviceListProps & {
  label: string
}

export function DevicePicker({ label, devices, onSelect, onRefresh }: DevicePickerProps) {
  const [open, setOpen] = useState(false)
  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) onRefresh()
      }}
    >
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'group w-52 justify-start font-normal text-foreground data-popup-open:border-ring',
        )}
      >
        <MonitorSpeaker className="text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown className="text-muted-foreground transition-transform group-data-popup-open:rotate-180" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-(--anchor-width) min-w-52">
        <DeviceList
          devices={devices}
          onRefresh={onRefresh}
          onSelect={(device) => {
            setOpen(false)
            onSelect(device)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
