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
  environmentLabel: 'LAN tin cậy',
  primaryColor: '#10B981',
  defaultThemeMode: 'dark'
};

const SystemSettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  loading: false,
  updateSettings: async () => { },
  refreshSettings: async () => { }
});

export function SystemSettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const applyPwaBranding = (data) => {
    if (!data) return;
    if (data.appName) {
      document.title = `${data.appName} - ${data.tagline || 'Unified Fleet & LAN Controller'}`;
      const appNameMeta = document.querySelector('meta[name="application-name"]');
      if (appNameMeta) appNameMeta.setAttribute('content', data.appName);
      const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (appleTitleMeta) appleTitleMeta.setAttribute('content', data.appName);
    }

    const iconSrc = data.logoUrl ? data.logoUrl : '/icons/icon-192.png';
    const favicons = document.querySelectorAll("link[rel*='icon']");
    favicons.forEach(el => el.setAttribute('href', iconSrc));

    const appleIcons = document.querySelectorAll("link[rel*='apple-touch-icon']");
    appleIcons.forEach(el => el.setAttribute('href', iconSrc));

    const manifestLink = document.querySelector("link[rel='manifest']");
    if (manifestLink) {
      manifestLink.setAttribute('href', `/manifest.webmanifest?v=${Date.now()}`);
    }
  };

  const fetchSettings = useCallback(async () => {
    try {
      const data = await apiRequest('/api/v1/system/settings');
      if (data && typeof data === 'object') {
        setSettings((prev) => ({ ...prev, ...data }));
        applyPwaBranding(data);
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
      applyPwaBranding(res.settings);
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
