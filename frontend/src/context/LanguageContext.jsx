import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import viTranslations from '../locales/vi.json';
import enTranslations from '../locales/en.json';

const translationsMap = {
  vi: viTranslations,
  en: enTranslations
};

const LanguageContext = createContext({
  lang: 'vi',
  setLang: () => {},
  t: (key, values) => key
});

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    return localStorage.getItem('wc_lang') || 'vi';
  });

  const setLang = useCallback((newLang) => {
    const validLang = newLang === 'en' ? 'en' : 'vi';
    setLangState(validLang);
    localStorage.setItem('wc_lang', validLang);
    document.documentElement.lang = validLang;
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback((key, values = {}) => {
    const currentDict = translationsMap[lang] || translationsMap.vi;
    let translation = currentDict[key] ?? translationsMap.en[key] ?? key;

    if (values && typeof values === 'object') {
      Object.entries(values).forEach(([placeholder, val]) => {
        translation = translation.replaceAll(`{${placeholder}}`, String(val ?? ''));
      });
    }

    return translation;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
