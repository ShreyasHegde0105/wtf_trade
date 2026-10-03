/**
 * Placeholder market news wire dataset.
 * Finite dataset for testing 18-item grid pagination (18 -> 36 -> 54 -> 72).
 * These are strictly labeled placeholders and do NOT make real-world market claims.
 */

const CATEGORIES = [
  'MARKET · PLACEHOLDER',
  'MACRO · PLACEHOLDER',
  'TERMINAL · PLACEHOLDER',
  'DERIVATIVES · PLACEHOLDER',
  'LIQUIDITY · PLACEHOLDER',
  'REGULATION · PLACEHOLDER',
];

export const TOTAL_NEWS_ITEMS = 72;
export const NEWS_PAGE_SIZE = 18;

export const NEWS_DATA = Array.from({ length: TOTAL_NEWS_ITEMS }, (_, i) => {
  const index = i + 1;
  const category = CATEGORIES[i % CATEGORIES.length];
  const hoursAgo = Math.floor(i * 1.5) + 1;
  const time = hoursAgo >= 24 ? `${Math.floor(hoursAgo / 24)}d ago` : `${hoursAgo}h ago`;

  return {
    id: `news-${index}`,
    index,
    title: `News ${index}`,
    category,
    time,
    source: 'WTF Wire',
    summary: `Placeholder market news briefing for News ${index}. Verification item for grid layout and pagination.`,
    content: `Placeholder article content for News ${index}.\n\nThis article provides simulated headline data for terminal testing. In production, this section connects to real-time market news wire services. All statistics and statements herein are placeholders.`,
  };
});
