import type { AxiosAdapter } from "axios";
import { stubReactNative } from "@/test-utils/reactNative";
import {
  clearSecureStore,
  lockSecureStore,
  storeAsAnEarlierBuildDid,
} from "@/test-utils/secureStore";
import {
  getIntegrationHeaders,
  updateIntegrationHeaderConfig,
} from "@/utils/customHeaders";
import { isExpectedError } from "@/utils/errors";
import { DiscoverSliderType } from "@/utils/seerr/types";
import { SeerrApi } from "./useSeerr";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock(
  "expo-secure-store",
  () => jest.requireActual("@/test-utils/secureStore").secureStoreModule,
);
// Ships as ES modules, which Jest does not load, and nothing here toasts.
jest.mock("sonner-native", () => ({ toast: {} }));
// The real log loads Sentry, whose timers keep Jest from exiting.
jest.mock("@/utils/log", () => ({
  writeToLog: (...args: unknown[]) => mockWriteToLog(...args),
  logAndCaptureError: () => undefined,
}));
// The settings atom imports the screens that edit it; the client reads none.
jest.mock("@/utils/atoms/settings", () => ({ useSettings: () => ({}) }));

const mockWriteToLog = jest.fn();

beforeEach(() => mockWriteToLog.mockClear());

// A Seerr that answers 200 with `body`, as the wire carries it: axios parses
// it, and hands back a string it could not parse as it came.
const answering = (body: string) => {
  const api = new SeerrApi("https://seerr.example");
  const adapter: AxiosAdapter = async (config) => ({
    data: body,
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  });
  api.axios.defaults.adapter = adapter;
  return api;
};

// What stands in front of a Seerr answers in its place, with a 200: a
// proxy's login page, a URL that points at the web app rather than the API.
// The body then reached Discover as the sliders and crashed its render
// (Sentry REACT-NATIVE-8V).
describe("SeerrApi.discoverSettings", () => {
  test("gives the sliders the server sends", async () => {
    const sliders = [
      { id: 1, type: DiscoverSliderType.TRENDING, order: 0, enabled: true },
    ];
    expect(await answering(JSON.stringify(sliders)).discoverSettings()).toEqual(
      sliders,
    );
  });

  test("has no sliders when a page answers in the server's place", async () => {
    expect(
      await answering(
        "<!DOCTYPE html><html><body>Sign in</body></html>",
      ).discoverSettings(),
    ).toEqual([]);
    // Local only: it is the user's setup, and nothing the app can act on.
    expect(mockWriteToLog).toHaveBeenCalledWith(
      "WARN",
      "Seerr discover settings are not a list",
      expect.stringContaining("<!DOCTYPE html>"),
    );
  });

  test("has no sliders when the answer is an object", async () => {
    expect(
      await answering('{"message":"Not found"}').discoverSettings(),
    ).toEqual([]);
  });

  test("has no sliders when the answer is empty", async () => {
    expect(await answering("").discoverSettings()).toEqual([]);
  });
});

// iOS launches the app in the background while the phone is locked, and the
// Keychain refuses the gateway headers until it is unlocked. Sent without
// them, a read is refused by the gateway with a 403, which this client takes
// for the Seerr session being over, and signs the user out of Seerr.
describe("a SeerrApi built while its headers cannot be read", () => {
  beforeEach(() => {
    clearSecureStore();
    stubReactNative();
  });

  const builtOnALockedPhone = () => {
    updateIntegrationHeaderConfig("seerr", {
      source: "custom",
      customHeaders: [{ key: "X-Gateway", value: "secret", enabled: true }],
    });
    storeAsAnEarlierBuildDid();
    lockSecureStore();

    const api = new SeerrApi(
      "https://seerr.example",
      getIntegrationHeaders("seerr"),
    );
    const sent: string[] = [];
    const adapter: AxiosAdapter = async (config) => {
      sent.push(config.url ?? "");
      return { data: [], status: 200, statusText: "OK", headers: {}, config };
    };
    api.axios.defaults.adapter = adapter;
    return { api, sent };
  };

  test("sends nothing", async () => {
    const { api, sent } = builtOnALockedPhone();

    const failure = await api.axios
      .get("/api/v1/auth/me")
      .catch((error: unknown) => error);

    expect(sent).toHaveLength(0);
    expect(failure).toBeInstanceOf(Error);
    expect(isExpectedError(failure)).toBe(true);
  });
});
