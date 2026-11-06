import { Polygon } from '../types/camera.types';
import { TrafficLightState } from '../types/websocket.types';

export interface OverlayOptions {
  lanes?: Polygon[];
  intersection?: Polygon;
  trafficLightBox?: Array<{ x: number; y: number; color?: 'red' | 'green' | 'yellow' }>;
  lightState?: TrafficLightState;
  showLanes?: boolean;
  showIntersection?: boolean;
  showTrafficLights?: boolean;
  showTelemetryHud?: boolean;
}

export class CanvasStreamRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private currentImage: HTMLImageElement = new Image();
  private isImageLoaded = false;
  private animFrameId: number | null = null;

  // FPS calculation
  private frameCount = 0;
  private lastFpsUpdateTime = performance.now();
  private currentFps = 0;
  private onFpsUpdate?: (fps: number) => void;

  // Overlays
  private overlays: OverlayOptions = {
    showLanes: true,
    showIntersection: true,
    showTrafficLights: true,
    showTelemetryHud: true,
  };

  constructor(options?: { onFpsUpdate?: (fps: number) => void }) {
    this.onFpsUpdate = options?.onFpsUpdate;
    this.currentImage.onload = () => {
      this.isImageLoaded = true;
      this.frameCount++;
      this.calculateFps();
      this.render();
    };
  }

  public attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.render();
  }

  public detach(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.canvas = null;
    this.ctx = null;
  }

  public setOverlays(options: Partial<OverlayOptions>): void {
    this.overlays = { ...this.overlays, ...options };
    this.render();
  }

  public updateFrame(base64Jpeg: string): void {
    this.currentImage.src = `data:image/jpeg;base64,${base64Jpeg}`;
  }

  public getFps(): number {
    return this.currentFps;
  }

  private calculateFps(): void {
    const now = performance.now();
    const elapsed = now - this.lastFpsUpdateTime;

    if (elapsed >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFpsUpdateTime = now;
      if (this.onFpsUpdate) {
        this.onFpsUpdate(this.currentFps);
      }
    }
  }

  private render(): void {
    if (!this.canvas || !this.ctx || !this.isImageLoaded) return;

    const canvas = this.canvas;
    const ctx = this.ctx;
    const img = this.currentImage;

    // Resize canvas to match intrinsic image resolution if not set
    if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
      canvas.width = img.naturalWidth || 854;
      canvas.height = img.naturalHeight || 480;
    }

    // 1. Draw base frame
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // 2. Draw Lane Polygons
    if (this.overlays.showLanes && this.overlays.lanes && this.overlays.lanes.length > 0) {
      this.drawPolygons(ctx, this.overlays.lanes, {
        strokeColor: 'rgba(56, 189, 248, 0.8)', // Sky blue
        fillColor: 'rgba(56, 189, 248, 0.15)',
        lineWidth: 2,
        label: 'Lane',
      });
    }

    // 3. Draw Intersection Polygon
    if (this.overlays.showIntersection && this.overlays.intersection && this.overlays.intersection.length > 0) {
      this.drawPolygon(ctx, this.overlays.intersection, {
        strokeColor: 'rgba(239, 68, 68, 0.85)', // Red
        fillColor: 'rgba(239, 68, 68, 0.15)',
        lineWidth: 2,
        label: 'Red-Light Zone',
      });
    }

    // 4. Draw Traffic Light Sample Boxes
    if (this.overlays.showTrafficLights && this.overlays.trafficLightBox) {
      for (const box of this.overlays.trafficLightBox) {
        ctx.strokeStyle = box.color === 'red' ? '#ef4444' : box.color === 'green' ? '#10b981' : '#f59e0b';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = 2;
        ctx.strokeRect(box.x - 12, box.y - 12, 24, 24);
        ctx.beginPath();
        ctx.arc(box.x, box.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawPolygon(
    ctx: CanvasRenderingContext2D,
    polygon: Polygon,
    options: { strokeColor: string; fillColor: string; lineWidth: number; label?: string }
  ): void {
    if (polygon.length < 3) return;

    ctx.save();
    ctx.strokeStyle = options.strokeColor;
    ctx.fillStyle = options.fillColor;
    ctx.lineWidth = options.lineWidth;

    ctx.beginPath();
    ctx.moveTo(polygon[0][0], polygon[0][1]);
    for (let i = 1; i < polygon.length; i++) {
      ctx.lineTo(polygon[i][0], polygon[i][1]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (options.label) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText(options.label, polygon[0][0] + 6, polygon[0][1] + 16);
    }
    ctx.restore();
  }

  private drawPolygons(
    ctx: CanvasRenderingContext2D,
    polygons: Polygon[],
    options: { strokeColor: string; fillColor: string; lineWidth: number; label?: string }
  ): void {
    polygons.forEach((poly, idx) => {
      this.drawPolygon(ctx, poly, {
        ...options,
        label: options.label ? `${options.label} ${idx + 1}` : undefined,
      });
    });
  }
}

