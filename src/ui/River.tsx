import { isDoraOrAka, sameTileKind } from '../game/tiles';
import type { DiscardRecord, Tile as TileType } from '../game/types';
import { Tile } from './Tile';

interface RiverProps {
  river: DiscardRecord[];
  label: string;
  opponent?: boolean;
  hoverTile?: TileType | null;
  onHoverTile?: (tile: TileType | null) => void;
  doraTiles?: TileType[];
}

export function River({ river, label, opponent, hoverTile, onHoverTile, doraTiles = [] }: RiverProps) {
  return (
    <section className={`river ${opponent ? 'river--opponent' : 'river--player'} ${river.length === 0 ? 'river--empty' : ''}`}>
      <header className="river-header">
        <span className="micro-label">{label}</span>
        <span className="river-count">{river.length} 舍</span>
      </header>
      <div className="river-grid">
        {river.length === 0 && <span className="river-empty">尚无敌牌</span>}
        {river.map((record, index) => (
          <span
            key={`${record.tile}-${index}`}
            className={`river-cell ${record.called ? 'river-cell--called' : ''} ${
              index === river.length - 1 ? 'river-cell--last' : ''
            }`}
            onMouseEnter={() => onHoverTile?.(record.tile)}
            onMouseLeave={() => onHoverTile?.(null)}
          >
            {record.riichi && <span className="riichi-stick" title="立直宣言牌" />}
            <Tile
              tile={record.tile}
              horizontal={record.riichi}
              called={record.called}
              glowing={isDoraOrAka(record.tile, doraTiles)}
              highlighted={hoverTile != null && sameTileKind(hoverTile, record.tile)}
            />
            {index === river.length - 1 && <span className="river-last-mark">最新</span>}
          </span>
        ))}
      </div>
    </section>
  );
}

export type RiverTile = TileType;
