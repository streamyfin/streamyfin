import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./translations/ar.json";
import ca from "./translations/ca.json";
import da from "./translations/da.json";
import de from "./translations/de.json";
import en from "./translations/en.json";
import eo from "./translations/eo.json";
import es from "./translations/es.json";
import fi from "./translations/fi.json";
import fr from "./translations/fr.json";
import hu from "./translations/hu.json";
import it from "./translations/it.json";
import ja from "./translations/ja.json";
import nb from "./translations/nb.json";
import nl from "./translations/nl.json";
import nn from "./translations/nn.json";
import pl from "./translations/pl.json";
import ptBR from "./translations/pt-BR.json";
import ro from "./translations/ro.json";
import ru from "./translations/ru.json";
import sq from "./translations/sq.json";
import sv from "./translations/sv.json";
import tlh from "./translations/tlh.json";
import tr from "./translations/tr.json";
import uk from "./translations/uk.json";
import vi from "./translations/vi.json";
import zhCN from "./translations/zh-CN.json";
import zhTW from "./translations/zh-TW.json";

const _APP_LANGUAGES = [
  { label: "Catalan", value: "ca" },
  { label: "العربية", value: "ar" },
  { label: "Dansk", value: "da" },
  { label: "Deutsch", value: "de" },
  { label: "English", value: "en" },
  { label: "Español", value: "es" },
  { label: "Esperanto", value: "eo" },
  { label: "Français", value: "fr" },
  { label: "Italiano", value: "it" },
  { label: "日本語", value: "ja" },
  { label: "Klingon", value: "tlh" },
  { label: "Türkçe", value: "tr" },
  { label: "Magyar", value: "hu" },
  { label: "Nederlands", value: "nl" },
  { label: "Polski", value: "pl" },
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
    da: { translation: da },
    de: { translation: de },
    en: { translation: en },
    es: { translation: es },
    eo: { translation: eo },
    fr: { translation: fr },
    hu: { translation: hu },
    it: { translation: it },
    ja: { translation: ja },
    nl: { translation: nl },
    pl: { translation: pl },
    "pt-BR": { translation: ptBR },
    ro: { translation: ro },
    sv: { translation: sv },
    nb: { translation: nb },
    nn: { translation: nn },
    fi: { translation: fi },
    sq: { translation: sq },
    ru: { translation: ru },
    tr: { translation: tr },
    tlh: { translation: tlh },
    uk: { translation: uk },
    vi: { translation: vi },
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
