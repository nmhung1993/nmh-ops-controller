import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../utils/api';

const DEFAULT_SETTINGS = {
  appName: 'NMH Ops',
  appSubtitle: 'Controller',
  tagline: 'Unified Fleet & LAN Controller',
  logoText: 'NMH',
  logoUrl: '',
  ownerSignature: '@nmhung1993',
  timezone: 'Asia/Ho_Chi_Minh',
  environmentLabel: 'LAN tin cậy'
};

const SystemSettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  loading: false,
  updateSettings: async () => {},
  refreshSettings: async () => {}
});

export function SystemSettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await apiRequest('/api/v1/system/settings');
      if (data && typeof data === 'object') {
        setSettings((prev) => ({ ...prev, ...data }));
        if (data.appName) {
          document.title = `${data.appName} - ${data.tagline || 'Unified Fleet & LAN Controller'}`;
        }
      }
    } catch (err) {
      console.warn('Could not load system settings, using defaults:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = async (newSettings) => {
    const res = await apiRequest('/api/v1/system/settings', {
      method: 'PUT',
      body: newSettings
    });
    if (res?.settings) {
      setSettings((prev) => ({ ...prev, ...res.settings }));
      if (res.settings.appName) {
        document.title = `${res.settings.appName} - ${res.settings.tagline || 'Unified Fleet & LAN Controller'}`;
      }
    }
    return res;
  };

  return (
    <SystemSettingsContext.Provider
      value={{
        settings,
        loading,
        updateSettings,
        refreshSettings: fetchSettings
      }}
    >
      {children}
    </SystemSettingsContext.Provider>
  );
}

export function useSystemSettings() {
  return useContext(SystemSettingsContext);
}
