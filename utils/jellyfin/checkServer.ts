import type { PublicSystemInfo } from "@jellyfin/sdk/lib/generated-client";
import {
  type CustomHeader,
  normalizeCustomHeaders,
  optionsWithOptionalHeaders,
} from "@/utils/customHeaders";
import {
  getServerCustomHeaders,
  updateServerCustomHeaders,
} from "@/utils/secureCredentials";

/** Thrown when the server answered but is older than Streamyfin supports. */
export class ServerTooOldError extends Error {
  constructor() {
    super("Server too old");
    this.name = "ServerTooOldError";
  }
}

export interface CheckedServer {
  /** The URL that answered, including the protocol that worked. */
  url: string;
  name: string;
}

/** Streamyfin needs 10.10 or newer. Anything unparseable is given the benefit
 * of the doubt — a server that answers but reports an odd version string must
 * not be locked out. */
function isSupportedVersion(version?: string | null): boolean {
  const [major, minor] = (version ?? "").split(".").map(Number);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return true;
  return major > 10 || (major === 10 && minor >= 10);
}

/**
 * Probes a user-entered address for a Jellyfin server, https first, and
 * returns the URL that answered.
 *
 * Custom proxy headers are attached so a server behind Cloudflare Access (or a
 * similar gateway) can be reached at all. Passing `customHeaders` — even as an
 * empty list — means "these are the headers the user just entered": they
 * replace whatever is saved and are persisted once the server answers. Omit it
 * to reuse the headers already stored for the server.
 *
 * @throws ServerTooOldError when the server is reachable but unsupported.
 */
export async function checkJellyfinServer(
  input: string,
  customHeaders?: CustomHeader[],
): Promise<CheckedServer | undefined> {
  const host = input.trim().replace(/^https?:\/\//i, "");

  for (const protocol of ["https", "http"]) {
    const url = `${protocol}://${host}`;
    try {
      const headers = normalizeCustomHeaders(
        customHeaders ?? getServerCustomHeaders(url),
      );
      const response = await fetch(
        `${url}/System/Info/Public`,
        optionsWithOptionalHeaders({ mode: "cors" as const }, headers),
      );
      if (!response.ok) continue;

      const data = (await response.json()) as PublicSystemInfo;
      if (!isSupportedVersion(data.Version)) throw new ServerTooOldError();

      // Only persist the headers once they are known to reach the server.
      if (customHeaders !== undefined) {
        updateServerCustomHeaders(url, customHeaders);
      }
      return { url, name: data.ServerName || "" };
    } catch (e) {
      if (e instanceof ServerTooOldError) throw e;
    }
  }

  return undefined;
}
