import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { readStoredAppLanguage } from "./utils/storedSettings";

const _APP_LANGUAGES = [
  { label: "Catalan", value: "ca" },
  { label: "Čeština", value: "cs" },
  { label: "العربية", value: "ar" },
  { label: "Dansk", value: "da" },
  { label: "Deutsch", value: "de" },
  { label: "Ελληνικά", value: "el" },
  { label: "English", value: "en" },
  { label: "Español", value: "es" },
  { label: "Esperanto", value: "eo" },
  { label: "Français", value: "fr" },
  { label: "עברית", value: "he" },
  { label: "Italiano", value: "it" },
  { label: "日本語", value: "ja" },
  { label: "한국어", value: "ko" },
  { label: "Klingon", value: "tlh" },
  { label: "Lëtzebuergesch", value: "lb" },
  { label: "Türkçe", value: "tr" },
  { label: "ไทย", value: "th" },
  { label: "Magyar", value: "hu" },
  { label: "Nederlands", value: "nl" },
  { label: "Polski", value: "pl" },
  { label: "Português (Portugal)", value: "pt" },
  { label: "Português (Brasil)", value: "pt-BR" },
  { label: "Română", value: "ro" },
  { label: "Svenska", value: "sv" },
  { label: "Norsk Bokmål", value: "nb" },
  { label: "Norsk Nynorsk", value: "nn" },
  { label: "Suomi", value: "fi" },
  { label: "Shqip", value: "sq" },
  { label: "Русский", value: "ru" },
  { label: "Українська", value: "uk" },
  { label: "简体中文", value: "zh-CN" },
  { label: "繁體中文", value: "zh-TW" },
  { label: "Tiếng Việt", value: "vi" },
].sort((a, b) => a.label.localeCompare(b.label));

export const APP_LANGUAGES = _APP_LANGUAGES;

// A static import evaluates a catalogue at launch whether or not it is shown.
// Metro's inline requires do not help: a default JSON import stays eager. Each
// thunk runs only when i18next asks for that language.
const CATALOGUES: Record<string, () => object> = {
  ca: () => require("./translations/ca-ES.json"),
  ar: () => require("./translations/ar-SA.json"),
  cs: () => require("./translations/cs-CZ.json"),
  da: () => require("./translations/da-DK.json"),
  de: () => require("./translations/de-DE.json"),
  el: () => require("./translations/el-GR.json"),
  en: () => require("./translations/en.json"),
  es: () => require("./translations/es-ES.json"),
  eo: () => require("./translations/eo.json"),
  fr: () => require("./translations/fr-FR.json"),
  he: () => require("./translations/he-IL.json"),
  hu: () => require("./translations/hu-HU.json"),
  it: () => require("./translations/it-IT.json"),
  ja: () => require("./translations/ja-JP.json"),
  ko: () => require("./translations/ko-KR.json"),
  lb: () => require("./translations/lb-LU.json"),
  nl: () => require("./translations/nl-NL.json"),
  pl: () => require("./translations/pl-PL.json"),
  pt: () => require("./translations/pt-PT.json"),
  "pt-BR": () => require("./translations/pt-BR.json"),
  ro: () => require("./translations/ro-RO.json"),
  sv: () => require("./translations/sv-SE.json"),
  // Crowdin ships a single Norwegian catalogue (Bokmål); nn keeps its own file.
  nb: () => require("./translations/no-NO.json"),
  no: () => require("./translations/no-NO.json"),
  nn: () => require("./translations/nn.json"),
  fi: () => require("./translations/fi-FI.json"),
  sq: () => require("./translations/sq.json"),
  ru: () => require("./translations/ru-RU.json"),
  th: () => require("./translations/th-TH.json"),
  tr: () => require("./translations/tr-TR.json"),
  tlh: () => require("./translations/tlh-AA.json"),
  uk: () => require("./translations/uk-UA.json"),
  vi: () => require("./translations/vi-VN.json"),
  // Devices report the "zh" macrolanguage; default it to Simplified.
  zh: () => require("./translations/zh-CN.json"),
  "zh-CN": () => require("./translations/zh-CN.json"),
  "zh-TW": () => require("./translations/zh-TW.json"),
};

// Answers synchronously, so `t()` works as soon as this module has run and
// `changeLanguage` never leaves a render in the previous language. A language
// with no catalogue gets null, which i18next treats as loaded and empty.
const catalogueBackend = {
  type: "backend" as const,
  init() {},
  read(
    lng: string,
    _ns: string,
    callback: (error: null, data: object | null) => void,
  ) {
    callback(null, CATALOGUES[lng]?.() ?? null);
  },
};

i18n
  .use(catalogueBackend)
  .use(initReactI18next)
  .init({
    compatibilityJSON: "v4",
    initAsync: false,

    // The stored language rather than the device's, which the layout effect
    // would only correct after the first requests had gone out in it.
    lng: readStoredAppLanguage() ?? (getLocales()[0].languageCode || "en"),
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
