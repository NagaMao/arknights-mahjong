import { useEffect, useRef, useState } from 'react';
import {
  canDeclareNineTerminals,
  canDeclareRiichi,
  getAnkanOptions,
  getKakanOptions,
  getLegalDiscards,
  getPlayerTenpai,
  getRevealedDora,
  getReactionOptions,
  getTsumoResult,
  getWaitsAfterDiscard,
} from '../game/state';
import { sameTileKind, tileName, windName } from '../game/tiles';
import type { GameState, GameEvent, Tile as TileType } from '../game/types';
import { Hand } from './Hand';
import { River } from './River';
import { SkillBar } from './SkillBar';
import { Tile } from './Tile';

export interface SkillBubbleInfo {
  player: 0 | 1;
  activeName: string;
}

interface TableProps {
  state: GameState;
  selectedTile: TileType | null;
  riichiMode: boolean;
  skillBubble: SkillBubbleInfo | null;
  onSelectTile: (tile: TileType) => void;
  onDoubleDiscard: (tile: TileType) => void;
  onRiichi: () => void;
  onTsumo: () => void;
  onRon: () => void;
  onPon: () => void;
  onKan: () => void;
  onChi: () => void;
  onPass: () => void;
  onUseSkill: () => void;
  onAnkan: () => void;
  onKakan: () => void;
  onNineTerminals: () => void;
  onHelp: () => void;
  onExit: () => void;
}

function eventIcon(type: GameEvent['type']): string {
  return {
    draw: '摸',
    discard: '打',
    call: '鸣',
    riichi: '立',
    skill: '技',
    win: '和',
    drawEnd: '流',
    info: '·',
  }[type];
}

function LogPanel({ events, seed, handSerial }: { events: GameEvent[]; seed: number; handSerial: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events]);
  const visible = events.slice(-40);
  return (
    <aside className="log-panel">
      <header className="log-header">
        <span className="micro-label">COMBAT LOG</span>
        <span className="live-dot" />
      </header>
      <div className="log-scroll" ref={scrollRef}>
        {visible.length === 0 && <p className="log-empty">等待行动记录...</p>}
        {visible.map((event) => (
          <div className={`log-entry log-entry--${event.type}`} key={event.id}>
            <span className="log-icon">{eventIcon(event.type)}</span>
            <span>{event.text}</span>
          </div>
        ))}
      </div>
      <div className="log-footer">
        <span>SEED // {seed}</span>
        <span>HAND #{handSerial}</span>
      </div>
    </aside>
  );
}

function StatusChips({ state }: { state: GameState }) {
  const p = state.players[0];
  return (
    <div className="status-chips">
      {p.riichi && <span className="chip chip--riichi">立直</span>}
      {p.doubleRiichi && <span className="chip chip--riichi">两立直</span>}
      {p.ippatsu && <span className="chip chip--ippatsu">一发</span>}
      {(p.tempFuriten || p.riichiFuriten) && <span className="chip chip--furiten">振听</span>}
      {state.players[1].riichi && <span className="chip chip--opponent-riichi">对手立直</span>}
      {state.players[1].ippatsu && <span className="chip chip--opponent-riichi">对手一发</span>}
      {p.amiyaLockPending && <span className="chip chip--danger">奇美拉代价待启动</span>}
      {p.amiyaLock > 0 && <span className="chip chip--danger">奇美拉代价 {p.amiyaLock}</span>}
    </div>
  );
}

function SkillBubble({ info, side }: { info: SkillBubbleInfo; side: 'player' | 'opponent' }) {
  return (
    <div className={`skill-bubble skill-bubble--${side}`} role="status">
      <span className="skill-bubble-kicker">{info.player === 0 ? 'YOU' : 'AI'} · SKILL ACTIVATED</span>
      <strong>{info.activeName}</strong>
      <span className="skill-bubble-tail" />
    </div>
  );
}

export function Table({
  state,
  selectedTile,
  riichiMode,
  skillBubble,
  onSelectTile,
  onDoubleDiscard,
  onRiichi,
  onTsumo,
  onRon,
  onPon,
  onKan,
  onChi,
  onPass,
  onUseSkill,
  onAnkan,
  onKakan,
  onNineTerminals,
  onHelp,
  onExit,
}: TableProps) {
  const human = state.players[0];
  const ai = state.players[1];
  const humanTurn = state.phase === 'discard' && state.turn === 0;
  const legalDiscards = getLegalDiscards(state, 0);
  const tsumo = humanTurn ? getTsumoResult(state) : null;
  const reaction = state.phase === 'react' && state.turn === 0 ? getReactionOptions(state) : null;
  const ankanOptions = humanTurn ? getAnkanOptions(state, 0) : [];
  const kakanOptions = humanTurn ? getKakanOptions(state, 0) : [];
  const nineReady = humanTurn && canDeclareNineTerminals(state);
  const riichiCandidates = humanTurn
    ? legalDiscards.filter((tile) => canDeclareRiichi(state, 0, tile))
    : [];
  const tenpai = getPlayerTenpai(state, 0);
  const dora = getRevealedDora(state);
  const [hoverTile, setHoverTile] = useState<TileType | null>(null);
  const [hoveredHandTile, setHoveredHandTile] = useState<TileType | null>(null);

  useEffect(() => {
    setHoverTile(null);
    setHoveredHandTile(null);
  }, [state.handSerial, state.turn, state.phase]);

  const hoveredRiichiCandidate =
    hoveredHandTile === null
      ? undefined
      : riichiCandidates.find((candidate) => sameTileKind(candidate, hoveredHandTile));
  const selectedRiichiCandidate =
    selectedTile === null
      ? undefined
      : riichiCandidates.find((candidate) => sameTileKind(candidate, selectedTile));
  const previewCandidate = hoveredRiichiCandidate ?? selectedRiichiCandidate;
  const previewWaits = previewCandidate
    ? getWaitsAfterDiscard(state, 0, previewCandidate)
    : null;

  const statusText = (() => {
    if (riichiMode) {
      if (previewWaits && previewWaits.length > 0) {
        return `宣言牌「${tileName(previewCandidate!)}」· 立直听牌`;
      }
      return '请选择立直宣言牌 · 再次点击宣言牌宣告立直';
    }
    if (reaction) {
      return reaction.canRon
        ? '可以荣和 · 见逃将进入振听'
        : '对家的舍牌可以响应';
    }
    if (!humanTurn) return 'AI 正在计算...';
    if (tsumo) return '摸牌成和 · 可以自摸';
    if (human.amiyaLockPending) return '奇美拉：本巡不受限制，本巡结束后进入摸切';
    if (human.amiyaLock > 0) return '奇美拉代价 · 本轮只能摸切';
    if (human.riichi) return '立直中 · 只能摸切或自摸';
    if (selectedTile !== null) return `已选择「${tileName(selectedTile)}」· 双击手牌出牌`;
    return '双击手牌出牌 · 单击选中可用于立直';
  })();

  const showPlayerBubble = skillBubble?.player === 0;
  const showAiBubble = skillBubble?.player === 1;

  return (
    <div className="game-screen">
      <header className="game-topbar">
        <div className="brand-lockup brand-lockup--small">
          <span className="brand-mark">R</span>
          <div>
            <div className="brand-title">RHODES ISLAND</div>
            <div className="brand-sub">RIICHI DIVISION</div>
          </div>
        </div>

        <div className="topbar-actions">
          <button type="button" className="icon-btn" onClick={onHelp} title="规则与操作">
            ?
          </button>
          <button type="button" className="text-btn" onClick={onExit}>
            退出
          </button>
        </div>
      </header>

      <main className="table-layout">
        <section className="table-surface">
          <div className="table-scanline" aria-hidden="true" />
          <div className="opponent-zone">
            <section className="match-info-panel" aria-label="对局信息">
              <div className="match-info-top">
                <span className="micro-label">MATCH INFO // 对局信息</span>
                <span className="match-info-sticks">供托 {state.riichiSticks}</span>
              </div>
              <div className="match-info-round">
                <span className="match-info-wind">{windName(state.roundWind)}</span>
                <div className="match-info-round-text">
                  <strong>{state.handNumber}局</strong>
                  <span>{state.honba} 本场</span>
                </div>
              </div>
              <div className="match-info-bottom">
                <div className="match-info-wall">
                  <span>牌山</span>
                  <strong>{state.wall.length}</strong>
                </div>
                <div className="match-info-dora">
                  <span>宝牌</span>
                  <div className="match-info-dora-tiles">
                    {dora.map((tile, index) => (
                      <Tile key={`${tile}-${index}`} tile={tile} mini />
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <div className="opponent-profile">
              <SkillBar state={state} player={1} compact />
              {showAiBubble && skillBubble && <SkillBubble info={skillBubble} side="opponent" />}
            </div>

            <Hand
              player={ai}
              index={1}
              drawnTile={state.turn === 1 && state.phase !== 'react' ? state.drawnTile : null}
              doraTiles={dora}
              hidden
            />
          </div>

          <div className="center-grid center-grid--rivers">
            <River
              river={ai.river}
              label="对手牌河"
              opponent
              hoverTile={hoverTile}
              onHoverTile={setHoverTile}
              doraTiles={dora}
            />
            <River
              river={human.river}
              label="你的牌河"
              hoverTile={hoverTile}
              onHoverTile={setHoverTile}
              doraTiles={dora}
            />
          </div>

          <div className="player-zone">
            <div className="player-meta-row">
              <div className="player-title">
                <span className="micro-label">YOUR HAND // {human.operator.toUpperCase()}</span>
                <div className="player-title-line">
                  <strong>{humanTurn ? '轮到你行动' : '等待对家'}</strong>
                  <StatusChips state={state} />
                </div>
              </div>
              <div className="tenpai-readout">
                {previewWaits && previewWaits.length > 0 ? (
                  <>
                    <span className="tenpai-dot is-riichi-preview" />
                    <span>立直听牌</span>
                    <span className="wait-tile-strip">
                      {previewWaits.map((tile, index) => (
                        <Tile key={`${tile}-${index}`} tile={tile} mini />
                      ))}
                    </span>
                  </>
                ) : tenpai.tenpai ? (
                  <>
                    <span className={`tenpai-dot ${tenpai.furiten ? 'is-furiten' : ''}`} />
                    <span>{tenpai.furiten ? '振听' : '听牌'}</span>
                    <span className="wait-tile-strip">
                      {tenpai.waits.map((tile, index) => (
                        <Tile key={`${tile}-${index}`} tile={tile} mini />
                      ))}
                    </span>
                  </>
                ) : (
                  <span className="tenpai-none">未听牌</span>
                )}
              </div>
            </div>

            <div className="player-main">
              <div className="hand-cluster">
                <div className={`hand-action-row ${reaction ? 'is-reaction' : ''}`}>
                  <div className="command-status">
                    <span className={`status-light ${humanTurn ? 'is-live' : ''} ${reaction ? 'is-alert' : ''}`} />
                    <div>
                      <span className="micro-label">
                        {reaction ? 'REACTION WINDOW' : humanTurn ? 'YOUR TURN' : 'STANDBY'}
                      </span>
                      <strong>{statusText}</strong>
                    </div>
                  </div>

                  <div className="hand-actions">
                    {reaction ? (
                      <>
                        {reaction.canRon && (
                          <button type="button" className="action-btn action-btn--win" onClick={onRon}>
                            荣和
                          </button>
                        )}
                        {reaction.canPon && (
                          <button type="button" className="action-btn" onClick={onPon}>
                            碰
                          </button>
                        )}
                        {reaction.canKan && (
                          <button type="button" className="action-btn" onClick={onKan}>
                            杠
                          </button>
                        )}
                        {reaction.chiOptions.length > 0 && (
                          <button type="button" className="action-btn" onClick={onChi}>
                            吃
                            {reaction.chiOptions.length > 1 && <small>{reaction.chiOptions.length}</small>}
                          </button>
                        )}
                        <button
                          type="button"
                          className={`action-btn action-btn--pass ${reaction.canRon ? 'is-risky' : ''}`}
                          onClick={onPass}
                          title={reaction.canRon ? '见逃后本局将进入振听' : '跳过响应'}
                        >
                          过
                        </button>
                      </>
                    ) : riichiMode ? (
                      <>
                        <button type="button" className="action-btn action-btn--gold" onClick={onRiichi}>
                          取消立直
                        </button>
                        {tsumo && (
                          <button type="button" className="action-btn action-btn--win" onClick={onTsumo}>
                            自摸
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {tsumo && (
                          <button type="button" className="action-btn action-btn--win" onClick={onTsumo}>
                            自摸
                          </button>
                        )}
                        {riichiCandidates.length > 0 && (
                          <button
                            type="button"
                            className="action-btn action-btn--gold"
                            onClick={onRiichi}
                            title="进入立直选择：单击宣言牌查看听牌，再次单击宣告立直"
                          >
                            立直
                          </button>
                        )}
                        {ankanOptions.length > 0 && (
                          <button type="button" className="action-btn" onClick={onAnkan}>
                            暗杠
                          </button>
                        )}
                        {kakanOptions.length > 0 && (
                          <button type="button" className="action-btn" onClick={onKakan}>
                            加杠
                          </button>
                        )}
                        {nineReady && (
                          <button type="button" className="action-btn action-btn--muted" onClick={onNineTerminals}>
                            九种九牌
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <Hand
                  player={human}
                  index={0}
                  drawnTile={state.turn === 0 && state.phase !== 'react' ? state.drawnTile : null}
                  interactive={humanTurn}
                  selected={selectedTile}
                  legal={legalDiscards}
                  riichiCandidates={riichiCandidates}
                  riichiMode={riichiMode}
                  doraTiles={dora}
                  onSelect={onSelectTile}
                  onDiscardTile={onDoubleDiscard}
                  onHoverTile={setHoveredHandTile}
                />
              </div>

              <div className="player-info-wrap">
                {showPlayerBubble && skillBubble && <SkillBubble info={skillBubble} side="player" />}
                <SkillBar state={state} player={0} onUseSkill={onUseSkill} />
              </div>
            </div>
          </div>
        </section>

        <LogPanel events={state.events} seed={state.seed} handSerial={state.handSerial} />
      </main>
    </div>
  );
}
