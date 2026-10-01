import { memo, useMemo } from 'react';
import { Line, LineChart, YAxis } from 'recharts';

export const UP_COLOR = '#00E5C4';
export const DOWN_COLOR = '#FF4B4B';

function MiniChart({ data, prices, trend, positive, width = 80, height = 40, strokeWidth = 2 }) {
  const points = data || prices || [];
  const isUp = trend != null ? trend === 'up' : Boolean(positive);
  const strokeColor = isUp ? UP_COLOR : DOWN_COLOR;

  const chartData = useMemo(() => {
    if (!Array.isArray(points)) return [];
    return points.map((val, idx) => ({ i: idx, v: typeof val === 'number' ? val : 0 }));
  }, [points]);

  const size = { width: `${width}px`, height: `${height}px` };

  if (!Array.isArray(points) || points.length < 2) {
    return (
      <div className="chart chart--empty" role="img" aria-label="7-day chart unavailable" style={size}>
        {width >= 60 ? 'No chart' : '—'}
      </div>
    );
  }

  return (
    <div
      className="chart"
      role="img"
      aria-label={`7-day price trend: ${isUp ? 'upward' : 'downward'}`}
      style={size}
    >
      <LineChart width={width} height={height} data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        {/* Fit the line to the data range; Recharts' default [0, auto] flattens high-priced assets. */}
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Line
          type="monotone"
          dataKey="v"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}

export default memo(MiniChart);
