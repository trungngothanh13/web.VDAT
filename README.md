# web.VDAT — Frontend Core & State Engine

Complete frontend integration, data layer, state management, and real-time streaming infrastructure for the **VDAT** (Vehicle Detection and Tracking) Smart Surveillance System.

This repository contains **everything needed for the frontend application**, completely decoupled from the presentation layer (UI components), allowing UI developers or design systems (Tailwind CSS, shadcn/ui, Ant Design, Material UI) to bind directly to production-ready hooks, stores, and API clients.

---

## 🏛️ Architecture Overview

```
                                [api.VDAT Backend (Express / WS)]
                                            │
               ┌────────────────────────────┴───────────────────────────┐
               │ REST API (/api/...)                                    │ WebSocket (/ws/client)
               ▼                                                        ▼
       [src/api/client.ts]                                    [src/websocket/client.ts]
               │                                                        │
               ├──────────────────────┬─────────────────────────────────┤
               ▼                      ▼                                 ▼
       [TanStack React Query]   [Zustand Stores]             [Direct Canvas Streamer]
       - useViolations()        - useAuthStore               - Zero-DOM 30 FPS rendering
       - useCameras()           - useStreamStore             - Hardware acceleration
       - useOverviewStats()     - useViolationStore          - Lane / Red-light overlays
       - useUpdateZones()       - useSettingsStore
               │                      │                                 │
               └──────────────────────┴─────────────────────────────────┘
                                      │
                                      ▼
                        [Frontend Web UI / Components]
                        (Views, Tables, Modals, Canvases)
```

---

## 📦 Directory Structure

```
src/
├── api/            # Typed Axios HTTP client with JWT interceptors & endpoint services
│   ├── auth.api.ts         # Login, /api/auth/me, health check
│   ├── camera.api.ts       # Get cameras, details, update lane/intersection zones
│   ├── violation.api.ts    # Paginated violation audit log & status review
│   ├── evidence.api.ts     # On-demand MP4 proof downloads, snapshots & uploads
│   └── stats.api.ts        # Traffic metrics & aggregated vehicle counts
├── websocket/      # High-performance WebSocket stream relay & fast-path canvas renderer
│   ├── client.ts           # Auto-reconnect with exponential backoff & heartbeat ping/pong
│   └── canvas-streamer.ts  # Direct 30 FPS Canvas rendering engine with polygon overlays
├── stores/         # Lightweight Zustand state stores (zero-boilerplate global state)
│   ├── auth.store.ts       # Auth tokens, user profiles, role helpers (isAdmin, isPolice)
│   ├── stream.store.ts     # Active cameras, live frames, HUD telemetry, stream FPS
│   ├── violation.store.ts  # Real-time alert feed, unread counter, search filters
│   ├── camera.store.ts     # Camera selection, zone geometry state
│   └── settings.store.ts   # Audio volumes, desktop notification toggles, stream quality
├── hooks/          # React Query & custom business logic hooks
│   ├── useAuth.ts          # Authentication, session initialization, permissions
│   ├── useLiveStream.ts    # Live frame subscription, stream pause/resume
│   ├── useViolationAlerts.ts # Real-time alert listener with sound & notifications
│   ├── useViolations.ts    # Paginated server-cached violation query with filters
│   ├── useReviewViolation.ts # Officer review mutation (CONFIRMED/DISMISSED + notes)
│   ├── useCameras.ts       # Camera list query with live status
│   ├── useUpdateZones.ts   # Push new lane polygons to backend and ThunderCompute
│   ├── useOverviewStats.ts # Traffic analytics query with polling
│   ├── useZoneEditor.ts    # Interactive polygon drawing, vertex dragging & undo/redo
│   ├── useEvidence.ts      # Proof clip download helper with progress tracking
│   ├── useAudioAlert.ts    # Synthesized Web Audio API red-light alert tone
│   └── useNotifications.ts # HTML5 Desktop notifications
├── schemas/        # Zod validation schemas for forms and request payloads
├── types/          # Strict TypeScript interfaces, enums, and data contracts
├── utils/          # Geometry math (ray casting), formatters, CSV/JSON exporters
└── mocks/          # Offline mock data and synthetic WebSocket simulator
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd web.VDAT
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env.development`:

```bash
cp .env.example .env.development
```

Key environment options:
* `VITE_API_URL`: Backend REST API URL (default: `http://localhost:5000`).
* `VITE_WS_URL`: Backend WebSocket URL (default: `ws://localhost:5000/ws/client`).
* `VITE_DEFAULT_CAMERA_ID`: Default active camera ID (default: `cam-01`).

### 3. Run Development Server

```bash
npm run dev
```

---

## 🛠️ Usage Examples for UI Developers

### 1. Connecting to Live Stream & Receiving Real-Time Alerts

```tsx
import React, { useEffect, useRef } from 'react';
import { useLiveStream, useViolationAlerts, CanvasStreamRenderer } from './src';

export function LiveMonitorView() {
  const { selectedCameraId, telemetry, isConnected, isCameraLive, togglePause, isPaused } = useLiveStream();
  const { liveAlerts, unreadAlertCount } = useViolationAlerts();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasStreamRenderer | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      rendererRef.current = new CanvasStreamRenderer();
      rendererRef.current.attach(canvasRef.current);
    }
    return () => rendererRef.current?.detach();
  }, []);

  return (
    <div>
      <h2>Camera: {selectedCameraId} ({isConnected ? 'Connected' : 'Offline'})</h2>
      <canvas ref={canvasRef} style={{ width: '100%', maxWidth: 854 }} />
      <div>
        <span>Vehicles: {telemetry.vehicle_count}</span>
        <span>Tracked: {telemetry.total_tracked}</span>
        <span>Light: {telemetry.light_state?.toUpperCase()}</span>
        <button onClick={togglePause}>{isPaused ? 'Resume' : 'Pause'}</button>
      </div>

      <h3>Live Violation Alerts ({unreadAlertCount} unread)</h3>
      <ul>
        {liveAlerts.map((alert) => (
          <li key={alert.id}>
            🚨 Track #{alert.trackId} ({alert.vehicleClass}) — Frame {alert.frameNumber}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### 2. Reviewing Violations (Officer Workflow)

```tsx
import React from 'react';
import { useViolations, useReviewViolation } from './src';

export function ViolationReviewList() {
  const { data, isLoading } = useViolations({ page: 1, limit: 10, status: 'PENDING_REVIEW' });
  const reviewMutation = useReviewViolation();

  if (isLoading) return <div>Loading violations...</div>;

  return (
    <table>
      <thead>
        <tr>
          <th>Track ID</th>
          <th>Vehicle</th>
          <th>Time</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data?.data.map((v) => (
          <tr key={v.id}>
            <td>#{v.trackId}</td>
            <td>{v.vehicleClass}</td>
            <td>{v.timestamp}</td>
            <td>
              <button
                onClick={() =>
                  reviewMutation.mutate({
                    id: v.id,
                    payload: { status: 'CONFIRMED', notes: 'Verified in evidence video' },
                  })
                }
              >
                Confirm
              </button>
              <button
                onClick={() =>
                  reviewMutation.mutate({
                    id: v.id,
                    payload: { status: 'DISMISSED', notes: 'Vehicle stopped before line' },
                  })
                }
              >
                Dismiss
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### 3. Interactive Zone Geometry Editor

```tsx
import React from 'react';
import { useZoneEditor, useUpdateZones } from './src';

export function ZoneEditor({ cameraId }: { cameraId: string }) {
  const { geometry, mode, setMode, undo, redo, canUndo, canRedo } = useZoneEditor();
  const updateMutation = useUpdateZones();

  const handleSave = () => {
    updateMutation.mutate({
      cameraId,
      payload: {
        lanes: geometry.lanes,
        intersection: geometry.intersection,
        lightBox: geometry.lightBoxes,
      },
    });
  };

  return (
    <div>
      <button onClick={() => setMode('draw_lane')}>Draw Lane</button>
      <button onClick={() => setMode('draw_intersection')}>Draw Intersection</button>
      <button onClick={undo} disabled={!canUndo}>Undo</button>
      <button onClick={redo} disabled={!canRedo}>Redo</button>
      <button onClick={handleSave}>Save & Sync with AI Engine</button>
    </div>
  );
}
```

---

## 🧪 Offline Development with Simulated WebSocket

If backend or AI engines are offline, you can start the built-in simulator:

```ts
import { mockWsSimulator } from './src';

// Starts 15 FPS simulated live telemetry and periodic violation alerts
mockWsSimulator.start(
  (frame) => console.log('Simulated Frame:', frame),
  (alert) => console.log('Simulated Alert:', alert)
);
```

---

## 📄 License

VDAT Project — Confidential & Proprietary.

