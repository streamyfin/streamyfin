import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./translations/en.json";
import fr from "./translations/fr.json";
import sv from "./translations/sv.json";
import { getLocales } from "expo-localization";

export const APP_LANGUAGES = [
  { label: "English", value: "en" },
  { label: "Français", value: "fr" },
  { label: "Svenska", value: "sv" },
];

i18n.use(initReactI18next).init({
  compatibilityJSON: "v4",
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    sv: { translation: sv },
  },

  lng: getLocales()[0].languageCode || "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
