# web.VDAT — Traffic Surveillance Dashboard

Frontend dashboard, state management, and real-time binary WebSocket streaming client for the **VDAT** (Vehicle Detection and Tracking) Smart Surveillance System.

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
       [TanStack React Query]   [Zustand Stores]              [Off-Thread Canvas Player]
       - useViolations()        - useAuthStore                - createImageBitmap + rAF
       - useCameras()           - useStreamStore              - Adaptive jitter buffer
       - useOverviewStats()     - useViolationStore
       - useUpdateZones()       - useSettingsStore
               │                      │                                 │
               └──────────────────────┴─────────────────────────────────┘
                                      │
                                      ▼
                     [src/components/ & src/App.tsx]
           (Live Monitor, Source Wall, Zone Editor, Evidence, Analytics)
```

---

## 📦 Directory Structure

```
src/
├── api/            # Typed Axios HTTP client with JWT interceptors & endpoint services
│   ├── auth.api.ts         # Login, /api/auth/me, health check
│   ├── camera.api.ts       # Cameras, CRUD, uploaded video staging, zone updates
│   ├── violation.api.ts    # Paginated violation audit log & status review
│   ├── evidence.api.ts     # Evidence URL resolver
│   └── stats.api.ts        # Traffic metrics & aggregated vehicle counts
├── components/     # Modular dashboard views, dialogs, and monitor panels
│   ├── analytics/          # Fleet & violation statistics view
│   ├── auth/               # Sign-in screen
│   ├── common/             # Shared expired-media fallback UI
│   ├── dialogs/            # Source selector, Add/Delete Camera, Evidence player modals
│   ├── layout/             # Top bar and account/workspace popover menu
│   └── monitor/            # Focused stream card, canvas player, HUD, camera wall, zone editor, evidence feed
├── config/         # Environment variables and UI constants
├── hooks/          # React Query, popover/dialog behavior, transmitter, canvas player & zone editor hooks
├── lib/            # TanStack React Query client setup
├── stores/         # Lightweight Zustand state stores (auth, stream, violations, settings)
├── styles/         # Layered CSS Grid & Container Query layout architecture (dashboard.css)
├── types/          # TypeScript interfaces and WebSocket contracts
├── utils/          # Formatters, geometry coordinate transforms, CSV export, audio, notifications, canvas drawing
├── websocket/      # WebSocket client with auto-reconnect, binary frame parsing & throttled telemetry
├── App.tsx         # Authenticated shell wiring monitor, zone annotation, analytics & dialogs
└── main.tsx        # React application entrypoint
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

### 3. Run Development & Production Builds

```bash
npm run dev
npm run typecheck
npm run build
```

---

## 📄 License

VDAT Project — Confidential & Proprietary.
