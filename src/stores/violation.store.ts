import { create } from 'zustand';
import { Violation, ViolationQueryParams } from '../types/violation.types';

interface ViolationStoreState {
  liveAlerts: Violation[];
  unreadAlertCount: number;
  selectedViolation: Violation | null;
  filters: ViolationQueryParams;

  // Actions
  addLiveAlert: (violation: Violation, maxFeedLength?: number) => void;
  clearUnreadCount: () => void;
  setSelectedViolation: (violation: Violation | null) => void;
  setFilters: (filters: Partial<ViolationQueryParams>) => void;
  resetFilters: () => void;
  updateViolationInStore: (updated: Violation) => void;
  updateClipUrl: (trackId: number, frameNumber: number, clipUrl: string, cameraId?: string) => void;
  clearLiveAlerts: () => void;
}

const initialFilters: ViolationQueryParams = {
  page: 1,
  limit: 20,
  cameraId: undefined,
  status: undefined,
  vehicleClass: undefined,
  startDate: undefined,
  endDate: undefined,
};

export const useViolationStore = create<ViolationStoreState>((set) => ({
  liveAlerts: [],
  unreadAlertCount: 0,
  selectedViolation: null,
  filters: initialFilters,

  addLiveAlert: (violation: Violation, maxFeedLength: number = 50) => {
    set((state) => {
      // Prevent duplicate insertion
      const exists = state.liveAlerts.some((v) => v.id === violation.id);
      if (exists) return state;

      const updatedFeed = [violation, ...state.liveAlerts].slice(0, maxFeedLength);
      return {
        liveAlerts: updatedFeed,
        unreadAlertCount: state.unreadAlertCount + 1,
      };
    });
  },

  clearUnreadCount: () => set({ unreadAlertCount: 0 }),

  setSelectedViolation: (violation: Violation | null) => set({ selectedViolation: violation }),

  setFilters: (newFilters: Partial<ViolationQueryParams>) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters, page: newFilters.page ?? 1 },
    })),

  resetFilters: () => set({ filters: initialFilters }),

  updateViolationInStore: (updated: Violation) => {
    set((state) => ({
      liveAlerts: state.liveAlerts.map((v) => (v.id === updated.id ? updated : v)),
      selectedViolation: state.selectedViolation?.id === updated.id ? updated : state.selectedViolation,
    }));
  },

  updateClipUrl: (trackId: number, frameNumber: number, clipUrl: string, cameraId?: string) => {
    set((state) => {
      const matchCriteria = (v: Violation) =>
        v.trackId === trackId &&
        v.frameNumber === frameNumber &&
        (!cameraId || v.cameraId === cameraId);

      const updatedLiveAlerts = state.liveAlerts.map((v) => {
        if (matchCriteria(v)) {
          return { ...v, evidenceClipUrl: clipUrl };
        }
        return v;
      });

      let updatedSelected = state.selectedViolation;
      if (updatedSelected && matchCriteria(updatedSelected)) {
        updatedSelected = { ...updatedSelected, evidenceClipUrl: clipUrl };
      }

      return {
        liveAlerts: updatedLiveAlerts,
        selectedViolation: updatedSelected,
      };
    });
  },

  clearLiveAlerts: () => set({ liveAlerts: [], unreadAlertCount: 0 }),
}));
