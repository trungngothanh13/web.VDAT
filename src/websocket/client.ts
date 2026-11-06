import { env } from '../config/env';
import { STORAGE_KEYS } from '../config/constants';
import {
  InboundWSMessage,
  StreamConnectionStatus,
  LiveFrameMessage,
  ViolationAlertMessage,
  EvidenceClipUpdateMessage,
  CameraStatusMessage,
  ConnectionEstablishedMessage,
} from '../types/websocket.types';

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

  // Event listener registries
  private liveFrameListeners = new Set<MessageHandler<LiveFrameMessage>>();
  private violationAlertListeners = new Set<MessageHandler<ViolationAlertMessage>>();
  private evidenceClipListeners = new Set<MessageHandler<EvidenceClipUpdateMessage>>();
  private cameraStatusListeners = new Set<MessageHandler<CameraStatusMessage>>();
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

      this.ws.onopen = () => {
        this.setStatus('connected');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
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

  public sendPayload(payload: Record<string, unknown>): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  // Event Subscription Methods
  public onLiveFrame(handler: MessageHandler<LiveFrameMessage>): () => void {
    this.liveFrameListeners.add(handler);
    return () => this.liveFrameListeners.delete(handler);
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

  private routeMessage(msg: InboundWSMessage): void {
    switch (msg.type) {
      case 'live_frame':
        for (const listener of this.liveFrameListeners) listener(msg);
        break;
      case 'violation_alert':
        for (const listener of this.violationAlertListeners) listener(msg);
        break;
      case 'evidence_clip_update':
        for (const listener of this.evidenceClipListeners) listener(msg);
        break;
      case 'camera_status':
        for (const listener of this.cameraStatusListeners) listener(msg);
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

