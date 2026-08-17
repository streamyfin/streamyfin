import type { PublicSystemInfo } from "@jellyfin/sdk/lib/generated-client";
import {
  type CustomHeader,
  normalizeCustomHeaders,
  optionsWithOptionalHeaders,
} from "@/utils/customHeaders";
import { writeErrorLog, writeInfoLog } from "@/utils/log";
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

/** LAN probes either answer near-instantly or never; don't let one candidate
 * hang the whole check. */
const PROBE_TIMEOUT_MS = 10_000;

/** Streamyfin needs 10.10 or newer. Anything unparseable is given the benefit
 * of the doubt — a server that answers but reports an odd version string must
 * not be locked out. */
function isSupportedVersion(version?: string | null): boolean {
  const [major, minor] = (version ?? "").split(".").map(Number);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return true;
  return major > 10 || (major === 10 && minor >= 10);
}

/**
 * Probes a user-entered address for a Jellyfin server and returns the URL
 * that answered. An explicitly typed scheme is trusted as-is — a typed
 * `http://` is never upgraded and a typed `https://` never silently
 * downgraded; only schemeless input probes https first, http as fallback.
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
  probeTimeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<CheckedServer | undefined> {
  const trimmed = input.trim();
  const typedScheme = /^(https?):\/\//i.exec(trimmed)?.[1]?.toLowerCase();
  const host = trimmed.replace(/^https?:\/\//i, "");
  const protocols = typedScheme ? [typedScheme] : ["https", "http"];
  writeInfoLog(
    `Server check: input "${input}" -> probing host "${host}" via ${protocols.join(
      ", ",
    )} (custom headers: ${
      customHeaders === undefined ? "saved" : customHeaders.length
    })`,
  );

  for (const protocol of protocols) {
    const url = `${protocol}://${host}`;
    // A dead HTTPS port on a LAN IP can leave the connection hanging instead
    // of refusing it, which would block the http fallback forever.
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), probeTimeoutMs);
    try {
      const headers = normalizeCustomHeaders(
        customHeaders ?? getServerCustomHeaders(url),
      );
      const response = await fetch(
        `${url}/System/Info/Public`,
        optionsWithOptionalHeaders(
          { mode: "cors" as const, signal: abort.signal },
          headers,
        ),
      );
      if (!response.ok) {
        writeErrorLog(`Server check: ${url} answered HTTP ${response.status}`);
        continue;
      }

      const data = (await response.json()) as PublicSystemInfo;
      if (!isSupportedVersion(data.Version)) throw new ServerTooOldError();

      // Only persist the headers once they are known to reach the server.
      if (customHeaders !== undefined) {
        updateServerCustomHeaders(url, customHeaders);
      }
      writeInfoLog(
        `Server check: ${url} OK — "${data.ServerName}" v${data.Version}`,
      );
      return { url, name: data.ServerName || "" };
    } catch (e) {
      if (e instanceof ServerTooOldError) throw e;
      writeErrorLog(
        `Server check: ${url} failed — ${
          abort.signal.aborted
            ? `timed out after ${probeTimeoutMs}ms`
            : e instanceof Error
              ? `${e.name}: ${e.message}`
              : String(e)
        }`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  writeErrorLog(`Server check: no protocol worked for "${host}"`);
  return undefined;
}
