import assert from 'node:assert/strict';
import { test, describe, beforeEach, afterEach } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SearchBar from './SearchBar.jsx';
import FilterBar from './FilterBar.jsx';
import AssetCard from './AssetCard.jsx';

function setNativeInputValue(input, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value');
  descriptor.set.call(input, value);
  if (input._valueTracker) {
    input._valueTracker.setValue('');
  }
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  input.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
}

describe('Real Frontend Component Render and DOM Tests', () => {
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

  describe('SearchBar Component', () => {
    test('renders input, placeholder, shortcut kbd, and icon', async () => {
      await act(async () => {
        root.render(React.createElement(SearchBar, { value: '', onChange: () => {} }));
      });

      const input = container.querySelector('input#asset-search');
      assert.ok(input, 'Search input must exist with id asset-search');
      assert.equal(input.getAttribute('type'), 'search');
      assert.equal(input.getAttribute('placeholder'), 'Search assets, symbols…');
      assert.equal(input.value, '');

      const kbd = container.querySelector('.search__kbd');
      assert.ok(kbd, 'Kbd shortcut hint must render when input is empty');
      assert.equal(kbd.textContent, '/');

      const clearBtn = container.querySelector('.search__clear-btn');
      assert.equal(clearBtn, null, 'Clear button must not render when input is empty');
    });

    test('updates input value and debounces onChange callback by 300ms', async () => {
      const calls = [];
      const handleChange = (val) => calls.push(val);

      await act(async () => {
        root.render(React.createElement(SearchBar, { value: '', onChange: handleChange }));
      });

      const input = container.querySelector('input#asset-search');

      // Type "b"
      await act(async () => {
        setNativeInputValue(input, 'b');
      });

      // After 100ms, callback must NOT have fired yet (debounced)
      await act(async () => {
        await sleep(100);
      });
      assert.equal(calls.length, 0, 'Callback must not fire before 300ms debounce interval');

      // Type "btc" before the 300ms expired
      await act(async () => {
        setNativeInputValue(input, 'btc');
      });

      // Still should not have fired at 150ms after the second input
      await act(async () => {
        await sleep(150);
      });
      assert.equal(calls.length, 0, 'Debounce must reset when new input is entered');

      // Wait remaining debounce duration (> 300ms after second input)
      await act(async () => {
        await sleep(350);
      });
      assert.equal(calls.length, 1, 'Callback should have fired exactly once');
      assert.equal(calls[0], 'btc', 'Callback should receive the latest debounced value');
    });

    test('clear button renders when text is entered, clicking clears input and invokes callback immediately', async () => {
      const calls = [];
      const handleChange = (val) => calls.push(val);

      await act(async () => {
        root.render(React.createElement(SearchBar, { value: 'ethereum', onChange: handleChange }));
      });

      const input = container.querySelector('input#asset-search');
      assert.equal(input.value, 'ethereum');

      const clearBtn = container.querySelector('.search__clear-btn');
      assert.ok(clearBtn, 'Clear button must render when input is not empty');

      await act(async () => {
        clearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      assert.equal(input.value, '', 'Input should be cleared');
      assert.equal(calls.length, 1, 'onChange should be called immediately on clear');
      assert.equal(calls[0], '', 'onChange should be called with empty string');
    });
  });

  describe('FilterBar Component', () => {
    test('renders momentum filters and sort controls with proper ARIA attributes', async () => {
      await act(async () => {
        root.render(
          React.createElement(FilterBar, {
            momentum: 'hot',
            onMomentumChange: () => {},
            sort: 'change',
            onSortChange: () => {},
          }),
        );
      });

      const segmentGroups = container.querySelectorAll('.segmented');
      assert.equal(segmentGroups.length, 2, 'Should render momentum and sort segmented controls');

      const momentumButtons = segmentGroups[0].querySelectorAll('.segmented__button');
      assert.equal(momentumButtons.length, 4, 'Should render 4 momentum filter options (All, Hot, Warming, Neutral)');

      const buttonLabels = Array.from(momentumButtons).map((b) => b.textContent.trim());
      assert.deepEqual(buttonLabels, ['All', 'Hot', 'Warming', 'Neutral']);

      // Hot is selected
      assert.equal(momentumButtons[1].getAttribute('aria-pressed'), 'true');
      assert.equal(momentumButtons[0].getAttribute('aria-pressed'), 'false');

      // Sort by change
      const sortButtons = segmentGroups[1].querySelectorAll('.segmented__button');
      assert.equal(sortButtons.length, 3);
      assert.equal(sortButtons[1].getAttribute('aria-pressed'), 'true'); // Price Change
    });

    test('clicking a filter button calls onMomentumChange with correct value', async () => {
      let selectedMomentum = null;
      let selectedSort = null;

      await act(async () => {
        root.render(
          React.createElement(FilterBar, {
            momentum: 'all',
            onMomentumChange: (val) => { selectedMomentum = val; },
            sort: 'momentum',
            onSortChange: (val) => { selectedSort = val; },
          }),
        );
      });

      const buttons = container.querySelectorAll('.segmented__button');
      // Click 'Warming' (index 2)
      await act(async () => {
        buttons[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      assert.equal(selectedMomentum, 'warming');

      // Click 'Volume' sort (index 6)
      await act(async () => {
        buttons[6].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      assert.equal(selectedSort, 'volume');
    });
  });

  describe('AssetCard Component', () => {
    const mockHotAsset = {
      id: 'bitcoin',
      symbol: 'BTC',
      name: 'Bitcoin',
      price_usd: 65432.1,
      price_change_24h: 3.45,
      volume_24h: 30000000000,
      avg_volume_7d: 20000000000,
      momentum_score: 2.28,
      momentum_label: 'Hot',
      sparkline_7d: [62000, 63000, 64000, 65432.1],
    };

    const mockDownAsset = {
      id: 'ethereum',
      symbol: 'ETH',
      name: 'Ethereum',
      price_usd: 3450.75,
      price_change_24h: -2.15,
      volume_24h: 15000000000,
      avg_volume_7d: 15000000000,
      momentum_score: 0.86,
      momentum_label: 'Neutral',
      sparkline_7d: [3600, 3550, 3500, 3450.75],
    };

    test('renders asset identity, price_usd, price_change_24h, and momentum_label badge', async () => {
      await act(async () => {
        root.render(React.createElement(AssetCard, { asset: mockHotAsset }));
      });

      const symbol = container.querySelector('.card__symbol');
      assert.equal(symbol.textContent, 'BTC');

      const name = container.querySelector('.card__name');
      assert.equal(name.textContent, 'Bitcoin');

      const price = container.querySelector('.card__price');
      assert.ok(price.textContent.includes('65,432'), `Expected price to format $65,432.xx, got: ${price.textContent}`);

      const change = container.querySelector('.card__change');
      assert.ok(change.classList.contains('is-up'), 'Positive change must have is-up class');
      assert.ok(change.textContent.includes('3.45%'));
      assert.ok(change.textContent.includes('▲'));

      const badge = container.querySelector('.badge');
      assert.ok(badge.classList.contains('badge--hot'));
      assert.equal(badge.textContent, 'Hot');

      const score = container.querySelector('.card__score');
      assert.equal(score.textContent, '2.28');
    });

    test('renders downward negative change with is-down class and down arrow', async () => {
      await act(async () => {
        root.render(React.createElement(AssetCard, { asset: mockDownAsset }));
      });

      const change = container.querySelector('.card__change');
      assert.ok(change.classList.contains('is-down'), 'Negative change must have is-down class');
      assert.ok(change.textContent.includes('2.15%'));
      assert.ok(change.textContent.includes('▼'));

      const badge = container.querySelector('.badge');
      assert.ok(badge.classList.contains('badge--neutral'));
      assert.equal(badge.textContent, 'Neutral');
    });

    test('renders volume meter progressbar and calculates ratio from avg_volume_7d', async () => {
      await act(async () => {
        root.render(React.createElement(AssetCard, { asset: mockHotAsset }));
      });

      const volMeter = container.querySelector('.vol-meter');
      assert.ok(volMeter, 'Volume meter progressbar must render');
      assert.equal(volMeter.getAttribute('role'), 'progressbar');

      // volume ratio: 30e9 / 20e9 = 1.5
      const ratioValue = parseFloat(volMeter.getAttribute('aria-valuenow'));
      assert.equal(ratioValue, 1.5);
    });

    test('toggles watchlist when star button is clicked', async () => {
      let toggledId = null;
      await act(async () => {
        root.render(
          React.createElement(AssetCard, {
            asset: mockHotAsset,
            isWatched: false,
            onToggleWatchlist: (id) => { toggledId = id; },
          }),
        );
      });

      const starBtn = container.querySelector('.star-btn');
      assert.ok(starBtn, 'Watchlist star button must render');
      assert.equal(starBtn.getAttribute('aria-pressed'), 'false');
      assert.equal(starBtn.textContent.trim(), '☆');

      await act(async () => {
        starBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      assert.equal(toggledId, 'bitcoin', 'Clicking star button must invoke onToggleWatchlist with asset ID');
    });

    test('invokes onOpen when card open button is clicked', async () => {
      let openedId = null;
      await act(async () => {
        root.render(
          React.createElement(AssetCard, {
            asset: mockHotAsset,
            onOpen: (id) => { openedId = id; },
          }),
        );
      });

      const openBtn = container.querySelector('.card__open');
      assert.ok(openBtn, 'Card open button must render when onOpen prop is passed');

      await act(async () => {
        openBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      assert.equal(openedId, 'bitcoin');
    });
  });
});
