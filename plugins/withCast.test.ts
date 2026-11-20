import {
  CAST_RECEIVER_APP_ID_PLIST_KEY,
  CAST_RECEIVER_APP_ID_STRING,
  castBonjourServices,
} from "./withCast";

// expo/config-plugins pulls in the xcode package, which Jest cannot parse;
// only the pure helpers are under test here, the mods run at prebuild.
jest.mock("expo/config-plugins", () => ({
  AndroidConfig: {
    Strings: { setStringItem: (_items: unknown, xml: unknown) => xml },
  },
  withInfoPlist: (config: unknown) => config,
  withStringsXml: (config: unknown) => config,
}));

test("adds the two Cast Bonjour services once", () => {
  expect(
    castBonjourServices(["_expo._tcp", "_googlecast._tcp"], "F007D354"),
  ).toEqual(["_expo._tcp", "_googlecast._tcp", "_F007D354._googlecast._tcp"]);
});

test("keeps an empty list working", () => {
  expect(castBonjourServices(undefined, "F007D354")).toEqual([
    "_googlecast._tcp",
    "_F007D354._googlecast._tcp",
  ]);
});

test("names the keys the native side reads", () => {
  expect(CAST_RECEIVER_APP_ID_PLIST_KEY).toBe("StreamyfinCastReceiverAppId");
  expect(CAST_RECEIVER_APP_ID_STRING).toBe("streamyfin_cast_receiver_app_id");
});
