import { clearMmkv } from "@/test-utils/mmkv";
import { storage } from "@/utils/mmkv";
import {
  PLUGIN_SETTINGS_KEY,
  readStoredAppLanguage,
  SETTINGS_KEY,
} from "./storedSettings";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// The log module reaches Sentry, whose client keeps a timer running past the
// last test.
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));

const store = (settings?: object, pluginSettings?: object) => {
  if (settings) storage.set(SETTINGS_KEY, JSON.stringify(settings));
  if (pluginSettings) {
    storage.set(PLUGIN_SETTINGS_KEY, JSON.stringify(pluginSettings));
  }
};

beforeEach(clearMmkv);

// What i18n starts in, before the settings atoms hydrate: the first requests
// of a cold start tell the server which language to answer in.
describe("readStoredAppLanguage", () => {
  test("is the language the user picked", () => {
    store({ preferedLanguage: "sv" });

    expect(readStoredAppLanguage()).toBe("sv");
  });

  test("is nothing on a first launch, so the device language applies", () => {
    expect(readStoredAppLanguage()).toBeUndefined();
  });

  test("is nothing when the app follows the system", () => {
    store({ preferedLanguage: undefined, otherSetting: true });

    expect(readStoredAppLanguage()).toBeUndefined();
  });

  test("is the plugin's language when the admin locked it", () => {
    store(
      { preferedLanguage: "sv" },
      { preferedLanguage: { locked: true, value: "de" } },
    );

    expect(readStoredAppLanguage()).toBe("de");
  });

  test("keeps the user's pick over an unlocked plugin default", () => {
    store(
      { preferedLanguage: "sv" },
      { preferedLanguage: { locked: false, value: "de" } },
    );

    expect(readStoredAppLanguage()).toBe("sv");
  });

  test("is the plugin's default when the user picked nothing", () => {
    store({}, { preferedLanguage: { locked: false, value: "de" } });

    expect(readStoredAppLanguage()).toBe("de");
  });

  test.each([42, null, "", { value: "sv" }])(
    "ignores a stored %p, which is not a language",
    (preferedLanguage) => {
      store({ preferedLanguage });

      expect(readStoredAppLanguage()).toBeUndefined();
    },
  );

  test("survives a settings blob that does not parse", () => {
    storage.set(SETTINGS_KEY, "{not json");

    expect(readStoredAppLanguage()).toBeUndefined();
  });
});
