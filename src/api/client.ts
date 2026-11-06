import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { env } from '../config/env';
import { STORAGE_KEYS } from '../config/constants';
import { ApiErrorResponse } from '../types/api.types';

export class ApiError extends Error {
  public statusCode: number;
  public detail?: string;
  public isNetworkError: boolean;

  constructor(message: string, statusCode: number = 500, detail?: string, isNetworkError: boolean = false) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.detail = detail;
    this.isNetworkError = isNetworkError;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export const apiClient = axios.create({
  baseURL: env.apiUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach JWT auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to normalize errors and handle 401s
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      const message = data?.error || error.message || 'An unexpected server error occurred';
      const detail = data?.detail;

      if (status === 401 && typeof window !== 'undefined') {
        // Clear token on authentication failure
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER_DATA);
        window.dispatchEvent(new CustomEvent('vdat:unauthorized'));
      }

      return Promise.reject(new ApiError(message, status, detail));
    }

    if (error.request) {
      return Promise.reject(
        new ApiError(
          'Network error: Unable to connect to VDAT backend server. Please check your network connection.',
          0,
          undefined,
          true
        )
      );
    }

    return Promise.reject(new ApiError(error.message || 'Unknown request configuration error', 500));
  }
);

