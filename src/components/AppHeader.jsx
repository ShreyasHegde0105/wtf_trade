import { useEffect } from 'react';

const NAV_ITEMS = [
  { href: '#markets', label: 'Markets' },
  { href: '#discover', label: 'Discover' },
  { href: '#watchlist', label: 'Watchlist' },
];

const STATUS_LABELS = { live: 'Live', reconnecting: 'Reconnecting', connecting: 'Connecting' };

export const SEARCH_INPUT_ID = 'asset-search';

function focusSearch() {
  const input = document.getElementById(SEARCH_INPUT_ID);
  if (!input) return;
  input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  input.focus({ preventScroll: true });
}

function isTypingTarget(target) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

export default function AppHeader({ connection = 'connecting' }) {
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

  const label = STATUS_LABELS[connection] ?? STATUS_LABELS.connecting;

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <a className="brand" href="#markets" aria-label="WTF Trade home">
          <span className="brand__mark" aria-hidden="true">W</span>
          <span className="brand__name">
            WTF <span className="brand__accent">Trade</span>
          </span>
        </a>

        <nav className="topnav" aria-label="Sections">
          {NAV_ITEMS.map((item) => (
            <a key={item.href} className="topnav__link" href={item.href}>
              {item.label}
            </a>
          ))}
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
