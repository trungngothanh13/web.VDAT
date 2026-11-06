export type ViolationStatus = 'PENDING_REVIEW' | 'CONFIRMED' | 'DISMISSED';

export type VehicleClass = 'motorcycle' | 'car' | 'truck' | 'bus' | string;

export type BoundingBox = [number, number, number, number]; // [x1, y1, x2, y2]

export interface ViolationCameraInfo {
  id: string;
  name: string;
  location?: string;
}

export interface ViolationReviewerInfo {
  id: string;
  fullName: string;
  email?: string;
}

export interface Violation {
  id: string;
  cameraId: string;
  camera?: ViolationCameraInfo;
  trackId: number;
  vehicleClass: VehicleClass;
  classId: number;
  frameNumber: number;
  timestamp: string; // e.g. "19.97s"
  lightState: string; // "red"
  bbox: BoundingBox;
  confidence?: number | null;
  snapshotUrl?: string | null;
  evidenceClipUrl?: string | null;
  status: ViolationStatus;
  reviewedById?: string | null;
  reviewedBy?: ViolationReviewerInfo | null;
  reviewedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ViolationQueryParams {
  page?: number;
  limit?: number;
  cameraId?: string;
  status?: ViolationStatus;
  vehicleClass?: string;
  startDate?: string;
  endDate?: string;
}

export interface ViolationPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedViolations {
  data: Violation[];
  pagination: ViolationPagination;
}

export interface UpdateViolationStatusPayload {
  status: 'CONFIRMED' | 'DISMISSED';
  notes?: string;
}
