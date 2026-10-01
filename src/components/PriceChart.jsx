import { memo, useId, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from 'recharts';
import { formatPrice } from '../utils/format.js';
import { DOWN_COLOR, UP_COLOR } from './MiniChart.jsx';

const GRID_COLOR = '#1E1E1E';
const AXIS_TEXT = '#888888';

const compactPrice = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumSignificantDigits: 4,
});

function axisPrice(value) {
  return value >= 1000 ? compactPrice.format(value) : formatPrice(value);
}

// Sparkline points are hourly samples ending at the latest update, so the
// distance from the last point is shown as an approximate age.
function ChartTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const { i, v } = payload[0].payload;
  const hoursAgo = total - 1 - i;
  return (
    <div className="price-chart__tooltip">
      <span className="num">{formatPrice(v)}</span>
      <span className="price-chart__tooltip-time">{hoursAgo === 0 ? 'Latest' : `≈ ${hoursAgo}h ago`}</span>
    </div>
  );
}

/**
 * Large single-series line/area chart. Takes a plain array of prices so the data
 * source (sparkline today, OHLC later) is decided by the caller.
 */
function PriceChart({ points, height = 280, label }) {
  const gradientId = useId().replace(/:/g, '');

  const chartData = useMemo(() => points.map((v, i) => ({ i, v })), [points]);

  if (points.length < 2) {
    return (
      <div className="price-chart price-chart--empty" style={{ height }} role="img" aria-label={`${label}: no data`}>
        Chart data unavailable for this period
      </div>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];
  const isUp = last >= first;
  const color = isUp ? UP_COLOR : DOWN_COLOR;

  return (
    <div
      className="price-chart"
      style={{ height }}
      role="img"
      aria-label={`${label}: ${isUp ? 'up' : 'down'} from ${formatPrice(first)} to ${formatPrice(last)}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <YAxis
            orientation="right"
            domain={['dataMin', 'dataMax']}
            tickFormatter={axisPrice}
            tick={{ fill: AXIS_TEXT, fontSize: 11, fontFamily: 'Space Mono, monospace' }}
            tickLine={false}
            axisLine={false}
            width={76}
            tickCount={5}
          />
          <ReferenceLine y={first} stroke={AXIS_TEXT} strokeDasharray="3 4" strokeOpacity={0.5} />
          <Tooltip
            content={<ChartTooltip total={points.length} />}
            cursor={{ stroke: AXIS_TEXT, strokeWidth: 1, strokeDasharray: '3 3' }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: '#080808', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default memo(PriceChart);
