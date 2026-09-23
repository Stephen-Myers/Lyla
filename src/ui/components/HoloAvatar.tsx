import type { AssistantState } from '@shared/types';

export function HoloAvatar({ state }: { state: AssistantState }) {
  return (
    <div className={`holo-avatar state-${state}`} aria-label={`LYLA is ${state}`}>
      <div className="holo-ring" />
      <div className="holo-core" />
      <div className="holo-face">
        <div className="eye" />
        <div className="eye" />
      </div>
      <div className="mouth" />
    </div>
  );
}
