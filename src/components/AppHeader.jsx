import { useEffect, useState } from 'react';

export const NAV_ITEMS = [
  { href: '#markets', label: 'Markets' },
  { href: '#gainers', label: 'Gainers' },
  { href: '#losers', label: 'Losers' },
  { href: '#discover', label: 'Discover' },
  { href: '#news', label: 'News' },
  { href: '#watchlist', label: 'Watchlist' },
];

const STATUS_LABELS = { live: 'Live', reconnecting: 'Reconnecting', connecting: 'Connecting' };

export const SEARCH_INPUT_ID = 'asset-search';

function focusSearch() {
  const input = document.getElementById(SEARCH_INPUT_ID);
  if (!input) return;
  if (typeof input.scrollIntoView === 'function') {
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  input.focus({ preventScroll: true });
}

function isTypingTarget(target) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

export default function AppHeader({ connection = 'connecting' }) {
  const [activeHash, setActiveHash] = useState(() => {
    if (typeof window !== 'undefined' && window.location?.hash) {
      return window.location.hash;
    }
    return '#markets';
  });

  // "/" jumps to asset search, unless the user is already typing somewhere.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target) || document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      focusSearch();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Sync active navigation link on hash change and scroll position
  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash) {
        setActiveHash(window.location.hash);
      }
    };

    window.addEventListener('hashchange', onHashChange);

    // Scroll spy: update active section as user scrolls
    let throttleTimeout = null;
    const onScroll = () => {
      if (throttleTimeout) return;
      throttleTimeout = setTimeout(() => {
        throttleTimeout = null;
        const scrollPosition = window.scrollY + 120;
        const targets = NAV_ITEMS.map((item) => {
          const el = document.querySelector(item.href);
          if (!el) return null;
          return { href: item.href, top: el.offsetTop };
        }).filter(Boolean);

        for (let i = targets.length - 1; i >= 0; i--) {
          if (scrollPosition >= targets[i].top) {
            setActiveHash(targets[i].href);
            break;
          }
        }
      }, 100);
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('scroll', onScroll);
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, []);

  const handleNavClick = (e, href) => {
    setActiveHash(href);
    const targetEl = document.querySelector(href);
    if (targetEl) {
      e.preventDefault();
      if (typeof targetEl.scrollIntoView === 'function') {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (window.history?.pushState) {
        window.history.pushState(null, '', href);
      }
    }
  };

  const label = STATUS_LABELS[connection] ?? STATUS_LABELS.connecting;

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <a
          className="brand"
          href="#markets"
          onClick={(e) => handleNavClick(e, '#markets')}
          aria-label="WTF Trade home"
        >
          <span className="brand__mark" aria-hidden="true">W</span>
          <span className="brand__name">
            WTF <span className="brand__accent">Trade</span>
          </span>
        </a>

        <nav className="topnav" aria-label="Sections">
          {NAV_ITEMS.map((item) => {
            const isActive = activeHash === item.href;
            return (
              <a
                key={item.href}
                className={`topnav__link ${isActive ? 'is-active' : ''}`}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href)}
                aria-current={isActive ? 'location' : undefined}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="topbar__right">
          <button type="button" className="topbar__search" onClick={focusSearch} aria-label="Search assets">
            <span className="topbar__search-icon" aria-hidden="true">⌕</span>
            <span className="topbar__search-text">Search</span>
            <kbd className="kbd" aria-hidden="true">/</kbd>
          </button>
          <p className={`live live--${connection}`} role="status" aria-live="polite">
            <span className="live__dot" aria-hidden="true" />
            <span className="live__label">{label}</span>
          </p>
        </div>
      </div>
    </header>
  );
}
