import { CategoryScale, Chart as ChartJS, LinearScale, LineElement, PointElement } from 'chart.js';
import { memo, useMemo } from 'react';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement);

const OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  events: [], // decorative sparkline: no hover work
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  scales: { x: { display: false }, y: { display: false } },
  elements: { point: { radius: 0 }, line: { borderWidth: 2, tension: 0.3 } },
};

// Canvas cannot read CSS variables, so resolve the design tokens once.
const readToken = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function MiniChart({ prices, positive }) {
  const data = useMemo(
    () => ({
      labels: prices.map((_, index) => index),
      datasets: [{ data: prices, borderColor: readToken(positive ? '--up' : '--down') }],
    }),
    [prices, positive],
  );

  if (prices.length < 2) {
    return (
      <div className="chart chart--empty" role="img" aria-label="24 hour chart unavailable">
        Chart unavailable
      </div>
    );
  }

  return (
    <div className="chart">
      <Line data={data} options={OPTIONS} aria-label="24 hour price trend" role="img" />
    </div>
  );
}

export default memo(MiniChart);
