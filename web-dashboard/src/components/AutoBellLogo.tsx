import { cn } from '@/lib/utils'

type Props = {
  className?: string
  title?: string
}

export function AutoBellLogoMark({ className, title }: Props) {
  return (
    <svg
      className={cn('shrink-0', className)}
      viewBox="0 0 256 256"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title ?? 'AutoBell'}
    >
      <path
        d="M128 38c-30 0-54 24-54 54v35c0 17-7 33-19 45-5 5-8 11-8 18 0 15 12 27 27 27h108c15 0 27-12 27-27 0-7-3-13-8-18-12-12-19-28-19-45V92c0-30-24-54-54-54Z"
        fill="#FFC107"
      />
      <path d="M128 205c-13 0-24 11-24 24h48c0-13-11-24-24-24Z" fill="#FF9800" />
      <path
        d="M79 90c-15 12-24 30-24 50"
        fill="none"
        stroke="#4CAF50"
        strokeWidth="18"
        strokeLinecap="round"
      />
      <path
        d="M177 90c15 12 24 30 24 50"
        fill="none"
        stroke="#4CAF50"
        strokeWidth="18"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function AutoBellLogo({ className, title }: Props) {
  return (
    <svg
      className={cn('shrink-0', className)}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title ?? 'AutoBell'}
    >
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000" floodOpacity="0.25" />
        </filter>
      </defs>

      <g transform="translate(0,10)">
        <path
          d="M256 70c-72 0-130 58-130 130v76c0 39-16 76-45 104-11 11-18 26-18 42 0 34 28 62 62 62h262c34 0 62-28 62-62 0-16-7-31-18-42-29-28-45-65-45-104v-76c0-72-58-130-130-130Z"
          fill="#FFC107"
        />
        <path d="M256 402c-32 0-58 26-58 58h116c0-32-26-58-58-58Z" fill="#FF9800" />
        <path
          d="M170 200c-36 28-58 71-58 118"
          fill="none"
          stroke="#4CAF50"
          strokeWidth="34"
          strokeLinecap="round"
        />
        <path
          d="M342 200c36 28 58 71 58 118"
          fill="none"
          stroke="#4CAF50"
          strokeWidth="34"
          strokeLinecap="round"
        />
      </g>

      <g filter="url(#shadow)">
        <text
          x="256"
          y="486"
          textAnchor="middle"
          fontSize="64"
          fontWeight="800"
          fontFamily="system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
          fill="#FF3B30"
          letterSpacing="2"
        >
          AUTO BELL
        </text>
      </g>
    </svg>
  )
}

