/**
 * VDAT Frontend Core Engine & Integration SDK
 * Complete state, API, WebSocket, and business logic infrastructure for the VDAT Smart Surveillance System.
 */

// 1. Data Contracts & Type Definitions
export * from './types';

// 2. Configuration & Route Guards
export * from './config/env';
export * from './config/routes';
export * from './config/constants';

// 3. REST API Client & Endpoints
export * from './api';

// 4. Real-time WebSocket Relay & Direct Canvas Streaming
export * from './websocket';

// 5. Global State Management (Zustand)
export * from './stores';

// 6. React Query & Business Logic Hooks
export * from './hooks';

// 7. Zod Form & Query Validation Schemas
export * from './schemas';

// 8. Utility Functions (Formatters, Geometry Math, Sound, Notifications, CSV/JSON Export)
export * from './utils';

// 9. Mock Data & Offline Simulator
export * from './mocks';
