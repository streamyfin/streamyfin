// One `t` for every render, as react-i18next keeps it.
const t = (key: string) => key;
export const identityTranslationModule = {
  useTranslation: () => ({ t }),
};

/**
 * `i18next` for every unit spec, wired in `unitSetup.ts`. Everything reads
 * through to the real singleton, so a spec that calls `init` and
 * `changeLanguage` gets real translations and the live `language`. Until then
 * `t` returns its key, the same as the `react-i18next` mapping: an
 * uninitialized `t` answers `undefined`, which drops every string built
 * outside React. A spec asserting on interpolated values mocks `i18next`
 * itself.
 */
export const identityI18nextModule = () => {
  const actual = jest.requireActual("i18next");
  const instance = actual.default ?? actual;
  const t = (...args: [string, ...unknown[]]) =>
    instance.isInitialized ? instance.t(...args) : args[0];
  const withIdentityT = (target: object) =>
    new Proxy(target, {
      get: (object, prop) =>
        prop === "t" ? t : Reflect.get(object, prop, object),
    });
  return actual.default
    ? withIdentityT({ ...actual, default: withIdentityT(instance) })
    : withIdentityT(instance);
};
