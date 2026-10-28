/**
 * 日本立直麻将的和牌结构、役种、符计算与听牌分析。
 * 该模块不依赖对局状态机，所有函数均为纯函数，便于单测与 AI 复用。
 */

import {
  CHUN,
  DRAGONS,
  EAST,
  HAKU,
  HATSU,
  HONORS,
  NORTH,
  SOUTH,
  WEST,
  WINDS,
  countTiles,
  countRedFives,
  doraFromIndicator,
  isDragon,
  isGreen,
  isHonor,
  isSimple,
  isTerminal,
  isTerminalOrHonor,
  isWind,
  normalizeTile,
  rankOf,
  tileName,
  tileSuitIndex,
} from './tiles';
import type { Meld, Tile, Wind, Yaku } from './types';

export type WaitType = 'ryanmen' | 'kanchan' | 'penchan' | 'tanki' | 'shanpon';

export interface HandContext {
  roundWind: Wind;
  seatWind: Wind;
  isTsumo: boolean;
  riichi?: boolean;
  doubleRiichi?: boolean;
  ippatsu?: boolean;
  rinshan?: boolean;
  chankan?: boolean;
  haitei?: boolean;
  houtei?: boolean;
  tenhou?: boolean;
  chiihou?: boolean;
  doraIndicators?: Tile[];
  uraIndicators?: Tile[];
}

export interface HandEvaluation {
  yaku: Yaku[];
  /** 含宝牌、里宝牌、技能减番后的番数（技能在 state 层应用）。 */
  han: number;
  fu: number;
  dora: number;
  uraDora: number;
  akaDora: number;
  yakumanCount: number;
}

interface Group {
  kind: 'sequence' | 'triplet' | 'kan';
  tiles: Tile[];
  /** 是否为门清暗刻/暗杠。 */
  concealed: boolean;
  /** 是否为杠。 */
  kan: boolean;
  /** 是否为大明杠/加杠（用于符与役）。 */
  openKan: boolean;
}

interface Interpretation {
  pair: Tile;
  groups: Group[];
  waitType: WaitType;
  winGroupIndex: number | null;
}

const YAKU_NAMES = {
  riichi: '立直',
  doubleRiichi: '两立直',
  ippatsu: '一发',
  tsumo: '门清自摸',
  pinfu: '平和',
  tanyao: '断幺九',
  iipeiko: '一杯口',
  ryanpeiko: '二杯口',
  sanshoku: '三色同顺',
  ittsu: '一气通贯',
  chanta: '混全带幺九',
  junchan: '纯全带幺九',
  toitoi: '对对和',
  sanankou: '三暗刻',
  sankantsu: '三杠子',
  sanshokuDoukou: '三色同刻',
  honroutou: '混老头',
  shousangen: '小三元',
  honitsu: '混一色',
  chinitsu: '清一色',
  chiitoi: '七对子',
  rinshan: '岭上开花',
  chankan: '抢杠',
  haitei: '海底摸月',
  houtei: '河底捞鱼',
  kokushi: '国士无双',
  kokushi13: '国士无双十三面',
  suuankou: '四暗刻',
  suuankouTanki: '四暗刻单骑',
  daisangen: '大三元',
  shousuushii: '小四喜',
  daisuushii: '大四喜',
  tsuuiisou: '字一色',
  chinroutou: '清老头',
  ryuuiisou: '绿一色',
  chuuren: '九莲宝灯',
  chuuren9: '纯正九莲宝灯',
  suukantsu: '四杠子',
  tenhou: '天和',
  chiihou: '地和',
} as const;

function addYaku(list: Yaku[], id: string, name: string, han: number): void {
  list.push({ id, name, han });
}

function addYakuman(list: Yaku[], id: string, name: string, count = 1): void {
  list.push({ id, name: count > 1 ? `${name}（双倍役满）` : name, han: 13 * count, yakuman: true });
}

function isValuePair(tile: Tile, ctx: HandContext): boolean {
  if (isDragon(tile)) return true;
  if (isWind(tile)) {
    const seat = { east: EAST, south: SOUTH, west: WEST, north: NORTH }[ctx.seatWind];
    const round = { east: EAST, south: SOUTH, west: WEST, north: NORTH }[ctx.roundWind];
    return tile === seat || tile === round;
  }
  return false;
}

function pairFu(tile: Tile, ctx: HandContext): number {
  let fu = 0;
  if (isDragon(tile)) fu += 2;
  if (isWind(tile)) {
    const seat = { east: EAST, south: SOUTH, west: WEST, north: NORTH }[ctx.seatWind];
    const round = { east: EAST, south: SOUTH, west: WEST, north: NORTH }[ctx.roundWind];
    if (tile === seat) fu += 2;
    if (tile === round) fu += 2;
  }
  return fu;
}

function meldToGroup(meld: Meld): Group {
  if (meld.type === 'chi') {
    return { kind: 'sequence', tiles: [...meld.tiles], concealed: false, kan: false, openKan: false };
  }
  const kan = meld.type === 'minkan' || meld.type === 'ankan' || meld.type === 'kakan';
  return {
    kind: kan ? 'kan' : 'triplet',
    tiles: [...meld.tiles],
    concealed: meld.type === 'ankan',
    kan,
    openKan: meld.type === 'minkan' || meld.type === 'kakan',
  };
}

function isMenzen(melds: readonly Meld[]): boolean {
  return melds.every((meld) => meld.type === 'ankan');
}

/** 枚举暗手牌中的所有面子拆分。 */
function extractSets(counts: number[], needed: number): Tile[][][] {
  if (needed === 0) {
    return counts.every((count) => count === 0) ? [[]] : [];
  }
  let first = -1;
  for (let tile = 0; tile < counts.length; tile += 1) {
    if (counts[tile] > 0) {
      first = tile;
      break;
    }
  }
  if (first < 0) return [];

  const results: Tile[][][] = [];

  // 刻子
  if (counts[first] >= 3) {
    counts[first] -= 3;
    for (const rest of extractSets(counts, needed - 1)) {
      results.push([[first, first, first], ...rest]);
    }
    counts[first] += 3;
  }

  // 顺子
  if (first < HONORS) {
    const suitStart = Math.floor(first / 9) * 9;
    const rank = first - suitStart;
    if (rank <= 6 && counts[first + 1] > 0 && counts[first + 2] > 0) {
      counts[first] -= 1;
      counts[first + 1] -= 1;
      counts[first + 2] -= 1;
      for (const rest of extractSets(counts, needed - 1)) {
        results.push([[first, first + 1, first + 2], ...rest]);
      }
      counts[first] += 1;
      counts[first + 1] += 1;
      counts[first + 2] += 1;
    }
  }

  return results;
}

function waitTypeForSequence(sequence: readonly Tile[], winTile: Tile): WaitType {
  const start = sequence[0];
  const rank = rankOf(start);
  if (winTile === sequence[1]) return 'kanchan';
  if (winTile === sequence[2]) {
    // 123 听 3 是边张
    return rank === 1 ? 'penchan' : 'ryanmen';
  }
  // 789 听 7 是边张
  return rank === 7 ? 'penchan' : 'ryanmen';
}

function buildInterpretations(
  handTiles: readonly Tile[],
  melds: readonly Meld[],
  winTile: Tile,
  isTsumo: boolean,
): Interpretation[] {
  const counts = countTiles(handTiles);
  const meldGroups = melds.map(meldToGroup);
  const needed = 4 - meldGroups.length;
  if (needed < 0) return [];
  const interpretations: Interpretation[] = [];

  for (let pair = 0; pair < counts.length; pair += 1) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    const sets = extractSets(counts, needed);
    counts[pair] += 2;

    for (const set of sets) {
      const baseGroups: Group[] = set.map((tiles) => ({
        kind: 'triplet' as const,
        tiles,
        concealed: true,
        kan: false,
        openKan: false,
      }));
      // 顺子重新标记类型
      set.forEach((tiles, index) => {
        if (tiles[0] !== tiles[1]) {
          baseGroups[index] = { kind: 'sequence', tiles, concealed: true, kan: false, openKan: false };
        }
      });
      const groups = [...baseGroups, ...meldGroups];

      if (pair === winTile) {
        interpretations.push({ pair, groups, waitType: 'tanki', winGroupIndex: null });
      }

      groups.forEach((group, groupIndex) => {
        if (!group.tiles.includes(winTile)) return;
        if (group.kind === 'sequence') {
          const waitType = waitTypeForSequence(group.tiles, winTile);
          const copied = groups.map((g, i) => (i === groupIndex ? { ...g, tiles: [...g.tiles] } : g));
          interpretations.push({ pair, groups: copied, waitType, winGroupIndex: groupIndex });
        } else {
          const copied = groups.map((g, i) => (i === groupIndex ? { ...g, tiles: [...g.tiles] } : g));
          // 荣和完成的暗刻视为明刻；暗杠不受影响。
          if (!isTsumo && group.kind === 'triplet' && group.concealed) {
            copied[groupIndex] = { ...copied[groupIndex], concealed: false };
          }
          interpretations.push({ pair, groups: copied, waitType: 'shanpon', winGroupIndex: groupIndex });
        }
      });
    }
  }

  // 去掉完全相同的拆分（不同枚举顺序可能重复）
  const seen = new Set<string>();
  return interpretations.filter((interp) => {
    const key = JSON.stringify({
      pair: interp.pair,
      wait: interp.waitType,
      groups: interp.groups.map((group) => [group.kind, group.tiles, group.concealed]).sort(),
    });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function allTilesOf(handTiles: readonly Tile[], melds: readonly Meld[]): Tile[] {
  return [...handTiles, ...melds.flatMap((meld) => meld.tiles)];
}

function countDora(tiles: readonly Tile[], indicators: readonly Tile[]): number {
  if (indicators.length === 0) return 0;
  const doraKinds = indicators.map(doraFromIndicator);
  let total = 0;
  for (const tile of tiles) {
    const normal = normalizeTile(tile);
    total += doraKinds.reduce((sum, dora) => sum + (dora === normal ? 1 : 0), 0);
  }
  return total;
}

function allGroupsContainTerminalOrHonor(groups: readonly Group[], pair: Tile): boolean {
  if (!isTerminalOrHonor(pair)) return false;
  return groups.every((group) => group.tiles.some((tile) => isTerminalOrHonor(tile)));
}

function allGroupsContainTerminal(groups: readonly Group[], pair: Tile): boolean {
  if (!isTerminal(pair)) return false;
  return groups.every((group) => group.tiles.some((tile) => isTerminal(tile)));
}

function detectYakuman(
  interp: Interpretation,
  fullTiles: readonly Tile[],
  melds: readonly Meld[],
  winTile: Tile,
): Yaku[] {
  const yakuman: Yaku[] = [];
  const menzen = isMenzen(melds);
  const groups = interp.groups;
  const triplets = groups.filter((group) => group.kind !== 'sequence');
  const triangleTiles = (tile: Tile) => triplets.filter((group) => group.tiles[0] === tile).length;
  const allHonors = fullTiles.every((tile) => isHonor(tile));
  const allTerminals = fullTiles.every((tile) => isTerminal(tile));
  const allGreen = fullTiles.every((tile) => isGreen(tile));
  const dragonTriplets = DRAGONS.filter((tile) => triangleTiles(tile) > 0).length;
  const windTriplets = WINDS.filter((tile) => triangleTiles(tile) > 0).length;
  const pair = interp.pair;

  if (dragonTriplets === 3) addYakuman(yakuman, 'daisangen', YAKU_NAMES.daisangen);

  if (windTriplets === 4) {
    addYakuman(yakuman, 'daisuushii', YAKU_NAMES.daisuushii, 2);
  } else if (windTriplets === 3 && isWind(pair)) {
    addYakuman(yakuman, 'shousuushii', YAKU_NAMES.shousuushii);
  }

  if (allHonors) addYakuman(yakuman, 'tsuuiisou', YAKU_NAMES.tsuuiisou);
  if (allTerminals) addYakuman(yakuman, 'chinroutou', YAKU_NAMES.chinroutou);
  if (allGreen) addYakuman(yakuman, 'ryuuiisou', YAKU_NAMES.ryuuiisou);

  const concealedTriplets = groups.filter(
    (group) => group.kind !== 'sequence' && group.concealed,
  ).length;
  if (menzen && concealedTriplets === 4) {
    if (interp.waitType === 'tanki') {
      addYakuman(yakuman, 'suuankou-tanki', YAKU_NAMES.suuankouTanki, 2);
    } else {
      addYakuman(yakuman, 'suuankou', YAKU_NAMES.suuankou);
    }
  }

  if (melds.filter((meld) => meld.type === 'minkan' || meld.type === 'ankan' || meld.type === 'kakan').length === 4) {
    addYakuman(yakuman, 'suukantsu', YAKU_NAMES.suukantsu);
  }

  // 九莲宝灯：门清、单一数位牌、1112345678999 + 任意一张
  const normalTiles = fullTiles.map(normalizeTile);
  if (menzen && normalTiles.every((tile) => !isHonor(tile))) {
    const suits = new Set(normalTiles.map((tile) => tileSuitIndex(tile)));
    if (suits.size === 1) {
      const suit = [...suits][0];
      const base = suit * 9;
      const counts = new Array<number>(9).fill(0);
      for (const tile of normalTiles) counts[tile - base] += 1;
      const required = [3, 1, 1, 1, 1, 1, 1, 1, 3];
      const isChuuren = required.every((need, index) => counts[index] >= need);
      if (isChuuren) {
        const extraCount = counts.reduce((sum, value) => sum + value, 0) - 13;
        if (extraCount === 1) {
          // 和牌前正好是 1112345678999 的九面听牌型，则为纯正九莲。
          const preCounts = [...counts];
          const normalWin = normalizeTile(winTile);
          if (normalWin >= base && normalWin < base + 9) preCounts[normalWin - base] -= 1;
          const isPure = required.every((need, index) => preCounts[index] === need);
          if (isPure) {
            addYakuman(yakuman, 'chuuren-9', YAKU_NAMES.chuuren9, 2);
          } else {
            addYakuman(yakuman, 'chuuren', YAKU_NAMES.chuuren);
          }
        }
      }
    }
  }

  return yakuman;
}

function evaluateStandardInterpretation(
  interp: Interpretation,
  handTiles: readonly Tile[],
  melds: readonly Meld[],
  ctx: HandContext,
  winTile: Tile,
): HandEvaluation | null {
  const fullTiles = allTilesOf(handTiles, melds);
  const menzen = isMenzen(melds);
  const allSimple = fullTiles.every((tile) => isSimple(tile));
  const allTerminalHonor = fullTiles.every((tile) => isTerminalOrHonor(tile));
  const sequences = interp.groups.filter((group) => group.kind === 'sequence');
  const triplets = interp.groups.filter((group) => group.kind !== 'sequence');
  const pair = interp.pair;

  const yakuman = detectYakuman(interp, fullTiles, melds, winTile);
  if (ctx.tenhou) addYakuman(yakuman, 'tenhou', YAKU_NAMES.tenhou);
  if (ctx.chiihou) addYakuman(yakuman, 'chiihou', YAKU_NAMES.chiihou);
  if (yakuman.length > 0) {
    return {
      yaku: yakuman,
      han: 0,
      fu: 0,
      dora: 0,
      uraDora: 0,
      akaDora: 0,
      yakumanCount: yakuman.reduce((sum, yaku) => sum + yaku.han / 13, 0),
    };
  }

  const yaku: Yaku[] = [];
  const doubleRiichi = !!ctx.doubleRiichi;
  if (doubleRiichi) addYaku(yaku, 'double-riichi', YAKU_NAMES.doubleRiichi, 2);
  else if (ctx.riichi) addYaku(yaku, 'riichi', YAKU_NAMES.riichi, 1);
  if ((ctx.riichi || doubleRiichi) && ctx.ippatsu) addYaku(yaku, 'ippatsu', YAKU_NAMES.ippatsu, 1);
  if (menzen && ctx.isTsumo) addYaku(yaku, 'tsumo', YAKU_NAMES.tsumo, 1);

  const pinfu =
    menzen &&
    sequences.length === 4 &&
    !isValuePair(pair, ctx) &&
    interp.waitType === 'ryanmen';
  if (pinfu) addYaku(yaku, 'pinfu', YAKU_NAMES.pinfu, 1);
  if (allSimple) addYaku(yaku, 'tanyao', YAKU_NAMES.tanyao, 1);

  if (menzen) {
    const seqCounts = new Map<string, number>();
    for (const seq of sequences) {
      const key = seq.tiles.join('-');
      seqCounts.set(key, (seqCounts.get(key) ?? 0) + 1);
    }
    const pairsOfSequences = [...seqCounts.values()].filter((count) => count >= 2).length;
    if (pairsOfSequences >= 2) addYaku(yaku, 'ryanpeiko', YAKU_NAMES.ryanpeiko, 3);
    else if (pairsOfSequences === 1) addYaku(yaku, 'iipeiko', YAKU_NAMES.iipeiko, 1);
  }

  // 三色同顺
  let sanshoku = false;
  for (const seq of sequences) {
    const start = seq.tiles[0];
    if (start >= HONORS) continue;
    const rank = start % 9;
    if (rank > 6) continue;
    const hasAll = [0, 1, 2].every((s) =>
      sequences.some((other) => {
        const otherStart = other.tiles[0];
        return Math.floor(otherStart / 9) === s && otherStart % 9 === rank;
      }),
    );
    if (hasAll) {
      sanshoku = true;
      break;
    }
  }
  if (sanshoku) addYaku(yaku, 'sanshoku', YAKU_NAMES.sanshoku, menzen ? 2 : 1);

  // 一气通贯
  let ittsu = false;
  for (let suit = 0; suit < 3; suit += 1) {
    const starts = [suit * 9, suit * 9 + 3, suit * 9 + 6];
    if (starts.every((start) => sequences.some((seq) => seq.tiles[0] === start))) {
      ittsu = true;
      break;
    }
  }
  if (ittsu) addYaku(yaku, 'ittsu', YAKU_NAMES.ittsu, menzen ? 2 : 1);

  const everyGroupHasTerminalHonor = allGroupsContainTerminalOrHonor(interp.groups, pair);
  const everyGroupHasTerminal = allGroupsContainTerminal(interp.groups, pair);
  const hasHonor = fullTiles.some((tile) => isHonor(tile));
  if (everyGroupHasTerminal && !hasHonor && sequences.length > 0) {
    addYaku(yaku, 'junchan', YAKU_NAMES.junchan, menzen ? 3 : 2);
  } else if (everyGroupHasTerminalHonor && sequences.length > 0) {
    addYaku(yaku, 'chanta', YAKU_NAMES.chanta, menzen ? 2 : 1);
  }

  if (triplets.length === 4) addYaku(yaku, 'toitoi', YAKU_NAMES.toitoi, 2);
  const concealedTriplets = triplets.filter((group) => group.concealed).length;
  if (concealedTriplets >= 3) addYaku(yaku, 'sanankou', YAKU_NAMES.sanankou, 2);
  if (triplets.filter((group) => group.kan).length >= 3) {
    addYaku(yaku, 'sankantsu', YAKU_NAMES.sankantsu, 2);
  }

  let sanshokuDoukou = false;
  for (let rank = 0; rank < 9; rank += 1) {
    const hasAll = [0, 1, 2].every((suit) =>
      triplets.some((group) => group.kind !== 'sequence' && group.tiles[0] === suit * 9 + rank),
    );
    if (hasAll) {
      sanshokuDoukou = true;
      break;
    }
  }
  if (sanshokuDoukou) addYaku(yaku, 'sanshoku-doukou', YAKU_NAMES.sanshokuDoukou, 2);

  if (allTerminalHonor) addYaku(yaku, 'honroutou', YAKU_NAMES.honroutou, 2);

  const dragonTriplets = DRAGONS.filter((tile) =>
    triplets.some((group) => group.tiles[0] === tile),
  ).length;
  if (dragonTriplets === 2 && isDragon(pair)) {
    addYaku(yaku, 'shousangen', YAKU_NAMES.shousangen, 2);
  }

  const suits = new Set<number>();
  let hasHonors = false;
  for (const tile of fullTiles) {
    if (isHonor(tile)) hasHonors = true;
    else suits.add(tileSuitIndex(tile));
  }
  if (suits.size === 1 && !hasHonors) addYaku(yaku, 'chinitsu', YAKU_NAMES.chinitsu, menzen ? 6 : 5);
  else if (suits.size === 1 && hasHonors) addYaku(yaku, 'honitsu', YAKU_NAMES.honitsu, menzen ? 3 : 2);

  // 役牌
  for (const dragon of DRAGONS) {
    if (triplets.some((group) => group.tiles[0] === dragon)) {
      addYaku(yaku, `yakuhai-${dragon}`, `役牌 ${tileName(dragon)}`, 1);
    }
  }
  const seatTile = { east: EAST, south: SOUTH, west: WEST, north: NORTH }[ctx.seatWind];
  const roundTile = { east: EAST, south: SOUTH, west: WEST, north: NORTH }[ctx.roundWind];
  if (triplets.some((group) => group.tiles[0] === seatTile)) {
    addYaku(yaku, 'yakuhai-seat', `自风 ${tileName(seatTile)}`, 1);
  }
  if (roundTile !== seatTile && triplets.some((group) => group.tiles[0] === roundTile)) {
    addYaku(yaku, 'yakuhai-round', `场风 ${tileName(roundTile)}`, 1);
  } else if (roundTile === seatTile && triplets.some((group) => group.tiles[0] === roundTile)) {
    // 连风牌：自风与场风各一番，合并显示为 2 番。
    addYaku(yaku, 'yakuhai-double-wind', `连风牌 ${tileName(roundTile)}`, 2);
  }

  if (ctx.rinshan) addYaku(yaku, 'rinshan', YAKU_NAMES.rinshan, 1);
  if (ctx.chankan) addYaku(yaku, 'chankan', YAKU_NAMES.chankan, 1);
  if (ctx.haitei) addYaku(yaku, 'haitei', YAKU_NAMES.haitei, 1);
  if (ctx.houtei) addYaku(yaku, 'houtei', YAKU_NAMES.houtei, 1);

  if (yaku.length === 0) return null;

  const dora = countDora(fullTiles, ctx.doraIndicators ?? []);
  const akaDora = countRedFives(fullTiles);
  const uraDora =
    ctx.riichi || doubleRiichi
      ? countDora(fullTiles, ctx.uraIndicators ?? [])
      : 0;

  let fu = calculateFu(interp, ctx, menzen, pinfu);
  if (!ctx.isTsumo && fu < 30 && fu !== 25) fu = 30;

  return {
    yaku,
    han: yaku.reduce((sum, item) => sum + item.han, 0) + dora + uraDora + akaDora,
    fu,
    dora,
    uraDora,
    akaDora,
    yakumanCount: 0,
  };
}

function calculateFu(
  interp: Interpretation,
  ctx: HandContext,
  menzen: boolean,
  pinfu: boolean,
): number {
  let fu = 20;
  if (menzen && !ctx.isTsumo) fu += 10;
  if (ctx.isTsumo && !pinfu) fu += 2;
  fu += pairFu(interp.pair, ctx);

  for (const group of interp.groups) {
    if (group.kind === 'sequence') continue;
    const terminal = isTerminalOrHonor(group.tiles[0]);
    if (group.kan) {
      if (group.concealed) fu += terminal ? 32 : 16;
      else fu += terminal ? 16 : 8;
    } else if (group.concealed) {
      fu += terminal ? 8 : 4;
    } else {
      fu += terminal ? 4 : 2;
    }
  }

  if (interp.waitType === 'tanki' || interp.waitType === 'kanchan' || interp.waitType === 'penchan') {
    fu += 2;
  }

  if (pinfu) return ctx.isTsumo ? 20 : 30;
  return Math.ceil(fu / 10) * 10;
}

function evaluateChiitoi(
  handTiles: readonly Tile[],
  melds: readonly Meld[],
  ctx: HandContext,
): HandEvaluation | null {
  if (melds.length > 0) return null;
  const counts = countTiles(handTiles);
  const pairs = counts.filter((count) => count >= 2).length;
  const pairUnits = counts.reduce((sum, count) => sum + Math.floor(count / 2), 0);
  if (pairs !== 7 || pairUnits !== 7) return null;
  if (handTiles.length !== 14) return null;

  const fullTiles = [...handTiles];
  const yakuman: Yaku[] = [];
  if (fullTiles.every((tile) => isHonor(tile))) addYakuman(yakuman, 'tsuuiisou', YAKU_NAMES.tsuuiisou);
  if (fullTiles.every((tile) => isTerminal(tile))) addYakuman(yakuman, 'chinroutou', YAKU_NAMES.chinroutou);
  if (fullTiles.every((tile) => isGreen(tile))) addYakuman(yakuman, 'ryuuiisou', YAKU_NAMES.ryuuiisou);
  if (ctx.tenhou) addYakuman(yakuman, 'tenhou', YAKU_NAMES.tenhou);
  if (ctx.chiihou) addYakuman(yakuman, 'chiihou', YAKU_NAMES.chiihou);

  if (yakuman.length > 0) {
    return {
      yaku: yakuman,
      han: 0,
      fu: 25,
      dora: 0,
      uraDora: 0,
      akaDora: 0,
      yakumanCount: yakuman.length,
    };
  }

  const yaku: Yaku[] = [];
  const doubleRiichi = !!ctx.doubleRiichi;
  if (doubleRiichi) addYaku(yaku, 'double-riichi', YAKU_NAMES.doubleRiichi, 2);
  else if (ctx.riichi) addYaku(yaku, 'riichi', YAKU_NAMES.riichi, 1);
  if ((ctx.riichi || doubleRiichi) && ctx.ippatsu) addYaku(yaku, 'ippatsu', YAKU_NAMES.ippatsu, 1);
  if (ctx.isTsumo) addYaku(yaku, 'tsumo', YAKU_NAMES.tsumo, 1);
  addYaku(yaku, 'chiitoi', YAKU_NAMES.chiitoi, 2);
  if (fullTiles.every((tile) => isSimple(tile))) addYaku(yaku, 'tanyao', YAKU_NAMES.tanyao, 1);
  if (fullTiles.every((tile) => isTerminalOrHonor(tile))) {
    addYaku(yaku, 'honroutou', YAKU_NAMES.honroutou, 2);
  }

  const suits = new Set<number>();
  let hasHonors = false;
  for (const tile of fullTiles) {
    if (isHonor(tile)) hasHonors = true;
    else suits.add(tileSuitIndex(tile));
  }
  if (suits.size === 1 && !hasHonors) addYaku(yaku, 'chinitsu', YAKU_NAMES.chinitsu, 6);
  else if (suits.size === 1 && hasHonors) addYaku(yaku, 'honitsu', YAKU_NAMES.honitsu, 3);

  if (ctx.rinshan) addYaku(yaku, 'rinshan', YAKU_NAMES.rinshan, 1);
  if (ctx.chankan) addYaku(yaku, 'chankan', YAKU_NAMES.chankan, 1);
  if (ctx.haitei) addYaku(yaku, 'haitei', YAKU_NAMES.haitei, 1);
  if (ctx.houtei) addYaku(yaku, 'houtei', YAKU_NAMES.houtei, 1);

  const dora = countDora(fullTiles, ctx.doraIndicators ?? []);
  const akaDora = countRedFives(fullTiles);
  const uraDora =
    ctx.riichi || doubleRiichi ? countDora(fullTiles, ctx.uraIndicators ?? []) : 0;

  return {
    yaku,
    han: yaku.reduce((sum, item) => sum + item.han, 0) + dora + uraDora + akaDora,
    fu: 25,
    dora,
    uraDora,
    akaDora,
    yakumanCount: 0,
  };
}

function evaluateKokushi(handTiles: readonly Tile[], melds: readonly Meld[]): HandEvaluation | null {
  if (melds.length > 0 || handTiles.length !== 14) return null;
  const counts = countTiles(handTiles);
  const orphanKinds = [0, 8, 9, 17, 18, 26, EAST, SOUTH, WEST, NORTH, HAKU, HATSU, CHUN];
  const allOrphans = handTiles.every((tile) => orphanKinds.includes(tile));
  if (!allOrphans) return null;
  const hasAll = orphanKinds.every((tile) => counts[tile] >= 1);
  if (!hasAll) return null;
  const duplicate = counts.findIndex((count) => count >= 2);
  if (duplicate < 0) return null;

  const pre = [...counts];
  pre[duplicate] -= 1;
  const isThirteenWait = orphanKinds.every((tile) => pre[tile] === 1);
  const yaku: Yaku[] = [];
  addYakuman(
    yaku,
    isThirteenWait ? 'kokushi-13' : 'kokushi',
    isThirteenWait ? YAKU_NAMES.kokushi13 : YAKU_NAMES.kokushi,
    isThirteenWait ? 2 : 1,
  );
  return {
    yaku,
    han: 0,
    fu: 0,
    dora: 0,
    uraDora: 0,
    akaDora: 0,
    yakumanCount: yaku[0].han / 13,
  };
}

/** 是否构成和牌牌型（不检查役种/振听）。 */
export function isWinningHand(handTiles: readonly Tile[], melds: readonly Meld[] = []): boolean {
  if (handTiles.length === 0) return false;
  const counts = countTiles(handTiles);
  const needed = 4 - melds.length;
  if (needed < 0) return false;
  // 七对子
  if (melds.length === 0 && handTiles.length === 14) {
    const pairUnits = counts.reduce((sum, count) => sum + Math.floor(count / 2), 0);
    const pairKinds = counts.filter((count) => count >= 2).length;
    if (pairUnits === 7 && pairKinds === 7) return true;
    // 国士
    const orphans = [0, 8, 9, 17, 18, 26, EAST, SOUTH, WEST, NORTH, HAKU, HATSU, CHUN];
    if (handTiles.every((tile) => orphans.includes(tile)) && orphans.every((tile) => counts[tile] >= 1)) {
      return true;
    }
  }
  for (let pair = 0; pair < counts.length; pair += 1) {
    if (counts[pair] < 2) continue;
    const copy = [...counts];
    copy[pair] -= 2;
    if (extractSets(copy, needed).length > 0) return true;
  }
  return false;
}

/** 计算 13 张手牌的听牌张。 */
export function getWinningTiles(handTiles: readonly Tile[], melds: readonly Meld[] = []): Tile[] {
  if (handTiles.length + melds.length * 3 !== 13) return [];
  const counts = countTiles(handTiles);
  const meldCounts = countTiles(melds.flatMap((meld) => meld.tiles));
  const waits: Tile[] = [];
  for (let tile = 0; tile < counts.length; tile += 1) {
    if (counts[tile] + meldCounts[tile] >= 4) continue;
    if (isWinningHand([...handTiles, tile], melds)) waits.push(tile);
  }
  return waits;
}

export function isTenpai(handTiles: readonly Tile[], melds: readonly Meld[] = []): boolean {
  return getWinningTiles(handTiles, melds).length > 0;
}

/** 计算牌河（或任意牌集合）中是否包含自己的听牌。 */
export function hasWaitInTiles(
  handTiles: readonly Tile[],
  melds: readonly Meld[],
  tiles: readonly Tile[],
): boolean {
  const waits = getWinningTiles(handTiles, melds);
  return tiles.some((tile) => waits.includes(normalizeTile(tile)));
}

/** 完整评估和牌；若没有役则返回 null。 */
export function evaluateHand(
  handTiles: readonly Tile[],
  melds: readonly Meld[],
  winTile: Tile,
  ctx: HandContext,
): HandEvaluation | null {
  if (!isWinningHand(handTiles, melds)) return null;
  if (!handTiles.includes(winTile)) return null;
  const normalWin = normalizeTile(winTile);

  const results: HandEvaluation[] = [];
  const chiitoi = evaluateChiitoi(handTiles, melds, ctx);
  if (chiitoi) results.push(chiitoi);
  const kokushi = evaluateKokushi(handTiles, melds);
  if (kokushi) results.push(kokushi);

  for (const interp of buildInterpretations(handTiles, melds, normalWin, ctx.isTsumo)) {
    const evaluated = evaluateStandardInterpretation(interp, handTiles, melds, ctx, normalWin);
    if (evaluated) results.push(evaluated);
  }

  if (results.length === 0) return null;
  results.sort((a, b) => {
    const ay = a.yakumanCount;
    const by = b.yakumanCount;
    if (ay !== by) return by - ay;
    if (a.han !== b.han) return b.han - a.han;
    return b.fu - a.fu;
  });
  return results[0];
}

/** 简化的向听数：返回 -1 表示和牌，0 表示听牌。 */
export function calculateShanten(handTiles: readonly Tile[], melds: readonly Meld[] = []): number {
  const counts = countTiles(handTiles);
  const openMelds = melds.length;
  let best = 8;

  const dfs = (index: number, sets: number, taatsu: number, pair: number): void => {
    if (index >= 34) {
      const totalSets = sets + openMelds;
      const cappedTaatsu = Math.min(taatsu, Math.max(0, 4 - totalSets));
      const value = 8 - totalSets * 2 - cappedTaatsu - pair;
      if (value < best) best = value;
      return;
    }
    if (counts[index] === 0) {
      dfs(index + 1, sets, taatsu, pair);
      return;
    }

    // 刻子
    if (counts[index] >= 3) {
      counts[index] -= 3;
      dfs(index, sets + 1, taatsu, pair);
      counts[index] += 3;
    }
    // 顺子
    if (index < HONORS) {
      const rank = index % 9;
      if (rank <= 6 && counts[index + 1] > 0 && counts[index + 2] > 0) {
        counts[index] -= 1;
        counts[index + 1] -= 1;
        counts[index + 2] -= 1;
        dfs(index, sets + 1, taatsu, pair);
        counts[index] += 1;
        counts[index + 1] += 1;
        counts[index + 2] += 1;
      }
    }
    // 对子作雀头
    if (counts[index] >= 2) {
      counts[index] -= 2;
      if (pair === 0) dfs(index, sets, taatsu, 1);
      dfs(index, sets, taatsu + 1, pair);
      counts[index] += 2;
    }
    // 两面/嵌张搭子
    if (index < HONORS) {
      const rank = index % 9;
      if (rank <= 7 && counts[index + 1] > 0) {
        counts[index] -= 1;
        counts[index + 1] -= 1;
        dfs(index, sets, taatsu + 1, pair);
        counts[index] += 1;
        counts[index + 1] += 1;
      }
      if (rank <= 6 && counts[index + 2] > 0) {
        counts[index] -= 1;
        counts[index + 2] -= 1;
        dfs(index, sets, taatsu + 1, pair);
        counts[index] += 1;
        counts[index + 2] += 1;
      }
    }
    // 跳过一张孤张
    counts[index] -= 1;
    dfs(index, sets, taatsu, pair);
    counts[index] += 1;
  };

  dfs(0, 0, 0, 0);

  if (melds.length === 0) {
    const pairUnits = counts.reduce((sum, count) => sum + Math.floor(count / 2), 0);
    const distinct = counts.filter((count) => count > 0).length;
    const chiitoiShanten = 6 - pairUnits + Math.max(0, 7 - distinct);
    if (chiitoiShanten < best) best = chiitoiShanten;

    const orphans = [0, 8, 9, 17, 18, 26, EAST, SOUTH, WEST, NORTH, HAKU, HATSU, CHUN];
    const unique = orphans.filter((tile) => counts[tile] > 0).length;
    const hasPair = orphans.some((tile) => counts[tile] >= 2);
    const kokushiShanten = 13 - unique - (hasPair ? 1 : 0);
    if (kokushiShanten < best) best = kokushiShanten;
  }

  return best;
}

/** 牌姿的简要文本，用于日志与测试。 */
export function handToString(handTiles: readonly Tile[]): string {
  return handTiles.map(tileName).join(' ');
}

/** 暴露给 UI 的听牌提示。 */
export interface TenpaiInfo {
  tenpai: boolean;
  waits: Tile[];
  furiten: boolean;
}

export function analyzeTenpai(
  handTiles: readonly Tile[],
  melds: readonly Meld[],
  ownRiver: readonly Tile[],
): TenpaiInfo {
  const waits = getWinningTiles(handTiles, melds);
  return {
    tenpai: waits.length > 0,
    waits,
    furiten: waits.some((tile) => ownRiver.some((riverTile) => normalizeTile(riverTile) === tile)),
  };
}
