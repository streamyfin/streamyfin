import { stopReceiverWhenEndingSession } from "./withCastStopReceiverOnEnd";

// expo/config-plugins pulls in the xcode package, which Jest cannot parse;
// only the AppDelegate edit is under test here.
jest.mock("expo/config-plugins", () => ({
  withAppDelegate: (config: unknown) => config,
}));

// What react-native-google-cast 4.9.1's own plugin writes into a Swift
// AppDelegate.
const swiftAppDelegate = [
  "#if canImport(GoogleCast) && os(iOS)",
  '    let receiverAppID = "F007D354"',
  "    let criteria = GCKDiscoveryCriteria(applicationID: receiverAppID)",
  "    let options = GCKCastOptions(discoveryCriteria: criteria)",
  "    options.disableDiscoveryAutostart = false",
  "    options.startDiscoveryAfterFirstTapOnCastButton = true",
  "    options.suspendSessionsWhenBackgrounded = true",
  "    GCKCastContext.setSharedInstanceWith(options)",
  "    GCKCastContext.sharedInstance().useDefaultExpandedMediaControls = true",
  "#endif",
].join("\n");

const objcAppDelegate = [
  "  GCKCastOptions* options = [[GCKCastOptions alloc] initWithDiscoveryCriteria:criteria];",
  "  [GCKCastContext setSharedInstanceWithOptions:options];",
].join("\n");

describe("stopReceiverWhenEndingSession", () => {
  it("has the Swift AppDelegate stop the receiver when a session ends", () => {
    expect(stopReceiverWhenEndingSession(swiftAppDelegate)).toContain(
      [
        "    options.stopReceiverApplicationWhenEndingSession = true",
        "    GCKCastContext.setSharedInstanceWith(options)",
      ].join("\n"),
    );
  });

  it("does the same in an Objective-C AppDelegate", () => {
    expect(stopReceiverWhenEndingSession(objcAppDelegate)).toContain(
      [
        "  options.stopReceiverApplicationWhenEndingSession = YES;",
        "  [GCKCastContext setSharedInstanceWithOptions:options];",
      ].join("\n"),
    );
  });

  it("sets the option once when the plugin runs twice", () => {
    const once = stopReceiverWhenEndingSession(swiftAppDelegate);

    expect(stopReceiverWhenEndingSession(once)).toBe(once);
  });

  it("leaves an AppDelegate without the Cast setup alone", () => {
    const plain = "func application() -> Bool {\n  return true\n}";

    expect(stopReceiverWhenEndingSession(plain)).toBe(plain);
  });
});
