/**
 * 简单但不随机的 AI。
 * 只使用自己的手牌、牌河、副露、宝牌指示牌、点数和立直状态等公开信息，
 * 绝不读取对手手牌或牌山内容（阿米娅检索时仅验证目标牌是否仍在牌山）。
 */

import {
  calculateShanten,
  getWinningTiles,
  isTenpai,
} from './rules';
import {
  EAST,
  SOUTH,
  WEST,
  countTiles,
  doraFromIndicator,
  isDragon,
  isHonor,
  isRedFive,
  isSimple,
  isTerminalOrHonor,
  normalizeTile,
  sameTileKind,
  tileName,
} from './tiles';
import { getAnkanOptions, getKakanOptions, getLegalDiscards, getReactionOptions, getTsumoResult, canDeclareNineTerminals } from './state';
import { skillCostFor, validateSkillActivation } from './skills';
import type { ChiOption, GameState, PlayerIndex, Tile } from './types';

export type AiAction =
  | { type: 'discard'; tile: Tile; riichi: boolean }
  | { type: 'tsumo' }
  | { type: 'ron' }
  | { type: 'pass' }
  | { type: 'pon' }
  | { type: 'kan' }
  | { type: 'chi'; option: ChiOption }
  | { type: 'skill'; tile?: Tile }
  | { type: 'ankan'; tile: Tile }
  | { type: 'kakan'; tile: Tile }
  | { type: 'nineTerminals' };

function opponentOf(player: PlayerIndex): PlayerIndex {
  return player === 0 ? 1 : 0;
}

function seatWindTile(state: GameState, player: PlayerIndex): Tile {
  if (player === state.dealer) return EAST;
  return WEST;
}

function roundWindTile(state: GameState): Tile {
  return state.roundWind === 'east' ? EAST : SOUTH;
}

function isValueTile(state: GameState, player: PlayerIndex, tile: Tile): boolean {
  return (
    isDragon(tile) ||
    tile === seatWindTile(state, player) ||
    tile === roundWindTile(state)
  );
}

/** 公开可见的牌数（不含对手手牌和牌山）。 */
function visibleCounts(state: GameState, player: PlayerIndex): number[] {
  const counts = new Array<number>(34).fill(0);
  const me = state.players[player];
  const foe = state.players[opponentOf(player)];
  for (const tile of [...me.hand, ...me.melds.flatMap((meld) => meld.tiles)]) {
    counts[normalizeTile(tile)] += 1;
  }
  for (const tile of [...foe.river.map((record) => record.tile), ...foe.melds.flatMap((meld) => meld.tiles)]) {
    counts[normalizeTile(tile)] += 1;
  }
  for (const tile of me.river.map((record) => record.tile)) counts[normalizeTile(tile)] += 1;
  for (const indicator of state.deadWall.doraIndicators.slice(0, state.deadWall.revealed)) {
    counts[normalizeTile(indicator)] += 1;
  }
  return counts;
}

function isSafeAgainstRiichi(state: GameState, player: PlayerIndex, tile: Tile): boolean {
  const foe = state.players[opponentOf(player)];
  if (!foe.riichi) return false;
  if (foe.river.some((record) => sameTileKind(record.tile, tile))) return true;
  const visible = visibleCounts(state, player);
  return visible[normalizeTile(tile)] >= 4;
}

function handUkeire(
  state: GameState,
  player: PlayerIndex,
  handAfter: Tile[],
  melds: GameState['players'][0]['melds'],
  currentShanten: number,
): number {
  const visible = visibleCounts(state, player);
  const ownMelds = melds.flatMap((meld) => meld.tiles);
  const used = countTiles([...handAfter, ...ownMelds]);
  let total = 0;
  for (let tile = 0; tile < 34; tile += 1) {
    if (used[tile] >= 4) continue;
    const remaining = Math.max(0, 4 - visible[tile]);
    if (remaining === 0) continue;
    const nextShanten = calculateShanten([...handAfter, tile], melds);
    if (nextShanten < currentShanten) total += remaining;
  }
  return total;
}

function tileKeepValue(state: GameState, player: PlayerIndex, tile: Tile): number {
  let value = 0;
  if (isValueTile(state, player, tile)) value += 8;
  const p = state.players[player];
  const count = p.hand.filter((t) => sameTileKind(t, tile)).length;
  if (count >= 2) value += 7;
  if (isRedFive(tile)) value += 5;
  if (isHonor(tile) && !isValueTile(state, player, tile) && count === 1) value -= 10;
  if (isTerminalOrHonor(tile) && count === 1) value -= 4;
  const doraCount = state.deadWall.doraIndicators
    .slice(0, state.deadWall.revealed)
    .filter((indicator) => doraFromIndicator(indicator) === normalizeTile(tile)).length;
  value += doraCount * 6;
  return value;
}

interface DiscardEvaluation {
  tile: Tile;
  shanten: number;
  ukeire: number;
  waits: Tile[];
  safe: boolean;
  value: number;
  shape: number;
}

function evaluateDiscard(state: GameState, player: PlayerIndex, tile: Tile): DiscardEvaluation {
  const p = state.players[player];
  const handAfter = [...p.hand];
  const index = handAfter.indexOf(tile);
  if (index >= 0) handAfter.splice(index, 1);
  const shanten = calculateShanten(handAfter, p.melds);
  const waits = getWinningTiles(handAfter, p.melds);
  const ukeire = handUkeire(state, player, handAfter, p.melds, shanten);
  const safe = isSafeAgainstRiichi(state, player, tile);
  return {
    tile,
    shanten,
    ukeire,
    waits,
    safe,
    value: tileKeepValue(state, player, tile),
    shape: 0,
  };
}

function chooseDiscard(state: GameState, player: PlayerIndex): DiscardEvaluation {
  const p = state.players[player];
  const legal = getLegalDiscards(state, player);
  if (legal.length === 0) throw new Error('AI 无合法出牌。');
  if (p.riichi || p.amiyaLock > 0) {
    const tile = legal[0];
    const evaluation = evaluateDiscard(state, player, tile);
    return evaluation;
  }

  const evaluations = legal.map((tile) => evaluateDiscard(state, player, tile));
  const foeRiichi = state.players[opponentOf(player)].riichi;
  let candidates = evaluations;
  let defensiveOnly = false;

  if (foeRiichi) {
    const safe = evaluations.filter((entry) => entry.safe);
    if (safe.length > 0) candidates = safe;
    else defensiveOnly = true;
  }

  candidates.sort((a, b) => {
    // 对手立直且没有现物时，优先切幺九字防守。
    if (defensiveOnly) {
      const aDanger = isTerminalOrHonor(a.tile) ? 0 : 1;
      const bDanger = isTerminalOrHonor(b.tile) ? 0 : 1;
      if (aDanger !== bDanger) return aDanger - bDanger;
    }
    if (a.shanten !== b.shanten) return a.shanten - b.shanten;
    if (a.waits.length !== b.waits.length) return b.waits.length - a.waits.length;
    if (a.ukeire !== b.ukeire) return b.ukeire - a.ukeire;
    if (foeRiichi && a.safe !== b.safe) return a.safe ? -1 : 1;
    return a.value - b.value;
  });

  return candidates[0];
}

function canRiichiForAI(state: GameState, player: PlayerIndex, tile: Tile): boolean {
  const p = state.players[player];
  if (p.riichi || p.amiyaLock > 0 || p.score < 1000) return false;
  if (!p.melds.every((meld) => meld.type === 'ankan')) return false;
  const handAfter = [...p.hand];
  const index = handAfter.indexOf(tile);
  if (index < 0) return false;
  handAfter.splice(index, 1);
  return isTenpai(handAfter, p.melds);
}

function chooseAmiyaSkill(state: GameState, player: PlayerIndex): AiAction | null {
  const p = state.players[player];
  if (p.operator !== 'amiya') return null;
  if (p.riichi || p.skillUsed || p.sp < skillCostFor('amiya') || p.amiyaLock > 0) return null;
  if (state.drawnTile === null) return null;
  // 差一张和牌（听牌）时才检索。判断当前摸牌前的十三张手牌。
  const handBefore = [...p.hand];
  const index = handBefore.indexOf(state.drawnTile);
  if (index < 0) return null;
  handBefore.splice(index, 1);
  const waits = getWinningTiles(handBefore, p.melds);
  if (waits.length === 0) return null;
  const available = waits.find((tile) => state.wall.some((wallTile) => sameTileKind(wallTile, tile)));
  if (available === undefined) return null;
  const validation = validateSkillActivation(state, player, { tile: available });
  if (!validation.ok) return null;
  return { type: 'skill', tile: available };
}

function chooseHoshigumaSkill(state: GameState, player: PlayerIndex): AiAction | null {
  const p = state.players[player];
  if (p.operator !== 'hoshiguma') return null;
  if (p.skillUsed || p.sp < skillCostFor('hoshiguma')) return null;
  const foe = state.players[opponentOf(player)];
  const handBefore = [...p.hand];
  if (state.drawnTile !== null) {
    const index = handBefore.indexOf(state.drawnTile);
    if (index >= 0) handBefore.splice(index, 1);
  }
  const tenpai = getWinningTiles(handBefore, p.melds).length > 0;
  if (!foe.riichi && !tenpai) return null;
  const validation = validateSkillActivation(state, player);
  if (!validation.ok) return null;
  return { type: 'skill' };
}

function chooseReaction(state: GameState, player: PlayerIndex): AiAction {
  const reaction = getReactionOptions(state);
  if (!reaction) return { type: 'pass' };
  const p = state.players[player];
  if (reaction.canRon) return { type: 'ron' };

  const isValue = isValueTile(state, player, reaction.tile);
  const allSimple = p.hand.every((tile) => isSimple(tile)) && p.melds.every((meld) => meld.tiles.every((tile) => isSimple(tile)));
  const shouldOpen = isValue || allSimple;

  if (reaction.canKan && isValue && state.totalKans < 2) return { type: 'kan' };
  if (reaction.canPon && shouldOpen) return { type: 'pon' };
  // 不轻易吃：只有断幺且已是两向听以内才考虑。
  if (reaction.chiOptions.length > 0 && allSimple) {
    const current = calculateShanten(p.hand, p.melds);
    if (current <= 1) {
      for (const option of reaction.chiOptions) {
        const remaining = [...option];
        const idx = remaining.indexOf(reaction.tile);
        if (idx >= 0) remaining.splice(idx, 1);
        const handAfter = [...p.hand];
        let ok = true;
        for (const t of remaining) {
          const i = handAfter.indexOf(t);
          if (i < 0) {
            ok = false;
            break;
          }
          handAfter.splice(i, 1);
        }
        if (!ok) continue;
        const melds = [...p.melds, { type: 'chi' as const, tiles: [...option] }];
        // 需要打出并保持高效率，过于复杂；只有明显进张才吃。
        if (calculateShanten(handAfter, melds) <= 0) return { type: 'chi', option: option as ChiOption };
      }
    }
  }
  return { type: 'pass' };
}

/** AI 主入口。 */
export function decideAiAction(state: GameState, player: PlayerIndex): AiAction {
  if (state.phase === 'react' && state.turn === player) {
    return chooseReaction(state, player);
  }
  if (state.phase !== 'discard' || state.turn !== player) return { type: 'pass' };

  if (getTsumoResult(state)) return { type: 'tsumo' };

  if (canDeclareNineTerminals(state)) {
    const p = state.players[player];
    if (p.operator === 'amiya' && p.amiyaLock > 0) {
      // 技能代价期间不能主动流局
    } else {
      const handBefore = [...p.hand];
      if (state.drawnTile !== null) {
        const idx = handBefore.indexOf(state.drawnTile);
        if (idx >= 0) handBefore.splice(idx, 1);
      }
      if (calculateShanten(handBefore, p.melds) >= 3) return { type: 'nineTerminals' };
    }
  }

  const amiyaSkill = chooseAmiyaSkill(state, player);
  if (amiyaSkill) return amiyaSkill;
  const hoshigumaSkill = chooseHoshigumaSkill(state, player);
  if (hoshigumaSkill) return hoshigumaSkill;

  const ankan = getAnkanOptions(state, player);
  if (ankan.length > 0) return { type: 'ankan', tile: ankan[0] };
  const kakan = getKakanOptions(state, player);
  if (kakan.length > 0) return { type: 'kakan', tile: kakan[0] };

  const best = chooseDiscard(state, player);
  const riichi = canRiichiForAI(state, player, best.tile) && best.waits.length > 0;
  return { type: 'discard', tile: best.tile, riichi };
}

/** 给界面显示 AI 思考摘要。 */
export function describeAiAction(action: AiAction): string {
  switch (action.type) {
    case 'discard':
      return action.riichi ? `立直！打出 ${tileName(action.tile)}` : `打出 ${tileName(action.tile)}`;
    case 'tsumo':
      return '自摸和牌';
    case 'ron':
      return '荣和';
    case 'pass':
      return '跳过';
    case 'pon':
      return '碰';
    case 'kan':
      return '杠';
    case 'chi':
      return '吃';
    case 'skill':
      return action.tile !== undefined ? `检索 ${tileName(action.tile)}` : '发动技能';
    case 'ankan':
      return `暗杠 ${tileName(action.tile)}`;
    case 'kakan':
      return `加杠 ${tileName(action.tile)}`;
    case 'nineTerminals':
      return '九种九牌';
    default:
      return '';
  }
}

/** 给界面显示 AI 思考摘要。 */
