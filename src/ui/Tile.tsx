import { isHonor, isRedFive, rankOf, tileName } from '../game/tiles';
import type { Tile as TileType } from '../game/types';
import { TILE_BACK_SRC, flatTileSrc, horizontalTileSrc } from './tileAssets';

interface TileProps {
  tile: TileType;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  selected?: boolean;
  highlighted?: boolean;
  disabled?: boolean;
  faceDown?: boolean;
  drawn?: boolean;
  mini?: boolean;
  small?: boolean;
  called?: boolean;
  horizontal?: boolean;
  dim?: boolean;
  glowing?: boolean;
  title?: string;
}

export function Tile({
  tile,
  onClick,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
  selected,
  highlighted,
  disabled,
  faceDown,
  drawn,
  mini,
  small,
  called,
  horizontal,
  dim,
  glowing,
  title,
}: TileProps) {
  const classes = [
    'tile',
    mini ? 'tile--mini' : small ? 'tile--small' : '',
    faceDown ? 'tile--back' : '',
    selected ? 'tile--selected' : '',
    highlighted ? 'tile--highlight' : '',
    drawn ? 'tile--drawn' : '',
    called ? 'tile--called' : '',
    horizontal ? 'tile--horizontal' : '',
    dim ? 'tile--dim' : '',
    !faceDown && glowing ? 'tile--glow' : '',
    disabled ? 'tile--disabled' : '',
    onClick || onDoubleClick ? 'tile--interactive' : '',
    isRedFive(tile) ? 'tile--red' : '',
    !faceDown && isHonor(tile) ? 'tile--honor' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const label = faceDown ? '牌背' : tileName(tile);
  const src = faceDown ? TILE_BACK_SRC : horizontal ? horizontalTileSrc(tile) : flatTileSrc(tile);

  return (
    <button
      type="button"
      className={classes}
      onClick={disabled ? undefined : onClick}
      onDoubleClick={disabled ? undefined : onDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={title ?? (faceDown ? '牌背' : `${label}${isRedFive(tile) ? ' · 赤宝牌' : ''}`)}
      aria-label={label}
      aria-pressed={selected ? true : undefined}
      aria-disabled={disabled || undefined}
      data-tile={faceDown ? 'back' : tile}
      data-rank={!faceDown && !isHonor(tile) ? rankOf(tile) : undefined}
    >
      <img src={src} alt="" draggable={false} />
      {!faceDown && glowing && <span className="tile-glow" aria-hidden="true" />}
    </button>
  );
}
