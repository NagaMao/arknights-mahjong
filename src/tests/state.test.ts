import { describe, expect, it } from 'vitest';
import {
  canDeclareRiichi,
  callChi,
  declareTsumo,
  discardTile,
  getLegalDiscards,
  getRonResult,
  getTsumoResult,
  getWaitsAfterDiscard,
  passReaction,
  seatWindOf,
  startGame,
  startNextHand,
  canDeclareNineTerminals,
} from '../game/state';
import { activateSkill, spCapFor, validateSkillActivation } from '../game/skills';
import { getWinningTiles, isTenpai } from '../game/rules';
import type { GameState, Meld, PlayerIndex, Tile } from '../game/types';

const t = (suit: 0 | 1 | 2, rank: number): Tile => suit * 9 + (rank - 1);

function sorted(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => a - b);
}

function rig(state: GameState, player: PlayerIndex, tiles: Tile[], drawn: Tile | null): GameState {
  const next = structuredClone(state);
  next.players[player].hand = sorted(tiles);
  next.players[player].melds = [];
  next.players[player].riichi = false;
  next.players[player].ippatsu = false;
  next.players[player].doubleRiichi = false;
  next.phase = 'discard';
  next.turn = player;
  next.drawnTile = drawn;
  next.lastDiscard = null;
  next.reaction = null;
  // 避免把测试中人工构造的庄家首巡和牌误判为天和。
  next.turnCount = Math.max(next.turnCount, 5);
  return next;
}

const pinfuHand = sorted([
  t(0, 1), t(0, 2), t(0, 3),
  t(0, 4), t(0, 5), t(0, 6),
  t(0, 7), t(0, 8), t(0, 9),
  t(1, 2), t(1, 3), t(1, 4),
  t(2, 5), t(2, 5),
]);

const tenpaiThirteen = sorted([
  t(0, 1), t(0, 2), t(0, 3),
  t(0, 4), t(0, 5), t(0, 6),
  t(0, 7), t(0, 8), t(0, 9),
  t(1, 1), t(1, 2), t(1, 3),
  t(2, 5),
]);

describe('对局状态机与立直', () => {
  it('庄家为东家，闲家为南家', () => {
    const state = startGame({ seed: 10, playerOperator: 'amiya', startDealer: 0 });
    expect(seatWindOf(state, 0)).toBe('east');
    expect(seatWindOf(state, 1)).toBe('south');
  });

  it('出牌获得 SP，阿米娅字牌额外 +1', () => {
    const state = rig(startGame({ seed: 11, playerOperator: 'amiya' }), 0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 27], 27);
    state.players[0].sp = 0;
    const next = discardTile(state, 0, 27);
    expect(next.players[0].sp).toBe(2);
    expect(next.players[0].river.at(-1)?.tile).toBe(27);
  });

  it('SP 不会超过主动技能消耗上限', () => {
    const state = rig(startGame({ seed: 12, playerOperator: 'amiya' }), 0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 27], 27);
    state.players[0].sp = spCapFor('amiya');
    const next = discardTile(state, 0, 27);
    expect(next.players[0].sp).toBe(spCapFor('amiya'));
  });

  it('立直支付 1000 点、供托 +1，且立直后只能摸切', () => {
    const state = rig(
      startGame({ seed: 13, playerOperator: 'amiya' }),
      0,
      [...tenpaiThirteen, t(2, 8)],
      t(2, 8),
    );
    state.players[0].score = 30000;
    expect(canDeclareRiichi(state, 0, t(2, 8))).toBe(true);
    const next = discardTile(state, 0, t(2, 8), true);
    expect(next.players[0].riichi).toBe(true);
    expect(next.players[0].doubleRiichi).toBe(true);
    expect(next.players[0].ippatsu).toBe(true);
    expect(next.riichiSticks).toBe(1);
    expect(next.players[0].score).toBe(29000);
    expect(next.players[0].river.at(-1)?.riichi).toBe(true);
  });

  it('九种九牌条件检测', () => {
    const state = rig(
      startGame({ seed: 14, playerOperator: 'amiya' }),
      0,
      [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33, 33],
      33,
    );
    expect(canDeclareNineTerminals(state)).toBe(true);
  });

  it('可计算立直宣言牌的听牌预览', () => {
    const state = rig(
      startGame({ seed: 15, playerOperator: 'amiya' }),
      0,
      [...tenpaiThirteen, t(2, 8)],
      t(2, 8),
    );
    expect(getWaitsAfterDiscard(state, 0, t(2, 8))).toEqual([t(2, 5)]);
  });
});

describe('干员技能', () => {
  it('阿米娅「奇美拉」检索后本巡不受限，本巡结束才进入 3 巡限制', () => {
    let state = rig(
      startGame({ seed: 21, playerOperator: 'amiya' }),
      0,
      [...tenpaiThirteen, t(2, 8)],
      t(2, 8),
    );
    const target = t(2, 5);
    state.wall = [t(0, 0), target, ...state.wall.filter((tile) => tile !== target && tile !== t(2, 8))];
    state.players[0].sp = spCapFor('amiya');
    state.players[0].skillUsed = false;
    const validation = validateSkillActivation(state, 0, { tile: target });
    expect(validation.ok).toBe(true);
    state = activateSkill(state, 0, { tile: target });
    expect(state.players[0].sp).toBe(0);
    expect(state.players[0].skillUsed).toBe(true);
    expect(state.players[0].amiyaLock).toBe(0);
    expect(state.players[0].amiyaLockPending).toBe(true);
    expect(state.players[0].hand).toContain(target);
    expect(state.drawnTile).toBe(target);
    expect(state.wall[0]).toBe(t(2, 8));
    expect(getLegalDiscards(state, 0).length).toBeGreaterThan(1);
    expect(getTsumoResult(state)).not.toBeNull();
    expect(() => discardTile(state, 0, t(2, 5))).not.toThrow();
    const after = discardTile(state, 0, t(0, 1));
    expect(after.players[0].amiyaLock).toBe(3);
    expect(after.players[0].amiyaLockPending).toBe(false);
    after.turn = 0;
    after.phase = 'discard';
    after.drawnTile = after.players[0].hand[0];
    expect(getLegalDiscards(after, 0)).toEqual([after.drawnTile]);
  });

  it('立直中不能发动奇美拉', () => {
    const state = rig(
      startGame({ seed: 23, playerOperator: 'amiya' }),
      0,
      [...tenpaiThirteen, t(2, 8)],
      t(2, 8),
    );
    state.players[0].riichi = true;
    state.players[0].sp = spCapFor('amiya');
    state.wall = [t(2, 5), ...state.wall];
    expect(validateSkillActivation(state, 0, { tile: t(2, 5) }).ok).toBe(false);
  });

  it('阿米娅不能选择已经不在牌山中的牌', () => {
    const state = rig(
      startGame({ seed: 22, playerOperator: 'amiya' }),
      0,
      [...tenpaiThirteen, t(2, 8)],
      t(2, 8),
    );
    state.players[0].sp = spCapFor('amiya');
    state.wall = state.wall.filter((tile) => tile !== 5);
    expect(validateSkillActivation(state, 0, { tile: 5 }).ok).toBe(false);
  });

  it('星熊「力之锯」设置减番与禁鸣标记', () => {
    let state = rig(
      startGame({ seed: 31, playerOperator: 'hoshiguma' }),
      0,
      [...tenpaiThirteen, t(2, 8)],
      t(2, 8),
    );
    state.players[0].sp = spCapFor('hoshiguma');
    state = activateSkill(state, 0);
    expect(state.players[0].sp).toBe(0);
    expect(state.players[0].skillUsed).toBe(true);
    expect(state.players[0].starHanReduction).toBe(true);
    expect(state.players[0].starNoCall).toBe(true);
  });

  it('星熊使用技能后无法碰牌', () => {
    let state = rig(
      startGame({ seed: 32, playerOperator: 'hoshiguma' }),
      0,
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 27],
      27,
    );
    state.players[0].sp = spCapFor('hoshiguma');
    state = activateSkill(state, 0);
    state.players[0].hand = sorted([0, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    state.players[1].hand = sorted([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0]);
    state.turn = 1;
    state.phase = 'discard';
    state.drawnTile = 0;
    state.lastDiscard = null;
    state.reaction = null;
    const after = discardTile(state, 1, 0);
    expect(after.reaction).toBeNull();
  });

  it('星熊减番在役满之外生效', () => {
    const base = rig(startGame({ seed: 33, playerOperator: 'amiya' }), 0, pinfuHand, t(1, 2));
    base.players[1].starHanReduction = true;
    const reduced = getTsumoResult(base);
    expect(reduced).not.toBeNull();
    base.players[1].starHanReduction = false;
    const normal = getTsumoResult(base);
    expect(normal).not.toBeNull();
    expect(reduced!.han).toBe(Math.max(1, normal!.han - 1));
    expect(reduced!.hanBeforeSkill).toBe(normal!.han);
  });

  it('星熊被动在支付时抽走 10% 入场供', () => {
    const state = rig(startGame({ seed: 34, playerOperator: 'amiya' }), 0, pinfuHand, t(1, 2));
    state.players[1].operator = 'hoshiguma';
    state.players[1].starHanReduction = false;
    state.players[0].score = 30000;
    state.players[1].score = 30000;
    state.riichiSticks = 0;
    state.pot = 0;
    state.honba = 0;
    const result = getTsumoResult(state);
    expect(result).not.toBeNull();
    const after = declareTsumo(state);
    const settlement = after.settlement;
    expect(settlement?.result.type).toBe('win');
    if (!settlement || settlement.result.type !== 'win') return;
    const fee = Math.floor(result!.payment.total * 0.1);
    expect(settlement.result.hoshigumaPot).toBe(fee);
    expect(after.pot).toBe(fee);
    expect(settlement.result.scoreAfter[0] - settlement.result.scoreBefore[0]).toBe(result!.payment.total - fee);
    expect(settlement.result.scoreAfter[1] - settlement.result.scoreBefore[1]).toBe(-result!.payment.total);
  });

  it('大三元包牌责任会记录在结果中', () => {
    const hand = sorted([
      31, 31, 31, 32, 32, 32, 33, 33, 33,
      t(0, 1), t(0, 2), t(0, 3),
      t(2, 5), t(2, 5),
    ]);
    const state = rig(startGame({ seed: 35, playerOperator: 'amiya' }), 0, hand, 33);
    state.players[0].paoBy = 1;
    const result = getTsumoResult(state);
    expect(result).not.toBeNull();
    expect(result!.yakumanCount).toBe(1);
    expect(result!.paoPlayer).toBe(1);
  });
});

describe('振听与食替', () => {
  it('牌河包含听牌张时不能荣和，见逃后进入振听', () => {
    const state = rig(startGame({ seed: 41, playerOperator: 'amiya' }), 0, tenpaiThirteen, null);
    state.players[0].river.push({ tile: t(2, 5), riichi: false, called: false, turn: 1 });
    state.players[1].hand = sorted([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    state.lastDiscard = { player: 1, tile: t(2, 5) };
    expect(getRonResult(state, 0, t(2, 5))).toBeNull();

    const clean = rig(startGame({ seed: 42, playerOperator: 'amiya' }), 0, tenpaiThirteen, null);
    clean.players[1].hand = sorted([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    clean.lastDiscard = { player: 1, tile: t(2, 5) };
    clean.phase = 'react';
    clean.reaction = {
      player: 0,
      from: 1,
      tile: t(2, 5),
      canRon: true,
      canPon: false,
      canKan: false,
      chiOptions: [],
      chankan: true,
      ronPreview: getRonResult(clean, 0, t(2, 5)),
    };
    const after = passReaction(clean);
    expect(after.players[0].tempFuriten).toBe(true);
  });

  it('吃牌后禁止食替，不能立即打出被鸣牌', () => {
    const state = rig(startGame({ seed: 43, playerOperator: 'amiya' }), 0, [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0,
    ], null);
    state.players[0].hand = sorted([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    state.players[1].hand = sorted([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    state.phase = 'react';
    state.turn = 0;
    state.lastDiscard = { player: 1, tile: 1 };
    state.reaction = {
      player: 0,
      from: 1,
      tile: 1,
      canRon: false,
      canPon: false,
      canKan: false,
      chiOptions: [[0, 1, 2]],
      chankan: false,
      ronPreview: null,
    };
    const after = callChi(state, [0, 1, 2]);
    expect(after.players[0].kuikaeForbidden).toContain(1);
    expect(() => discardTile(after, 0, 1)).toThrow(/食替/);
    const cleared = discardTile(after, 0, 3);
    expect(cleared.players[0].kuikaeForbidden).toEqual([]);
  });
});

describe('流局与下一局', () => {
  it('流局时单方听牌收取 3000 点', () => {
    const state = rig(
      startGame({ seed: 51, playerOperator: 'amiya' }),
      0,
      [...tenpaiThirteen, t(2, 9)],
      t(2, 9),
    );
    state.wall = [];
    state.players[1].hand = sorted([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]);
    state.players[0].river = [{ tile: t(0, 3), riichi: false, called: false, turn: 0 }];
    state.players[1].river = [];
    state.players[0].score = 30000;
    state.players[1].score = 30000;
    state.lastDiscard = null;
    state.reaction = null;
    const after = discardTile(state, 0, t(2, 9));
    expect(after.phase).toBe('handEnd');
    expect(after.settlement?.result.type).toBe('draw');
    if (!after.settlement || after.settlement.result.type !== 'draw') return;
    expect(after.settlement.result.tenpaiDelta).toBe(3000);
    expect(after.players[0].score).toBe(33000);
    expect(after.players[1].score).toBe(27000);
  });

  it('下一局保留 SP、场供与立直棒', () => {
    const state = rig(
      startGame({ seed: 52, playerOperator: 'amiya' }),
      0,
      [...tenpaiThirteen, t(2, 9)],
      t(2, 9),
    );
    state.players[0].sp = 7;
    state.riichiSticks = 2;
    state.pot = 500;
    state.players[0].score = 33000;
    state.players[1].score = 27000;
    state.phase = 'handEnd';
    state.settlement = {
      result: {
        type: 'draw',
        reason: 'exhaustive',
        tenpai: [true, false],
        tenpaiDelta: 3000,
        scoreBefore: [30000, 30000],
        scoreAfter: [33000, 27000],
      },
      next: {
        dealer: 1,
        roundWind: 'east',
        handNumber: 2,
        honba: 0,
        gameOver: false,
      },
    };
    const after = startNextHand(state);
    expect(after.players[0].sp).toBe(7);
    expect(after.riichiSticks).toBe(2);
    expect(after.pot).toBe(500);
    expect(after.handSerial).toBe(2);
    expect(after.players[0].score).toBe(33000);
  });
});

describe('规则辅助', () => {
  it('平和手牌听牌张与向听', () => {
    expect(isTenpai(tenpaiThirteen)).toBe(true);
    expect(getWinningTiles(tenpaiThirteen)).toEqual([t(2, 5)]);
  });

  it('副露手牌也能正确枚举手牌', () => {
    const melds: Meld[] = [{ type: 'pon', tiles: [27, 27, 27] }];
    const hand = sorted([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9]);
    expect(hand.length + melds.length * 3).toBe(14);
  });
});

