import { renderHook } from "@testing-library/react-native";
import { Platform } from "react-native";
import { useAppLanguage } from "./useAppLanguage";

let mockLanguage = "en";
const mockChangeLanguage = jest.fn((language: string) => {
  mockLanguage = language;
  return Promise.resolve();
});
jest.mock("@/i18n", () => ({
  __esModule: true,
  default: {
    get language() {
      return mockLanguage;
    },
    changeLanguage: (language: string) => mockChangeLanguage(language),
    t: (key: string) => key,
  },
}));
const mockChannels = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock("@/utils/notificationChannels", () => ({
  createNotificationChannels: (...args: unknown[]) => mockChannels(...args),
}));
const mockCategories = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock("@/utils/notificationActions", () => ({
  registerNotificationCategories: (...args: unknown[]) =>
    mockCategories(...args),
}));
const mockInvalidate = jest.fn();
jest.mock("@/utils/query/networkAwareInvalidate", () => ({
  invalidateQueriesWhenOnline: (...args: unknown[]) => mockInvalidate(...args),
}));

const queryClient = {} as never;
const notifications = {} as never;
const settled = () => new Promise((resolve) => setImmediate(resolve));

const run = async (language: string, settingsLoaded: boolean) => {
  await renderHook(() =>
    useAppLanguage(language, settingsLoaded, queryClient, notifications),
  );
  await settled();
};

describe("the app's language", () => {
  beforeEach(() => {
    mockLanguage = "en";
    jest.clearAllMocks();
    jest.replaceProperty(Platform, "OS", "android");
    jest.spyOn(Platform, "isTV", "get").mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("waits for the stored settings before anything", async () => {
    await run("fr", false);

    expect(mockChangeLanguage).not.toHaveBeenCalled();
    expect(mockChannels).not.toHaveBeenCalled();
    expect(mockCategories).not.toHaveBeenCalled();
  });

  // i18n starts in the stored language, so the first hydrated run changes
  // nothing, and the channels and buttons were still never named.
  test("names the channels and buttons when it is already the stored one", async () => {
    mockLanguage = "fr";
    await run("fr", true);

    expect(mockChangeLanguage).not.toHaveBeenCalled();
    expect(mockInvalidate).not.toHaveBeenCalled();
    expect(mockChannels).toHaveBeenCalledTimes(1);
    expect(mockCategories).toHaveBeenCalledTimes(1);
  });

  test("follows a new one, refetches what was asked in the old one, and names everything in it", async () => {
    await run("fr", true);

    expect(mockChangeLanguage).toHaveBeenCalledWith("fr");
    expect(mockInvalidate).toHaveBeenCalledWith(queryClient, {});
    expect(mockChannels).toHaveBeenCalledWith(
      notifications,
      expect.any(Function),
    );
    expect(mockCategories).toHaveBeenCalledWith(
      notifications,
      expect.any(Function),
    );
  });

  test("on iOS names the buttons, which have no channel there", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    await run("en", true);

    expect(mockChannels).not.toHaveBeenCalled();
    expect(mockCategories).toHaveBeenCalledTimes(1);
  });

  test("on a TV only follows it, with no notification to name", async () => {
    jest.spyOn(Platform, "isTV", "get").mockReturnValue(true);
    await run("fr", true);

    expect(mockChangeLanguage).toHaveBeenCalledWith("fr");
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
    expect(mockChannels).not.toHaveBeenCalled();
    expect(mockCategories).not.toHaveBeenCalled();
  });
});
