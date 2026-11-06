import { create } from 'zustand';
import { User, LoginCredentials } from '../types/auth.types';
import { authApi } from '../api/auth.api';
import { STORAGE_KEYS } from '../config/constants';

interface AuthStoreState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => void;
  login: (credentials: LoginCredentials) => Promise<User>;
  logout: () => void;
  fetchMe: () => Promise<User | null>;
  clearError: () => void;

  // Role helper getters
  isAdmin: () => boolean;
  isPolice: () => boolean;
}

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  initialize: () => {
    if (typeof window === 'undefined') return;

    const storedToken = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    const storedUserJson = localStorage.getItem(STORAGE_KEYS.USER_DATA);

    if (storedToken && storedUserJson) {
      try {
        const user = JSON.parse(storedUserJson) as User;
        set({
          token: storedToken,
          user,
          isAuthenticated: true,
          error: null,
        });
      } catch {
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER_DATA);
      }
    }

    // Listen for global 401 unauthorized events from API client
    window.addEventListener('vdat:unauthorized', () => {
      get().logout();
    });
  },

  login: async (credentials: LoginCredentials) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(credentials);
      const { token, user } = response;

      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
        localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
      }

      set({
        token,
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      return user;
    } catch (err: any) {
      const message = err.message || 'Login failed';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER_DATA);
    }
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },

  fetchMe: async () => {
    if (!get().token) return null;
    try {
      const { user } = await authApi.getMe();
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
      }
      set({ user, isAuthenticated: true });
      return user;
    } catch {
      get().logout();
      return null;
    }
  },

  clearError: () => set({ error: null }),

  isAdmin: () => get().user?.role === 'ADMIN',
  isPolice: () => get().user?.role === 'POLICE' || get().user?.role === 'ADMIN',
}));

