import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./translations/ar-SA.json";
import ca from "./translations/ca-ES.json";
import cs from "./translations/cs-CZ.json";
import da from "./translations/da-DK.json";
import de from "./translations/de-DE.json";
import el from "./translations/el-GR.json";
import en from "./translations/en.json";
import eo from "./translations/eo.json";
import es from "./translations/es-ES.json";
import fi from "./translations/fi-FI.json";
import fr from "./translations/fr-FR.json";
import he from "./translations/he-IL.json";
import hu from "./translations/hu-HU.json";
import it from "./translations/it-IT.json";
import ja from "./translations/ja-JP.json";
import ko from "./translations/ko-KR.json";
import nl from "./translations/nl-NL.json";
import nn from "./translations/nn.json";
import no from "./translations/no-NO.json";
import pl from "./translations/pl-PL.json";
import ptBR from "./translations/pt-BR.json";
import pt from "./translations/pt-PT.json";
import ro from "./translations/ro-RO.json";
import ru from "./translations/ru-RU.json";
import sq from "./translations/sq.json";
import sv from "./translations/sv-SE.json";
import th from "./translations/th-TH.json";
import tlh from "./translations/tlh-AA.json";
import tr from "./translations/tr-TR.json";
import uk from "./translations/uk-UA.json";
import vi from "./translations/vi-VN.json";
import zhCN from "./translations/zh-CN.json";
import zhTW from "./translations/zh-TW.json";

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

i18n.use(initReactI18next).init({
  compatibilityJSON: "v4",
  resources: {
    ca: { translation: ca },
    ar: { translation: ar },
    cs: { translation: cs },
    da: { translation: da },
    de: { translation: de },
    el: { translation: el },
    en: { translation: en },
    es: { translation: es },
    eo: { translation: eo },
    fr: { translation: fr },
    he: { translation: he },
    hu: { translation: hu },
    it: { translation: it },
    ja: { translation: ja },
    ko: { translation: ko },
    nl: { translation: nl },
    pl: { translation: pl },
    pt: { translation: pt },
    "pt-BR": { translation: ptBR },
    ro: { translation: ro },
    sv: { translation: sv },
    // Crowdin ships a single Norwegian catalogue (Bokmål); nn keeps its own file.
    nb: { translation: no },
    no: { translation: no },
    nn: { translation: nn },
    fi: { translation: fi },
    sq: { translation: sq },
    ru: { translation: ru },
    th: { translation: th },
    tr: { translation: tr },
    tlh: { translation: tlh },
    uk: { translation: uk },
    vi: { translation: vi },
    // Devices report the "zh" macrolanguage; default it to Simplified.
    zh: { translation: zhCN },
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
