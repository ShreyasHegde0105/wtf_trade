import { memo } from 'react';

function NewsCard({ item, onClick }) {
  return (
    <article
      className="news-card"
      onClick={() => onClick(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(item);
        }
      }}
      aria-label={`${item.title}, ${item.category}, ${item.time}. Click to read article.`}
    >
      <div className="news-card__meta">
        <span className="news-card__category">{item.category}</span>
        <span className="news-card__time num">{item.time}</span>
      </div>
      <h3 className="news-card__title">
        <span className="news-card__headline">{item.title}</span>
      </h3>
      <p className="news-card__summary">{item.summary}</p>
    </article>
  );
}

export default memo(NewsCard);
