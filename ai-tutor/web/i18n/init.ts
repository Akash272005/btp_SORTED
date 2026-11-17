import i18n, { type Resource } from "i18next";
import { initReactI18next } from "react-i18next";

import enApp from "@/locales/en/app.json";
import hiApp from "@/locales/hi/app.json";

export type AppLanguage = "en" | "hi";

export function normalizeLanguage(lang: unknown): AppLanguage {
  if (!lang) return "en";
  const s = String(lang).toLowerCase();
  if (s === "hi" || s === "hin" || s === "hindi") return "hi";
  if (s === "en" || s === "english") return "en";
  // Legacy Chinese UI locale removed; fall back to English.
  if (s === "zh" || s === "cn" || s === "chinese") return "en";
  return "en";
}

let _initialized = false;

export function initI18n(language?: unknown) {
  if (_initialized) return i18n;

  const resources: Resource = {
    en: { app: enApp },
    hi: { app: hiApp },
  };

  i18n.use(initReactI18next).init({
    resources,
    lng: normalizeLanguage(language),
    fallbackLng: "en",
    // Use a single default namespace to keep lookups simple.
    // We intentionally keep keySeparator disabled so keys like "Generating..." remain valid.
    defaultNS: "app",
    ns: ["app"],
    keySeparator: false,
    interpolation: {
      escapeValue: false,
    },
    returnEmptyString: false,
    returnNull: false,
  });

  _initialized = true;
  return i18n;
}
