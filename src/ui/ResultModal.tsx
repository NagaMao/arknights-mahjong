import { formatScore, formatSignedScore } from '../game/scoring';
import { OPERATORS } from '../game/skills';
import {
  doraFromIndicator,
  isRedFive,
  normalizeTile,
  sortTiles,
  tileName,
  windName,
} from '../game/tiles';
import type { GameState, HandResult, Meld, PlayerIndex, Tile as TileType } from '../game/types';
import { Tile } from './Tile';

interface ResultModalProps {
  state: GameState;
  onNextHand: () => void;
  onNewGame: () => void;
  onBackToTitle: () => void;
}

function deltaLabel(value: number): string {
  return formatSignedScore(value);
}

function yakuHanLabel(han: number, yakuman: boolean): string {
  return yakuman ? '役满' : `${han} 番`;
}

function meldLabel(type: Meld['type']): string {
  return { chi: '吃', pon: '碰', minkan: '明杠', ankan: '暗杠', kakan: '加杠' }[type];
}

function WinTile({
  tile,
  doraKinds,
  uraKinds,
  showUra,
}: {
  tile: TileType;
  doraKinds: readonly TileType[];
  uraKinds: readonly TileType[];
  showUra: boolean;
}) {
  const normal = normalizeTile(tile);
  const badges: string[] = [];
  if (doraKinds.includes(normal)) badges.push('宝');
  if (showUra && uraKinds.includes(normal)) badges.push('里');
  if (isRedFive(tile)) badges.push('赤');
  return (
    <span className="win-tile">
      <Tile tile={tile} mini />
      {badges.length > 0 && <span className="win-tile-badges">{badges.join('')}</span>}
    </span>
  );
}

function WinningHand({
  state,
  winner,
  winTile,
  isTsumo,
  doraKinds,
  uraKinds,
  showUra,
}: {
  state: GameState;
  winner: PlayerIndex;
  winTile: TileType;
  isTsumo: boolean;
  doraKinds: readonly TileType[];
  uraKinds: readonly TileType[];
  showUra: boolean;
}) {
  const player = state.players[winner];
  const concealed = [...player.hand];
  const winIndex = concealed.lastIndexOf(winTile);
  if (winIndex >= 0) concealed.splice(winIndex, 1);
  const hand = sortTiles(concealed);
  return (
    <section className="winning-hand">
      <div className="section-title">
        <span>和牌牌型</span>
        <span className="section-line" />
        <span className="win-legends">
          <i className="legend-dora">宝</i> 宝牌
          {showUra && <><i className="legend-ura">里</i> 里宝牌</>}
          <i className="legend-aka">赤</i> 赤宝牌
        </span>
      </div>
      <div className="winning-hand-tiles">
        <div className="win-hand-group">
          {hand.map((tile, index) => (
            <WinTile
              key={`${tile}-${index}`}
              tile={tile}
              doraKinds={doraKinds}
              uraKinds={uraKinds}
              showUra={showUra}
            />
          ))}
          {player.melds.map((meld, meldIndex) => (
            <span className="win-meld" key={`meld-${meldIndex}`}>
              <span className="win-meld-label">{meldLabel(meld.type)}</span>
              {meld.tiles.map((tile, index) => (
                <WinTile
                  key={`${tile}-${index}`}
                  tile={tile}
                  doraKinds={doraKinds}
                  uraKinds={uraKinds}
                  showUra={showUra}
                />
              ))}
            </span>
          ))}
        </div>
        <span className="win-winning-tile">
          <span className="win-winning-label">{isTsumo ? '自摸' : '荣和'}</span>
          <WinTile
            tile={winTile}
            doraKinds={doraKinds}
            uraKinds={uraKinds}
            showUra={showUra}
          />
        </span>
      </div>
      <div className="win-indicators">
        <span className="micro-label">宝牌</span>
        {doraKinds.map((tile, index) => (
          <Tile key={`dora-${tile}-${index}`} tile={tile} mini />
        ))}
        {showUra && (
          <>
            <span className="micro-label win-ura-label">里宝牌</span>
            {uraKinds.map((tile, index) => (
              <Tile key={`ura-${tile}-${index}`} tile={tile} mini />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function scoreRows(result: HandResult): { label: string; value: string; tone: string }[] {
  if (result.type === 'win') {
    const rows: { label: string; value: string; tone: string }[] = [
      { label: '和牌点数', value: `${formatScore(result.win.payment.total)} 点`, tone: 'gold' },
    ];
    if (result.honba > 0) rows.push({ label: '本场费', value: `+${result.honba * 300} 点`, tone: 'muted' });
    if (result.riichiSticks > 0) {
      rows.push({ label: '供托', value: `+${result.riichiSticks * 1000} 点`, tone: 'muted' });
    }
    if (result.pot > 0) rows.push({ label: '场供', value: `+${result.pot} 点`, tone: 'muted' });
    if (result.hoshigumaPot > 0) {
      rows.push({ label: '星熊「荆棘」', value: `-${result.hoshigumaPot} 点入场供`, tone: 'warn' });
    }
    return rows;
  }
  const rows: { label: string; value: string; tone: string }[] = [];
  if (result.tenpaiDelta > 0) {
    rows.push({ label: '听牌罚符', value: `${formatScore(result.tenpaiDelta)} 点`, tone: 'gold' });
  }
  return rows;
}

export function ResultModal({ state, onNextHand, onNewGame, onBackToTitle }: ResultModalProps) {
  if (!state.settlement) return null;
  const { result, next } = state.settlement;
  const gameOver = next.gameOver;
  const winner = result.type === 'win' ? result.win.player : null;
  const winnerState = winner !== null ? state.players[winner] : null;
  const isDraw = result.type === 'draw';
  const finalScores: [number, number] = [state.players[0].score, state.players[1].score];
  const finalWinner: PlayerIndex = finalScores[0] === finalScores[1]
    ? state.dealer
    : finalScores[0] > finalScores[1]
      ? 0
      : 1;
  const tied = finalScores[0] === finalScores[1];
  const doraKinds = state.deadWall.doraIndicators
    .slice(0, state.deadWall.revealed)
    .map(doraFromIndicator);
  const uraKinds = state.deadWall.uraIndicators
    .slice(0, state.deadWall.revealed)
    .map(doraFromIndicator);
  const showUra = !!winnerState?.riichi;
  const reasonText =
    result.type === 'draw'
      ? {
          exhaustive: '牌山摸尽 · 流局',
          nineTerminals: '九种九牌 · 流局',
          fourKans: '四杠散了 · 流局',
          nagashi: '流局满贯',
        }[result.reason]
      : result.win.special === 'nagashi'
        ? '流局满贯'
        : result.win.isTsumo
          ? '自摸'
          : '荣和';

  return (
    <div className="modal-backdrop result-backdrop">
      <div className={`result-modal ${gameOver ? 'result-modal--gameover' : ''}`} role="dialog" aria-modal="true">
        <div className="result-scanline" />
        <header className="result-header">
          <div>
            <div className="micro-label">OPERATION RESULT</div>
            <h2>{gameOver ? '对局结束' : reasonText}</h2>
            <p className="result-round">
              {windName(state.roundWind)}{state.handNumber}局 · {state.honba} 本场
            </p>
          </div>
          <div className="result-header-side">
            <span className={`result-badge ${gameOver ? 'result-badge--danger' : ''}`}>
              {gameOver ? 'FINAL' : 'SETTLE'}
            </span>
            {result.type === 'win' && winnerState && (
              <div className={`winner-summary winner-summary--${winnerState.operator}`}>
                <div className="winner-summary-text">
                  <span className="micro-label">{result.win.special === 'nagashi' ? 'NAGASHI' : 'WINNER'}</span>
                  <strong>{OPERATORS[winnerState.operator].name}</strong>
                  <span>
                    {result.win.special === 'nagashi'
                      ? '流局满贯'
                      : `${result.win.isTsumo ? '自摸' : '荣和'} 「${tileName(result.win.tile)}」`}
                  </span>
                </div>
                {result.win.special !== 'nagashi' && <Tile tile={result.win.tile} mini />}
              </div>
            )}
          </div>
        </header>

        {!isDraw && winner !== null && result.win.special !== 'nagashi' && (
          <WinningHand
            state={state}
            winner={winner}
            winTile={result.win.tile}
            isTsumo={result.win.isTsumo}
            doraKinds={doraKinds}
            uraKinds={showUra ? uraKinds : []}
            showUra={showUra}
          />
        )}

        {!isDraw && (
          <div className="result-body">
            <div className="result-yaku">
              <div className="section-title">
                <span>役种</span>
                <span className="section-line" />
                <span>
                  {result.win.yakumanCount > 0
                    ? `${result.win.yakumanCount} 倍役满`
                    : `${result.win.han} 番 ${result.win.fu} 符`}
                </span>
              </div>
              {result.win.yaku.length === 0 ? (
                <div className="yaku-row yaku-row--special">
                  <span>流局满贯</span>
                  <span>满贯</span>
                </div>
              ) : (
                <div className="yaku-list">
                  {result.win.yaku.map((yaku) => (
                    <div className="yaku-row" key={`${yaku.id}-${yaku.name}`}>
                      <span>{yaku.name}</span>
                      <span className={yaku.yakuman ? 'tone-gold' : ''}>
                        {yakuHanLabel(yaku.han, !!yaku.yakuman)}
                      </span>
                    </div>
                  ))}
                  {result.win.dora > 0 && (
                    <div className="yaku-row yaku-row--dora">
                      <span>宝牌</span>
                      <span>+{result.win.dora} 番</span>
                    </div>
                  )}
                  {result.win.uraDora > 0 && (
                    <div className="yaku-row yaku-row--dora">
                      <span>里宝牌</span>
                      <span>+{result.win.uraDora} 番</span>
                    </div>
                  )}
                  {result.win.akaDora > 0 && (
                    <div className="yaku-row yaku-row--dora">
                      <span>赤宝牌</span>
                      <span>+{result.win.akaDora} 番</span>
                    </div>
                  )}
                </div>
              )}
              {result.win.hanBeforeSkill > result.win.han && (
                <div className="skill-effect-note">
                  星熊「力之锯」：{result.win.hanBeforeSkill} 番 → {result.win.han} 番
                </div>
              )}
              {result.win.payment.limitName && (
                <div className="limit-note">{result.win.payment.limitName}</div>
              )}
            </div>

            <div className="result-scorebox">
              <div className="section-title">
                <span>点数结算</span>
                <span className="section-line" />
              </div>
              {scoreRows(result).map((row) => (
                <div className="score-row" key={row.label}>
                  <span>{row.label}</span>
                  <span className={`score-value tone-${row.tone}`}>{row.value}</span>
                </div>
              ))}
              {[0, 1].map((index) => {
                const playerIndex = index as PlayerIndex;
                const p = state.players[playerIndex];
                const delta = result.scoreAfter[playerIndex] - result.scoreBefore[playerIndex];
                return (
                  <div className={`final-score ${winner === playerIndex ? 'final-score--winner' : ''}`} key={playerIndex}>
                    <span className="final-name">
                      {OPERATORS[p.operator].name}
                      <small>{playerIndex === state.dealer ? '庄' : '闲'}</small>
                    </span>
                    <span className={`final-delta ${delta >= 0 ? 'is-plus' : 'is-minus'}`}>{deltaLabel(delta)}</span>
                    <strong>{formatScore(result.scoreAfter[playerIndex])}</strong>
                  </div>
                );
              })}
              {result.win.paoPlayer !== undefined && (
                <div className="pao-note">
                  包牌责任 · {OPERATORS[state.players[result.win.paoPlayer].operator].name} 支付本局役满点数
                </div>
              )}
            </div>
          </div>
        )}

        {isDraw && (
          <div className="draw-result">
            <div className="draw-icon"><span>流</span></div>
            <p className="draw-copy">{reasonText}</p>
            <div className="tenpai-grid">
              {[0, 1].map((index) => {
                const playerIndex = index as PlayerIndex;
                const p = state.players[playerIndex];
                const tenpai = result.tenpai[playerIndex];
                const delta = result.scoreAfter[playerIndex] - result.scoreBefore[playerIndex];
                return (
                  <div className="tenpai-card" key={playerIndex}>
                    <span>{OPERATORS[p.operator].name}</span>
                    <strong className={tenpai ? 'is-plus' : 'is-minus'}>{tenpai ? '听牌' : '未听'}</strong>
                    <em>{deltaLabel(delta)}</em>
                    <b>{formatScore(result.scoreAfter[playerIndex])}</b>
                  </div>
                );
              })}
            </div>
            {result.tenpaiDelta > 0 && (
              <p className="draw-note">听牌者收取未听者 3000 点。</p>
            )}
          </div>
        )}

        {gameOver && (
          <div className="final-victory">
            <span className="micro-label">FINAL VICTORY</span>
            <strong>{OPERATORS[state.players[finalWinner].operator].name}</strong>
            <span>
              {formatScore(finalScores[finalWinner])} 点
              {tied ? ' · 同点，庄家胜' : ''}
            </span>
          </div>
        )}

        <div className="result-next">
          <span className="micro-label">{gameOver ? 'MISSION COMPLETE' : 'NEXT OPERATION'}</span>
          <strong>
            {gameOver
              ? next.reason
              : next.dealer === state.dealer
                ? `连庄 · ${windName(next.roundWind)}${next.handNumber}局 · ${next.honba} 本场`
                : `换庄 · ${windName(next.roundWind)}${next.handNumber}局`}
          </strong>
        </div>

        <footer className="result-actions">
          {!gameOver && (
            <button type="button" className="btn btn--primary btn--wide" onClick={onNextHand}>
              继续下一局 <span>→</span>
            </button>
          )}
          {gameOver && (
            <button type="button" className="btn btn--primary btn--wide" onClick={onNewGame}>
              再次出击 <span>↻</span>
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={onBackToTitle}>
            返回标题
          </button>
        </footer>
      </div>
    </div>
  );
}
