/**
 * The address a TV puts in its sign-in QR code: the Quick Connect page of the
 * server's web client, which reads `?code=` and fills the code in. A phone
 * camera alone can finish the pairing there, and the Streamyfin app reads the
 * code back from it to approve it with the phone's own session.
 */
export const quickConnectPairingUrl = (serverUrl: string, code: string) => {
  let base = serverUrl;
  while (base.endsWith("/")) base = base.slice(0, -1);
  return `${base}/web/#/quickconnect?code=${encodeURIComponent(code)}`;
};

export type ScannedPairingCode =
  | { kind: "quick-connect"; serverUrl: string; code: string }
  /** What TVs on an older version show: they expect a password over the network. */
  | { kind: "legacy" };

const QUICK_CONNECT_URL =
  /^(https?:\/\/.+?)\/web\/(?:index\.html)?#\/quickconnect\?(.*)$/i;

/** Reads a scanned TV sign-in code, or returns null for anything else. */
export const parsePairingCode = (data: string): ScannedPairingCode | null => {
  const match = QUICK_CONNECT_URL.exec(data.trim());
  if (match) {
    const code = match[2]
      .split("&")
      .map((pair) => pair.split("="))
      .find(([key]) => key === "code")?.[1];
    const cleaned = decodeURIComponent(code ?? "").replace(/\s/g, "");
    if (!cleaned) return null;
    return { kind: "quick-connect", serverUrl: match[1], code: cleaned };
  }
  try {
    const parsed = JSON.parse(data);
    if (parsed?.action === "streamyfin-pair") return { kind: "legacy" };
  } catch {
    // Not JSON either.
  }
  return null;
};
