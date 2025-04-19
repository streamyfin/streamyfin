import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { getLocales } from "expo-localization";
import da from "./translations/da.json";
import de from "./translations/de.json";
import en from "./translations/en.json";
import es from "./translations/es.json";
import fr from "./translations/fr.json";
import it from "./translations/it.json";
import ja from "./translations/ja.json";
import nl from "./translations/nl.json";
import pl from "./translations/pl.json";
import ptBR from "./translations/pt-BR.json";
import ru from "./translations/ru.json";
import sq from "./translations/sq.json";
import sv from "./translations/sv.json";
import tr from "./translations/tr.json";
import ua from "./translations/ua.json";
import zhCN from "./translations/zh-CN.json";
import zhTW from "./translations/zh-TW.json";

export const APP_LANGUAGES = [
  { label: "Dansk", value: "da" },
  { label: "Deutsch", value: "de" },
  { label: "English", value: "en" },
  { label: "Español", value: "es" },
  { label: "Français", value: "fr" },
  { label: "Italiano", value: "it" },
  { label: "日本語", value: "ja" },
  { label: "Türkçe", value: "tr" },
  { label: "Nederlands", value: "nl" },
  { label: "Polski", value: "pl" },
  { label: "Português (Brasil)", value: "pt-BR" },
  { label: "Svenska", value: "sv" },
  { label: "Shqip", value: "sq" },
  { label: "Русский", value: "ru" },
  { label: "Українська", value: "ua" },
  { label: "简体中文", value: "zh-CN" },
  { label: "繁體中文", value: "zh-TW" },
];

i18n.use(initReactI18next).init({
  compatibilityJSON: "v4",
  resources: {
    da: { translation: da },
    de: { translation: de },
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
    it: { translation: it },
    ja: { translation: ja },
    nl: { translation: nl },
    pl: { translation: pl },
    "pt-BR": { translation: ptBR },
    sv: { translation: sv },
    sq: { translation: sq },
    ru: { translation: ru },
    tr: { translation: tr },
    ua: { translation: ua },
    "zh-CN": { translation: zhCN },
    "zh-TW": { translation: zhTW },
  },

  lng: getLocales()[0].languageCode || "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
