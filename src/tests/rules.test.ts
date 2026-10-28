import { describe, expect, it } from 'vitest';
import {
  calculateShanten,
  evaluateHand,
  getWinningTiles,
  isTenpai,
  isWinningHand,
  type HandContext,
} from '../game/rules';
import { calculatePayment } from '../game/scoring';
import {
  RED_MAN,
  RED_PIN,
  RED_SOU,
  buildWall,
  createDeck,
  doraFromIndicator,
  sameTileKind,
  tileName,
} from '../game/tiles';
import type { Meld, Tile } from '../game/types';

const baseCtx: HandContext = {
  roundWind: 'east',
  seatWind: 'west',
  isTsumo: false,
  doraIndicators: [],
  uraIndicators: [],
};

const t = (suit: 0 | 1 | 2, rank: number): Tile => suit * 9 + (rank - 1);

function sorted(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => a - b);
}

function ctx(overrides: Partial<HandContext> = {}): HandContext {
  return { ...baseCtx, ...overrides };
}

describe('牌山与种子随机', () => {
  it('生成 136 张牌、96 张可摸牌山和 14 张王牌', () => {
    expect(createDeck()).toHaveLength(136);
    const deck = createDeck();
    expect(deck.filter((tile) => tile === RED_MAN)).toHaveLength(1);
    expect(deck.filter((tile) => tile === RED_PIN)).toHaveLength(1);
    expect(deck.filter((tile) => tile === RED_SOU)).toHaveLength(1);
    const built = buildWall('seed-1');
    expect(built.wall).toHaveLength(96);
    expect(built.hands[0]).toHaveLength(13);
    expect(built.hands[1]).toHaveLength(13);
    expect(built.deadWall.rinshan).toHaveLength(4);
    expect(built.deadWall.doraIndicators).toHaveLength(5);
    expect(built.deadWall.uraIndicators).toHaveLength(5);
    const all = [...built.wall, ...built.hands.flat(), ...built.deadWall.rinshan, ...built.deadWall.doraIndicators, ...built.deadWall.uraIndicators];
    expect(all).toHaveLength(136);
  });

  it('相同种子生成完全相同的牌山', () => {
    const a = buildWall(20241028);
    const b = buildWall(20241028);
    expect(a.wall).toEqual(b.wall);
    expect(a.hands).toEqual(b.hands);
  });

  it('宝牌指示牌循环正确', () => {
    expect(doraFromIndicator(t(0, 9))).toBe(t(0, 1));
    expect(doraFromIndicator(t(1, 1))).toBe(t(1, 2));
    expect(doraFromIndicator(30)).toBe(27); // 北 -> 东
    expect(doraFromIndicator(33)).toBe(31); // 中 -> 白
  });
});

describe('和牌牌型', () => {
  it('识别标准四面子一雀头', () => {
    const hand = sorted([
      t(0, 1), t(0, 2), t(0, 3),
      t(0, 4), t(0, 5), t(0, 6),
      t(0, 7), t(0, 8), t(0, 9),
      t(1, 1), t(1, 2), t(1, 3),
      t(2, 5), t(2, 5),
    ]);
    expect(isWinningHand(hand)).toBe(true);
  });

  it('识别七对子与国士无双', () => {
    const chiitoi = sorted([
      t(0, 1), t(0, 1), t(0, 3), t(0, 3), t(0, 5), t(0, 5),
      t(1, 2), t(1, 2), t(2, 4), t(2, 4), 27, 27, 31, 31,
    ]);
    expect(isWinningHand(chiitoi)).toBe(true);
    const kokushi = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33, 33];
    expect(isWinningHand(kokushi)).toBe(true);
  });

  it('计算听牌张', () => {
    const hand = sorted([
      t(0, 1), t(0, 2), t(0, 3),
      t(0, 4), t(0, 5), t(0, 6),
      t(0, 7), t(0, 8), t(0, 9),
      t(1, 1), t(1, 2), t(1, 3),
      t(2, 5),
    ]);
    expect(isTenpai(hand)).toBe(true);
    expect(getWinningTiles(hand)).toEqual([t(2, 5)]);
    expect(calculateShanten(hand)).toBe(0);
  });
});

describe('役种与符', () => {
  it('平和 + 门清自摸，20 符 2 番', () => {
    const win = t(1, 2);
    const hand = sorted([
      t(0, 1), t(0, 2), t(0, 3),
      t(0, 4), t(0, 5), t(0, 6),
      t(0, 7), t(0, 8), t(0, 9),
      t(1, 2), t(1, 3), t(1, 4),
      t(2, 5), t(2, 5),
    ]);
    const result = evaluateHand(hand, [], win, ctx({ isTsumo: true }));
    expect(result).not.toBeNull();
    expect(result!.fu).toBe(20);
    expect(result!.yaku.map((y) => y.id)).toEqual(expect.arrayContaining(['pinfu', 'tsumo', 'ittsu']));
    expect(result!.han).toBe(4); // 平和 1 + 自摸 1 + 一气通贯 2
  });

  it('断幺九、役牌与宝牌', () => {
    const win = t(1, 2);
    const hand = sorted([
      t(0, 2), t(0, 3), t(0, 4),
      t(0, 5), t(0, 6), t(0, 7),
      t(1, 2), t(1, 3), t(1, 4),
      t(2, 3), t(2, 4), t(2, 5),
      t(1, 8), t(1, 8),
    ]);
    const result = evaluateHand(hand, [], win, ctx({ isTsumo: true, doraIndicators: [t(0, 1)] }));
    expect(result).not.toBeNull();
    expect(result!.yaku.map((y) => y.id)).toContain('tanyao');
    expect(result!.dora).toBe(1); // 一万指示，二万为宝牌
    expect(result!.han).toBeGreaterThanOrEqual(2);
  });

  it('役牌刻子与副露手番数', () => {
    const win = 31; // 白
    const hand = sorted([
      t(0, 1), t(0, 2), t(0, 3),
      t(1, 4), t(1, 5), t(1, 6),
      t(2, 7), t(2, 8), t(2, 9),
      t(2, 2), t(2, 2),
      31, 31, 31,
    ]);
    const result = evaluateHand(hand, [], win, ctx({ isTsumo: true }));
    expect(result).not.toBeNull();
    const ids = result!.yaku.map((y) => y.id);
    expect(ids).toContain('yakuhai-31');
    expect(ids).toContain('tsumo');
    expect(ids).not.toContain('pinfu');
  });

  it('七对子 25 符、二番', () => {
    const hand = sorted([
      t(0, 1), t(0, 1), t(0, 3), t(0, 3), t(0, 5), t(0, 5),
      t(1, 2), t(1, 2), t(2, 4), t(2, 4), 27, 27, 31, 31,
    ]);
    const result = evaluateHand(hand, [], t(1, 2), ctx({ isTsumo: true }));
    expect(result).not.toBeNull();
    expect(result!.fu).toBe(25);
    expect(result!.yaku.map((y) => y.id)).toContain('chiitoi');
  });

  it('国士无双十三面是双倍役满', () => {
    const hand = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33, 33];
    const result = evaluateHand(hand, [], 33, ctx({ isTsumo: true }));
    expect(result).not.toBeNull();
    expect(result!.yakumanCount).toBe(2);
  });

  it('天和与地和作为役满', () => {
    const win = t(1, 2);
    const hand = sorted([
      t(0, 1), t(0, 2), t(0, 3),
      t(0, 4), t(0, 5), t(0, 6),
      t(0, 7), t(0, 8), t(0, 9),
      t(1, 2), t(1, 3), t(1, 4),
      t(2, 5), t(2, 5),
    ]);
    const tenhou = evaluateHand(hand, [], win, ctx({ isTsumo: true, tenhou: true }));
    expect(tenhou).not.toBeNull();
    expect(tenhou!.yakumanCount).toBe(1);
    expect(tenhou!.yaku.map((y) => y.id)).toContain('tenhou');

    const chiihou = evaluateHand(hand, [], win, ctx({ isTsumo: true, chiihou: true }));
    expect(chiihou).not.toBeNull();
    expect(chiihou!.yaku.map((y) => y.id)).toContain('chiihou');
  });

  it('赤五按普通五判定牌型，并额外计算赤宝牌', () => {
    const win = t(1, 2);
    const hand = sorted([
      t(0, 1), t(0, 2), t(0, 3),
      t(0, 4), RED_MAN, t(0, 6),
      t(0, 7), t(0, 8), t(0, 9),
      t(1, 2), t(1, 3), t(1, 4),
      t(2, 5), t(2, 5),
    ]);
    const result = evaluateHand(hand, [], win, ctx({ isTsumo: true }));
    expect(result).not.toBeNull();
    expect(result!.akaDora).toBe(1);
    expect(result!.han).toBeGreaterThan(4);
    expect(tileName(RED_MAN)).toBe('赤五万');
    expect(sameTileKind(RED_MAN, t(0, 5))).toBe(true);
  });

  it('副露降低清一色番数', () => {
    const win = t(0, 9);
    const hand = sorted([
      t(0, 1), t(0, 2), t(0, 3),
      t(0, 4), t(0, 5), t(0, 6),
      t(0, 7), t(0, 8),
      t(0, 2), t(0, 2),
    ]);
    const melds: Meld[] = [{ type: 'pon', tiles: [t(0, 1), t(0, 1), t(0, 1)] }];
    const result = evaluateHand([...hand, win], melds, win, ctx({ isTsumo: false }));
    expect(result).not.toBeNull();
    expect(result!.yaku.find((y) => y.id === 'chinitsu')?.han).toBe(5);
  });

  it('三色同顺', () => {
    const win = t(2, 3);
    const hand = sorted([
      t(0, 1), t(0, 2), t(0, 3),
      t(1, 1), t(1, 2), t(1, 3),
      t(2, 1), t(2, 2), t(2, 3),
      t(0, 4), t(0, 5), t(0, 6),
      t(1, 5), t(1, 5),
    ]);
    const result = evaluateHand(hand, [], win, ctx({ isTsumo: true }));
    expect(result).not.toBeNull();
    expect(result!.yaku.map((y) => y.id)).toContain('sanshoku');
  });

  it('三色同刻与三暗刻', () => {
    const win = t(0, 4);
    const hand = sorted([
      t(0, 1), t(0, 1), t(0, 1),
      t(1, 1), t(1, 1), t(1, 1),
      t(2, 1), t(2, 1), t(2, 1),
      t(0, 2), t(0, 3), t(0, 4),
      t(2, 5), t(2, 5),
    ]);
    const result = evaluateHand(hand, [], win, ctx({ isTsumo: true }));
    expect(result).not.toBeNull();
    const ids = result!.yaku.map((y) => y.id);
    expect(ids).toContain('sanshoku-doukou');
    expect(ids).toContain('sanankou');
  });

  it('混全带幺九与纯全带幺九', () => {
    const chantaWin = t(2, 3);
    const chantaHand = sorted([
      t(0, 1), t(0, 2), t(0, 3),
      t(1, 7), t(1, 8), t(1, 9),
      t(2, 1), t(2, 2), t(2, 3),
      27, 27, 27,
      t(0, 9), t(0, 9),
    ]);
    const chanta = evaluateHand(chantaHand, [], chantaWin, ctx({ isTsumo: true }));
    expect(chanta).not.toBeNull();
    expect(chanta!.yaku.map((y) => y.id)).toContain('chanta');

    const junchanWin = t(0, 2);
    const junchanHand = sorted([
      t(0, 1), t(0, 2), t(0, 3),
      t(0, 7), t(0, 8), t(0, 9),
      t(1, 1), t(1, 2), t(1, 3),
      t(1, 7), t(1, 8), t(1, 9),
      t(2, 1), t(2, 1),
    ]);
    const junchan = evaluateHand(junchanHand, [], junchanWin, ctx({ isTsumo: true }));
    expect(junchan).not.toBeNull();
    expect(junchan!.yaku.map((y) => y.id)).toContain('junchan');
    expect(junchan!.yaku.map((y) => y.id)).not.toContain('chanta');
  });

  it('对对和与荣和完成的暗刻按明刻计算', () => {
    const win = t(1, 2);
    const hand = sorted([
      t(0, 1), t(0, 1), t(0, 1),
      t(1, 1), t(1, 1), t(1, 1),
      t(2, 1), t(2, 1), t(2, 1),
      t(1, 2), t(1, 2), t(1, 2),
      t(2, 5), t(2, 5),
    ]);
    const result = evaluateHand(hand, [], win, ctx({ isTsumo: false }));
    expect(result).not.toBeNull();
    const ids = result!.yaku.map((y) => y.id);
    expect(ids).toContain('toitoi');
    expect(ids).toContain('sanankou');
    expect(ids).not.toContain('suuankou');
  });

  it('小三元与大三元', () => {
    const shousangenWin = 31;
    const shousangen = sorted([
      31, 31, 31, 32, 32, 32, 33, 33,
      t(0, 1), t(0, 2), t(0, 3),
      t(1, 4), t(1, 5), t(1, 6),
    ]);
    const small = evaluateHand(shousangen, [], shousangenWin, ctx({ isTsumo: true }));
    expect(small).not.toBeNull();
    expect(small!.yaku.map((y) => y.id)).toContain('shousangen');

    const daisangenWin = 33;
    const daisangen = sorted([
      31, 31, 31, 32, 32, 32, 33, 33, 33,
      t(0, 1), t(0, 2), t(0, 3),
      t(2, 5), t(2, 5),
    ]);
    const big = evaluateHand(daisangen, [], daisangenWin, ctx({ isTsumo: true }));
    expect(big).not.toBeNull();
    expect(big!.yakumanCount).toBe(1);
    expect(big!.yaku.map((y) => y.id)).toContain('daisangen');
  });

  it('四暗刻单骑为双倍役满', () => {
    const hand = sorted([
      t(0, 1), t(0, 1), t(0, 1),
      t(0, 2), t(0, 2), t(0, 2),
      t(0, 3), t(0, 3), t(0, 3),
      t(0, 4), t(0, 4), t(0, 4),
      t(0, 5), t(0, 5),
    ]);
    const result = evaluateHand(hand, [], t(0, 5), ctx({ isTsumo: true }));
    expect(result).not.toBeNull();
    expect(result!.yakumanCount).toBe(2);
  });

  it('封闭顺子重复计入一杯口，混一色按门清计番', () => {
    const win = t(0, 3);
    const hand = sorted([
      t(0, 1), t(0, 2), t(0, 3),
      t(0, 1), t(0, 2), t(0, 3),
      t(0, 7), t(0, 8), t(0, 9),
      27, 27, 27,
      t(0, 5), t(0, 5),
    ]);
    const result = evaluateHand(hand, [], win, ctx({ isTsumo: true }));
    expect(result).not.toBeNull();
    const ids = result!.yaku.map((y) => y.id);
    expect(ids).toContain('iipeiko');
    expect(ids).toContain('honitsu');
    expect(result!.yaku.find((y) => y.id === 'honitsu')?.han).toBe(3);
  });
});

describe('点数计算', () => {
  it('闲家 30 符 3 番荣和 3900 点', () => {
    const payment = calculatePayment(3, 30, false, false, 0);
    expect(payment.total).toBe(3900);
  });

  it('庄家 40 符 4 番荣和满贯 12000 点', () => {
    const payment = calculatePayment(4, 40, true, false, 0);
    expect(payment.total).toBe(12000);
    expect(payment.limitName).toBe('满贯');
  });

  it('闲家自摸 20 符 2 番，2 人麻将仅庄家支付 700 点', () => {
    const payment = calculatePayment(2, 20, false, true, 0);
    expect(payment.total).toBe(700);
  });

  it('役满点数', () => {
    expect(calculatePayment(0, 0, false, false, 1).total).toBe(32000);
    expect(calculatePayment(0, 0, true, true, 1).total).toBe(16000);
    expect(calculatePayment(0, 0, false, true, 1).total).toBe(16000);
  });
});

describe('振听辅助与牌名', () => {
  it('听牌张在牌河中时提示振听', () => {
    const hand = sorted([
      t(0, 1), t(0, 2), t(0, 3),
      t(0, 4), t(0, 5), t(0, 6),
      t(0, 7), t(0, 8), t(0, 9),
      t(1, 1), t(1, 2), t(1, 3),
      t(2, 5),
    ]);
    const waits = getWinningTiles(hand);
    expect(waits).toHaveLength(1);
    const river = [waits[0]];
    expect(river.some((tile) => waits.includes(tile))).toBe(true);
  });

  it('牌名可读', () => {
    expect(tileName(t(0, 1))).toBe('一万');
    expect(tileName(27)).toBe('东');
    expect(tileName(31)).toBe('白');
  });
});
