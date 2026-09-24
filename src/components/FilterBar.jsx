import { SORT_OPTIONS, TYPE_OPTIONS } from '../utils/feedView.js';

function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented__button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function FilterBar({ type, onTypeChange, sort, onSortChange }) {
  return (
    <div className="filters">
      <SegmentedControl label="Asset type" options={TYPE_OPTIONS} value={type} onChange={onTypeChange} />
      <SegmentedControl label="Sort by" options={SORT_OPTIONS} value={sort} onChange={onSortChange} />
    </div>
  );
}
