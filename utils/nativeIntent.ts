/**
 * The link Android opens the app with when the music notification, or the
 * system media controls, are tapped: react-native-track-player gives it to its
 * media session. Nothing in the app answers to it, yet Expo Router would read
 * its host as a one-word path, which the library route takes as a library id.
 */
const MUSIC_PLAYER_LINK = /^trackplayer:/i;

/**
 * What Expo Router does with a link the system opens the app with
 * (app/+native-intent.ts). A falsy answer leaves the app where it was, or
 * starts it where the launcher would. Covered by utils/nativeIntent.test.ts,
 * and against the app's own routes by utils/appLinking.test.ts.
 */
export const redirectSystemPath = ({
  path,
}: {
  path: string;
  initial: boolean;
}): string | null => {
  // The notification only brings the app back: the player it stands for is
  // the mini player's to open.
  if (MUSIC_PLAYER_LINK.test(path)) return null;
  return path;
};
