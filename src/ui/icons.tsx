import type { SVGProps } from 'react';

/**
 * ZDrive icon set: original line icons on a 24px grid, 1.5px stroke, round caps and joins.
 * Icons are decorative (aria-hidden) unless given a `title`.
 */

const PATHS = {
  play: 'M7 5.5v13l11-6.5z',
  pause: 'M8 5.5v13M16 5.5v13',
  restart: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4',
  home: 'M4 11 12 4.5 20 11M6 9.5V19h4.5v-5h3v5H18V9.5',
  wrench: 'M14.5 4.5a4 4 0 0 0-3.7 5.5L4.5 16.3a1.8 1.8 0 0 0 2.6 2.6l6.3-6.3a4 4 0 0 0 5.5-3.7l-2.6 2.6-2.6-.9-.9-2.6z',
  trophy: 'M8 4.5h8v5a4 4 0 0 1-8 0zM8 6.5H5v1.5a3 3 0 0 0 3 3M16 6.5h3v1.5a3 3 0 0 1-3 3M12 13.5V17M8.5 19.5h7M10 17h4',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10.4 3.5h3.2l.5 2.4 1.7 1 2.3-.8 1.6 2.8-1.8 1.6v2l1.8 1.6-1.6 2.8-2.3-.8-1.7 1-.5 2.4h-3.2l-.5-2.4-1.7-1-2.3.8-1.6-2.8 1.8-1.6v-2L3.9 8.9l1.6-2.8 2.3.8 1.7-1z',
  gamepad: 'M7.5 8h9a4 4 0 0 1 3.9 3.2l.8 4.3a2.3 2.3 0 0 1-4 1.9L15.5 16h-7l-1.7 1.4a2.3 2.3 0 0 1-4-1.9l.8-4.3A4 4 0 0 1 7.5 8zM8 10.5v3M6.5 12h3M15.5 11.5h.01M17.5 13h.01',
  keyboard: 'M3.5 7h17v10h-17zM7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 14h8',
  mouse: 'M12 3.5a5 5 0 0 1 5 5v7a5 5 0 0 1-10 0v-7a5 5 0 0 1 5-5zM12 7v3',
  volume: 'M4.5 9.5h3l4-3.5v12l-4-3.5h-3zM15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11',
  volumeOff: 'M4.5 9.5h3l4-3.5v12l-4-3.5h-3zM15.5 9.5l5 5M20.5 9.5l-5 5',
  chevronLeft: 'M14.5 6 8.5 12l6 6',
  chevronRight: 'M9.5 6l6 6-6 6',
  chevronDown: 'M6 9.5l6 6 6-6',
  chevronUp: 'M6 14.5l6-6 6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  checkCircle: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM8.3 12.2l2.6 2.6 4.8-5.1',
  xCircle: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6',
  warning: 'M12 4 21 19.5H3zM12 10v4M12 17h.01',
  danger: 'M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7zM12 8v4.5M12 15.8h.01',
  info: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5M12 8h.01',
  trash: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 10.5v6M14 10.5v6',
  pencil: 'M15.5 4.5l4 4L9 19H5v-4zM13 7l4 4',
  copy: 'M9 9h10.5v10.5H9zM5 15V4.5h10.5',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 19.5h14',
  upload: 'M12 15.5V4.5M7 9l5-5 5 5M5 19.5h14',
  camera: 'M4 8h3.5l1.5-2.5h6L16.5 8H20v11H4zM12 10.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  eyeOff: 'M4 4l16 16M9.9 5.8A8.6 8.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.7 3.4M6.3 7.4A16 16 0 0 0 2.5 12s3.5 6.5 9.5 6.5a8.5 8.5 0 0 0 4.1-1',
  search: 'M10.5 4.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l4.5 4.5',
  robot: 'M5 9h14v9.5H5zM9 13h.01M15 13h.01M12 9V5.5M10 5.5h4M3 12.5v3M21 12.5v3M9 16h6',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
  flag: 'M5.5 20.5v-16M5.5 4.5h12l-2.5 4 2.5 4h-12',
  film: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4',
  layers: 'M12 4l8.5 4.5L12 13 3.5 8.5zM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5',
  grid: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z',
  sliders: 'M5 7h9M18 7h1M5 17h1M10 17h9M14 5v4M6 15v4',
  database: 'M12 4c4.4 0 8 1.1 8 2.5S16.4 9 12 9 4 7.9 4 6.5 7.6 4 12 4zM4 6.5v11C4 18.9 7.6 20 12 20s8-1.1 8-2.5v-11M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5',
  accessibility: 'M12 3.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM5 9l7 1.5L19 9M12 10.5v4M9 20.5l3-6 3 6',
  steering: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3.7 11.5 9.5 12M14.5 12l5.8-.5M12 14.5v6',
  sparkle: 'M12 4v4M12 16v4M4 12h4M16 12h4M7 7l2 2M15 15l2 2M17 7l-2 2M9 15l-2 2',
  monitor: 'M3.5 5h17v11h-17zM9 20h6M12 16v4',
  menu: 'M4.5 7h15M4.5 12h15M4.5 17h15',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  dot: 'M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  pinPiece: 'M9.5 3.5h5v8.5h-5zM9.5 12h5v8.5h-5z',
  cupPiece: 'M6 6.5h12l-1.5 12h-9zM6 6.5 7.2 4h9.6L18 6.5',
  lift: 'M6 20.5V3.5M18 20.5V3.5M6 14h12M9.5 10.5 12 8l2.5 2.5',
  timer: 'M12 6.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 10v3.5M9.5 3.5h5M18 6.5l1.5-1.5',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z',
  external: 'M13.5 4.5h6v6M19.5 4.5l-8 8M17 13.5v6H4.5V7h6',
  scale: 'M4 20l7-7M4 20h5M4 20v-5M20 4l-7 7M20 4h-5M20 4v5',
} as const;

export type IconName = keyof typeof PATHS;

/** Icons drawn filled (solid shapes) rather than stroked. */
const FILLED = new Set<IconName>(['play', 'dot']);

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Rendered size in CSS units; defaults to 1.25rem (--icon-md). */
  size?: string;
  title?: string;
}

export function Icon({ name, size = 'var(--icon-md)', title, className, ...rest }: IconProps) {
  const filled = FILLED.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      className={`zd-icon${className ? ` ${className}` : ''}`}
      focusable="false"
      {...rest}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}

export const ICON_NAMES = Object.keys(PATHS) as IconName[];
