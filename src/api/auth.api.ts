import { apiClient } from './client';
import { LoginCredentials, LoginResponse, User } from '../types/auth.types';
import { HealthCheckResponse } from '../types/api.types';

export const authApi = {
  /**
   * Authenticate user with email and password
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const { data } = await apiClient.post<LoginResponse>('/api/auth/login', credentials);
    return data;
  },

  /**
   * Fetch current authenticated user's profile
   */
  async getMe(): Promise<{ user: User }> {
    const { data } = await apiClient.get<{ user: User }>('/api/auth/me');
    return data;
  },

  /**
   * Service health check
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const { data } = await apiClient.get<HealthCheckResponse>('/health');
    return data;
  },
};

