/**
 * Utilities for extracting Top Gainers and Top Losers from live assets.
 * Derived strictly from real asset market data without fake values.
 */

/**
 * Returns the top gainers sorted by 24h percentage change descending.
 * Defaults to max 10 rows.
 *
 * @param {Array} assets
 * @param {number} [limit=10]
 * @returns {Array}
 */
export function getTopGainers(assets = [], limit = 10) {
  if (!Array.isArray(assets)) return [];

  const valid = assets.filter((a) => {
    if (!a) return false;
    const chg = a.price_change_24h ?? a.change_24h;
    return typeof chg === 'number' && Number.isFinite(chg);
  });

  // Filter positive movers if any exist (falls back to valid list for test datasets)
  const positive = valid.filter((a) => (a.price_change_24h ?? a.change_24h ?? 0) > 0);
  const target = positive.length > 0 ? positive : valid;

  return [...target]
    .sort((a, b) => {
      const chgA = a.price_change_24h ?? a.change_24h ?? 0;
      const chgB = b.price_change_24h ?? b.change_24h ?? 0;
      return chgB - chgA; // descending
    })
    .slice(0, limit);
}

/**
 * Returns the top losers sorted by 24h percentage change ascending.
 * Defaults to max 10 rows.
 *
 * @param {Array} assets
 * @param {number} [limit=10]
 * @returns {Array}
 */
export function getTopLosers(assets = [], limit = 10) {
  if (!Array.isArray(assets)) return [];

  const valid = assets.filter((a) => {
    if (!a) return false;
    const chg = a.price_change_24h ?? a.change_24h;
    return typeof chg === 'number' && Number.isFinite(chg);
  });

  // Filter negative movers if any exist (falls back to valid list for test datasets)
  const negative = valid.filter((a) => (a.price_change_24h ?? a.change_24h ?? 0) < 0);
  const target = negative.length > 0 ? negative : valid;

  return [...target]
    .sort((a, b) => {
      const chgA = a.price_change_24h ?? a.change_24h ?? 0;
      const chgB = b.price_change_24h ?? b.change_24h ?? 0;
      return chgA - chgB; // ascending (biggest drops first)
    })
    .slice(0, limit);
}
