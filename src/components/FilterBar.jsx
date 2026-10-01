import { MOMENTUM_FILTER_OPTIONS, SORT_OPTIONS } from '../utils/feedView.js';

function SegmentedControl({ label, caption, options, value, onChange }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {caption && <span className="segmented__caption" aria-hidden="true">{caption}</span>}
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

export default function FilterBar({
  momentum = 'all',
  onMomentumChange,
  sort = 'momentum',
  onSortChange,
}) {
  return (
    <div className="filters">
      <SegmentedControl
        label="Momentum filter"
        caption="Status"
        options={MOMENTUM_FILTER_OPTIONS}
        value={momentum}
        onChange={onMomentumChange}
      />
      {sort && onSortChange && (
        <SegmentedControl
          label="Sort by"
          caption="Sort"
          options={SORT_OPTIONS}
          value={sort}
          onChange={onSortChange}
        />
      )}
    </div>
  );
}
