/** 立直麻将牌面素材映射：扁平风格牌面 + 默认风格横置牌。 */

import { isHonor, isRedFive, rankOf, suitOf } from '../game/tiles';
import type { Tile } from '../game/types';

const FLAT_BASE = '/tiles/flat';
const HORIZONTAL_BASE = '/tiles/horizontal';

export const TILE_BACK_SRC = `${FLAT_BASE}/flat_back.png`;

function suitCode(tile: Tile): 'm' | 'p' | 's' {
  const suit = suitOf(tile);
  if (suit === 'man') return 'm';
  if (suit === 'pin') return 'p';
  return 's';
}

/** 普通牌面：万/筒/索 f1m..f9s，字牌 f1z..f7z，赤五 f0m/f0p/f0s。 */
export function flatTileSrc(tile: Tile): string {
  if (isRedFive(tile)) return `${FLAT_BASE}/f0${suitCode(tile)}.png`;
  if (isHonor(tile)) return `${FLAT_BASE}/f${rankOf(tile)}z.png`;
  return `${FLAT_BASE}/f${rankOf(tile)}${suitCode(tile)}.png`;
}

/** 立直宣言牌的横置版本。 */
export function horizontalTileSrc(tile: Tile): string {
  if (isRedFive(tile)) return `${HORIZONTAL_BASE}/h0${suitCode(tile)}.png`;
  if (isHonor(tile)) return `${HORIZONTAL_BASE}/h${rankOf(tile)}z.png`;
  return `${HORIZONTAL_BASE}/h${rankOf(tile)}${suitCode(tile)}.png`;
}
