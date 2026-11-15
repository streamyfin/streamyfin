import { identityTranslationModule } from "./i18next";

// Everything but `useTranslation` stays real, so `initReactI18next` and `Trans`
// work in specs that boot i18next. A spec that needs the real `useTranslation`
// mocks `react-i18next` with `@/test-utils/realI18next`.
module.exports = {
  ...jest.requireActual("./realI18next"),
  ...identityTranslationModule,
};
