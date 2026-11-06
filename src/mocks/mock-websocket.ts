import { LiveFrameMessage, ViolationAlertMessage } from '../types/websocket.types';
import { MOCK_VIOLATIONS } from './mock-data';

export class MockWebSocketSimulator {
  private timer: ReturnType<typeof setInterval> | null = null;
  private violationTimer: ReturnType<typeof setInterval> | null = null;
  private frameCount = 0;
  private isRunning = false;

  private onFrameCallback?: (msg: LiveFrameMessage) => void;
  private onAlertCallback?: (msg: ViolationAlertMessage) => void;

  public start(
    onFrame: (msg: LiveFrameMessage) => void,
    onAlert?: (msg: ViolationAlertMessage) => void,
    fps: number = 15
  ): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.onFrameCallback = onFrame;
    this.onAlertCallback = onAlert;

    const interval = Math.round(1000 / fps);

    // Create a 1x1 base64 transparent pixel fallback image if canvas not available
    const syntheticBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    this.timer = setInterval(() => {
      this.frameCount++;
      const seconds = (this.frameCount / fps).toFixed(2);
      const isRed = (this.frameCount % 180) > 90;

      const frameMsg: LiveFrameMessage = {
        type: 'live_frame',
        cameraId: 'cam-01',
        telemetry: {
          vehicle_count: 8 + (this.frameCount % 5),
          total_tracked: 120 + Math.floor(this.frameCount / 10),
          violations_count: 14 + Math.floor(this.frameCount / 150),
          fps,
          light_state: isRed ? 'red' : 'green',
          frame_number: this.frameCount,
          timestamp: `${seconds}s`,
        },
        image: syntheticBase64,
        timestamp: Date.now(),
      };

      if (this.onFrameCallback) {
        this.onFrameCallback(frameMsg);
      }
    }, interval);

    // Periodically simulate a violation alert every 25 seconds
    if (onAlert) {
      this.violationTimer = setInterval(() => {
        const sample = MOCK_VIOLATIONS[Math.floor(Math.random() * MOCK_VIOLATIONS.length)];
        const simulated: ViolationAlertMessage = {
          type: 'violation_alert',
          violation: {
            ...sample,
            id: `v-sim-${Date.now()}`,
            trackId: 2000 + Math.floor(Math.random() * 500),
            frameNumber: this.frameCount,
            timestamp: `${(this.frameCount / fps).toFixed(2)}s`,
            createdAt: new Date().toISOString(),
            status: 'PENDING_REVIEW',
          },
        };
        this.onAlertCallback?.(simulated);
      }, 25000);
    }
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.violationTimer) {
      clearInterval(this.violationTimer);
      this.violationTimer = null;
    }
    this.isRunning = false;
  }
}

export const mockWsSimulator = new MockWebSocketSimulator();
