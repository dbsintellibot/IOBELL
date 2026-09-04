import { cn } from '@/lib/utils'

type Props = {
  className?: string
  title?: string
}

export function AutoBellLogoMark({ className, title }: Props) {
  return (
    <img
      src="/logo.png"
      alt={title ?? 'AutoBell Logo'}
      className={cn('shrink-0 object-contain rounded-xl', className)}
    />
  )
}

export function AutoBellLogo({ className, title }: Props) {
  return (
    <div className={cn('flex items-center justify-center shrink-0', className)}>
      <img
        src="/logo.png"
        alt={title ?? 'AutoBell Logo'}
        className="max-h-full max-w-full object-contain rounded-2xl shadow-sm"
      />
    </div>
  )
}
