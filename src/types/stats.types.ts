import { Violation } from './violation.types';

export interface StatsSummary {
  totalViolations: number;
  pendingReview: number;
  confirmed: number;
  dismissed: number;
  activeCamerasCount: number;
}

export interface VehicleClassCount {
  class: string;
  count: number;
}

export interface CameraCount {
  cameraId: string;
  count: number;
}

export interface OverviewStats {
  summary: StatsSummary;
  byVehicleClass: VehicleClassCount[];
  byCamera: CameraCount[];
  recentViolations: Violation[];
}
