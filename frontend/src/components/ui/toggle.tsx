import { cn } from '@/lib/utils'

type ToggleProps = {
  value: boolean
  onChange: () => void
  disabled?: boolean
  label?: string
}

export function Toggle({ value, onChange, disabled = false, label }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      aria-label={label}
      aria-pressed={value}
      className={cn(
        'inline-flex h-6 w-11 items-center rounded-full border border-border p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        value ? 'justify-end bg-primary/20' : 'justify-start bg-muted/60',
      )}
    >
      <span className={cn('size-4 rounded-full', value ? 'bg-primary' : 'bg-muted-foreground/50')} />
    </button>
  )
}
