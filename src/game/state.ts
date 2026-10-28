/**
 * 2 人立直麻将对局状态机。
 * 所有操作均接收旧 state 并返回新 state，方便 React 撤销式渲染与测试。
 */

import { OPERATORS, activateSkill, skillCostFor, spGainFor } from './skills';
import { calculatePayment } from './scoring';
import { evaluateHand, getWinningTiles, isTenpai } from './rules';
import {
  DRAGONS,
  EAST,
  HONORS,
  NORTH,
  ORPHANS,
  SOUTH,
  WEST,
  buildWall,
  countTiles,
  doraFromIndicator,
  isDragon,
  isHonor,
  isRedFive,
  isTerminalOrHonor,
  isWind,
  normalizeTile,
  sameTileKind,
  sortTiles,
  tileName,
  tileSortValue,
  windName,
} from './tiles';
import type {
  ChiOption,
  GameConfig,
  GameEvent,
  GameState,
  HandSettlement,
  Meld,
  NextRoundInfo,
  PlayerIndex,
  PlayerState,
  ReactionOptions,
  Tile,
  Wind,
  WinResult,
  DrawResult,
} from './types';

const START_SCORE = 30000;
const PLAYER_COUNT = 2;

function opponentOf(player: PlayerIndex): PlayerIndex {
  return player === 0 ? 1 : 0;
}

function playerName(state: GameState, player: PlayerIndex): string {
  return OPERATORS[state.players[player].operator].name;
}

function createPlayer(operator: 'amiya' | 'hoshiguma', score: number, sp: number): PlayerState {
  return {
    hand: [],
    melds: [],
    river: [],
    score,
    sp,
    operator,
    skillUsed: false,
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    riichiTurn: null,
    tempFuriten: false,
    riichiFuriten: false,
    amiyaLock: 0,
    amiyaLockPending: false,
    starHanReduction: false,
    starNoCall: false,
    kuikaeForbidden: [],
    hasDrawn: false,
    paoBy: null,
  };
}

function addEvent(
  state: GameState,
  type: GameEvent['type'],
  text: string,
  player?: PlayerIndex,
): void {
  state.eventSeq += 1;
  state.events.push({ id: state.eventSeq, type, text, player });
  if (state.events.length > 80) state.events.splice(0, state.events.length - 80);
}

function removeTileFromHand(hand: Tile[], tile: Tile, count = 1): boolean {
  for (let i = 0; i < count; i += 1) {
    const index = hand.indexOf(tile);
    if (index < 0) return false;
    hand.splice(index, 1);
  }
  return true;
}

/** 按牌种移除（赤五与普通五视为同种），优先保留赤五，返回实际移除的牌面编码。 */
function removeTilesByKind(hand: Tile[], tile: Tile, count = 1): Tile[] | null {
  const removed: Tile[] = [];
  for (let i = 0; i < count; i += 1) {
    let index = hand.findIndex((candidate) => sameTileKind(candidate, tile) && !isRedFive(candidate));
    if (index < 0) index = hand.findIndex((candidate) => sameTileKind(candidate, tile));
    if (index < 0) return null;
    removed.push(hand.splice(index, 1)[0]);
  }
  return removed;
}

function isForbiddenDiscard(player: PlayerState, tile: Tile): boolean {
  return player.kuikaeForbidden.some((forbidden) => sameTileKind(forbidden, tile));
}

export function seatWindOf(state: GameState, player: PlayerIndex): Wind {
  return player === state.dealer ? 'east' : 'south';
}

export function roundLabel(state: GameState): string {
  return `${windName(state.roundWind)}${state.handNumber}局`;
}

export function playerLabel(state: GameState, player: PlayerIndex): string {
  const p = state.players[player];
  return `${OPERATORS[p.operator].name}${player === state.dealer ? '（庄）' : ''}`;
}

function buildHandState(
  config: GameConfig,
  scores: [number, number],
  sps: [number, number],
  dealer: PlayerIndex,
  roundWind: 'east' | 'south',
  handNumber: number,
  honba: number,
  riichiSticks: number,
  pot: number,
  handSerial: number,
): GameState {
  const wallData = buildWall(`${config.seed}#${handSerial}`);
  const aiOperator = config.playerOperator === 'amiya' ? 'hoshiguma' : 'amiya';
  const players: [PlayerState, PlayerState] = [
    createPlayer(config.playerOperator, scores[0], sps[0]),
    createPlayer(aiOperator, scores[1], sps[1]),
  ];
  players[0].hand = wallData.hands[0];
  players[1].hand = wallData.hands[1];

  const state: GameState = {
    seed: config.seed,
    handSerial,
    config,
    players,
    dealer,
    roundWind,
    handNumber,
    honba,
    riichiSticks,
    pot,
    wall: wallData.wall,
    deadWall: wallData.deadWall,
    turn: dealer,
    phase: 'discard',
    drawnTile: null,
    lastDrawWasRinshan: false,
    lastDiscard: null,
    reaction: null,
    totalKans: 0,
    anyCall: false,
    turnCount: 0,
    settlement: null,
    events: [],
    eventSeq: 0,
  };

  addEvent(
    state,
    'info',
    `${windName(roundWind)}${handNumber}局开始 · ${honba} 本场 · 庄家 ${playerName(state, dealer)}`,
  );
  drawForTurn(state, dealer, 'live');
  return state;
}

/** 开始一局全新的半庄。 */
export function startGame(config: GameConfig): GameState {
  const dealer = config.startDealer ?? 0;
  return buildHandState(
    config,
    [START_SCORE, START_SCORE],
    [0, 0],
    dealer,
    'east',
    1,
    0,
    0,
    0,
    1,
  );
}

/** 结算后进入下一局。 */
export function startNextHand(state: GameState): GameState {
  if (!state.settlement) throw new Error('当前没有待开始的下一局。');
  if (state.settlement.next.gameOver) throw new Error('对局已经结束。');
  const next = state.settlement.next;
  return buildHandState(
    state.config,
    [state.players[0].score, state.players[1].score],
    [state.players[0].sp, state.players[1].sp],
    next.dealer,
    next.roundWind,
    next.handNumber,
    next.honba,
    state.riichiSticks,
    state.pot,
    state.handSerial + 1,
  );
}

function drawForTurn(
  state: GameState,
  player: PlayerIndex,
  source: 'live' | 'rinshan',
): void {
  if (source === 'live' && state.wall.length === 0) {
    settleDraw(state, 'exhaustive');
    return;
  }
  let tile: Tile | undefined;
  if (source === 'rinshan') {
    tile = state.deadWall.rinshan.shift();
    if (tile === undefined) {
      settleDraw(state, 'fourKans');
      return;
    }
    state.lastDrawWasRinshan = true;
  } else {
    tile = state.wall.shift();
    state.lastDrawWasRinshan = false;
  }
  if (tile === undefined) {
    settleDraw(state, 'exhaustive');
    return;
  }

  const p = state.players[player];
  p.hand.push(tile);
  p.hasDrawn = true;
  p.tempFuriten = false;
  state.drawnTile = tile;
  state.turn = player;
  state.phase = 'discard';
  state.reaction = null;
  state.turnCount += 1;
  addEvent(
    state,
    'draw',
    source === 'rinshan'
      ? `${playerName(state, player)} 岭上摸牌`
      : `${playerName(state, player)} 摸牌`,
    player,
  );
}

function advanceToNextDraw(state: GameState, nextPlayer: PlayerIndex): void {
  if (state.totalKans >= 4) {
    settleDraw(state, 'fourKans');
    return;
  }
  if (state.wall.length === 0) {
    settleDraw(state, 'exhaustive');
    return;
  }
  drawForTurn(state, nextPlayer, 'live');
}

function chiOptionsFor(tile: Tile, hand: readonly Tile[]): ChiOption[] {
  if (isHonor(tile)) return [];
  const counts = countTiles(hand);
  const normal = normalizeTile(tile);
  const suitStart = Math.floor(normal / 9) * 9;
  const options: ChiOption[] = [];
  for (let offset = -2; offset <= 0; offset += 1) {
    const start = normal + offset;
    if (start < suitStart || start + 2 > suitStart + 8) continue;
    const seq: ChiOption = [start, start + 1, start + 2];
    const ok = seq.every((t) => {
      if (t === normal) return true;
      return counts[t] > 0;
    });
    if (ok) options.push(seq);
  }
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = option.join('-');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRonFuriten(state: GameState, player: PlayerIndex): boolean {
  const p = state.players[player];
  if (p.tempFuriten || p.riichiFuriten) return true;
  const waits = getWinningTiles(p.hand, p.melds);
  if (waits.length === 0) return false;
  return waits.some((wait) => p.river.some((record) => normalizeTile(record.tile) === wait));
}

function buildWinResult(
  state: GameState,
  player: PlayerIndex,
  handWithWin: Tile[],
  winTile: Tile,
  isTsumo: boolean,
  from: PlayerIndex | null,
  flags: {
    rinshan?: boolean;
    chankan?: boolean;
    haitei?: boolean;
    houtei?: boolean;
  },
): WinResult | null {
  const p = state.players[player];
  const opponent = state.players[opponentOf(player)];
  const firstUninterruptedDraw = isTsumo && !state.anyCall && p.river.length === 0;
  const tenhou = firstUninterruptedDraw && player === state.dealer && state.turnCount === 1;
  const chiihou = firstUninterruptedDraw && player !== state.dealer && state.turnCount === 2;
  const evaluation = evaluateHand(handWithWin, p.melds, winTile, {
    roundWind: state.roundWind,
    seatWind: seatWindOf(state, player),
    isTsumo,
    riichi: p.riichi,
    doubleRiichi: p.doubleRiichi,
    ippatsu: p.ippatsu && p.riichi,
    rinshan: flags.rinshan,
    chankan: flags.chankan,
    haitei: flags.haitei,
    houtei: flags.houtei,
    tenhou,
    chiihou,
    doraIndicators: state.deadWall.doraIndicators.slice(0, state.deadWall.revealed),
    uraIndicators: state.deadWall.uraIndicators.slice(0, state.deadWall.revealed),
  });
  if (!evaluation) return null;

  const yakuman = evaluation.yakumanCount;
  const hanBeforeSkill = yakuman > 0 ? yakuman * 13 : evaluation.han;
  let han = hanBeforeSkill;
  if (
    yakuman === 0 &&
    opponent.operator === 'hoshiguma' &&
    opponent.starHanReduction
  ) {
    han = Math.max(1, han - 1);
  }
  const payment = calculatePayment(
    yakuman > 0 ? 0 : han,
    evaluation.fu,
    player === state.dealer,
    isTsumo,
    yakuman,
  );
  const paoPlayer =
    p.paoBy !== null &&
    evaluation.yaku.some((yaku) => yaku.id === 'daisangen' || yaku.id === 'daisuushii')
      ? p.paoBy
      : undefined;

  return {
    player,
    from,
    tile: winTile,
    isTsumo,
    yaku: evaluation.yaku,
    han,
    hanBeforeSkill,
    fu: evaluation.fu,
    dora: evaluation.dora,
    uraDora: evaluation.uraDora,
    akaDora: evaluation.akaDora,
    yakumanCount: yakuman,
    paoPlayer,
    payment: {
      base: payment.base,
      total: payment.total,
      limitName: payment.limitName,
    },
  };
}

/** 若当前玩家可以自摸，返回和牌详情。 */
export function getTsumoResult(state: GameState): WinResult | null {
  if (state.phase !== 'discard' || state.drawnTile === null) return null;
  const player = state.turn;
  const p = state.players[player];
  if (!p.hand.includes(state.drawnTile)) return null;
  const rinshan = state.lastDrawWasRinshan;
  return buildWinResult(state, player, p.hand, state.drawnTile, true, null, {
    rinshan,
    haitei: !rinshan && state.wall.length === 0,
  });
}

/** 若指定玩家可以荣和当前舍牌，返回和牌详情；振听或无役返回 null。 */
export function getRonResult(
  state: GameState,
  player: PlayerIndex,
  tile: Tile,
  chankan = false,
): WinResult | null {
  if (!chankan && !state.lastDiscard) return null;
  if (isRonFuriten(state, player)) return null;
  const p = state.players[player];
  const handWithWin = [...p.hand, tile];
  return buildWinResult(state, player, handWithWin, tile, false, chankan ? null : state.lastDiscard?.player ?? null, {
    chankan,
    houtei: !chankan && state.wall.length === 0,
  });
}

function buildReaction(
  state: GameState,
  player: PlayerIndex,
  from: PlayerIndex,
  tile: Tile,
  chankan: boolean,
): ReactionOptions | null {
  const p = state.players[player];
  const ronPreview = getRonResult(state, player, tile, chankan);
  const canCall =
    !chankan &&
    !p.riichi &&
    p.amiyaLock === 0 &&
    !p.starNoCall &&
    state.totalKans < 4;
  const counts = countTiles(p.hand);
  const canPon = canCall && counts[tile] >= 2;
  const canKan = canCall && counts[tile] >= 3;
  const chiOptions = canCall ? chiOptionsFor(tile, p.hand) : [];
  const canChi = chiOptions.length > 0;
  if (!ronPreview && !canPon && !canKan && !canChi) return null;
  return {
    player,
    from,
    tile,
    canRon: !!ronPreview,
    canPon,
    canKan,
    chiOptions,
    chankan,
    ronPreview,
  };
}

function beginReaction(
  state: GameState,
  player: PlayerIndex,
  from: PlayerIndex,
  tile: Tile,
  chankan = false,
): boolean {
  const reaction = buildReaction(state, player, from, tile, chankan);
  if (!reaction) {
    state.reaction = null;
    return false;
  }
  state.reaction = reaction;
  state.phase = 'react';
  state.turn = player;
  return true;
}

/** 当前可用的反应（若无则为 null）。 */
export function getReactionOptions(state: GameState): ReactionOptions | null {
  return state.reaction;
}

export function getLegalDiscards(state: GameState, player: PlayerIndex): Tile[] {
  if (state.phase !== 'discard' || state.turn !== player) return [];
  const p = state.players[player];
  if (p.riichi || p.amiyaLock > 0) {
    if (state.drawnTile === null) return [];
    return isForbiddenDiscard(p, state.drawnTile) ? [] : [state.drawnTile];
  }
  const unique = [...new Set(p.hand)].filter((tile) => !isForbiddenDiscard(p, tile));
  return unique.sort((a, b) => tileSortValue(a) - tileSortValue(b));
}

export function canDeclareRiichi(
  state: GameState,
  player: PlayerIndex,
  discardTile: Tile,
): boolean {
  if (state.phase !== 'discard' || state.turn !== player) return false;
  const p = state.players[player];
  if (p.riichi || p.amiyaLock > 0) return false;
  if (p.score < 1000) return false;
  if (state.drawnTile === null) return false;
  if (!p.hand.includes(discardTile)) return false;
  if (!p.melds.every((meld) => meld.type === 'ankan')) return false;
  const handAfter = [...p.hand];
  if (!removeTileFromHand(handAfter, discardTile)) return false;
  return getWinningTiles(handAfter, p.melds).length > 0;
}

/** 计算打出某张牌后（保持门清 / 听牌形）的听牌张，用于立直宣示预览。 */
export function getWaitsAfterDiscard(
  state: GameState,
  player: PlayerIndex,
  discardTile: Tile,
): Tile[] {
  const p = state.players[player];
  const handAfter = [...p.hand];
  if (!removeTileFromHand(handAfter, discardTile)) return [];
  return getWinningTiles(handAfter, p.melds);
}

function computeNextRound(state: GameState, renchan: boolean): NextRoundInfo {
  const busted = state.players
    .map((p, index) => ({ index: index as PlayerIndex, score: p.score }))
    .filter((entry) => entry.score <= 0);

  if (busted.length > 0) {
    const names = busted.map((entry) => playerName(state, entry.index)).join('、');
    return {
      dealer: state.dealer,
      roundWind: state.roundWind,
      handNumber: state.handNumber,
      honba: state.honba,
      gameOver: true,
      reason: `${names} 点数归零，对局结束。`,
    };
  }

  if (renchan) {
    return {
      dealer: state.dealer,
      roundWind: state.roundWind,
      handNumber: state.handNumber,
      honba: state.honba + 1,
      gameOver: false,
    };
  }

  const nextDealer = opponentOf(state.dealer);
  let handNumber = state.handNumber + 1;
  let roundWind = state.roundWind;

  if (handNumber > 4) {
    if (roundWind === 'east') {
      roundWind = 'south';
      handNumber = 1;
    } else {
      return {
        dealer: nextDealer,
        roundWind,
        handNumber: 4,
        honba: 0,
        gameOver: true,
        reason: '南四局结束，按最终点数判定胜负。',
      };
    }
  }

  return {
    dealer: nextDealer,
    roundWind,
    handNumber,
    honba: 0,
    gameOver: false,
  };
}

export function useSkill(
  state: GameState,
  player: PlayerIndex,
  payload?: { tile?: Tile },
): GameState {
  return activateSkill(state, player, payload);
}

/** 玩家打出牌；可同时宣告立直。 */
export function discardTile(
  state: GameState,
  player: PlayerIndex,
  tile: Tile,
  declareRiichi = false,
): GameState {
  if (state.phase !== 'discard' || state.turn !== player) {
    throw new Error('当前不是你的出牌阶段。');
  }
  const p = state.players[player];
  if (!p.hand.includes(tile)) throw new Error('手牌中没有这张牌。');
  if (isForbiddenDiscard(p, tile)) throw new Error('食替禁止：不能打出这张牌。');
  if ((p.riichi || p.amiyaLock > 0) && state.drawnTile !== tile) {
    throw new Error(p.riichi ? '立直后只能摸切。' : '奇美拉代价：只能摸切。');
  }
  if (declareRiichi && !canDeclareRiichi(state, player, tile)) {
    throw new Error('无法立直：需要门清听牌且点数不少于 1000。');
  }

  const next = structuredClone(state);
  const np = next.players[player];
  if (!removeTileFromHand(np.hand, tile)) throw new Error('手牌中没有这张牌。');

  if (declareRiichi) {
    np.score -= 1000;
    next.riichiSticks += 1;
    np.riichi = true;
    np.doubleRiichi = np.river.length === 0 && !next.anyCall;
    np.ippatsu = true;
    np.riichiTurn = next.turnCount;
  }

  np.river.push({ tile, riichi: declareRiichi, called: false, turn: next.turnCount });
  np.sp = Math.min(skillCostFor(np.operator), np.sp + spGainFor(np.operator, tile));
  np.kuikaeForbidden = [];
  np.tempFuriten = false;
  if (np.riichi && !declareRiichi) np.ippatsu = false;

  if (np.amiyaLockPending) {
    np.amiyaLockPending = false;
    np.amiyaLock = 3;
    addEvent(next, 'info', `${playerName(next, player)} 的奇美拉代价启动：之后 3 巡只能摸切。`, player);
  } else if (np.amiyaLock > 0) {
    np.amiyaLock -= 1;
    if (np.amiyaLock === 0) {
      addEvent(next, 'info', `奇美拉的代价结束，${playerName(next, player)} 恢复正常行动。`, player);
    }
  }

  next.drawnTile = null;
  next.lastDrawWasRinshan = false;
  next.lastDiscard = { player, tile };
  next.reaction = null;

  addEvent(
    next,
    declareRiichi ? 'riichi' : 'discard',
    `${playerName(next, player)} ${declareRiichi ? '立直！打出' : '打出'}「${tileName(tile)}」`,
    player,
  );
  if (declareRiichi) {
    addEvent(next, 'riichi', `${playerName(next, player)} 支付 1000 点立直棒。`, player);
  }

  const reactor = opponentOf(player);
  if (beginReaction(next, reactor, player, tile)) return next;
  advanceToNextDraw(next, reactor);
  return next;
}

function markCalledDiscard(state: GameState, from: PlayerIndex, tile: Tile): void {
  const river = state.players[from].river;
  for (let i = river.length - 1; i >= 0; i -= 1) {
    if (sameTileKind(river[i].tile, tile) && !river[i].called) {
      river[i].called = true;
      return;
    }
  }
}

function applyCallCommon(
  state: GameState,
  player: PlayerIndex,
  from: PlayerIndex,
  tile: Tile,
): void {
  markCalledDiscard(state, from, tile);
  state.anyCall = true;
  state.players[0].ippatsu = false;
  state.players[1].ippatsu = false;
  state.players[player].tempFuriten = false;
  state.players[player].kuikaeForbidden = [];
  state.reaction = null;
  state.lastDiscard = { player: from, tile };
  state.drawnTile = null;
  state.turn = player;
  state.phase = 'discard';
}

/** 鸣牌后检查是否形成大三元 / 大四喜的包牌责任。 */
function updatePao(state: GameState, player: PlayerIndex, tile: Tile, from: PlayerIndex): void {
  const p = state.players[player];
  if (p.paoBy !== null) return;
  const counts = countTiles([...p.hand, ...p.melds.flatMap((meld) => meld.tiles)]);
  if (isDragon(tile)) {
    const dragonTriplets = DRAGONS.filter((dragon) => counts[dragon] >= 3).length;
    if (dragonTriplets >= 3) {
      p.paoBy = from;
      addEvent(state, 'info', `${playerName(state, from)} 对 ${playerName(state, player)} 的大三元形成包牌责任。`, from);
    }
    return;
  }
  if (isWind(tile)) {
    const windTriplets = [EAST, SOUTH, WEST, NORTH].filter((wind) => counts[wind] >= 3).length;
    if (windTriplets >= 4) {
      p.paoBy = from;
      addEvent(state, 'info', `${playerName(state, from)} 对 ${playerName(state, player)} 的大四喜形成包牌责任。`, from);
    }
  }
}

function revealDora(state: GameState): void {
  if (state.deadWall.revealed >= 5) return;
  state.deadWall.revealed += 1;
  const indicator = state.deadWall.doraIndicators[state.deadWall.revealed - 1];
  addEvent(state, 'info', `新宝牌指示牌公开：${tileName(indicator)}`);
}

function kuikaeForChi(option: ChiOption, called: Tile): Tile[] {
  const forbidden = new Set<Tile>([called]);
  const [low, , high] = option;
  const calledNormal = normalizeTile(called);
  if (calledNormal === low && high < Math.floor(high / 9) * 9 + 8) forbidden.add(high + 1);
  if (calledNormal === high && low > Math.floor(low / 9) * 9) forbidden.add(low - 1);
  return [...forbidden];
}

export function callChi(state: GameState, option: ChiOption): GameState {
  const reaction = state.reaction;
  if (!reaction || state.phase !== 'react') throw new Error('当前没有可鸣的牌。');
  const key = option.join('-');
  if (!reaction.chiOptions.some((candidate) => candidate.join('-') === key)) {
    throw new Error('无效的吃牌组合。');
  }
  const next = structuredClone(state);
  const r = next.reaction!;
  const p = next.players[r.player];
  const remaining = [...option];
  const calledIndex = remaining.findIndex((candidate) => sameTileKind(candidate, r.tile));
  if (calledIndex >= 0) remaining.splice(calledIndex, 1);
  for (const handTile of remaining) {
    if (!removeTilesByKind(p.hand, handTile)) throw new Error('手牌不足，无法吃牌。');
  }
  const meldTiles = option.map((candidate) =>
    sameTileKind(candidate, r.tile) ? r.tile : candidate,
  );
  p.melds.push({
    type: 'chi',
    tiles: sortTiles(meldTiles),
    from: r.from,
    calledTile: r.tile,
  });
  applyCallCommon(next, r.player, r.from, r.tile);
  p.kuikaeForbidden = kuikaeForChi(option, r.tile);
  addEvent(next, 'call', `${playerName(next, r.player)} 吃「${tileName(r.tile)}」`, r.player);
  return next;
}

export function callPon(state: GameState): GameState {
  const reaction = state.reaction;
  if (!reaction || state.phase !== 'react' || !reaction.canPon) {
    throw new Error('当前不能碰。');
  }
  const next = structuredClone(state);
  const r = next.reaction!;
  const p = next.players[r.player];
  const removed = removeTilesByKind(p.hand, r.tile, 2);
  if (!removed) throw new Error('手牌不足，无法碰牌。');
  p.melds.push({ type: 'pon', tiles: sortTiles([r.tile, ...removed]), from: r.from, calledTile: r.tile });
  applyCallCommon(next, r.player, r.from, r.tile);
  p.kuikaeForbidden = [r.tile];
  updatePao(next, r.player, r.tile, r.from);
  addEvent(next, 'call', `${playerName(next, r.player)} 碰「${tileName(r.tile)}」`, r.player);
  return next;
}

export function callKan(state: GameState): GameState {
  const reaction = state.reaction;
  if (!reaction || state.phase !== 'react' || !reaction.canKan) {
    throw new Error('当前不能杠。');
  }
  const next = structuredClone(state);
  const r = next.reaction!;
  const p = next.players[r.player];
  const removed = removeTilesByKind(p.hand, r.tile, 3);
  if (!removed) throw new Error('手牌不足，无法杠牌。');
  p.melds.push({ type: 'minkan', tiles: sortTiles([r.tile, ...removed]), from: r.from, calledTile: r.tile });
  applyCallCommon(next, r.player, r.from, r.tile);
  p.kuikaeForbidden = [r.tile];
  next.totalKans += 1;
  revealDora(next);
  updatePao(next, r.player, r.tile, r.from);
  addEvent(next, 'call', `${playerName(next, r.player)} 明杠「${tileName(r.tile)}」`, r.player);
  drawForTurn(next, r.player, 'rinshan');
  return next;
}

export function passReaction(state: GameState): GameState {
  const reaction = state.reaction;
  if (!reaction || state.phase !== 'react') throw new Error('当前没有需要放弃的鸣牌。');
  const next = structuredClone(state);
  const r = next.reaction!;
  const p = next.players[r.player];
  if (r.canRon) {
    p.tempFuriten = true;
    if (p.riichi) p.riichiFuriten = true;
    addEvent(next, 'info', `${playerName(next, r.player)} 见逃，进入振听。`, r.player);
  } else {
    addEvent(next, 'info', `${playerName(next, r.player)} 选择跳过。`, r.player);
  }
  next.reaction = null;
  next.phase = 'discard';

  if (r.chankan) {
    drawForTurn(next, r.from, 'rinshan');
    return next;
  }
  advanceToNextDraw(next, r.player);
  return next;
}

export function declareRon(state: GameState): GameState {
  const reaction = state.reaction;
  if (!reaction || !reaction.canRon || !reaction.ronPreview) {
    throw new Error('当前不能荣和。');
  }
  const next = structuredClone(state);
  const r = next.reaction!;
  const p = next.players[r.player];
  if (!r.ronPreview) throw new Error('当前不能荣和。');
  p.hand.push(r.tile);
  next.reaction = null;
  addEvent(next, 'win', `${playerName(next, r.player)} 荣和「${tileName(r.tile)}」！`, r.player);
  settleWin(next, {
    ...r.ronPreview,
    from: r.chankan ? r.from : r.from,
  });
  return next;
}

export function declareTsumo(state: GameState): GameState {
  if (state.phase !== 'discard') throw new Error('当前不能自摸。');
  const result = getTsumoResult(state);
  if (!result) throw new Error('当前手牌不能自摸，或没有役。');
  const next = structuredClone(state);
  addEvent(next, 'win', `${playerName(next, result.player)} 自摸「${tileName(result.tile)}」！`, result.player);
  settleWin(next, result);
  return next;
}

function applyStarPassive(
  state: GameState,
  winner: PlayerIndex,
  payer: PlayerIndex,
  paymentTotal: number,
): number {
  const payerState = state.players[payer];
  if (payerState.operator !== 'hoshiguma') return 0;
  const fee = Math.floor(paymentTotal * 0.1);
  if (fee <= 0) return 0;
  state.players[winner].score -= fee;
  return fee;
}

function settleWin(state: GameState, win: WinResult): void {
  const winner = win.player;
  const payer = win.paoPlayer ?? (win.from === null ? opponentOf(winner) : win.from);
  if (payer === winner) throw new Error('支付者不能是新手本人。');

  const scoreBefore: [number, number] = [state.players[0].score, state.players[1].score];
  const handPayment = win.payment.total;
  const honbaPayment = state.honba * 300;
  const totalPayment = handPayment + honbaPayment;
  const riichiSticks = state.riichiSticks;
  const potBefore = state.pot;

  state.players[winner].score += totalPayment + riichiSticks * 1000 + potBefore;
  state.players[payer].score -= totalPayment;
  state.riichiSticks = 0;
  state.pot = 0;

  const hoshigumaPot = applyStarPassive(state, winner, payer, totalPayment);
  state.pot = hoshigumaPot;

  const scoreAfter: [number, number] = [state.players[0].score, state.players[1].score];
  const renchan = winner === state.dealer;
  const next = computeNextRound(state, renchan);

  const result = {
    type: 'win' as const,
    win,
    honba: state.honba,
    riichiSticks,
    pot: potBefore,
    scoreBefore,
    scoreAfter,
    hoshigumaPot,
  };

  state.phase = next.gameOver ? 'gameOver' : 'handEnd';
  state.turn = winner;
  state.drawnTile = null;
  state.reaction = null;
  state.settlement = { result, next };
  addEvent(
    state,
    'win',
    `${playerName(state, winner)} ${win.special === 'nagashi' ? '流局满贯' : '和牌'}，${
      scoreAfter[winner] - scoreBefore[winner] >= 0 ? '+' : ''
    }${scoreAfter[winner] - scoreBefore[winner]} 点。`,
    winner,
  );
  if (hoshigumaPot > 0) {
    addEvent(state, 'info', `星熊「荆棘」发动：${hoshigumaPot} 点进入场供。`, payer);
  }
  if (next.reason) addEvent(state, 'info', next.reason);
}

function isNagashiEligible(state: GameState, player: PlayerIndex): boolean {
  const p = state.players[player];
  if (p.melds.length > 0) return false;
  if (p.river.length === 0) return false;
  return p.river.every((record) => !record.called && isTerminalOrHonor(record.tile));
}

function settleNagashi(state: GameState, winner: PlayerIndex): void {
  const isDealer = winner === state.dealer;
  const win: WinResult = {
    player: winner,
    from: opponentOf(winner),
    tile: 0,
    isTsumo: true,
    yaku: [],
    han: 0,
    hanBeforeSkill: 0,
    fu: 0,
    dora: 0,
    uraDora: 0,
    akaDora: 0,
    yakumanCount: 0,
    payment: {
      base: 2000,
      total: isDealer ? 12000 : 8000,
      limitName: '流局满贯',
    },
    special: 'nagashi',
  };
  addEvent(state, 'drawEnd', `${playerName(state, winner)} 达成流局满贯！`, winner);
  settleWin(state, win);
}

function thirteenTileHand(state: GameState, player: PlayerIndex): Tile[] {
  const hand = [...state.players[player].hand];
  if (state.drawnTile !== null && state.turn === player) {
    removeTileFromHand(hand, state.drawnTile);
  }
  return hand;
}

function settleDraw(
  state: GameState,
  reason: 'exhaustive' | 'nineTerminals' | 'fourKans',
): void {
  const scoreBefore: [number, number] = [state.players[0].score, state.players[1].score];
  const tenpai: [boolean, boolean] = [
    isTenpai(thirteenTileHand(state, 0), state.players[0].melds),
    isTenpai(thirteenTileHand(state, 1), state.players[1].melds),
  ];

  if (reason === 'exhaustive') {
    const eligible = [0, 1].filter((player) => isNagashiEligible(state, player as PlayerIndex));
    if (eligible.length === 1) {
      settleNagashi(state, eligible[0] as PlayerIndex);
      return;
    }
  }

  let tenpaiDelta = 0;
  if (reason === 'exhaustive' && tenpai[0] !== tenpai[1]) {
    const winner = tenpai[0] ? 0 : 1;
    const loser = winner === 0 ? 1 : 0;
    state.players[winner].score += 3000;
    state.players[loser].score -= 3000;
    tenpaiDelta = 3000;
    addEvent(
      state,
      'drawEnd',
      `${playerName(state, winner)} 听牌，收取 ${playerName(state, loser)} 3000 点。`,
      winner,
    );
  }

  const scoreAfter: [number, number] = [state.players[0].score, state.players[1].score];
  const forceRenchan = reason === 'nineTerminals' || reason === 'fourKans';
  const renchan = forceRenchan ? true : tenpai[state.dealer];
  const next = computeNextRound(state, renchan);

  const reasonText = {
    exhaustive: '牌山摸尽，流局。',
    nineTerminals: '九种九牌，流局。',
    fourKans: '四杠散了，流局。',
  }[reason];
  const result: DrawResult = {
    type: 'draw',
    reason,
    tenpai,
    tenpaiDelta,
    scoreBefore,
    scoreAfter,
  };
  state.phase = next.gameOver ? 'gameOver' : 'handEnd';
  state.drawnTile = null;
  state.reaction = null;
  state.settlement = { result, next };
  addEvent(state, 'drawEnd', reasonText);
  if (next.reason) addEvent(state, 'info', next.reason);
}

export function declareNineTerminals(state: GameState): GameState {
  if (!canDeclareNineTerminals(state)) throw new Error('当前不能宣告九种九牌。');
  const next = structuredClone(state);
  addEvent(next, 'drawEnd', `${playerName(next, next.turn)} 宣告九种九牌。`, next.turn);
  settleDraw(next, 'nineTerminals');
  return next;
}

export function canDeclareNineTerminals(state: GameState): boolean {
  if (state.phase !== 'discard' || state.drawnTile === null) return false;
  const p = state.players[state.turn];
  if (p.amiyaLock > 0 || p.riichi) return false;
  if (p.melds.some((meld) => meld.type !== 'ankan')) return false;
  const distinct = new Set(p.hand.filter((tile) => ORPHANS.includes(tile))).size;
  return distinct >= 9;
}

function riichiAnkanKeepsWaits(state: GameState, player: PlayerIndex, tile: Tile): boolean {
  const p = state.players[player];
  if (!p.riichi) return true;
  if (state.drawnTile === null) return false;
  const beforeHand = [...p.hand];
  removeTileFromHand(beforeHand, state.drawnTile);
  const before = getWinningTiles(beforeHand, p.melds).slice().sort((a, b) => a - b);
  const afterHand = [...p.hand];
  const kanTiles = removeTilesByKind(afterHand, tile, 4);
  if (!kanTiles) return false;
  const afterMelds: Meld[] = [...p.melds, { type: 'ankan', tiles: kanTiles }];
  const after = getWinningTiles(afterHand, afterMelds).slice().sort((a, b) => a - b);
  return before.length > 0 && before.join(',') === after.join(',');
}

export function getAnkanOptions(state: GameState, player: PlayerIndex): Tile[] {
  if (state.phase !== 'discard' || state.turn !== player || state.drawnTile === null) return [];
  const p = state.players[player];
  if (p.amiyaLock > 0 || p.starNoCall) return [];
  if (state.totalKans >= 4 || state.deadWall.rinshan.length === 0) return [];
  const counts = countTiles(p.hand);
  return counts
    .map((count, tile) => ({ count, tile }))
    .filter(({ count, tile }) => count >= 4 && riichiAnkanKeepsWaits(state, player, tile))
    .map(({ tile }) => p.hand.find((handTile) => sameTileKind(handTile, tile)) ?? tile);
}

export function getKakanOptions(state: GameState, player: PlayerIndex): Tile[] {
  if (state.phase !== 'discard' || state.turn !== player || state.drawnTile === null) return [];
  const p = state.players[player];
  if (p.riichi || p.amiyaLock > 0 || p.starNoCall) return [];
  if (state.totalKans >= 4 || state.deadWall.rinshan.length === 0) return [];
  const options: Tile[] = [];
  for (const meld of p.melds) {
    if (meld.type !== 'pon') continue;
    const handTile = p.hand.find((candidate) => sameTileKind(candidate, meld.tiles[0]));
    if (handTile !== undefined) options.push(handTile);
  }
  return [...new Set(options)].sort((a, b) => tileSortValue(a) - tileSortValue(b));
}

export function declareAnkan(state: GameState, tile: Tile): GameState {
  if (!getAnkanOptions(state, state.turn).some((option) => sameTileKind(option, tile))) {
    throw new Error('当前不能暗杠这张牌。');
  }
  const next = structuredClone(state);
  const player = next.turn;
  const p = next.players[player];
  const kanTiles = removeTilesByKind(p.hand, tile, 4);
  if (!kanTiles) throw new Error('手牌不足。');
  p.melds.push({ type: 'ankan', tiles: kanTiles });
  p.ippatsu = false;
  next.players[opponentOf(player)].ippatsu = false;
  next.anyCall = true;
  next.totalKans += 1;
  next.drawnTile = null;
  revealDora(next);
  addEvent(next, 'call', `${playerName(next, player)} 暗杠「${tileName(tile)}」`, player);
  drawForTurn(next, player, 'rinshan');
  return next;
}

export function declareKakan(state: GameState, tile: Tile): GameState {
  if (!getKakanOptions(state, state.turn).some((option) => sameTileKind(option, tile))) {
    throw new Error('当前不能加杠这张牌。');
  }
  const next = structuredClone(state);
  const player = next.turn;
  const p = next.players[player];
  const meldIndex = p.melds.findIndex(
    (meld) => meld.type === 'pon' && sameTileKind(meld.tiles[0], tile),
  );
  if (meldIndex < 0) throw new Error('找不到可加杠的碰。');
  if (!removeTileFromHand(p.hand, tile)) throw new Error('手牌不足。');
  const meld = p.melds[meldIndex];
  p.melds[meldIndex] = { ...meld, type: 'kakan', tiles: sortTiles([...meld.tiles, tile]) };
  p.ippatsu = false;
  next.players[opponentOf(player)].ippatsu = false;
  next.anyCall = true;
  next.totalKans += 1;
  next.drawnTile = null;
  next.lastDiscard = { player, tile };
  revealDora(next);
  addEvent(next, 'call', `${playerName(next, player)} 加杠「${tileName(tile)}」`, player);

  if (beginReaction(next, opponentOf(player), player, tile, true)) {
    return next;
  }
  drawForTurn(next, player, 'rinshan');
  return next;
}

export interface TenpaiDisplay {
  tenpai: boolean;
  waits: Tile[];
  furiten: boolean;
}

export function getPlayerTenpai(state: GameState, player: PlayerIndex): TenpaiDisplay {
  const p = state.players[player];
  const hand = thirteenTileHand(state, player);
  const waits = getWinningTiles(hand, p.melds);
  const furiten =
    p.tempFuriten ||
    p.riichiFuriten ||
    waits.some((wait) => p.river.some((record) => normalizeTile(record.tile) === wait));
  return { tenpai: waits.length > 0, waits, furiten };
}

export function getRevealedDora(state: GameState): Tile[] {
  return state.deadWall.doraIndicators
    .slice(0, state.deadWall.revealed)
    .map(doraFromIndicator);
}

export function getRevealedUra(state: GameState): Tile[] {
  return state.deadWall.uraIndicators.slice(0, state.deadWall.revealed).map(doraFromIndicator);
}

export function getSeatWind(state: GameState, player: PlayerIndex): Wind {
  return seatWindOf(state, player);
}

export function getSettlement(state: GameState): HandSettlement | null {
  return state.settlement;
}

export const RULES_CONSTANTS = {
  START_SCORE,
  PLAYER_COUNT,
  EAST,
  SOUTH,
  WEST,
  NORTH,
  HONORS,
};
