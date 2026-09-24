export default function SearchBar({ value, onChange }) {
  return (
    <div className="search">
      <label className="visually-hidden" htmlFor="asset-search">
        Search by name or symbol
      </label>
      <input
        id="asset-search"
        className="search__input"
        type="search"
        placeholder="Search name or symbol"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
