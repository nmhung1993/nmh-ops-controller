import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../utils/api';

const AuthContext = createContext({
  token: '',
  user: null,
  isSetupRequired: false,
  isLoading: true,
  login: async () => {},
  setupAdmin: async () => {},
  logout: () => {},
  updateUser: () => {}
});

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('wc_token') || '');
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('wc_user') || 'null');
    } catch {
      return null;
    }
  });
  const [isSetupRequired, setIsSetupRequired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkSetupStatus = useCallback(async () => {
    try {
      const data = await apiRequest('/api/setup/status');
      setIsSetupRequired(Boolean(data.required));
    } catch (error) {
      console.error('Failed to check setup status:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSetupStatus();

    const handleUnauthorized = () => {
      setToken('');
      setUser(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [checkSetupStatus]);

  const login = useCallback(async (username, password) => {
    const data = await apiRequest('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    const sessionUser = {
      username: data.username,
      role: data.role,
      mustChangePassword: Boolean(data.mustChangePassword)
    };

    localStorage.setItem('wc_token', data.token);
    localStorage.setItem('wc_user', JSON.stringify(sessionUser));
    setToken(data.token);
    setUser(sessionUser);
    return sessionUser;
  }, []);

  const setupAdmin = useCallback(async (username, password) => {
    await apiRequest('/api/setup', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    setIsSetupRequired(false);
    return login(username, password);
  }, [login]);

  const logout = useCallback(() => {
    localStorage.removeItem('wc_token');
    localStorage.removeItem('wc_user');
    setToken('');
    setUser(null);
  }, []);

  const updateUser = useCallback((updated) => {
    setUser((prev) => {
      const next = { ...prev, ...updated };
      localStorage.setItem('wc_user', JSON.stringify(next));
      return next;
    });
  }, []);

  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isSetupRequired,
        isLoading,
        isSuperAdmin,
        isAdmin,
        login,
        setupAdmin,
        logout,
        updateUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
