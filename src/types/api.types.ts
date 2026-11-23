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

