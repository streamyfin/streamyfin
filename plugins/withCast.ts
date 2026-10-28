import {
  AndroidConfig,
  type ConfigPlugin,
  withInfoPlist,
  withStringsXml,
} from "expo/config-plugins";

/**
 * The Cast SDK is configured by the native module (the Cast support of
 * modules/mpv-player), which reads the receiver id at launch: from the
 * Info.plist key below on iOS, from the string resource below on Android.
 * This plugin writes those, plus the Bonjour services iOS requires before an
 * app may browse the local network for Cast devices. Session options, the
 * options provider and the notification live in the module, not here.
 * NSLocalNetworkUsageDescription is declared in app.json for the Jellyfin
 * server already and covers Cast discovery too.
 */
export const CAST_RECEIVER_APP_ID_PLIST_KEY = "StreamyfinCastReceiverAppId";
export const CAST_RECEIVER_APP_ID_STRING = "streamyfin_cast_receiver_app_id";

export interface WithCastOptions {
  /** The Cast receiver application id, Jellyfin's own receiver by default. */
  receiverAppId: string;
}

/** The Bonjour services with the two Cast ones added once, existing order kept. */
export const castBonjourServices = (
  existing: string[] | undefined,
  receiverAppId: string,
): string[] => [
  ...new Set([
    ...(existing ?? []),
    "_googlecast._tcp",
    `_${receiverAppId}._googlecast._tcp`,
  ]),
];

const withCast: ConfigPlugin<WithCastOptions> = (config, { receiverAppId }) => {
  config = withInfoPlist(config, (plist) => {
    plist.modResults.NSBonjourServices = castBonjourServices(
      plist.modResults.NSBonjourServices as string[] | undefined,
      receiverAppId,
    );
    plist.modResults[CAST_RECEIVER_APP_ID_PLIST_KEY] = receiverAppId;
    return plist;
  });

  return withStringsXml(config, (strings) => {
    strings.modResults = AndroidConfig.Strings.setStringItem(
      [
        {
          $: { name: CAST_RECEIVER_APP_ID_STRING, translatable: "false" },
          _: receiverAppId,
        },
      ],
      strings.modResults,
    );
    return strings;
  });
};

export default withCast;
