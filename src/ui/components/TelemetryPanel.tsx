import type { SystemTelemetry } from '@shared/types';

export function TelemetryPanel({ telemetry }: { telemetry: SystemTelemetry | null }) {
  if (!telemetry) {
    return <div className="empty-hint">Gathering system telemetry…</div>;
  }

  return (
    <div className="telemetry-grid">
      <Metric label="CPU" value={`${telemetry.cpu}%`} pct={telemetry.cpu} />
      <Metric
        label="Memory"
        value={`${telemetry.memory}% · ${telemetry.memoryUsedGb}/${telemetry.memoryTotalGb} GB`}
        pct={telemetry.memory}
      />
      {telemetry.battery != null && (
        <Metric
          label={telemetry.charging ? 'Battery (charging)' : 'Battery'}
          value={`${telemetry.battery}%`}
          pct={telemetry.battery}
        />
      )}
    </div>
  );
}

function Metric({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="metric">
      <div className="metric-label">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="bar">
        <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}
