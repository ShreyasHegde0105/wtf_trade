export function formatPrice(price) {
  const digits = price >= 100 ? 2 : price >= 1 ? 3 : price >= 0.01 ? 4 : 6;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(price);
}

export function formatChange(change) {
  const sign = change > 0 ? '+' : change < 0 ? '-' : '';
  return `${sign}${Math.abs(change).toFixed(2)}%`;
}

export function formatVolume(volume) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(volume);
}

export const formatScore = (score) => score.toFixed(2);
