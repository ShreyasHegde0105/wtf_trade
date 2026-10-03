import { useEffect } from 'react';

export default function NewsModal({ item, onClose }) {
  useEffect(() => {
    if (!item) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div className="news-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="news-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="news-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="news-modal__header">
          <div className="news-modal__meta">
            <span className="news-modal__badge">{item.category}</span>
            <span className="news-modal__time num">{item.time}</span>
            <span className="news-modal__source">{item.source}</span>
          </div>
          <button
            type="button"
            className="news-modal__close"
            onClick={onClose}
            aria-label="Close news article"
          >
            ✕
          </button>
        </div>

        <div className="news-modal__body">
          <h2 id="news-modal-title" className="news-modal__title">
            {item.title}
          </h2>
          <div className="news-modal__article">
            {item.content.split('\n\n').map((paragraph, idx) => (
              <p key={idx}>{paragraph}</p>
            ))}
          </div>
          <div className="news-modal__footer">
            <span className="news-modal__disclaimer">
              WTF Trade Terminal · Verification Wire · Strictly Placeholder
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
