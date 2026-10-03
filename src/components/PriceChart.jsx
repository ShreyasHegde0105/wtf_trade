import { memo, useId, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatPrice } from '../utils/format.js';
import { DOWN_COLOR, UP_COLOR } from './MiniChart.jsx';

const GRID_COLOR = '#1c2229';
const AXIS_TEXT = '#64748b';

const compactPrice = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumSignificantDigits: 4,
});

function axisPrice(value) {
  return value >= 1000 ? compactPrice.format(value) : formatPrice(value);
}

function formatMMDD(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}/${d}`;
}

function formatHHMM(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function getTickIndices(length, count) {
  if (length <= 2) return [0, Math.max(0, length - 1)];
  const step = (length - 1) / (count - 1);
  const set = new Set();
  for (let k = 0; k < count; k++) {
    set.add(Math.min(Math.round(k * step), length - 1));
  }
  return Array.from(set).sort((a, b) => a - b);
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { v, fullTime } = payload[0].payload;
  return (
    <div className="price-chart__tooltip">
      <span className="price-chart__tooltip-price num">{formatPrice(v)}</span>
      <span className="price-chart__tooltip-time num">{fullTime}</span>
    </div>
  );
}

function PriceChart({ points = [], height = 280, label, timeframe = '7d' }) {
  const gradientId = useId().replace(/:/g, '');

  const is1D = timeframe === '1d';

  const chartData = useMemo(() => {
    if (!Array.isArray(points) || points.length === 0) return [];
    const now = Date.now();
    // 24 hours (86,400,000 ms) for 1D, 7 days (604,800,000 ms) for 7D
    const totalMs = is1D ? 24 * 3600 * 1000 : 7 * 24 * 3600 * 1000;
    const stepMs = points.length > 1 ? totalMs / (points.length - 1) : totalMs;

    return points.map((v, i) => {
      const timeMs = now - (points.length - 1 - i) * stepMs;
      const d = new Date(timeMs);
      const dateStr = formatMMDD(d);
      const timeStr = formatHHMM(d);
      return {
        i,
        v,
        timeMs,
        dateStr,
        timeStr,
        fullTime: is1D ? `${timeStr} (local)` : `${dateStr} ${timeStr}`,
      };
    });
  }, [points, is1D]);

  // For 1D: ~5 ticks at 6-hour intervals (00:00, 06:00, 12:00, 18:00, now)
  // For 7D: ~6 ticks representing actual MM/DD calendar dates
  const ticks = useMemo(() => {
    if (!points || points.length < 2) return [];
    const tickCount = is1D ? 5 : 6;
    return getTickIndices(points.length, tickCount);
  }, [points, is1D]);

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
        <AreaChart data={chartData} margin={{ top: 8, right: 6, bottom: 4, left: 6 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.14} />
              <stop offset="85%" stopColor={color} stopOpacity={0.01} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="2 2" vertical={false} />
          <XAxis
            dataKey="i"
            ticks={ticks}
            tickFormatter={(idx) => {
              const item = chartData[idx];
              return is1D ? item?.timeStr : item?.dateStr;
            }}
            tick={{ fill: AXIS_TEXT, fontSize: 10, fontFamily: 'JetBrains Mono, Space Mono, monospace' }}
            tickLine={{ stroke: GRID_COLOR }}
            axisLine={{ stroke: GRID_COLOR }}
            dy={4}
          />
          <YAxis
            orientation="right"
            domain={['dataMin', 'dataMax']}
            tickFormatter={axisPrice}
            tick={{ fill: AXIS_TEXT, fontSize: 10, fontFamily: 'JetBrains Mono, Space Mono, monospace' }}
            tickLine={false}
            axisLine={{ stroke: GRID_COLOR }}
            width={72}
            tickCount={5}
          />
          {/* Baseline reference line */}
          <ReferenceLine y={first} stroke={AXIS_TEXT} strokeDasharray="3 3" strokeOpacity={0.35} />
          {/* Current price horizontal indicator line */}
          <ReferenceLine
            y={last}
            stroke={color}
            strokeDasharray="2 2"
            strokeOpacity={0.75}
            strokeWidth={1}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: AXIS_TEXT, strokeWidth: 1, strokeDasharray: '3 3' }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: '#07090a', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default memo(PriceChart);
