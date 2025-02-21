import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import de from "./translations/de.json";
import en from "./translations/en.json";
import es from "./translations/es.json";
import fr from "./translations/fr.json";
import it from "./translations/it.json";
import ja from "./translations/ja.json";
import nl from "./translations/nl.json";
import sv from "./translations/sv.json";
import zhTW from './translations/zh-TW.json';
import { getLocales } from "expo-localization";

export const APP_LANGUAGES = [
  { label: "Deutsch", value: "de" },
  { label: "English", value: "en" },
  { label: "Español", value: "es" },
  { label: "Français", value: "fr" },
  { label: "Italiano", value: "it" },
  { label: "日本語", value: "ja" },
  { label: "Nederlands", value: "nl" },
  { label: "Svenska", value: "sv" },
  { label: "繁體中文", value: "zh-TW" },
];

i18n.use(initReactI18next).init({
  compatibilityJSON: "v4",
  resources: {
    de: { translation: de },
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
    it: { translation: it },
    ja: { translation: ja },
    nl: { translation: nl },
    sv: { translation: sv },
    "zh-TW": { translation: zhTW },
  },

  lng: getLocales()[0].languageCode || "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
