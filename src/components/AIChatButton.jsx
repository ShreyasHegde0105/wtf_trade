import { memo } from 'react';

function AIChatButton({ isOpen, onClick }) {
  return (
    <button
      type="button"
      className={`ai-chat-btn ${isOpen ? 'is-active' : ''}`}
      onClick={onClick}
      aria-label={isOpen ? 'Close WTF Intelligence assistant' : 'Open WTF Intelligence assistant'}
      aria-expanded={isOpen}
      aria-controls="wtf-ai-panel"
      title="WTF Intelligence AI"
    >
      <span className="ai-chat-btn__icon" aria-hidden="true">
        {/* Subtle geometric assistant sparkle icon */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" opacity="0.35" />
          <polygon points="12,4 14.5,9.5 20,12 14.5,14.5 12,20 9.5,14.5 4,12 9.5,9.5" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <span className="ai-chat-btn__label">AI</span>
    </button>
  );
}

export default memo(AIChatButton);
