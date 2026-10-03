import { memo } from 'react';
import { getTopLosers } from '../utils/movers.js';
import { formatChange, formatPrice } from '../utils/format.js';

function LosersList({ assets = [], onOpenAsset }) {
  const losers = getTopLosers(assets, 10);

  return (
    <section id="losers" className="movers-panel" aria-labelledby="losers-title">
      <div className="section-head movers-head">
        <h2 id="losers-title" className="section-head__title">
          Top Losers <span className="movers-head__chevron" aria-hidden="true">&gt;</span>
        </h2>
        <span className="section-head__sub">First 10 · 24h change</span>
      </div>

      <div className="movers-table-wrap">
        <table className="movers-table" aria-label="Top 10 losing assets">
          <thead>
            <tr className="movers-thead">
              <th scope="col" className="movers-th movers-th--rank">
                <abbr title="Rank">#</abbr>
              </th>
              <th scope="col" className="movers-th movers-th--asset">Asset</th>
              <th scope="col" className="movers-th movers-th--num">Price</th>
              <th scope="col" className="movers-th movers-th--num">24h</th>
            </tr>
          </thead>
          <tbody>
            {losers.length === 0 ? (
              <tr>
                <td colSpan={4} className="movers-empty">
                  No loser data available
                </td>
              </tr>
            ) : (
              losers.map((asset, index) => {
                const rank = index + 1;
                const price = asset.price_usd ?? asset.price ?? 0;
                const change24h = asset.price_change_24h ?? asset.change_24h ?? 0;

                return (
                  <tr
                    key={asset.id || index}
                    className="movers-row"
                    onClick={() => onOpenAsset?.(asset.id)}
                    role={onOpenAsset ? 'button' : undefined}
                    tabIndex={onOpenAsset ? 0 : undefined}
                    onKeyDown={
                      onOpenAsset
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onOpenAsset(asset.id);
                            }
                          }
                        : undefined
                    }
                    aria-label={`${asset.name} (${asset.symbol}), ${formatPrice(price)}, ${formatChange(change24h)} 24h. Click to view asset details.`}
                  >
                    <td className="movers-td movers-td--rank">
                      <span className="num movers-rank">{rank}</span>
                    </td>
                    <td className="movers-td movers-td--asset">
                      <div className="movers-asset">
                        {asset.image || asset.logo ? (
                          <img
                            src={asset.image || asset.logo}
                            alt=""
                            className="movers-asset__icon"
                            loading="lazy"
                          />
                        ) : (
                          <span className="movers-asset__badge" aria-hidden="true">
                            {asset.symbol ? asset.symbol.slice(0, 3) : '•'}
                          </span>
                        )}
                        <div className="movers-asset__meta">
                          <span className="movers-asset__name">{asset.name}</span>
                          <span className="movers-asset__symbol">{asset.symbol}</span>
                        </div>
                      </div>
                    </td>
                    <td className="movers-td movers-td--num">
                      <span className="num">{formatPrice(price)}</span>
                    </td>
                    <td className="movers-td movers-td--num is-down">
                      <span className="num">{formatChange(change24h)}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default memo(LosersList);
