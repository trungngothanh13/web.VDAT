import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth.store';
import { LoginCredentials } from '../types/auth.types';

export function useAuth() {
  const store = useAuthStore();

  useEffect(() => {
    store.initialize();
  }, []);

  return {
    user: store.user,
    token: store.token,
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    error: store.error,
    role: store.user?.role ?? null,
    isAdmin: store.isAdmin(),
    isPolice: store.isPolice(),
    login: (credentials: LoginCredentials) => store.login(credentials),
    logout: () => store.logout(),
    clearError: () => store.clearError(),
    fetchMe: () => store.fetchMe(),
  };
}
