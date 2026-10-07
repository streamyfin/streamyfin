/**
 * The address a TV puts in its sign-in QR code: the Quick Connect page of the
 * server's web client, which reads `?code=` and fills the code in. A phone
 * camera alone can finish the pairing there, and the Streamyfin app reads the
 * code back from it to approve it with the phone's own session.
 *
 * The server id, when the TV has it, lets the app tell a TV on another server
 * apart from an expired code without contacting the address in the QR code.
 */
export const quickConnectPairingUrl = (
  serverUrl: string,
  code: string,
  serverId?: string,
) => {
  // The QR code is on screen for anyone in the room to read, so credentials
  // saved in the address (user:password@host) stay out of it.
  let base = serverUrl.replace(/^(https?:\/\/)[^/?#]*@/i, "$1");
  while (base.endsWith("/")) base = base.slice(0, -1);
  const params = [`code=${encodeURIComponent(code)}`];
  if (serverId) params.push(`serverId=${encodeURIComponent(serverId)}`);
  return `${base}/web/#/quickconnect?${params.join("&")}`;
};

export type ScannedPairingCode =
  | {
      kind: "quick-connect";
      serverUrl: string;
      code: string;
      serverId?: string;
    }
  /** What TVs on an older version show: they expect a password over the network. */
  | { kind: "legacy" };

const QUICK_CONNECT_URL =
  /^(https?:\/\/.+?)\/web\/(?:index\.html)?#\/quickconnect\?(.*)$/i;

/** Decodes one query value, or returns undefined for a malformed escape. */
const decodeParam = (value: string | undefined) => {
  if (value === undefined) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

/** Reads a scanned TV sign-in code, or returns null for anything else. */
export const parsePairingCode = (data: string): ScannedPairingCode | null => {
  const match = QUICK_CONNECT_URL.exec(data.trim());
  if (match) {
    const pairs = match[2].split("&").map((pair) => pair.split("="));
    // First match wins, as with URLSearchParams in the web client.
    const param = (name: string) =>
      decodeParam(pairs.find(([key]) => key === name)?.[1]);
    const code = param("code")?.replace(/\s/g, "");
    if (!code) return null;
    const serverId = param("serverId");
    return {
      kind: "quick-connect",
      serverUrl: match[1],
      code,
      ...(serverId ? { serverId } : {}),
    };
  }
  try {
    const parsed = JSON.parse(data);
    if (parsed?.action === "streamyfin-pair") return { kind: "legacy" };
  } catch {
    // Not JSON either.
  }
  return null;
};
