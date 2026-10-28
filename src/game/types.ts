/** 全局游戏类型定义。牌用 0-33 的整数表示，便于计数与判定。 */

export type Tile = number;
export type PlayerIndex = 0 | 1;
export type Wind = 'east' | 'south' | 'west' | 'north';
export type RoundWind = 'east' | 'south';
export type OperatorId = 'amiya' | 'hoshiguma';
export type MeldType = 'chi' | 'pon' | 'minkan' | 'ankan' | 'kakan';

export interface Meld {
  type: MeldType;
  /** 排好序的组成牌。 */
  tiles: Tile[];
  /** 鸣牌来源玩家；暗杠没有来源。 */
  from?: PlayerIndex;
  /** 被鸣的那张牌。 */
  calledTile?: Tile;
}

export interface DiscardRecord {
  tile: Tile;
  /** 是否同时宣告立直。 */
  riichi: boolean;
  /** 是否被鸣走（仍保留在牌河记录中，用于振听与安全牌判断）。 */
  called: boolean;
  turn: number;
}

export interface PlayerState {
  hand: Tile[];
  melds: Meld[];
  river: DiscardRecord[];
  score: number;
  sp: number;
  operator: OperatorId;
  /** 本局主动技能是否已使用。 */
  skillUsed: boolean;
  riichi: boolean;
  doubleRiichi: boolean;
  /** 一发有效（立直后尚未经过自己的下一次舍牌）。 */
  ippatsu: boolean;
  /** 立直巡目，用于显示。 */
  riichiTurn: number | null;
  /** 同巡振听：见逃后直到自己下一次摸牌。 */
  tempFuriten: boolean;
  /** 立直振听：立直后见逃，永久持续。 */
  riichiFuriten: boolean;
  /** 阿米娅技能代价剩余巡数；>0 时只能摸切、不可鸣牌/立直。 */
  amiyaLock: number;
  /** 本巡使用奇美拉后，待本巡结束才启动 3 巡代价。 */
  amiyaLockPending: boolean;
  /** 星熊主动：本局对手和牌番数 -1。 */
  starHanReduction: boolean;
  /** 星熊主动：本局不能鸣牌。 */
  starNoCall: boolean;
  /** 鸣牌后禁止舍出的牌（食替禁止）。 */
  kuikaeForbidden: Tile[];
  /** 本局是否已经摸过牌（显示用）。 */
  hasDrawn: boolean;
  /** 包牌责任者：由该玩家舍出的第三组三元牌 / 第四组风牌鸣牌。 */
  paoBy: PlayerIndex | null;
}

export interface DeadWall {
  rinshan: Tile[];
  doraIndicators: Tile[];
  uraIndicators: Tile[];
  /** 已公开的宝牌指示牌数量，初始 1。 */
  revealed: number;
}

export interface GameConfig {
  seed: number;
  /** 玩家选择的干员，AI 使用另一位。 */
  playerOperator: OperatorId;
  /** 起始庄家，默认玩家 0。 */
  startDealer?: PlayerIndex;
}

export interface ReactionOptions {
  player: PlayerIndex;
  from: PlayerIndex;
  tile: Tile;
  canRon: boolean;
  canPon: boolean;
  canKan: boolean;
  chiOptions: Tile[][];
  /** 抢杠反应。 */
  chankan: boolean;
  ronPreview: WinResult | null;
}

export type GamePhase = 'discard' | 'react' | 'handEnd' | 'gameOver';

export interface Yaku {
  id: string;
  name: string;
  han: number;
  yakuman?: boolean;
}

export interface PaymentInfo {
  base: number;
  /** 2 人麻将中只有一家支付，这里为支付者应付总额（不含本场/供托）。 */
  total: number;
  limitName: string;
}

export interface WinResult {
  player: PlayerIndex;
  from: PlayerIndex | null;
  tile: Tile;
  isTsumo: boolean;
  yaku: Yaku[];
  /** 技能减番后的总番数（含宝牌）。 */
  han: number;
  hanBeforeSkill: number;
  fu: number;
  dora: number;
  uraDora: number;
  akaDora: number;
  yakumanCount: number;
  payment: PaymentInfo;
  /** 包牌责任者（2 人局通常与唯一支付者重合）。 */
  paoPlayer?: PlayerIndex;
  /** 特殊和牌：流局满贯。 */
  special?: 'nagashi';
}

export interface DrawResult {
  type: 'draw';
  reason: 'exhaustive' | 'nineTerminals' | 'fourKans' | 'nagashi';
  tenpai: [boolean, boolean];
  /** 听牌罚符造成的点数变化。 */
  tenpaiDelta: number;
  scoreBefore: [number, number];
  scoreAfter: [number, number];
  nagashiWinner?: PlayerIndex;
}

export interface WinHandResult {
  type: 'win';
  win: WinResult;
  honba: number;
  riichiSticks: number;
  pot: number;
  scoreBefore: [number, number];
  scoreAfter: [number, number];
  /** 星熊被动产生的场供。 */
  hoshigumaPot: number;
}

export type HandResult = DrawResult | WinHandResult;

export interface NextRoundInfo {
  dealer: PlayerIndex;
  roundWind: RoundWind;
  handNumber: number;
  honba: number;
  gameOver: boolean;
  reason?: string;
}

export interface GameEvent {
  id: number;
  type: 'draw' | 'discard' | 'call' | 'riichi' | 'skill' | 'win' | 'drawEnd' | 'info';
  text: string;
  player?: PlayerIndex;
}

export interface HandSettlement {
  result: HandResult;
  next: NextRoundInfo;
}

export interface GameState {
  seed: number;
  handSerial: number;
  config: GameConfig;
  players: [PlayerState, PlayerState];
  dealer: PlayerIndex;
  roundWind: RoundWind;
  handNumber: number;
  honba: number;
  riichiSticks: number;
  /** 场供（点数），星熊被动与特殊规则产生。 */
  pot: number;
  wall: Tile[];
  deadWall: DeadWall;
  turn: PlayerIndex;
  phase: GamePhase;
  drawnTile: Tile | null;
  lastDrawWasRinshan: boolean;
  lastDiscard: { player: PlayerIndex; tile: Tile } | null;
  reaction: ReactionOptions | null;
  totalKans: number;
  anyCall: boolean;
  turnCount: number;
  settlement: HandSettlement | null;
  events: GameEvent[];
  eventSeq: number;
}

export type ChiOption = [Tile, Tile, Tile];
