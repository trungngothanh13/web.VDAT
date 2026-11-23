import { getLightConfig } from '../../config/constants';
import { useStreamStore } from '../../stores/stream.store';

interface StreamHudProps {
  isBypassed: boolean;
  fallbackViolationCount: number;
}

export function StreamHud({ isBypassed, fallbackViolationCount }: StreamHudProps) {
  const telemetry = useStreamStore((s) => s.telemetry);
  const lightCfg = getLightConfig(telemetry.light_state);

  return (
    <div className="hud-wrapper">
      <div className="hud-bar">
        <div className="stat-box">
          <div className="stat-label">Active Vehicles</div>
          <div className="stat-value">{telemetry.vehicle_count ?? 0}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Total Tracked</div>
          <div className="stat-value">{telemetry.total_tracked ?? 0}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Violation Count</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>
            {telemetry.violations_count ?? fallbackViolationCount}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Stream FPS</div>
          <div className="stat-value">{telemetry.fps ?? 0} FPS</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Signal</div>
          <div
            className="stat-value"
            style={{ color: isBypassed ? 'var(--warning-text)' : lightCfg.color }}
          >
            {isBypassed ? 'BYPASSED' : lightCfg.label}
          </div>
        </div>
      </div>
    </div>
  );
}
