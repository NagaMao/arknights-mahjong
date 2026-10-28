/** 牌定义、种子随机与牌山生成。 */

import type { DeadWall, Tile } from './types';

export const TILE_KIND_COUNT = 34;
export const HAND_SIZE = 13;
export const WALL_SIZE = 136;

export const MAN = 0;
export const PIN = 9;
export const SOU = 18;
export const HONORS = 27;

export const EAST = 27;
export const SOUTH = 28;
export const WEST = 29;
export const NORTH = 30;
export const HAKU = 31; // 白
export const HATSU = 32; // 发
export const CHUN = 33; // 中

/** 赤宝牌使用 34-36 三个额外编码，规则运算前统一还原为普通五。 */
export const RED_MAN = 34;
export const RED_PIN = 35;
export const RED_SOU = 36;
export const RED_FIVES: readonly Tile[] = [RED_MAN, RED_PIN, RED_SOU];

const RED_TO_NORMAL: Record<number, Tile> = {
  [RED_MAN]: 4,
  [RED_PIN]: 13,
  [RED_SOU]: 22,
};

export function isRedFive(tile: Tile): boolean {
  return tile >= RED_MAN && tile <= RED_SOU;
}

/** 实际宝牌或赤宝牌都需要在牌面上闪光提示。 */
export function isDoraOrAka(tile: Tile, doraTiles: readonly Tile[]): boolean {
  if (isRedFive(tile)) return true;
  return doraTiles.some((dora) => sameTileKind(dora, tile));
}

/** 把赤五还原为普通五；其他牌原样返回。 */
export function normalizeTile(tile: Tile): Tile {
  return RED_TO_NORMAL[tile] ?? tile;
}

/** 红五与普通五视为同一种牌，用于振听、悬停、食替提示等。 */
export function sameTileKind(a: Tile, b: Tile): boolean {
  return normalizeTile(a) === normalizeTile(b);
}

export const DRAGONS: readonly Tile[] = [HAKU, HATSU, CHUN];
export const WINDS: readonly Tile[] = [EAST, SOUTH, WEST, NORTH];
export const ORPHANS: readonly Tile[] = [
  0, 8, 9, 17, 18, 26,
  EAST, SOUTH, WEST, NORTH, HAKU, HATSU, CHUN,
];

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const SUIT_LABEL = ['万', '筒', '索'];
const HONOR_LABEL = ['东', '南', '西', '北', '白', '发', '中'];

/** 0-8 万，9-17 筒，18-26 索，27-33 字牌；34-36 为赤五。 */
export function suitOf(tile: Tile): 'man' | 'pin' | 'sou' | 'honor' {
  const normal = normalizeTile(tile);
  if (normal < PIN) return 'man';
  if (normal < SOU) return 'pin';
  if (normal < HONORS) return 'sou';
  return 'honor';
}

export function rankOf(tile: Tile): number {
  const normal = normalizeTile(tile);
  if (normal >= HONORS) return normal - HONORS + 1;
  return (normal % 9) + 1;
}

export function isHonor(tile: Tile): boolean {
  return normalizeTile(tile) >= HONORS;
}

export function isWind(tile: Tile): boolean {
  const normal = normalizeTile(tile);
  return normal >= EAST && normal <= NORTH;
}

export function isDragon(tile: Tile): boolean {
  const normal = normalizeTile(tile);
  return normal >= HAKU && normal <= CHUN;
}

export function isTerminal(tile: Tile): boolean {
  return !isHonor(tile) && (rankOf(tile) === 1 || rankOf(tile) === 9);
}

export function isTerminalOrHonor(tile: Tile): boolean {
  return isHonor(tile) || isTerminal(tile);
}

export function isSimple(tile: Tile): boolean {
  return !isTerminalOrHonor(tile);
}

export function isGreen(tile: Tile): boolean {
  const normal = normalizeTile(tile);
  return normal === SOU + 1 || normal === SOU + 2 || normal === SOU + 3 || normal === SOU + 5 || normal === SOU + 7 || normal === HATSU;
}

/** 中文牌名，例如 五万、东、白；赤五会标注“赤”。 */
export function tileName(tile: Tile): string {
  if (isHonor(tile)) return HONOR_LABEL[rankOf(tile) - 1];
  const suit = suitOf(tile);
  const rank = rankOf(tile) - 1;
  const suitIndex = suit === 'man' ? 0 : suit === 'pin' ? 1 : 2;
  return `${isRedFive(tile) ? '赤' : ''}${CN_NUM[rank]}${SUIT_LABEL[suitIndex]}`;
}

/** 简短牌名，例如 5万；用于 AI 日志。 */
export function tileShortName(tile: Tile): string {
  if (isHonor(tile)) return HONOR_LABEL[rankOf(tile) - 1];
  return `${isRedFive(tile) ? '赤' : ''}${rankOf(tile)}${SUIT_LABEL[suitOf(tile) === 'man' ? 0 : suitOf(tile) === 'pin' ? 1 : 2]}`;
}

export function tileSuitIndex(tile: Tile): number {
  const normal = normalizeTile(tile);
  if (normal < PIN) return 0;
  if (normal < SOU) return 1;
  return 2;
}

export function isSameSuit(a: Tile, b: Tile): boolean {
  return !isHonor(a) && !isHonor(b) && tileSuitIndex(a) === tileSuitIndex(b);
}

/** 手牌、牌河统一排序：普通牌在前，赤五紧跟同种牌。 */
export function tileSortValue(tile: Tile): number {
  return normalizeTile(tile) * 2 + (isRedFive(tile) ? 1 : 0);
}

export function sortTiles(tiles: readonly Tile[]): Tile[] {
  return [...tiles].sort((a, b) => tileSortValue(a) - tileSortValue(b));
}

export function windName(wind: 'east' | 'south' | 'west' | 'north'): string {
  return { east: '东', south: '南', west: '西', north: '北' }[wind];
}

export function windTile(wind: 'east' | 'south' | 'west' | 'north'): Tile {
  return { east: EAST, south: SOUTH, west: WEST, north: NORTH }[wind];
}

/** 宝牌指示牌对应的实际宝牌。 */
export function doraFromIndicator(indicator: Tile): Tile {
  const normal = normalizeTile(indicator);
  if (normal < HONORS) {
    const base = Math.floor(normal / 9) * 9;
    return base + ((normal - base + 1) % 9);
  }
  if (isWind(normal)) return EAST + ((normal - EAST + 1) % 4);
  return HAKU + ((normal - HAKU + 1) % 3);
}

/** 构造 136 张牌：每个数位/字牌 4 张，其中 5m/5p/5s 各有一张赤宝牌。 */
export function createDeck(): Tile[] {
  const deck: Tile[] = [];
  for (let tile = 0; tile < TILE_KIND_COUNT; tile += 1) {
    const isFive = tile === 4 || tile === 13 || tile === 22;
    const normalCopies = isFive ? 3 : 4;
    for (let copy = 0; copy < normalCopies; copy += 1) deck.push(tile);
  }
  deck.push(RED_MAN, RED_PIN, RED_SOU);
  return deck;
}

export function countTiles(tiles: readonly Tile[]): number[] {
  const counts = new Array<number>(TILE_KIND_COUNT).fill(0);
  for (const tile of tiles) counts[normalizeTile(tile)] += 1;
  return counts;
}

export function tilesFromCounts(counts: readonly number[]): Tile[] {
  const result: Tile[] = [];
  counts.forEach((count, tile) => {
    for (let i = 0; i < count; i += 1) result.push(tile);
  });
  return result;
}

/** xmur3：把任意种子散列为 32 位整数。 */
export function hashSeed(seed: number | string): number {
  const str = String(seed);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 可种子伪随机数生成器。 */
export function createRng(seed: number | string): () => number {
  let state = hashSeed(seed);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(input: readonly T[], rng: () => number): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface BuiltWall {
  wall: Tile[];
  deadWall: DeadWall;
  /** 两家各 13 张配牌。 */
  hands: [Tile[], Tile[]];
}

/**
 * 生成一副牌山：
 * - 122 张参与配牌与可摸牌山；
 * - 最后 14 张固定为王牌：岭上 4、宝牌指示 5、里宝指示 5；
 * - 配牌 26 张，剩余 96 张为可摸牌山。
 */
export function buildWall(seed: number | string): BuiltWall {
  const rng = createRng(seed);
  const shuffled = shuffle(createDeck(), rng);
  const deadTiles = shuffled.slice(-14);
  const playable = shuffled.slice(0, 122);
  const dealTiles = playable.slice(0, 26);
  const wall = playable.slice(26);
  const hands: [Tile[], Tile[]] = [
    dealTiles.slice(0, 13).sort((a, b) => tileSortValue(a) - tileSortValue(b)),
    dealTiles.slice(13, 26).sort((a, b) => tileSortValue(a) - tileSortValue(b)),
  ];
  return {
    wall,
    hands,
    deadWall: {
      rinshan: deadTiles.slice(0, 4),
      doraIndicators: deadTiles.slice(4, 9),
      uraIndicators: deadTiles.slice(9, 14),
      revealed: 1,
    },
  };
}

/** 从牌山移除指定牌（用于阿米娅技能），红五与普通五视为同种，返回新的牌堆顶。 */
export function moveTileToWallTop(wall: readonly Tile[], tile: Tile): Tile[] | null {
  const index = wall.findIndex((candidate) => sameTileKind(candidate, tile));
  if (index < 0) return null;
  const next = [...wall];
  const [found] = next.splice(index, 1);
  next.unshift(found);
  return next;
}

/** 判断某张牌（含赤五）是否仍在未被公开的牌山内。 */
export function countInWall(wall: readonly Tile[], tile: Tile): number {
  return wall.reduce((sum, t) => sum + (sameTileKind(t, tile) ? 1 : 0), 0);
}

export function countRedFives(tiles: readonly Tile[]): number {
  return tiles.reduce((sum, tile) => sum + (isRedFive(tile) ? 1 : 0), 0);
}
