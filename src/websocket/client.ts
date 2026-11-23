import { env } from '../config/env';
import { STORAGE_KEYS } from '../config/constants';
import {
  InboundWSMessage,
  StreamConnectionStatus,
  FrameTelemetry,
  LiveFrameMessage,
  CameraPreviewMessage,
  CameraBypassZonesStatusMessage,
  CameraSourceStatusMessage,
  CameraTelemetryMessage,
  CameraProfileSwitchedMessage,
  ViolationAlertMessage,
  EvidenceClipUpdateMessage,
  CameraStatusMessage,
  AiModelStatusMessage,
  AiTrackerStatusMessage,
  ConnectionEstablishedMessage,
} from '../types/websocket.types';

export interface RawLiveFramePacket {
  cameraId: string;
  blob: Blob;
  telemetry?: FrameTelemetry;
  timestamp: number;
}

type MessageHandler<T> = (data: T) => void;
type StatusHandler = (status: StreamConnectionStatus) => void;

export class VdatWebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private status: StreamConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectDelay = 10000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingIntervalTimer: ReturnType<typeof setInterval> | null = null;
  private shouldReconnect = true;
  private textDecoder = new TextDecoder();

  // Event listener registries
  private liveFrameListeners = new Set<MessageHandler<LiveFrameMessage>>();
  private rawLiveFrameListeners = new Set<MessageHandler<RawLiveFramePacket>>();
  private cameraPreviewListeners = new Set<MessageHandler<CameraPreviewMessage>>();
  private cameraBypassZonesListeners = new Set<MessageHandler<CameraBypassZonesStatusMessage>>();
  private cameraSourceStatusListeners = new Set<MessageHandler<CameraSourceStatusMessage>>();
  private cameraTelemetryListeners = new Set<MessageHandler<CameraTelemetryMessage>>();
  private lastFocusedTelemetryAt = new Map<string, number>();
  private lastFocusedTelemetryMeta = new Map<string, { violations?: number; light?: string }>();
  private latestFrameBlobByCamera = new Map<string, Blob>();
  private cameraProfileListeners = new Set<MessageHandler<CameraProfileSwitchedMessage>>();
  private violationAlertListeners = new Set<MessageHandler<ViolationAlertMessage>>();
  private evidenceClipListeners = new Set<MessageHandler<EvidenceClipUpdateMessage>>();
  private cameraStatusListeners = new Set<MessageHandler<CameraStatusMessage>>();
  private aiModelStatusListeners = new Set<MessageHandler<AiModelStatusMessage>>();
  private aiTrackerStatusListeners = new Set<MessageHandler<AiTrackerStatusMessage>>();
  private connectionListeners = new Set<MessageHandler<ConnectionEstablishedMessage>>();
  private statusListeners = new Set<StatusHandler>();

  constructor(url: string = env.wsUrl) {
    this.url = url;
  }

  public setUrl(newUrl: string): void {
    if (this.url !== newUrl) {
      this.url = newUrl;
      if (this.status === 'connected' || this.status === 'connecting') {
        this.reconnect();
      }
    }
  }

  public getStatus(): StreamConnectionStatus {
    return this.status;
  }

  public connect(): void {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (!token) {
      this.setStatus('disconnected');
      return;
    }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.shouldReconnect = true;
    this.setStatus('connecting');

    try {
      const separator = this.url.includes('?') ? '&' : '?';
      const authenticatedUrl = `${this.url}${separator}token=${encodeURIComponent(token)}`;
      this.ws = new WebSocket(authenticatedUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.setStatus('connected');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          if (event.data instanceof ArrayBuffer) {
            this.routeBinaryMessage(event.data);
            return;
          }
          const msg = JSON.parse(event.data) as InboundWSMessage;
          this.routeMessage(msg);
        } catch {
          // Ignore unparseable frames
        }
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.ws = null;
        if (this.shouldReconnect) {
          this.setStatus('reconnecting');
          this.scheduleReconnect();
        } else {
          this.setStatus('disconnected');
        }
      };

      this.ws.onerror = (error) => {
        console.warn('[VdatWS] WebSocket connection error:', error);
      };
    } catch (err) {
      console.error('[VdatWS] Failed to instantiate WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  public reconnect(): void {
    this.disconnect();
    this.connect();
  }

  public sendPing(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }

  public getBufferedAmount(): number {
    return this.ws ? this.ws.bufferedAmount : 0;
  }

  public getLatestFrameBlob(cameraId: string): Blob | null {
    return this.latestFrameBlobByCamera.get(cameraId) ?? null;
  }

  public sendPayload(payload: Record<string, unknown>): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  public sendBinary(data: ArrayBuffer | Uint8Array): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
      return true;
    }
    return false;
  }

  // Event Subscription Methods
  public onLiveFrame(handler: MessageHandler<LiveFrameMessage>): () => void {
    this.liveFrameListeners.add(handler);
    return () => this.liveFrameListeners.delete(handler);
  }

  public onRawLiveFrame(handler: MessageHandler<RawLiveFramePacket>): () => void {
    this.rawLiveFrameListeners.add(handler);
    return () => this.rawLiveFrameListeners.delete(handler);
  }

  public onCameraPreview(handler: MessageHandler<CameraPreviewMessage>): () => void {
    this.cameraPreviewListeners.add(handler);
    return () => this.cameraPreviewListeners.delete(handler);
  }

  public onCameraBypassZonesStatus(
    handler: MessageHandler<CameraBypassZonesStatusMessage>
  ): () => void {
    this.cameraBypassZonesListeners.add(handler);
    return () => this.cameraBypassZonesListeners.delete(handler);
  }

  public onCameraSourceStatus(handler: MessageHandler<CameraSourceStatusMessage>): () => void {
    this.cameraSourceStatusListeners.add(handler);
    return () => this.cameraSourceStatusListeners.delete(handler);
  }

  public onCameraTelemetry(handler: MessageHandler<CameraTelemetryMessage>): () => void {
    this.cameraTelemetryListeners.add(handler);
    return () => this.cameraTelemetryListeners.delete(handler);
  }

  public onCameraProfileSwitched(handler: MessageHandler<CameraProfileSwitchedMessage>): () => void {
    this.cameraProfileListeners.add(handler);
    return () => this.cameraProfileListeners.delete(handler);
  }

  public onViolationAlert(handler: MessageHandler<ViolationAlertMessage>): () => void {
    this.violationAlertListeners.add(handler);
    return () => this.violationAlertListeners.delete(handler);
  }

  public onEvidenceClipUpdate(handler: MessageHandler<EvidenceClipUpdateMessage>): () => void {
    this.evidenceClipListeners.add(handler);
    return () => this.evidenceClipListeners.delete(handler);
  }

  public onCameraStatus(handler: MessageHandler<CameraStatusMessage>): () => void {
    this.cameraStatusListeners.add(handler);
    return () => this.cameraStatusListeners.delete(handler);
  }

  public onAiModelStatus(handler: MessageHandler<AiModelStatusMessage>): () => void {
    this.aiModelStatusListeners.add(handler);
    return () => this.aiModelStatusListeners.delete(handler);
  }

  public onAiTrackerStatus(handler: MessageHandler<AiTrackerStatusMessage>): () => void {
    this.aiTrackerStatusListeners.add(handler);
    return () => this.aiTrackerStatusListeners.delete(handler);
  }

  public onConnectionEstablished(handler: MessageHandler<ConnectionEstablishedMessage>): () => void {
    this.connectionListeners.add(handler);
    return () => this.connectionListeners.delete(handler);
  }

  public onStatusChange(handler: StatusHandler): () => void {
    this.statusListeners.add(handler);
    handler(this.status);
    return () => this.statusListeners.delete(handler);
  }

  private setStatus(newStatus: StreamConnectionStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      for (const listener of this.statusListeners) {
        try {
          listener(newStatus);
        } catch (e) {
          console.error('[VdatWS] Status listener error:', e);
        }
      }
    }
  }

  private routeBinaryMessage(buffer: ArrayBuffer): void {
    if (buffer.byteLength < 4) return;
    const view = new DataView(buffer);
    const headerLen = view.getUint32(0, false);
    if (headerLen <= 0 || 4 + headerLen > buffer.byteLength) return;

    const headerStr = this.textDecoder.decode(new Uint8Array(buffer, 4, headerLen));
    const header = JSON.parse(headerStr) as Record<string, any>;

    if (header.type === 'live_frame') {
      const jpegBytes = new Uint8Array(buffer, 4 + headerLen);
      const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
      const ts = header.timestamp || Date.now();
      const cameraId = String(header.cameraId || 'cam-01');
      this.latestFrameBlobByCamera.set(cameraId, blob);

      if (this.rawLiveFrameListeners.size > 0) {
        const pkt: RawLiveFramePacket = {
          cameraId,
          blob,
          telemetry: header.telemetry,
          timestamp: ts,
        };
        for (const listener of this.rawLiveFrameListeners) {
          listener(pkt);
        }

        // Throttle React/Zustand HUD telemetry updates (~5 Hz) while still updating immediately on violation or light changes
        if (header.telemetry) {
          const prevMeta = this.lastFocusedTelemetryMeta.get(cameraId);
          const nextViol = header.telemetry.violations_count;
          const nextLight = header.telemetry.light_state;
          const changedCritical =
            !prevMeta || prevMeta.violations !== nextViol || prevMeta.light !== nextLight;
          const lastAt = this.lastFocusedTelemetryAt.get(cameraId) ?? 0;
          if (changedCritical || ts - lastAt >= 200) {
            this.lastFocusedTelemetryAt.set(cameraId, ts);
            this.lastFocusedTelemetryMeta.set(cameraId, {
              violations: nextViol,
              light: nextLight,
            });
            this.routeMessage({
              type: 'camera_telemetry',
              cameraId,
              telemetry: header.telemetry,
              timestamp: ts,
            });
          }
        }
        return;
      }

      const blobUrl = URL.createObjectURL(blob);
      this.routeMessage({
        type: 'live_frame',
        cameraId,
        telemetry: header.telemetry,
        image: blobUrl,
        timestamp: ts,
      } as LiveFrameMessage);
    }
  }

  private routeMessage(msg: InboundWSMessage): void {
    switch (msg.type) {
      case 'live_frame':
        for (const listener of this.liveFrameListeners) listener(msg);
        break;
      case 'camera_preview':
        for (const listener of this.cameraPreviewListeners) listener(msg);
        break;
      case 'camera_bypass_zones_status':
        for (const listener of this.cameraBypassZonesListeners) listener(msg);
        break;
      case 'camera_source_status':
        if (msg.status === 'stopped' || msg.status === 'ended') {
          this.latestFrameBlobByCamera.delete(msg.cameraId);
        }
        for (const listener of this.cameraSourceStatusListeners) listener(msg);
        break;
      case 'camera_telemetry':
        for (const listener of this.cameraTelemetryListeners) listener(msg);
        break;
      case 'camera_profile_switched':
        for (const listener of this.cameraProfileListeners) listener(msg);
        break;
      case 'violation_alert':
        for (const listener of this.violationAlertListeners) listener(msg);
        break;
      case 'evidence_clip_update':
        for (const listener of this.evidenceClipListeners) listener(msg);
        break;
      case 'camera_status':
        if (msg.status === 'OFFLINE') {
          this.latestFrameBlobByCamera.delete(msg.cameraId);
        }
        for (const listener of this.cameraStatusListeners) listener(msg);
        break;
      case 'ai_model_status':
        for (const listener of this.aiModelStatusListeners) listener(msg);
        break;
      case 'ai_tracker_status':
        for (const listener of this.aiTrackerStatusListeners) listener(msg);
        break;
      case 'connection_established':
        for (const listener of this.connectionListeners) listener(msg);
        break;
      case 'pong':
        // Heartbeat acknowledged
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    // Exponential backoff: 1s, 2s, 4s, 8s, up to maxReconnectDelay (10s)
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connect();
      }
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingIntervalTimer = setInterval(() => {
      this.sendPing();
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.pingIntervalTimer) {
      clearInterval(this.pingIntervalTimer);
      this.pingIntervalTimer = null;
    }
  }
}

// Global singleton instance for application-wide use
export const vdatWsClient = new VdatWebSocketClient();

