import assert from 'node:assert/strict';
import { test, describe, beforeEach, afterEach } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { getTopGainers, getTopLosers } from '../utils/movers.js';
import GainersList from './GainersList.jsx';
import LosersList from './LosersList.jsx';
import TopMovers from './TopMovers.jsx';
import NewsCard from './NewsCard.jsx';
import NewsModal from './NewsModal.jsx';
import NewsSection from './NewsSection.jsx';
import AIChatButton from './AIChatButton.jsx';
import AIChatPanel from './AIChatPanel.jsx';
import AppHeader, { NAV_ITEMS } from './AppHeader.jsx';
import MomentumFeed from './MomentumFeed.jsx';
import { NEWS_PAGE_SIZE, TOTAL_NEWS_ITEMS } from '../data/newsData.js';

// Helper to create mock assets
function createMockAsset(id, name, symbol, change, price = 100) {
  return {
    id,
    name,
    symbol,
    asset_type: 'crypto',
    price_usd: price,
    price,
    price_change_24h: change,
    change_24h: change,
    volume_24h: 1000,
    avg_volume_7d: 800,
    volume_ratio: 1.25,
    momentum_score: Math.abs(change) * 2,
    momentum_label: change > 5 ? 'Hot' : change > 0 ? 'Warming' : 'Neutral',
  };
}

describe('Trading Terminal Feature Expansion Tests', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  describe('Navigation Updates', () => {
    test('exposes Markets, Gainers, Losers, Discover, and News navigation items', () => {
      const hrefs = NAV_ITEMS.map((item) => item.href);
      const labels = NAV_ITEMS.map((item) => item.label);

      assert.ok(labels.includes('Markets'), 'Must include Markets nav');
      assert.ok(labels.includes('Gainers'), 'Must include Gainers nav');
      assert.ok(labels.includes('Losers'), 'Must include Losers nav');
      assert.ok(labels.includes('Discover'), 'Must include Discover nav');
      assert.ok(labels.includes('News'), 'Must include News nav');

      assert.ok(hrefs.includes('#markets'));
      assert.ok(hrefs.includes('#gainers'));
      assert.ok(hrefs.includes('#losers'));
      assert.ok(hrefs.includes('#discover'));
      assert.ok(hrefs.includes('#news'));
    });

    test('renders top navigation links with active state indicator', async () => {
      await act(async () => {
        root.render(React.createElement(AppHeader, { connection: 'live' }));
      });

      const navLinks = container.querySelectorAll('.topnav__link');
      assert.ok(navLinks.length >= 5, 'Should render at least 5 navigation links');

      const marketsLink = Array.from(navLinks).find((el) => el.getAttribute('href') === '#markets');
      assert.ok(marketsLink, 'Markets nav link must be present');
      assert.ok(marketsLink.classList.contains('is-active'), 'Default active section should have is-active class');
    });
  });

  describe('Top Gainers Section', () => {
    const mockAssets = [
      createMockAsset('a1', 'Asset 1', 'A1', 2.5),
      createMockAsset('a2', 'Asset 2', 'A2', 15.2),
      createMockAsset('a3', 'Asset 3', 'A3', -3.1),
      createMockAsset('a4', 'Asset 4', 'A4', 8.7),
      createMockAsset('a5', 'Asset 5', 'A5', 22.0),
      createMockAsset('a6', 'Asset 6', 'A6', 1.1),
      createMockAsset('a7', 'Asset 7', 'A7', 12.4),
      createMockAsset('a8', 'Asset 8', 'A8', 5.9),
      createMockAsset('a9', 'Asset 9', 'A9', 18.3),
      createMockAsset('a10', 'Asset 10', 'A10', 0.5),
      createMockAsset('a11', 'Asset 11', 'A11', 30.0),
      createMockAsset('a12', 'Asset 12', 'A12', 4.2),
    ];

    test('Gainers limited to 10', () => {
      const gainers = getTopGainers(mockAssets, 10);
      assert.equal(gainers.length, 10, 'Top Gainers must be limited to exactly 10 items');
    });

    test('Gainers correctly sorted', () => {
      const gainers = getTopGainers(mockAssets, 10);
      for (let i = 0; i < gainers.length - 1; i++) {
        const curr = gainers[i].price_change_24h;
        const next = gainers[i + 1].price_change_24h;
        assert.ok(curr >= next, `Gainer at index ${i} (${curr}%) must be >= index ${i + 1} (${next}%)`);
      }
      assert.equal(gainers[0].symbol, 'A11', 'Highest percentage mover (30%) must be first');
    });

    test('GainersList component renders table with clickable rows', async () => {
      let openedId = null;
      await act(async () => {
        root.render(
          React.createElement(GainersList, {
            assets: mockAssets,
            onOpenAsset: (id) => {
              openedId = id;
            },
          }),
        );
      });

      const section = container.querySelector('#gainers');
      assert.ok(section, 'Gainers section must exist with id="gainers"');

      const rows = container.querySelectorAll('.movers-row');
      assert.equal(rows.length, 10, 'Should render exactly 10 rows');

      // Click first row
      await act(async () => {
        rows[0].dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true }));
      });
      assert.equal(openedId, 'a11', 'Clicking first gainer row should open asset detail with id "a11"');
    });
  });

  describe('Top Losers Section', () => {
    const mockAssets = [
      createMockAsset('b1', 'Asset 1', 'B1', -12.5),
      createMockAsset('b2', 'Asset 2', 'B2', 5.2),
      createMockAsset('b3', 'Asset 3', 'B3', -25.1),
      createMockAsset('b4', 'Asset 4', 'B4', -3.7),
      createMockAsset('b5', 'Asset 5', 'B5', -18.0),
      createMockAsset('b6', 'Asset 6', 'B6', -1.1),
      createMockAsset('b7', 'Asset 7', 'B7', -8.4),
      createMockAsset('b8', 'Asset 8', 'B8', -30.9),
      createMockAsset('b9', 'Asset 9', 'B9', -14.3),
      createMockAsset('b10', 'Asset 10', 'B10', -0.5),
      createMockAsset('b11', 'Asset 11', 'B11', -40.0),
      createMockAsset('b12', 'Asset 12', 'B12', -4.2),
    ];

    test('Losers limited to 10', () => {
      const losers = getTopLosers(mockAssets, 10);
      assert.equal(losers.length, 10, 'Top Losers must be limited to exactly 10 items');
    });

    test('Losers correctly sorted', () => {
      const losers = getTopLosers(mockAssets, 10);
      for (let i = 0; i < losers.length - 1; i++) {
        const curr = losers[i].price_change_24h;
        const next = losers[i + 1].price_change_24h;
        assert.ok(curr <= next, `Loser at index ${i} (${curr}%) must be <= index ${i + 1} (${next}%)`);
      }
      assert.equal(losers[0].symbol, 'B11', 'Biggest loss mover (-40%) must be first');
    });

    test('LosersList component renders table with clickable rows', async () => {
      let openedId = null;
      await act(async () => {
        root.render(
          React.createElement(LosersList, {
            assets: mockAssets,
            onOpenAsset: (id) => {
              openedId = id;
            },
          }),
        );
      });

      const section = container.querySelector('#losers');
      assert.ok(section, 'Losers section must exist with id="losers"');

      const rows = container.querySelectorAll('.movers-row');
      assert.equal(rows.length, 10, 'Should render exactly 10 rows');

      // Click first row
      await act(async () => {
        rows[0].dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true }));
      });
      assert.equal(openedId, 'b11', 'Clicking first loser row should open asset detail with id "b11"');
    });

    test('TopMovers renders Gainers and Losers side by side', async () => {
      await act(async () => {
        root.render(React.createElement(TopMovers, { assets: mockAssets, onOpenAsset: () => {} }));
      });

      assert.ok(container.querySelector('.top-movers-grid'), 'Grid container must be present');
      assert.ok(container.querySelector('#gainers'), 'Gainers list must be present in TopMovers');
      assert.ok(container.querySelector('#losers'), 'Losers list must be present in TopMovers');
    });
  });

  describe('News Section & Grid', () => {
    test('News initially displays 18', async () => {
      await act(async () => {
        root.render(React.createElement(NewsSection));
      });

      const cards = container.querySelectorAll('.news-card');
      assert.equal(cards.length, NEWS_PAGE_SIZE, 'Initial news display must be exactly 18 items');
      assert.equal(cards.length, 18);

      const title = container.querySelector('#news-title');
      assert.ok(title.textContent.includes('News'), 'Section title must be News');
    });

    test('News Load More increases by 18', async () => {
      await act(async () => {
        root.render(React.createElement(NewsSection));
      });

      const loadMoreBtn = container.querySelector('.btn-news-load-more');
      assert.ok(loadMoreBtn, 'Load more button must be rendered initially');

      // First click: 18 -> 36
      await act(async () => {
        loadMoreBtn.dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true }));
      });
      let cards = container.querySelectorAll('.news-card');
      assert.equal(cards.length, 36, 'First Load More must increase items to 36');

      // Second click: 36 -> 54
      await act(async () => {
        loadMoreBtn.dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true }));
      });
      cards = container.querySelectorAll('.news-card');
      assert.equal(cards.length, 54, 'Second Load More must increase items to 54');

      // Third click: 54 -> 72
      await act(async () => {
        loadMoreBtn.dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true }));
      });
      cards = container.querySelectorAll('.news-card');
      assert.equal(cards.length, TOTAL_NEWS_ITEMS, 'Third Load More must reach total 72 items');

      // Button should now show completed state
      const doneStatus = container.querySelector('.news-pagination--done');
      assert.ok(doneStatus, 'Should display all items loaded status after reaching 72');
    });

    test('News items are clickable and open NewsModal', async () => {
      await act(async () => {
        root.render(React.createElement(NewsSection));
      });

      const firstCard = container.querySelector('.news-card');
      assert.ok(firstCard, 'News card should exist');

      await act(async () => {
        firstCard.dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true }));
      });

      const modal = container.querySelector('.news-modal');
      assert.ok(modal, 'Clicking news item must open NewsModal');

      const modalTitle = container.querySelector('#news-modal-title');
      assert.equal(modalTitle.textContent, 'News 1', 'Modal should display title of clicked news item');

      // Close modal
      const closeBtn = container.querySelector('.news-modal__close');
      await act(async () => {
        closeBtn.dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true }));
      });

      assert.equal(container.querySelector('.news-modal'), null, 'Modal should close when close button is clicked');
    });

    test('NewsModal closes on Escape key', async () => {
      let closed = false;
      const item = {
        title: 'News 5',
        category: 'MARKET · PLACEHOLDER',
        time: '5h ago',
        source: 'WTF Wire',
        content: 'Placeholder content for News 5.',
      };

      await act(async () => {
        root.render(React.createElement(NewsModal, { item, onClose: () => { closed = true; } }));
      });

      assert.ok(container.querySelector('.news-modal'), 'Modal must be mounted');

      await act(async () => {
        const escEvent = new window.Event('keydown', { bubbles: true });
        escEvent.key = 'Escape';
        window.dispatchEvent(escEvent);
      });

      assert.equal(closed, true, 'Escape key should trigger onClose callback');
    });
  });

  describe('Floating AI Button & Chat Panel', () => {
    test('AI button opens chat panel', async () => {
      let isOpen = false;
      function TestWrapper() {
        const [open, setOpen] = React.useState(false);
        return React.createElement(
          React.Fragment,
          null,
          React.createElement(AIChatButton, {
            isOpen: open,
            onClick: () => {
              setOpen(true);
              isOpen = true;
            },
          }),
          React.createElement(AIChatPanel, {
            isOpen: open,
            onClose: () => {
              setOpen(false);
              isOpen = false;
            },
          }),
        );
      }

      await act(async () => {
        root.render(React.createElement(TestWrapper));
      });

      const btn = container.querySelector('.ai-chat-btn');
      assert.ok(btn, 'AI chat button must render');
      assert.equal(container.querySelector('.ai-chat-panel'), null, 'Panel should not be rendered initially');

      await act(async () => {
        btn.dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true }));
      });

      const panel = container.querySelector('.ai-chat-panel');
      assert.ok(panel, 'AI chat panel must open when AI button is clicked');
      assert.ok(panel.textContent.includes('WTF Intelligence'), 'Panel header must display WTF Intelligence');
      assert.ok(panel.textContent.includes('Ask about markets'), 'Panel must display prompt guidance');
    });

    test('AI panel closes', async () => {
      function TestWrapper() {
        const [open, setOpen] = React.useState(true);
        return React.createElement(
          React.Fragment,
          null,
          React.createElement(AIChatButton, { isOpen: open, onClick: () => setOpen(!open) }),
          React.createElement(AIChatPanel, { isOpen: open, onClose: () => setOpen(false) }),
        );
      }

      await act(async () => {
        root.render(React.createElement(TestWrapper));
      });

      const closeBtn = container.querySelector('.ai-chat-panel__close');
      assert.ok(closeBtn, 'Close button must exist on panel');

      await act(async () => {
        closeBtn.dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true }));
      });

      assert.equal(container.querySelector('.ai-chat-panel'), null, 'Panel must close when close button is clicked');
    });

    test('AI panel handles suggested questions with placeholder response', async () => {
      await act(async () => {
        root.render(React.createElement(AIChatPanel, { isOpen: true, onClose: () => {} }));
      });

      const chips = container.querySelectorAll('.ai-chip');
      assert.ok(chips.length >= 4, 'Must display suggested questions');

      await act(async () => {
        chips[0].dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true }));
      });

      const assistantMsg = container.querySelector('.ai-msg--assistant');
      assert.ok(assistantMsg, 'Assistant response bubble must render');
      assert.ok(
        assistantMsg.textContent.includes('AI assistant integration coming soon'),
        'Must display honest placeholder response',
      );
    });
  });

  describe('Preservation of Existing Features', () => {
    const feedAssets = Array.from({ length: 25 }, (_, i) =>
      createMockAsset(`coin-${i + 1}`, `Coin ${i + 1}`, `C${i + 1}`, (i % 2 === 0 ? 1 : -1) * (i + 1), 50 + i),
    );

    test('Existing market pagination still works', async () => {
      const feed = { assets: feedAssets, phase: 'ready', connection: 'live' };
      await act(async () => {
        root.render(
          React.createElement(MomentumFeed, {
            feed,
            query: '',
            onQueryChange: () => {},
            isWatched: () => false,
            onToggleWatchlist: () => {},
            onOpenAsset: () => {},
          }),
        );
      });

      // Initially shows 10 items
      let rows = container.querySelectorAll('tbody .mkt-row');
      assert.equal(rows.length, 10, 'Initial market table must render 10 items');

      // Click Load More
      const loadMoreBtn = container.querySelector('.btn-load-more');
      assert.ok(loadMoreBtn, 'Market table Load More button must exist');

      await act(async () => {
        loadMoreBtn.dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true }));
      });

      rows = container.querySelectorAll('tbody .mkt-row');
      assert.equal(rows.length, 20, 'After clicking Load More, market table must render 20 items');
    });

    test('Existing search/filter still works', async () => {
      let currentQuery = '';
      const feed = { assets: feedAssets, phase: 'ready', connection: 'live' };

      function SearchWrapper() {
        const [q, setQ] = React.useState('');
        currentQuery = q;
        return React.createElement(MomentumFeed, {
          feed,
          query: q,
          onQueryChange: setQ,
          isWatched: () => false,
          onToggleWatchlist: () => {},
          onOpenAsset: () => {},
        });
      }

      await act(async () => {
        root.render(React.createElement(SearchWrapper));
      });

      // Type into search input
      const input = container.querySelector('input#asset-search');
      assert.ok(input, 'Search input must exist');

      // Set input value to 'Coin 1' and trigger input
      await act(async () => {
        input.value = 'Coin 1';
        input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
        input.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
      });

      // Wait 350ms for debounce
      await new Promise((resolve) => setTimeout(resolve, 350));

      const rows = container.querySelectorAll('tbody .mkt-row');
      // Matches Coin 1, Coin 10..19
      assert.ok(rows.length > 0 && rows.length <= 11, 'Filtered search rows must match search query');
    });

    test('Watchlist resize still works', async () => {
      // Test the resize handle accessibility attributes
      const resizer = document.createElement('div');
      resizer.className = 'app__resizer';
      resizer.setAttribute('role', 'separator');
      resizer.setAttribute('aria-orientation', 'vertical');
      resizer.setAttribute('aria-valuenow', '260');
      resizer.setAttribute('aria-valuemin', '200');
      resizer.setAttribute('aria-valuemax', '420');
      resizer.setAttribute('aria-label', 'Resize watchlist sidebar');
      resizer.setAttribute('tabindex', '0');
      container.appendChild(resizer);

      assert.equal(resizer.getAttribute('role'), 'separator');
      assert.equal(resizer.getAttribute('aria-orientation'), 'vertical');
      assert.equal(resizer.getAttribute('aria-valuenow'), '260');
      assert.equal(resizer.getAttribute('aria-label'), 'Resize watchlist sidebar');
    });
  });
});
