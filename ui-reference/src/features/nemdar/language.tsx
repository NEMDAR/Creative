import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
export type Language = 'en' | 'ar';
const LanguageContext = createContext<{ language: Language; setLanguage: (value: Language) => void }>({ language: 'en', setLanguage: () => {} });
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('en');
  const [ready, setReady] = useState(false);
  useEffect(() => { const stored = window.localStorage.getItem('nemdar-language'); if (stored === 'ar') setLanguage('ar'); setReady(true); }, []);
  useEffect(() => { if (!ready) return; document.documentElement.lang = language; document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'; window.localStorage.setItem('nemdar-language', language); }, [language, ready]);
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}
export function useLanguage() { return useContext(LanguageContext); }
export function LanguageSwitch() {
 const { language, setLanguage } = useLanguage();
 return <div role="group" aria-label="Language and direction" className="inline-flex shrink-0 rounded-lg border border-border bg-card p-0.5" dir="ltr"><Button size="sm" variant={language === 'en' ? 'secondary' : 'ghost'} aria-pressed={language === 'en'} onClick={() => setLanguage('en')} className="h-7 px-2 text-[11px]">EN</Button><Button size="sm" variant={language === 'ar' ? 'secondary' : 'ghost'} aria-pressed={language === 'ar'} onClick={() => setLanguage('ar')} className="h-7 px-2 text-[11px]">AR</Button></div>;
}