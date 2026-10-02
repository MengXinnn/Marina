import type { PlayerColor, Ware } from '@manila/engine';

/** Single source for every colour in the scene and HUD. See docs/ART_DIRECTION.md. */

export const WARE_COLORS: Record<Ware, { main: number; dark: number; light: number; css: string }> =
  {
    ginseng: { main: 0xe8c872, dark: 0xb8913f, light: 0xf6e3a8, css: '#e8c872' },
    nutmeg: { main: 0x9a5b34, dark: 0x6b3b20, light: 0xc0855a, css: '#b06a3c' },
    silk: { main: 0x5fc6e0, dark: 0x2f8fb0, light: 0xa6e6f2, css: '#5fc6e0' },
    jade: { main: 0x4dbf7a, dark: 0x2a8a52, light: 0x93e0ad, css: '#4dbf7a' },
  };

export const PLAYER_COLORS: Record<PlayerColor, { main: number; dark: number; css: string }> = {
  red: { main: 0xe0413a, dark: 0x9e2620, css: '#e0413a' },
  blue: { main: 0x3d5fd9, dark: 0x263c94, css: '#5b7cf0' },
  orange: { main: 0xf08a24, dark: 0xb05f10, css: '#f08a24' },
  purple: { main: 0x9a4fd0, dark: 0x66308f, css: '#b06ae6' },
  white: { main: 0xf2efe6, dark: 0xb9b3a3, css: '#f2efe6' },
};

export const ENV = {
  sky: 0x8fd3e8,
  seaDeep: 0x0f4c6e,
  sea: 0x1b7a9e,
  seaShallow: 0x3fb2c4,
  foam: 0xd8f4f2,
  sand: 0xf0d79a,
  sandDark: 0xd9b874,
  wetSand: 0xc9a865,
  grass: 0x6dbb4a,
  grassDark: 0x4e9a38,
  dirt: 0x9a7048,
  rock: 0x8d8a85,
  rockDark: 0x6a6762,
  wood: 0xa0643c,
  woodDark: 0x6e4126,
  woodLight: 0xc98d5a,
  plank: 0xd8a66e,
  rope: 0xd9c08a,
  wall: 0xf2ead8,
  wallShade: 0xd9ccb0,
  roof: 0xc4553a,
  roofDark: 0x8f3a26,
  roofGreen: 0x3f8f6b,
  gold: 0xf2c230,
  goldDark: 0xb98a14,
  iron: 0x4a4f57,
  sail: 0xf3ead2,
  pirateSail: 0x26262c,
  pirateHull: 0x3a2a24,
  danger: 0xd8433a,
  leaf: 0x3fa34d,
  leafDark: 0x2b7a3a,
  trunk: 0x8a5a32,
  lamp: 0xfff1b0,
  skin: 0xe9b48a,
} as const;
