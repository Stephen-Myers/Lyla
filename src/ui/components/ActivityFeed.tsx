import type { ToolActivity } from '@shared/types';

export function ActivityFeed({ activities }: { activities: ToolActivity[] }) {
  if (!activities.length) {
    return (
      <div className="empty-hint">
        Tool activity will appear here when LYLA works — search, system checks, memory, and more.
      </div>
    );
  }

  return (
    <div className="activity-list">
      {activities.map((a) => (
        <div key={a.id} className={`activity ${a.status}`}>
          <div>
            <div>{a.description}</div>
            {a.error && <div style={{ color: 'var(--rose)', marginTop: 4 }}>{a.error}</div>}
          </div>
          <div className="status">{a.status}</div>
        </div>
      ))}
    </div>
  );
}
