import type { AxiosAdapter } from "axios";
import { DiscoverSliderType } from "@/utils/seerr/types";
import { SeerrApi } from "./useSeerr";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// Ships as ES modules, which Jest does not load, and nothing here toasts.
jest.mock("sonner-native", () => ({ toast: {} }));
// The real log loads Sentry, whose timers keep Jest from exiting.
jest.mock("@/utils/log", () => ({
  writeToLog: (...args: unknown[]) => mockWriteToLog(...args),
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
