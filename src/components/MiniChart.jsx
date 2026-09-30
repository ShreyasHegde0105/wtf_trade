import { memo, useMemo } from 'react';
import { Line, LineChart } from 'recharts';

function MiniChart({ data, prices, trend, positive }) {
  const points = data || prices || [];
  const isUp = trend != null ? trend === 'up' : Boolean(positive);
  const strokeColor = isUp ? '#00E5C4' : '#FF4B4B';

  const chartData = useMemo(() => {
    if (!Array.isArray(points)) return [];
    return points.map((val, idx) => ({ i: idx, v: typeof val === 'number' ? val : 0 }));
  }, [points]);

  if (!Array.isArray(points) || points.length < 2) {
    return (
      <div
        className="chart chart--empty"
        role="img"
        aria-label="7-day chart unavailable"
        style={{ width: '80px', height: '40px' }}
      >
        Chart unavailable
      </div>
    );
  }

  return (
    <div
      className="chart"
      role="img"
      aria-label={`7-day price trend: ${isUp ? 'upward' : 'downward'}`}
      style={{ width: '80px', height: '40px' }}
    >
      <LineChart
        width={80}
        height={40}
        data={chartData}
        margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
      >
        <Line
          type="monotone"
          dataKey="v"
          stroke={strokeColor}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}

export default memo(MiniChart);
