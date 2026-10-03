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
    } catch {
      // The session may already be gone; still land on the login page.
    }
    // A full reload drops all in-memory state (query cache, sockets). Do not clear the
    // store first: ProtectedRoute would then also redirect client-side and the two
    // navigations race each other.
    window.location.assign('/login');
  }
}));
