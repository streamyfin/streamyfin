import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./translations/en.json";
import sv from "./translations/sv.json";
import { getLocales } from "expo-localization";

i18n.use(initReactI18next).init({
  compatibilityJSON: "v3",
  resources: {
    en: { translation: en },
    sv: { translation: sv },
  },

  lng: getLocales()[0].languageCode || "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
