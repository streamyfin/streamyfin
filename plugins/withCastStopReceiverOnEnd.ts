import { type ConfigPlugin, withAppDelegate } from "expo/config-plugins";

// On iOS a Cast session that ends only disconnects the phone unless the cast
// options say to stop the receiver app, which they do not by default, so
// "Stop casting" left the TV playing. Android stops the receiver there, and
// JellyfinCastStopReporter takes a session that ended without an error for a
// closed receiver and reports its stop to the server at once. iOS has to stop
// the receiver too, or the dashboard shows the cast stopped while it plays.
const SWIFT_SETUP = /^(\s*)GCKCastContext\.setSharedInstanceWith\(options\)/m;
const OBJC_SETUP =
  /^(\s*)\[GCKCastContext setSharedInstanceWithOptions:options\];/m;

/**
 * The AppDelegate with the receiver stopped when a session ends, after the
 * cast options react-native-google-cast's own plugin writes there.
 */
export const stopReceiverWhenEndingSession = (contents: string): string => {
  if (contents.includes("stopReceiverApplicationWhenEndingSession")) {
    return contents;
  }
  if (SWIFT_SETUP.test(contents)) {
    return contents.replace(
      SWIFT_SETUP,
      (line, indent: string) =>
        `${indent}options.stopReceiverApplicationWhenEndingSession = true\n${line}`,
    );
  }
  return contents.replace(
    OBJC_SETUP,
    (line, indent: string) =>
      `${indent}options.stopReceiverApplicationWhenEndingSession = YES;\n${line}`,
  );
};

const withCastStopReceiverOnEnd: ConfigPlugin = (config) =>
  withAppDelegate(config, (delegate) => {
    delegate.modResults.contents = stopReceiverWhenEndingSession(
      delegate.modResults.contents,
    );
    return delegate;
  });

export default withCastStopReceiverOnEnd;
