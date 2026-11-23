import { create } from 'zustand';
import { Violation } from '../types/violation.types';

interface ViolationStoreState {
  liveAlerts: Violation[];

  // Actions
  addLiveAlert: (violation: Violation, maxFeedLength?: number) => void;
  updateViolationInStore: (updated: Violation) => void;
  updateClipUrl: (trackId: number, frameNumber: number, clipUrl: string, cameraId?: string) => void;
}

export const useViolationStore = create<ViolationStoreState>((set) => ({
  liveAlerts: [],

  addLiveAlert: (violation: Violation, maxFeedLength: number = 50) => {
    set((state) => {
      const exists = state.liveAlerts.some((v) => v.id === violation.id);
      if (exists) return state;

      return {
        liveAlerts: [violation, ...state.liveAlerts].slice(0, maxFeedLength),
      };
    });
  },

  updateViolationInStore: (updated: Violation) => {
    set((state) => ({
      liveAlerts: state.liveAlerts.map((v) => (v.id === updated.id ? updated : v)),
    }));
  },

  updateClipUrl: (trackId: number, frameNumber: number, clipUrl: string, cameraId?: string) => {
    set((state) => {
      const matchCriteria = (v: Violation) =>
        v.trackId === trackId &&
        v.frameNumber === frameNumber &&
        (!cameraId || v.cameraId === cameraId);

      return {
        liveAlerts: state.liveAlerts.map((v) =>
          matchCriteria(v) ? { ...v, evidenceClipUrl: clipUrl } : v
        ),
      };
    });
  },
}));
