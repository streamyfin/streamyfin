import type { PublicSystemInfo } from "@jellyfin/sdk/lib/generated-client";
import { escapeRegExp } from "lodash";
import { REDACTED_SERVER } from "@/constants/Sentry";
import {
  type CustomHeader,
  normalizeCustomHeaders,
  optionsWithOptionalHeaders,
} from "@/utils/customHeaders";
import { writeInfoLog, writeToLog } from "@/utils/log";
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

const errorText = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/**
 * The host in an address whose scheme is already off, read the way the
 * probe's URL is built from it: what precedes the path, less any credentials
 * in front and the port behind, and without the brackets of an IPv6 address.
 *
 * Not parseServerInput: that one reads the address for the server URL field,
 * takes `admin@host` for the host and gives up on `user:password@host`, and
 * where the two readings differ the host is not found and stays in the log.
 */
const hostNameOf = (host: string): string => {
  const authority = host.split(/[/\\?#]/)[0];
  return authority
    .slice(authority.lastIndexOf("@") + 1)
    .replace(/:\d*$/, "")
    .replace(/^\[|\]$/g, "");
};

/**
 * What a failed probe says for itself, fit to be a log message.
 *
 * A log message is mirrored into Sentry as a breadcrumb, and the scrubber on
 * the way there (utils/sentry.ts) knows a host by its scheme or as an IPv4
 * address and by nothing else. A platform's network error names the host in
 * words of its own ('Unable to resolve host "…"', "pretending to be “…”"),
 * so the name is taken out here, where it is known. Only the first line is
 * kept: a certificate error goes on to list the names the certificate is
 * for, which are the same server's.
 *
 * @param host The address as it is probed, without its scheme.
 */
function describeProbeFailure(error: unknown, host: string): string {
  const detail = errorText(error).split("\n")[0];
  const hostName = hostNameOf(host);
  return hostName
    ? detail.replace(new RegExp(escapeRegExp(hostName), "gi"), REDACTED_SERVER)
    : detail;
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
  // The address goes with the entry as data, which stays in the log on the
  // device, and not into the message, which is also a Sentry breadcrumb: an
  // address typed without a scheme reads there as it was typed.
  const typed = { address: trimmed };
  writeInfoLog(
    `Server check: probing via ${protocols.join(", ")} (custom headers: ${
      customHeaders === undefined ? "saved" : customHeaders.length
    })`,
    typed,
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
        // WARN, not ERROR: probe failures are routine (http probe against an
        // https-only server, typos, offline) and must not become Sentry
        // events — they stay in the local log and breadcrumb trail.
        writeToLog(
          "WARN",
          `Server check: ${url} answered HTTP ${response.status}`,
        );
        continue;
      }

      const data = (await response.json()) as PublicSystemInfo;
      if (!isSupportedVersion(data.Version)) throw new ServerTooOldError();

      // Only persist the headers once they are known to reach the server.
      if (customHeaders !== undefined) {
        updateServerCustomHeaders(url, customHeaders);
      }
      // The name is the admin's to choose, and is often the host again.
      writeInfoLog(`Server check: ${url} OK — v${data.Version}`, {
        name: data.ServerName,
      });
      return { url, name: data.ServerName || "" };
    } catch (e) {
      if (e instanceof ServerTooOldError) throw e;
      // The error as it came goes with the entry as data: the lines cut
      // from the message are what a user fixing their certificate reads.
      writeToLog(
        "WARN",
        `Server check: ${url} failed — ${
          abort.signal.aborted
            ? `timed out after ${probeTimeoutMs}ms`
            : describeProbeFailure(e, host)
        }`,
        { error: errorText(e) },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  // Environmental (wrong address, server down), not an app defect — local
  // log only.
  writeToLog("WARN", "Server check: no protocol worked", typed);
  return undefined;
}
