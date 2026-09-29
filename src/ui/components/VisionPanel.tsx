import type { VisionSnapshot } from '@shared/types';

export function VisionPanel({ vision }: { vision: VisionSnapshot | null }) {
  if (!vision) {
    return <div className="empty-hint">Vision subsystem starting…</div>;
  }

  const looking = vision.looking;
  const window = vision.activeWindow;
  const contextActive = vision.enabled && !vision.paused && vision.mode === 'visual_context';
  const showEye = looking || contextActive;

  return (
    <div className="vision-panel">
      <div className={`vision-indicator${looking ? ' looking' : ''}${showEye ? ' on' : ''}`}>
        <span className="vision-eye" aria-hidden>
          {showEye ? '👁' : '○'}
        </span>
        <div>
          <strong>{looking ? 'LYLA 👁' : 'LYLA'}</strong>
          <div className="vision-mode-label">{vision.indicator}</div>
        </div>
      </div>

      {looking && (
        <p className="vision-status">Analyzing…</p>
      )}

      {window && (
        <dl className="vision-dl">
          <dt>Application</dt>
          <dd>{window.application || window.processName || 'Unknown'}</dd>
          <dt>Window</dt>
          <dd>{window.title || '(untitled)'}</dd>
          {window.displayLabel && (
            <>
              <dt>Screen</dt>
              <dd>{window.displayLabel}</dd>
            </>
          )}
        </dl>
      )}

      {vision.displays.length > 0 && (
        <div className="vision-displays">
          {vision.displays.map((d) => (
            <div key={d.id} className="vision-display-chip">
              {d.label}
              <span>
                {d.name ? `${d.name} · ` : ''}
                {d.width}×{d.height}
                {d.isPrimary ? ' · primary' : ` · ${d.position}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {vision.lastObservation && (
        <pre className="vision-observation">{vision.lastObservation}</pre>
      )}
    </div>
  );
}
