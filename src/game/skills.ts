/**
 * 干员技能系统。
 * 每名干员 1 个被动 + 1 个主动；SP 上限等于主动消耗，跨局保留。
 */

import { isHonor, normalizeTile, sameTileKind, tileName } from './tiles';
import type { GameState, OperatorId, PlayerIndex, Tile } from './types';

export interface OperatorInfo {
  id: OperatorId;
  name: string;
  code: string;
  title: string;
  spCost: number;
  color: string;
  accent: string;
  passiveName: string;
  passiveDescription: string;
  activeName: string;
  activeDescription: string;
  quote: string;
}

export const OPERATORS: Record<OperatorId, OperatorInfo> = {
  amiya: {
    id: 'amiya',
    name: '阿米娅',
    code: 'AMIYA',
    title: '罗德岛公开领袖',
    spCost: 20,
    color: '#8b5cf6',
    accent: '#c4b5fd',
    passiveName: '源石技艺',
    passiveDescription: '每打出一张字牌，额外获得 1 SP（该张共 +2 SP）。',
    activeName: '奇美拉',
    activeDescription:
      '从牌山中检索一张指定牌并立即取得（替换本巡摸牌，原牌回到牌山顶部）。本巡可正常和牌、立直；本巡结束后 3 巡内只能摸切，不可鸣牌、不可立直。每局限一次。',
    quote: '我会带着大家，找到属于我们的未来。',
  },
  hoshiguma: {
    id: 'hoshiguma',
    name: '星熊',
    code: 'HOSHIGUMA',
    title: '龙门近卫局特别督察组',
    spCost: 30,
    color: '#0d9488',
    accent: '#5eead4',
    passiveName: '荆棘',
    passiveDescription: '自身支付点数时，和牌者需额外将支付额 10% 交入场供。',
    activeName: '力之锯',
    activeDescription:
      '本局对手和牌番数 -1（最低 1 番，役满不受影响）。使用后本局不可鸣牌；立直后不可发动。每局限一次。',
    quote: '别怕，我挡在前面。',
  },
};

export function operatorOf(id: OperatorId): OperatorInfo {
  return OPERATORS[id];
}

export function skillCostFor(id: OperatorId): number {
  return OPERATORS[id].spCost;
}

export function spCapFor(id: OperatorId): number {
  return OPERATORS[id].spCost;
}

export function spGainFor(operator: OperatorId, discarded: Tile): number {
  return 1 + (operator === 'amiya' && isHonor(discarded) ? 1 : 0);
}

export interface SkillActivationResult {
  ok: boolean;
  reason?: string;
}

export function validateSkillActivation(
  state: GameState,
  player: PlayerIndex,
  payload?: { tile?: Tile },
): SkillActivationResult {
  const p = state.players[player];
  if (state.phase !== 'discard' || state.turn !== player) {
    return { ok: false, reason: '当前不是你的行动回合。' };
  }
  if (p.skillUsed) return { ok: false, reason: '本局主动技能已经使用过。' };
  if (p.operator === 'amiya' && p.riichi) {
    return { ok: false, reason: '立直中不能发动奇美拉。' };
  }
  if (p.operator === 'hoshiguma' && p.riichi) {
    return { ok: false, reason: '立直中不能发动力之锯。' };
  }
  if (p.sp < OPERATORS[p.operator].spCost) {
    return { ok: false, reason: `SP 不足，需要 ${OPERATORS[p.operator].spCost} 点。` };
  }
  if (p.amiyaLock > 0) return { ok: false, reason: '奇美拉的代价尚未结束。' };
  if (p.operator === 'amiya') {
    if (payload?.tile === undefined) return { ok: false, reason: '请选择要检索的牌。' };
    if (!state.wall.some((wallTile) => sameTileKind(wallTile, payload.tile as Tile))) {
      return { ok: false, reason: '这张牌已经全部出现于手牌、牌河、副露或王牌中。' };
    }
  }
  return { ok: true };
}

function pushEvent(state: GameState, text: string, player: PlayerIndex): void {
  state.eventSeq += 1;
  state.events = [
    ...state.events.slice(-59),
    { id: state.eventSeq, type: 'skill', text, player },
  ];
}

/** 执行主动技能。返回新的 state，不修改原 state。 */
export function activateSkill(
  state: GameState,
  player: PlayerIndex,
  payload?: { tile?: Tile },
): GameState {
  const validation = validateSkillActivation(state, player, payload);
  if (!validation.ok) throw new Error(validation.reason ?? '技能无法使用');
  const next = structuredClone(state);
  const p = next.players[player];

  if (p.operator === 'amiya') {
    const target = payload?.tile as Tile;
    const targetIndex = next.wall.findIndex((wallTile) => sameTileKind(wallTile, target));
    if (targetIndex < 0) throw new Error('牌山中已没有这张牌。');
    const actualTarget = next.wall[targetIndex];
    next.wall.splice(targetIndex, 1);
    const oldDrawn = next.drawnTile;
    if (oldDrawn !== null && oldDrawn !== actualTarget && p.hand.includes(oldDrawn)) {
      // 技能在摸牌后发动：检索牌立即替换本巡摸牌，原摸牌回到牌山顶部。
      const handIndex = p.hand.indexOf(oldDrawn);
      if (handIndex >= 0) p.hand.splice(handIndex, 1);
      p.hand.push(actualTarget);
      next.drawnTile = actualTarget;
      next.wall.unshift(oldDrawn);
      pushEvent(next, `阿米娅发动「奇美拉」，检索并取得「${tileName(actualTarget)}」；本巡不受限制，之后进入 3 巡摸切。`, player);
    } else {
      next.wall.unshift(actualTarget);
      pushEvent(next, `阿米娅发动「奇美拉」，将「${tileName(actualTarget)}」置于牌山顶部；本巡不受限制，之后进入 3 巡摸切。`, player);
    }
    p.amiyaLockPending = true;
    p.amiyaLock = 0;
  } else {
    p.starHanReduction = true;
    p.starNoCall = true;
    pushEvent(next, '星熊发动「力之锯」，本局对手和牌番数 -1，且自身不可鸣牌。', player);
  }

  p.sp = 0;
  p.skillUsed = true;
  return next;
}

/** UI 用：返回阿米娅可以检索的牌种（红五还原为普通五，只显示牌山中仍存在的牌）。 */
export function getAmiyaSelectableTiles(state: GameState): Tile[] {
  return [...new Set(state.wall.map((tile) => normalizeTile(tile)))].sort((a, b) => a - b);
}

/** 供界面展示的当前 SP 上限。 */
export function getSpCap(state: GameState, player: PlayerIndex): number {
  return spCapFor(state.players[player].operator);
}


