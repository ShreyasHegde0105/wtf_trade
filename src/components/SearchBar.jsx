import { useEffect, useRef, useState } from 'react';

export default function SearchBar({ value = '', onChange }) {
  const [inputValue, setInputValue] = useState(value);
  const timerRef = useRef(null);

  // Sync external programmatic updates (e.g. clicking a discovery chip or watchlist item)
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleChange = (event) => {
    const nextValue = event.target.value;
    setInputValue(nextValue);

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChange?.(nextValue);
    }, 300);
  };

  const handleClear = () => {
    clearTimeout(timerRef.current);
    setInputValue('');
    onChange?.('');
  };

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  return (
    <div className="search">
      <label className="visually-hidden" htmlFor="asset-search">
        Search by name or symbol
      </label>
      <div className="search__input-wrapper">
        <span className="search__icon" aria-hidden="true">⌕</span>
        <input
          id="asset-search"
          className="search__input"
          type="search"
          placeholder="Search assets, symbols…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={inputValue}
          onChange={handleChange}
        />
        {!inputValue && (
          <kbd className="kbd search__kbd" aria-hidden="true">/</kbd>
        )}
        {Boolean(inputValue) && (
          <button
            type="button"
            className="search__clear-btn"
            onClick={handleClear}
            aria-label="Clear search"
            title="Clear search"
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>
    </div>
  );
}
