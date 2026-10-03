import { memo, useCallback, useMemo, useState } from 'react';
import NewsCard from './NewsCard.jsx';
import NewsModal from './NewsModal.jsx';
import { NEWS_DATA, NEWS_PAGE_SIZE, TOTAL_NEWS_ITEMS } from '../data/newsData.js';

function NewsSection() {
  const [visibleCount, setVisibleCount] = useState(NEWS_PAGE_SIZE);
  const [selectedNews, setSelectedNews] = useState(null);

  const displayedNews = useMemo(() => {
    return NEWS_DATA.slice(0, visibleCount);
  }, [visibleCount]);

  const hasMore = visibleCount < TOTAL_NEWS_ITEMS;
  const remainingCount = Math.max(0, TOTAL_NEWS_ITEMS - visibleCount);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + NEWS_PAGE_SIZE, TOTAL_NEWS_ITEMS));
  }, []);

  const handleSelectNews = useCallback((item) => {
    setSelectedNews(item);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedNews(null);
  }, []);

  return (
    <section id="news" className="news-section" aria-labelledby="news-title">
      <div className="section-head news-head">
        <h2 id="news-title" className="section-head__title">
          News <span className="news-head__chevron" aria-hidden="true">&gt;</span>
        </h2>
        <span className="section-head__sub">
          Wire · <span className="num">{displayedNews.length}</span> / <span className="num">{TOTAL_NEWS_ITEMS}</span> items
        </span>
      </div>

      {/* 6 columns x 3 rows desktop grid */}
      <div
        className="news-grid"
        role="region"
        aria-label="Market news wire grid"
      >
        {displayedNews.map((item) => (
          <NewsCard key={item.id} item={item} onClick={handleSelectNews} />
        ))}
      </div>

      {/* Load More Pagination */}
      <div className="news-pagination">
        {hasMore ? (
          <button
            type="button"
            className="btn-news-load-more"
            onClick={handleLoadMore}
            aria-label={`Load 18 more news items (${remainingCount} remaining)`}
          >
            <span className="btn-load-more__line" aria-hidden="true" />
            <span className="btn-news-load-more__text">
              Load More <span className="num">+18</span>
              <span className="btn-news-load-more__sub num">({remainingCount} remaining)</span>
            </span>
            <span className="btn-load-more__line" aria-hidden="true" />
          </button>
        ) : (
          <div className="news-pagination--done" aria-live="polite">
            <span className="btn-load-more__line" aria-hidden="true" />
            <span className="news-pagination__status">All {TOTAL_NEWS_ITEMS} news items loaded</span>
            <span className="btn-load-more__line" aria-hidden="true" />
          </div>
        )}
      </div>

      {selectedNews && (
        <NewsModal item={selectedNews} onClose={handleCloseModal} />
      )}
    </section>
  );
}

export default memo(NewsSection);
