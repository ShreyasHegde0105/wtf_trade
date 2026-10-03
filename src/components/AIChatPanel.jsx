import { memo, useCallback, useEffect, useRef, useState } from 'react';

const SUGGESTED_QUESTIONS = [
  "What's moving today?",
  'Show me the top gainers.',
  "Explain BTC's recent movement.",
  'Compare BTC and ETH.',
];

function AIChatPanel({ isOpen, onClose, onSendMessage }) {
  const [messages, setMessages] = useState([]);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Escape key closes panel
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Auto-scroll messages
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const userMsg = { id: `u-${Date.now()}`, sender: 'user', text: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setInputVal('');

      if (onSendMessage) {
        try {
          const res = await onSendMessage(trimmed);
          setMessages((prev) => [
            ...prev,
            { id: `a-${Date.now()}`, sender: 'assistant', text: res },
          ]);
          return;
        } catch {
          // fall through to placeholder
        }
      }

      // Clean placeholder response without faking AI facts
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          sender: 'assistant',
          text: 'AI assistant integration coming soon.',
        },
      ]);
    },
    [onSendMessage],
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSend(inputVal);
  };

  if (!isOpen) return null;

  return (
    <div
      id="wtf-ai-panel"
      className="ai-chat-panel"
      role="dialog"
      aria-label="WTF Intelligence assistant"
      aria-modal="false"
    >
      <header className="ai-chat-panel__header">
        <div className="ai-chat-panel__identity">
          <span className="ai-chat-panel__status-dot" aria-hidden="true" />
          <div>
            <h2 className="ai-chat-panel__title">WTF Intelligence</h2>
            <span className="ai-chat-panel__subtitle">Trading Assistant Shell</span>
          </div>
        </div>
        <button
          type="button"
          className="ai-chat-panel__close"
          onClick={onClose}
          aria-label="Close WTF Intelligence"
        >
          ✕
        </button>
      </header>

      <div className="ai-chat-panel__body">
        <div className="ai-chat-panel__intro">
          <p className="ai-chat-panel__desc">
            Ask about markets, assets, news, or WTF Trade.
          </p>
          <div className="ai-chat-panel__suggestions" role="group" aria-label="Suggested prompts">
            {SUGGESTED_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                className="ai-chip"
                onClick={() => handleSend(question)}
              >
                {question}
              </button>
            ))}
          </div>
        </div>

        {messages.length > 0 && (
          <div className="ai-chat-panel__messages" aria-live="polite">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`ai-msg ai-msg--${msg.sender}`}
              >
                <div className="ai-msg__bubble">
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form className="ai-chat-panel__input-area" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="ai-chat-panel__input"
          placeholder="Ask something..."
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          aria-label="Ask WTF Intelligence"
        />
        <button
          type="submit"
          className="ai-chat-panel__send"
          disabled={!inputVal.trim()}
          aria-label="Send message"
        >
          Send
        </button>
      </form>
    </div>
  );
}

export default memo(AIChatPanel);
