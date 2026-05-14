import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type AppLanguage = "fr" | "en";

type TranslationKey =
  | "lang.label"
  | "lang.fr"
  | "lang.en"
  | "nav.operations"
  | "nav.pilotage"
  | "nav.system"
  | "nav.dashboard"
  | "nav.leads"
  | "nav.intimuraImport"
  | "nav.salesDispatch"
  | "nav.quotes"
  | "nav.sharedCalendar"
  | "nav.installDispatch"
  | "nav.sectorHeatmap"
  | "nav.salesBoard"
  | "nav.installBoard"
  | "nav.installerProfile"
  | "nav.installerApplications"
  | "nav.representativeApplications"
  | "nav.sectorsPlanning"
  | "nav.usersRoles"
  | "nav.architecture"
  | "layout.simulatedView"
  | "layout.logout"
  | "layout.loading"
  | "reminder.title"
  | "reminder.description"
  | "reminder.cityUndefined"
  | "reminder.lastUpdate"
  | "reminder.toConfirm"
  | "reminder.followup"
  | "reminder.openAndCheck"
  | "roleSwitcher.placeholder";

const TRANSLATIONS: Record<AppLanguage, Record<TranslationKey, string>> = {
  fr: {
    "lang.label": "Langue",
    "lang.fr": "FR",
    "lang.en": "EN",
    "nav.operations": "Operations",
    "nav.pilotage": "Pilotage",
    "nav.system": "Systeme",
    "nav.dashboard": "Tableau de bord",
    "nav.leads": "Leads Intimura",
    "nav.intimuraImport": "Import Intimura",
    "nav.salesDispatch": "Dispatch vendeur",
    "nav.quotes": "Soumissions",
    "nav.sharedCalendar": "Calendrier partage",
    "nav.installDispatch": "Dispatch installation",
    "nav.sectorHeatmap": "Heatmap secteurs",
    "nav.salesBoard": "Tableau ventes",
    "nav.installBoard": "Tableau installation",
    "nav.installerProfile": "Ma fiche sous-traitant",
    "nav.installerApplications": "Applications installateurs",
    "nav.representativeApplications": "Applications representants",
    "nav.sectorsPlanning": "Secteurs et planification",
    "nav.usersRoles": "Utilisateurs et roles",
    "nav.architecture": "Architecture CRM",
    "layout.simulatedView": "Vue simulee",
    "layout.logout": "Se deconnecter",
    "layout.loading": "Chargement...",
    "reminder.title": "Dossiers a mettre a jour",
    "reminder.description": "Ces soumissions ouvertes n'ont pas ete mises a jour depuis plus de 24 h.",
    "reminder.cityUndefined": "Ville non definie",
    "reminder.lastUpdate": "derniere mise a jour",
    "reminder.toConfirm": "a confirmer",
    "reminder.followup": "Relance",
    "reminder.openAndCheck": "Ouvrir et cocher l'etape",
    "roleSwitcher.placeholder": "Choisir un utilisateur",
  },
  en: {
    "lang.label": "Language",
    "lang.fr": "FR",
    "lang.en": "EN",
    "nav.operations": "Operations",
    "nav.pilotage": "Management",
    "nav.system": "System",
    "nav.dashboard": "Dashboard",
    "nav.leads": "Intimura Leads",
    "nav.intimuraImport": "Intimura Import",
    "nav.salesDispatch": "Sales Dispatch",
    "nav.quotes": "Quotes",
    "nav.sharedCalendar": "Shared Calendar",
    "nav.installDispatch": "Installation Dispatch",
    "nav.sectorHeatmap": "Sector Heatmap",
    "nav.salesBoard": "Sales Board",
    "nav.installBoard": "Installation Board",
    "nav.installerProfile": "My subcontractor form",
    "nav.installerApplications": "Installer Applications",
    "nav.representativeApplications": "Representative Applications",
    "nav.sectorsPlanning": "Sectors and Planning",
    "nav.usersRoles": "Users and Roles",
    "nav.architecture": "CRM Architecture",
    "layout.simulatedView": "Simulated view",
    "layout.logout": "Log out",
    "layout.loading": "Loading...",
    "reminder.title": "Files to update",
    "reminder.description": "These open quotes have not been updated for over 24h.",
    "reminder.cityUndefined": "City undefined",
    "reminder.lastUpdate": "last update",
    "reminder.toConfirm": "to confirm",
    "reminder.followup": "Follow-up",
    "reminder.openAndCheck": "Open and check step",
    "roleSwitcher.placeholder": "Select a user",
  },
};

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: TranslationKey) => string;
}

const STORAGE_KEY = "crm-language";
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>("fr");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "fr" || saved === "en") {
      setLanguage(saved);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => {
    return {
      language,
      setLanguage,
      t: (key) => TRANSLATIONS[language][key] ?? key,
    };
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
