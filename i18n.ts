import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import de from "./translations/de.json";
import en from "./translations/en.json";
import es from "./translations/es.json";
import fr from "./translations/fr.json";
import nl from "./translations/nl.json";
import sv from "./translations/sv.json";
import { getLocales } from "expo-localization";

export const APP_LANGUAGES = [
  { label: "Deutsch", value: "de" },
  { label: "English", value: "en" },
  { label: "Español", value: "es" },
  { label: "Français", value: "fr" },
  { label: "Nederlands", value: "nl" },
  { label: "Svenska", value: "sv" },
];

i18n.use(initReactI18next).init({
  compatibilityJSON: "v4",
  resources: {
    de: { translation: de },
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
    nl: { translation: nl },
    sv: { translation: sv },
  },

  lng: getLocales()[0].languageCode || "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
