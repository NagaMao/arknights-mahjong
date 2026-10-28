import { useEffect, useRef } from 'react';
import { isDoraOrAka, normalizeTile, sameTileKind, sortTiles } from '../game/tiles';
import type { Meld, PlayerState, Tile as TileType } from '../game/types';
import { Tile } from './Tile';

interface HandProps {
  player: PlayerState;
  index: 0 | 1;
  drawnTile: TileType | null;
  hidden?: boolean;
  interactive?: boolean;
  selected?: TileType | null;
  legal?: TileType[];
  riichiCandidates?: TileType[];
  riichiMode?: boolean;
  doraTiles?: TileType[];
  onSelect?: (tile: TileType) => void;
  onDiscardTile?: (tile: TileType) => void;
  onHoverTile?: (tile: TileType | null) => void;
}

function meldLabel(type: Meld['type']): string {
  return { chi: '吃', pon: '碰', minkan: '明杠', ankan: '暗杠', kakan: '加杠' }[type];
}

function MeldView({ meld, hidden, doraTiles }: { meld: Meld; hidden?: boolean; doraTiles: readonly TileType[] }) {
  return (
    <div className={`meld meld--${meld.type}`} title={meldLabel(meld.type)}>
      <span className="meld-label">{meldLabel(meld.type)}</span>
      <div className="meld-tiles">
        {meld.tiles.map((tile, index) => {
          const faceDown = meld.type === 'ankan' && (index === 0 || index === 3);
          return (
            <Tile
              key={`${tile}-${index}`}
              tile={tile}
              mini
              faceDown={faceDown}
              glowing={!faceDown && isDoraOrAka(tile, doraTiles)}
              called={meld.calledTile === tile}
              dim={hidden && faceDown}
            />
          );
        })}
      </div>
    </div>
  );
}

export function Hand({
  player,
  index,
  drawnTile,
  hidden,
  interactive,
  selected,
  legal = [],
  riichiCandidates = [],
  riichiMode = false,
  doraTiles = [],
  onSelect,
  onDiscardTile,
  onHoverTile,
}: HandProps) {
  const handTilesRef = useRef<HTMLDivElement>(null);
  const sorted = sortTiles(player.hand);

  // 移动端手牌可能横向溢出：摸牌后自动滚到最右侧，保证刚摸的牌可见。
  useEffect(() => {
    if (hidden) return;
    const el = handTilesRef.current;
    if (!el) return;
    el.scrollLeft = drawnTile === null ? 0 : el.scrollWidth;
  }, [hidden, drawnTile, player.hand.length]);

  let drawnIndex = -1;
  if (drawnTile !== null) {
    drawnIndex = sorted.lastIndexOf(drawnTile);
  }
  const rest = [...sorted];
  let drawn: TileType | null = null;
  if (drawnIndex >= 0 && !hidden) {
    drawn = rest.splice(drawnIndex, 1)[0];
  }
  const selectedKind = selected === null || selected === undefined ? null : normalizeTile(selected);

  if (hidden) {
    const concealedCount = player.hand.length - (drawnTile !== null ? 1 : 0);
    return (
      <section className={`hand hand--opponent hand--p${index}`} aria-label="对手手牌">
        <div className="hand-melds">
          {player.melds.map((meld, meldIndex) => (
            <MeldView key={meldIndex} meld={meld} hidden doraTiles={doraTiles} />
          ))}
        </div>
        <div className="hand-tiles hand-tiles--hidden">
          {Array.from({ length: concealedCount }, (_, tileIndex) => (
            <Tile key={`back-${tileIndex}`} tile={0} faceDown small />
          ))}
          {drawnTile !== null && <Tile tile={0} faceDown small drawn />}
        </div>
      </section>
    );
  }

  const renderPlayerTile = (tile: TileType, key: string, isDrawn = false) => {
    const playable = interactive === true;
    const isLegal = legal.includes(tile);
    const isRiichiCandidate = riichiCandidates.some((candidate) => sameTileKind(candidate, tile));
    const isSelectable = riichiMode ? isRiichiCandidate : isLegal;
    const selectedThis = selectedKind !== null && normalizeTile(tile) === selectedKind;
    return (
      <span
        className={`hand-tile-wrap ${isRiichiCandidate ? 'hand-tile-wrap--riichi' : ''}`}
        key={key}
      >
        {isRiichiCandidate && <span className="riichi-tile-marker">立</span>}
        <Tile
          tile={tile}
          drawn={isDrawn}
          selected={selectedThis}
          disabled={playable && !isSelectable}
          glowing={isDoraOrAka(tile, doraTiles)}
          onClick={playable ? () => onSelect?.(tile) : undefined}
          onDoubleClick={playable ? () => onDiscardTile?.(tile) : undefined}
          onMouseEnter={() => onHoverTile?.(tile)}
          onMouseLeave={() => onHoverTile?.(null)}
          small={!isDrawn}
        />
      </span>
    );
  };

  return (
    <section className="hand hand--player" aria-label="你的手牌">
      <div className="hand-melds">
        {player.melds.map((meld, meldIndex) => (
          <MeldView key={meldIndex} meld={meld} doraTiles={doraTiles} />
        ))}
      </div>
      <div className="hand-tiles" ref={handTilesRef}>
        {rest.map((tile, tileIndex) => renderPlayerTile(tile, `${tile}-${tileIndex}`))}
        {drawn !== null && (
          <span className="drawn-wrap">
            <span className="drawn-label">摸</span>
            {renderPlayerTile(drawn, `drawn-${drawn}`, true)}
          </span>
        )}
      </div>
    </section>
  );
}
