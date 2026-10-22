import { getLocales } from "expo-localization";
import i18next from "i18next";
import {
  getAcceptLanguage,
  resolveAcceptLanguage,
  withAcceptLanguage,
  withAcceptLanguageForUrl,
} from "./acceptLanguage";

jest.mock("expo-localization", () => ({ getLocales: jest.fn() }));

const SERVER = "https://jellyfin.example";

const setDeviceLanguage = (languageTag: string) =>
  jest
    .mocked(getLocales)
    .mockReturnValue([{ languageTag }] as unknown as ReturnType<
      typeof getLocales
    >);

beforeAll(() => i18next.init({ lng: "sv", resources: {} }));
beforeEach(async () => {
  setDeviceLanguage("en-US");
  await i18next.changeLanguage("sv");
});

describe("resolveAcceptLanguage", () => {
  test("asks for the language the app is displayed in", () => {
    expect(resolveAcceptLanguage("sv", () => "en-US")).toBe("sv");
  });

  test("keeps a regional app language whole", () => {
    expect(resolveAcceptLanguage("pt-BR", () => "en-US")).toBe("pt-BR");
  });

  test.each([undefined, null, ""])(
    "falls back to the device locale when the app language is %p",
    (appLanguage) => {
      expect(resolveAcceptLanguage(appLanguage, () => "de-DE")).toBe("de-DE");
    },
  );

  test("does not ask the device when the app has a language", () => {
    const getDeviceLanguage = jest.fn(() => "de-DE");

    resolveAcceptLanguage("sv", getDeviceLanguage);

    expect(getDeviceLanguage).not.toHaveBeenCalled();
  });

  test.each([
    "sv,en;q=0.8",
    "sv, en",
    "sv\r\nX-Injected: 1",
    "sv;q=1",
    "*",
    "s",
  ])("refuses %p, which is not a single language tag", (appLanguage) => {
    // mpv takes its headers as one comma separated list with no escape, so a
    // comma in the value reaches the server as extra, broken header lines.
    // Nothing that is not one plain tag may get through, wherever it came from.
    expect(resolveAcceptLanguage(appLanguage, () => "en-US")).toBe("en-US");
  });

  test("sends nothing when neither is a usable tag", () => {
    expect(resolveAcceptLanguage(undefined, () => null)).toBeUndefined();
    expect(resolveAcceptLanguage("a,b", () => "c,d")).toBeUndefined();
  });
});

describe("getAcceptLanguage", () => {
  test("follows the app language as it changes", async () => {
    expect(getAcceptLanguage()).toBe("sv");

    await i18next.changeLanguage("fr");

    expect(getAcceptLanguage()).toBe("fr");
  });

  test("asks for the device locale when the app language is unusable", async () => {
    await i18next.changeLanguage("a,b");

    expect(getAcceptLanguage()).toBe("en-US");
  });

  test("sends nothing when the device locale is unusable too", async () => {
    setDeviceLanguage("");
    await i18next.changeLanguage("a,b");

    expect(getAcceptLanguage()).toBeUndefined();
  });

  test("sends nothing, and does not throw, when the device reports no locale", async () => {
    // This runs inside the request interceptor: a throw fails the request.
    jest
      .mocked(getLocales)
      .mockReturnValue([] as unknown as ReturnType<typeof getLocales>);
    await i18next.changeLanguage("a,b");

    expect(getAcceptLanguage()).toBeUndefined();
  });
});

describe("withAcceptLanguage", () => {
  test("adds the header next to the ones already there", () => {
    expect(withAcceptLanguage({ "cf-access-client-id": "abc" }, "sv")).toEqual({
      "Accept-Language": "sv",
      "cf-access-client-id": "abc",
    });
  });

  test.each(["Accept-Language", "accept-language", "ACCEPT-LANGUAGE"])(
    "leaves a %s the user configured as a custom header alone",
    (name) => {
      // A plain object holds both spellings at once, and the player and the
      // websocket would then send the header twice.
      const headers = { [name]: "de" };

      expect(withAcceptLanguage(headers, "sv")).toBe(headers);
    },
  );

  test("returns the headers untouched when there is no language to send", () => {
    // Several native APIs behave differently once a `headers` key exists, so
    // nothing may be added when there is nothing to say.
    const headers = {};

    expect(withAcceptLanguage(headers, undefined)).toBe(headers);
  });
});

describe("withAcceptLanguageForUrl", () => {
  test("adds the language to a stream the server serves", () => {
    expect(
      withAcceptLanguageForUrl(
        { Authorization: "token" },
        `${SERVER}/Videos/1/stream.mkv`,
        SERVER,
      ),
    ).toEqual({ "Accept-Language": "sv", Authorization: "token" });
  });

  test.each([
    ["a remote stream", "https://cdn.example/live.m3u8", SERVER],
    ["a downloaded file", "file:///downloads/1.mkv", SERVER],
    ["no stream", undefined, SERVER],
    ["no server", `${SERVER}/Videos/1/stream.mkv`, undefined],
  ])("adds nothing for %s", (_name, url, serverUrl) => {
    // A player sends its headers with every request it makes, to whoever
    // hosts the stream.
    const headers = {};

    expect(withAcceptLanguageForUrl(headers, url, serverUrl)).toBe(headers);
  });
});
