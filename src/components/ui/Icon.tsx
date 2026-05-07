import React from 'react';
import Svg, { Path, Circle, Rect, Line, G } from 'react-native-svg';
import { colors } from '../../theme';

export type IconName =
  | 'send'
  | 'swap'
  | 'scan'
  | 'receive'
  | 'history'
  | 'wallet'
  | 'discover'
  | 'settings'
  | 'search'
  | 'bookmark'
  | 'close'
  | 'eye'
  | 'eyeOff'
  | 'copy'
  | 'qr'
  | 'arrowDown'
  | 'arrowUp'
  | 'check'
  | 'plus'
  | 'minus'
  | 'shield'
  | 'lock'
  | 'lightning'
  | 'chevronRight'
  | 'chevronLeft';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color = colors.text, strokeWidth = 2 }: IconProps) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (name) {
    case 'send':
      return (
        <Svg {...props}>
          <Path d="M22 2 11 13" />
          <Path d="m22 2-7 20-4-9-9-4Z" />
        </Svg>
      );
    case 'swap':
      return (
        <Svg {...props}>
          <Path d="M7 16V4m0 0L3 8m4-4 4 4" />
          <Path d="M17 8v12m0 0 4-4m-4 4-4-4" />
        </Svg>
      );
    case 'scan':
      return (
        <Svg {...props}>
          <Path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <Path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <Path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <Path d="M7 21H5a2 2 0 0 1-2-2v-2" />
        </Svg>
      );
    case 'receive':
      return (
        <Svg {...props}>
          <Path d="M12 5v14" />
          <Path d="m19 12-7 7-7-7" />
        </Svg>
      );
    case 'arrowDown':
      return (
        <Svg {...props}>
          <Path d="M12 5v14" />
          <Path d="m19 12-7 7-7-7" />
        </Svg>
      );
    case 'arrowUp':
      return (
        <Svg {...props}>
          <Path d="M12 19V5" />
          <Path d="m5 12 7-7 7 7" />
        </Svg>
      );
    case 'history':
      return (
        <Svg {...props}>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M12 7v5l3 2" />
        </Svg>
      );
    case 'wallet':
      return (
        <Svg {...props}>
          <Path d="M19 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z" />
          <Path d="M16 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill={color} />
          <Path d="M19 7V5a1 1 0 0 0-1.2-1L5.2 6.5A2 2 0 0 0 3.5 8.5" />
        </Svg>
      );
    case 'discover':
      return (
        <Svg {...props}>
          <Circle cx="12" cy="12" r="4" />
          <Path d="M3 12c0-2 4-3 9-3s9 1 9 3-4 3-9 3-9-1-9-3Z" />
        </Svg>
      );
    case 'settings':
      return (
        <Svg {...props}>
          <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
          <Circle cx="12" cy="12" r="3" />
        </Svg>
      );
    case 'search':
      return (
        <Svg {...props}>
          <Circle cx="11" cy="11" r="8" />
          <Path d="m21 21-4.3-4.3" />
        </Svg>
      );
    case 'bookmark':
      return (
        <Svg {...props}>
          <Path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z" />
        </Svg>
      );
    case 'close':
      return (
        <Svg {...props}>
          <Path d="M18 6 6 18" />
          <Path d="m6 6 12 12" />
        </Svg>
      );
    case 'eye':
      return (
        <Svg {...props}>
          <Path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <Circle cx="12" cy="12" r="3" />
        </Svg>
      );
    case 'eyeOff':
      return (
        <Svg {...props}>
          <Path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.7 2.7" />
          <Path d="M6.6 6.6A13.5 13.5 0 0 0 2 12s3 8 10 8a10.9 10.9 0 0 0 5.4-1.4" />
          <Path d="M14.1 14.1a3 3 0 0 1-4.2-4.2" />
          <Line x1="2" y1="2" x2="22" y2="22" />
        </Svg>
      );
    case 'copy':
      return (
        <Svg {...props}>
          <Rect x="9" y="9" width="13" height="13" rx="2" />
          <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </Svg>
      );
    case 'qr':
      return (
        <Svg {...props}>
          <Rect x="3" y="3" width="7" height="7" rx="1" />
          <Rect x="14" y="3" width="7" height="7" rx="1" />
          <Rect x="3" y="14" width="7" height="7" rx="1" />
          <Path d="M14 14h3v3h-3z" />
          <Path d="M21 14v7h-7" />
        </Svg>
      );
    case 'check':
      return (
        <Svg {...props}>
          <Path d="M20 6 9 17l-5-5" />
        </Svg>
      );
    case 'plus':
      return (
        <Svg {...props}>
          <Path d="M12 5v14M5 12h14" />
        </Svg>
      );
    case 'minus':
      return (
        <Svg {...props}>
          <Path d="M5 12h14" />
        </Svg>
      );
    case 'shield':
      return (
        <Svg {...props}>
          <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        </Svg>
      );
    case 'lock':
      return (
        <Svg {...props}>
          <Rect x="3" y="11" width="18" height="11" rx="2" />
          <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </Svg>
      );
    case 'lightning':
      return (
        <Svg {...props}>
          <Path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
        </Svg>
      );
    case 'chevronRight':
      return (
        <Svg {...props}>
          <Path d="m9 18 6-6-6-6" />
        </Svg>
      );
    case 'chevronLeft':
      return (
        <Svg {...props}>
          <Path d="m15 18-6-6 6-6" />
        </Svg>
      );
    default:
      return null;
  }
}
