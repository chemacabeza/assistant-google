import { create } from 'zustand';
import { api } from '../api/axios';

export const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  
  checkAuth: async () => {
    try {
      const response = await api.get('/api/auth/profile');
      set({ user: response.data, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
  
  logout: async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (e) {
      console.error(e);
    }
    set({ user: null, isAuthenticated: false });
    window.location.href = '/login';
  }
}));
