/** Builds the Jellyfin WebSocket URL. */
export const getWebSocketUrl = (
  basePath: string,
  accessToken: string,
  deviceId: string,
): string => {
  const url = new URL(basePath);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/socket`;
  url.searchParams.set("ApiKey", accessToken);
  url.searchParams.set("deviceId", deviceId);
  return url.toString();
};
