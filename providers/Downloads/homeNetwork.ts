import type { Api } from "@jellyfin/sdk";
import { storage } from "@/utils/mmkv";
import {
  getServerLocalConfig,
  type LocalNetworkConfig,
} from "@/utils/secureCredentials";
import { isHttpUrl } from "@/utils/serverUrl/candidates";

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, "");

/**
 * The home network set up for the signed-in server under Settings → Network,
 * or null while there is none that the app would switch to. The same
 * conditions as `ServerUrlProvider` switching to the local address.
 */
export const homeNetworkConfig = (): LocalNetworkConfig | null => {
  const remoteUrl = storage.getString("serverUrl");
  const config = remoteUrl ? getServerLocalConfig(remoteUrl) : undefined;
  return config?.enabled &&
    isHttpUrl(config.localUrl) &&
    config.homeWifiSSIDs.length > 0
    ? config
    : null;
};

/**
 * Whether the app talks to the server over its local address, which it does
 * only on one of the home Wi-Fi networks. Asked of the api in use rather than
 * of the Wi-Fi name, so a download never starts on the remote address in the
 * moment before the app switches.
 */
export const isOnHomeNetwork = (api: Pick<Api, "basePath">): boolean => {
  const config = homeNetworkConfig();
  return (
    !!config &&
    withoutTrailingSlash(api.basePath) === withoutTrailingSlash(config.localUrl)
  );
};
