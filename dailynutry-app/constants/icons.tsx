/**
 * DailyNutry — SVG Icon Component (React Native)
 * 
 * Stroke-based icons, 1.5px rounded — converted from the web
 * prototype's inline SVG system to react-native-svg.
 */

import React from 'react';
import Svg, { Path } from 'react-native-svg';

const ICON_PATHS: Record<string, string> = {
  sun:        'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4',
  sunrise:    'M3 18h18M5 15a7 7 0 0114 0M12 2v3M5.5 6.5l1.6 1.6M18.5 6.5l-1.6 1.6M8 22h8',
  moon:       'M20.5 14.5A9 9 0 119.5 3.5a7 7 0 0011 11z',
  coffee:     'M3 8h13v6a4 4 0 01-4 4H7a4 4 0 01-4-4V8zM16 9h2a3 3 0 010 6h-2M7 2v3M11 2v3',
  fork:       'M7 2v8a3 3 0 003 3v9M17 2v8a3 3 0 01-3 3M13 2v6',
  apple:      'M12 7c0-3 2-5 5-5-.5 2.5-2 4.5-5 5zM7 22c-3 0-4-4-4-8s2-7 5-7c1.5 0 2 1 4 1s2.5-1 4-1c3 0 5 3 5 7s-1 8-4 8c-2 0-2.5-1-5-1s-2.5 1-5 1z',
  plate:      'M12 21a9 9 0 100-18 9 9 0 000 18zM12 17a5 5 0 100-10 5 5 0 000 10z',
  chevR:      'M9 5l7 7-7 7',
  chevL:      'M15 5l-7 7 7 7',
  chevDown:   'M5 9l7 7 7-7',
  chevU:      'M5 15l7-7 7 7',
  chevD:      'M5 9l7 7 7-7',
  check:      'M5 12l5 5L20 6',
  plus:       'M12 5v14M5 12h14',
  minus:      'M5 12h14',
  x:          'M6 6l12 12M6 18L18 6',
  cart:       'M3 4h2l2.4 11.2a2 2 0 002 1.6h8.7a2 2 0 002-1.5L22 7H6M10 21a1 1 0 100-2 1 1 0 000 2zM18 21a1 1 0 100-2 1 1 0 000 2z',
  cam:        'M4 8h3l2-3h6l2 3h3v11H4V8zM12 17a4 4 0 100-8 4 4 0 000 8z',
  book:       'M4 4h7a3 3 0 013 3v13a2 2 0 00-2-2H4V4zM20 4h-7a3 3 0 00-3 3v13a2 2 0 012-2h8V4z',
  home:       'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  flame:      'M12 22c4 0 7-3 7-7 0-4-3-6-5-9-1 3-3 4-5 6s-3 4-3 6c0 2 2 4 6 4z',
  bell:       'M6 16V11a6 6 0 1112 0v5l1.5 2.5h-15L6 16zM10 20a2 2 0 004 0',
  scale:      'M6 21h12M12 3v18M6 9l3-6h6l3 6M3 13a3 3 0 006 0M15 13a3 3 0 006 0',
  edit:       'M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3',
  upload:     'M12 17V4M5 11l7-7 7 7M4 21h16',
  calendar:   'M4 6h16v15H4V6zM4 10h16M9 3v4M15 3v4',
  list:       'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  swap:       'M7 7h13l-3-3M17 17H4l3 3',
  search:     'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  user:       'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  settings:   'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z',
  sparkle:    'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z',
  droplet:    'M12 21a6 6 0 006-6c0-4-6-12-6-12S6 11 6 15a6 6 0 006 6z',
  info:       'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7v.01',
  grip:       'M5 5h2v2H5zM11 5h2v2h-2zM17 5h2v2h-2zM5 11h2v2H5zM11 11h2v2h-2zM17 11h2v2h-2zM5 17h2v2H5zM11 17h2v2h-2zM17 17h2v2h-2z',
  timer:      'M12 21a8 8 0 100-16 8 8 0 000 16zM12 9v4l3 2M9 2h6',
  leaf:       'M5 21c0-9 6-15 16-15-2 10-7 16-16 15zM5 21l6-6',
  pantry:     'M4 4h16v2H4zM5 6v14h14V6M9 9v5M12 9v5M15 9v5',
};

interface IcProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Ic({ name, size = 20, color = '#1f1d17', strokeWidth = 1.5 }: IcProps) {
  const d = ICON_PATHS[name] || ICON_PATHS.plate;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={d}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
