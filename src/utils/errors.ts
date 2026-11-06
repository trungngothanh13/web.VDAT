import { ApiError } from '../api/client';

/**
 * Extracts a user-facing error message from any caught error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkError) {
      return 'Unable to reach backend service. Please check your connection or server status.';
    }
    if (error.statusCode === 401) {
      return 'Session expired or invalid credentials. Please sign in again.';
    }
    if (error.statusCode === 403) {
      return 'You do not have permission to perform this action.';
    }
    if (error.statusCode === 404) {
      return error.detail || 'The requested resource was not found.';
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'An unexpected error occurred. Please try again.';
}
