import React from 'react'
import Svg, { Path } from 'react-native-svg'

type Props = {
  size?: number
}

export function AutoBellLogoMark({ size = 64 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" accessibilityRole="image">
      <Path
        d="M128 38c-30 0-54 24-54 54v35c0 17-7 33-19 45-5 5-8 11-8 18 0 15 12 27 27 27h108c15 0 27-12 27-27 0-7-3-13-8-18-12-12-19-28-19-45V92c0-30-24-54-54-54Z"
        fill="#FFC107"
      />
      <Path d="M128 205c-13 0-24 11-24 24h48c0-13-11-24-24-24Z" fill="#FF9800" />
      <Path
        d="M79 90c-15 12-24 30-24 50"
        fill="none"
        stroke="#4CAF50"
        strokeWidth={18}
        strokeLinecap="round"
      />
      <Path
        d="M177 90c15 12 24 30 24 50"
        fill="none"
        stroke="#4CAF50"
        strokeWidth={18}
        strokeLinecap="round"
      />
    </Svg>
  )
}

