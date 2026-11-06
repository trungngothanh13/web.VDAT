# web.VDAT — Technical Architecture & Integration Guide

This document details the internal design patterns, data flows, and state synchronization mechanisms powering the frontend infrastructure of the **VDAT** surveillance system.

---

## 1. System Topology & Data Flow

```
┌─────────────────────────────────┐
│ ThunderCompute (AI Engine)      │
│ - YOLO Object Detection         │
│ - ByteTrack / BoT-SORT Tracking │
│ - Red-Light Logic Filter        │
└──────────────┬──────────────────┘
               │ 1. ws://host:5000/ws/inference
               ▼
┌─────────────────────────────────┐
│ api.VDAT (Backend Hub)          │
│ - Express REST API              │
│ - WebSocket Stream Multiplexer  │
│ - PostgreSQL Persistence        │
└──────────────┬──────────────────┘
               │ 2. ws://host:5000/ws/client & HTTP /api/...
               ▼
┌─────────────────────────────────┐
│ web.VDAT (Frontend Engine)      │
│ - VdatWebSocketClient           │
│ - CanvasStreamRenderer          │
│ - Zustand Global State Stores   │
│ - TanStack React Query Cache    │
└─────────────────────────────────┘
```

---

## 2. High-Frequency Frame Streaming (Direct Canvas Renderer)

In video surveillance dashboards running at 15–30 FPS with JPEG base64 payloads:
- Storing base64 images directly into React component state (`useState`) can cause React to re-render the entire virtual DOM tree 30 times per second, causing severe dropped frames, GC spikes, and UI sluggishness.
- To eliminate this bottleneck, `web.VDAT` introduces `CanvasStreamRenderer` in `src/websocket/canvas-streamer.ts`.
- The renderer draws directly to an HTML5 `<canvas>` using `CanvasRenderingContext2D.drawImage` and runs hardware-accelerated overlay drawing for:
  - Configured lane polygons (cyan)
  - Red-light violation intersection polygons (red)
  - Traffic light sampling points
- Frame rendering and telemetry updates are decoupled:
  - The frame bitmap is handled directly via `CanvasStreamRenderer`.
  - Telemetry (vehicle count, light status, FPS) is published to `useStreamStore` at a throttled rate for HUD presentation.

---

## 3. Real-Time Alert Event Lifecycle

When an unauthorized vehicle crosses the stop line on a red light:
1. **AI Detection**: ThunderCompute sends `{ type: "violation", cameraId, event, evidenceImage }` over WebSocket to `api.VDAT`.
2. **Server Storage**: `api.VDAT` stores the record in PostgreSQL (`status = 'PENDING_REVIEW'`) and saves the snapshot JPG.
3. **Outbound Broadcast**: `api.VDAT` broadcasts `{ type: "violation_alert", violation }` to all connected web clients on `/ws/client`.
4. **Client Reception**:
   - `VdatWebSocketClient` routes the event to `useViolationAlerts()`.
   - The alert is prepended to `useViolationStore.liveAlerts`.
   - If enabled in `useSettingsStore`, `playViolationAlertChime()` plays a two-tone warning chime via Web Audio API.
   - If tab is in background, a system notification is shown via HTML5 Notification API.
5. **Asynchronous Evidence Encoding**:
   - ThunderCompute encodes the 5-10 second MP4 proof clip and notifies the backend: `{ type: "evidence_clip_ready" }`.
   - Backend broadcasts `{ type: "evidence_clip_update", trackId, frameNumber, evidenceClipUrl }`.
   - Frontend store updates the matching violation record so the "Watch Clip / Download Video" button becomes instantly active.

---

## 4. State Management Taxonomy

State in `web.VDAT` is split into two cleanly separated categories:

| State Category | Technology | Files | Purpose |
| :--- | :--- | :--- | :--- |
| **Server State** | TanStack React Query | `src/hooks/useViolations.ts`<br>`src/hooks/useCameras.ts`<br>`src/hooks/useOverviewStats.ts` | Remote API data, pagination, caching, revalidation, and optimistic mutations |
| **Client & Stream State** | Zustand | `src/stores/stream.store.ts`<br>`src/stores/violation.store.ts`<br>`src/stores/auth.store.ts`<br>`src/stores/settings.store.ts` | Live WebSocket stream, active camera selection, HUD telemetry, audio volume, session auth |

---

## 5. Security & Access Control

- All protected endpoints use JSON Web Tokens (`Authorization: Bearer <token>`).
- The Axios interceptor in `src/api/client.ts` automatically attaches the token stored in `localStorage`.
- On receiving HTTP 401 Unauthorized:
  - Interceptor discards the invalid token.
  - Fires the `vdat:unauthorized` event.
  - `useAuthStore` logs out the user and redirects to `/login`.
- Role-based capabilities (`permissions` in `src/config/routes.ts`):
  - `ADMIN`: Full access to modify camera zone geometry (`/cameras/:id/zones`) and push updates to AI engine.
  - `POLICE` & `ADMIN`: Review violations (`CONFIRMED` or `DISMISSED`) with review notes.
