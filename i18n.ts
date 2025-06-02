import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { getLocales } from "expo-localization";
import de from "./translations/de.json";
import en from "./translations/en.json";
import eo from "./translations/eo.json";
import es from "./translations/es.json";
import fr from "./translations/fr.json";
import it from "./translations/it.json";
import ja from "./translations/ja.json";
import nl from "./translations/nl.json";
import pl from "./translations/pl.json";
import ptBR from "./translations/pt-BR.json";
import sv from "./translations/sv.json";
import nb from "./translations/nb.json";
import nn from "./translations/nn.json";
import ru from "./translations/ru.json";
import tlh from "./translations/tlh.json";
import tr from "./translations/tr.json";
import uk from "./translations/uk.json";
import zhCN from "./translations/zh-CN.json";
import zhTW from "./translations/zh-TW.json";

export const APP_LANGUAGES = [
  { label: "Deutsch", value: "de" },
  { label: "English", value: "en" },
  { label: "Español", value: "es" },
  { label: "Esperanto", value: "eo" },
  { label: "Français", value: "fr" },
  { label: "Italiano", value: "it" },
  { label: "日本語", value: "ja" },
  { label: "Klingon", value: "tlh" },
  { label: "Türkçe", value: "tr" },
  { label: "Nederlands", value: "nl" },
  { label: "Polski", value: "pl" },
  { label: "Português (Brasil)", value: "pt-BR" },
  { label: "Svenska", value: "sv" },
  { label: "Norsk Bokmål", value: "nb" },
  { label: "Norsk Nynorsk", value: "nn" },
  { label: "Русский", value: "ru" },
  { label: "Українська", value: "uk" },
  { label: "Українська", value: "uk" },
  { label: "简体中文", value: "zh-CN" },
  { label: "繁體中文", value: "zh-TW" },
];

i18n.use(initReactI18next).init({
  compatibilityJSON: "v4",
  resources: {
    de: { translation: de },
    en: { translation: en },
    es: { translation: es },
    eo: { translation: eo },
    fr: { translation: fr },
    it: { translation: it },
    ja: { translation: ja },
    nl: { translation: nl },
    pl: { translation: pl },
    "pt-BR": { translation: ptBR },
    sv: { translation: sv },
    nb: { translation: nb },
    nn: { translation: nn },
    ru: { translation: ru },
    tr: { translation: tr },
    tlh: { translation: tlh },
    uk: { translation: uk },
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
