export interface ApiErrorResponse {
  error: string;
  detail?: string;
  statusCode?: number;
}

export interface HealthCheckResponse {
  status: 'UP' | 'DOWN';
  service: string;
  timestamp: string;
}

export interface EvidenceUploadResponse {
  message: string;
  fileUrl: string;
  filename: string;
  linkedViolation: string | null;
}
