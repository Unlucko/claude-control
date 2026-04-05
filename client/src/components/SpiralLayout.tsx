import { type ReactNode } from 'react';

interface Props {
  items: ReactNode[];
  depth?: number;
}

// Spiral/fibonacci tiling: first item takes half, rest subdivide the other half
// Direction alternates: horizontal -> vertical -> horizontal -> ...
export default function SpiralLayout({ items, depth = 0 }: Props) {
  if (items.length === 0) return null;
  if (items.length === 1) return <>{items[0]}</>;

  const [first, ...rest] = items;
  const isHorizontal = depth % 2 === 0;

  return (
    <div style={{
      display: 'flex',
      flexDirection: isHorizontal ? 'row' : 'column',
      flex: 1,
      minHeight: 0,
      minWidth: 0,
    }}>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
        {first}
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
        <SpiralLayout items={rest} depth={depth + 1} />
      </div>
    </div>
  );
}
