import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { ChatMessage } from '@shared/types';

export function ChatPanel({
  messages,
  onSend,
  inputRef,
  disabled,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const localRef = useRef('');
  const stickToBottomRef = useRef(true);

  // Telemetry snapshots recreate the messages array every few seconds — only
  // scroll when conversation content actually changes.
  const scrollKey = useMemo(
    () => messages.map((m) => `${m.id}:${m.content.length}:${m.status ?? ''}`).join('|'),
    [messages],
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [scrollKey]);

  const visible = messages.filter((m) => m.role !== 'system');

  return (
    <>
      <div
        className="messages"
        ref={listRef}
        onScroll={() => {
          const el = listRef.current;
          if (!el) return;
          const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          stickToBottomRef.current = distanceFromBottom < 80;
        }}
      >
        {!visible.length && (
          <div className="empty-hint">
            Hey. I&apos;m LYLA. Ask what&apos;s on your screen, for system status, to open an app,
            to search the web, or tell me something to remember.
          </div>
        )}
        {visible.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            {m.role === 'tool' ? `↳ ${m.toolName}: ${m.content}` : m.content}
            {m.status === 'streaming' ? '▍' : ''}
          </div>
        ))}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          const value = inputRef.current?.value ?? localRef.current;
          if (!value.trim()) return;
          stickToBottomRef.current = true;
          onSend(value);
          if (inputRef.current) inputRef.current.value = '';
          localRef.current = '';
        }}
      >
        <input
          ref={inputRef}
          placeholder="Talk to LYLA…"
          disabled={disabled}
          onChange={(e) => {
            localRef.current = e.target.value;
          }}
          autoFocus
        />
        <button type="submit" disabled={disabled}>
          Send
        </button>
      </form>
    </>
  );
}
