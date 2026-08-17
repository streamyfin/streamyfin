import * as Sentry from "@sentry/react-native";
import { Platform } from "react-native";
import {
  readStoredPluginSettings,
  readStoredSettings,
} from "@/utils/storedSettings";
import { getVersionInfo } from "@/utils/version";

// Public Sentry DSN for org "streamyfin", project "react-native". A DSN only
// allows submitting events, so shipping it in the client bundle is fine.
// EXPO_PUBLIC_SENTRY_DSN overrides it (e.g. to point a fork at its own org).
const SENTRY_DSN =
  process.env.EXPO_PUBLIC_SENTRY_DSN ??
  "https://5c548edf47663532bb529ba72b2ddbb1@o4509610343596032.ingest.de.sentry.io/4509610370728016";

let initialized = false;

/**
 * Reads the crash-report preference straight from MMKV. This runs at app
 * startup, before Jotai hydrates settingsAtom, so it parses the persisted
 * blobs directly instead of going through useSettings. Reporting is on by
 * default; an explicit user opt-out — or a server admin lock — disables it.
 */
const hasSentryConsent = (): boolean => {
  const lock = readStoredPluginSettings().sentryEnabled;
  if (lock?.locked === true) {
    return lock.value === true;
  }
  return readStoredSettings().sentryEnabled !== false;
};

// Media filenames are derived from titles ("Show S01E02.mp4", downloaded
// sidecar subs, poster staging), so any path basename with a media extension
// reveals what the user watches. Replace the basename, keep the extension —
// the container is what makes a decode error debuggable, the title never is.
// Apostrophes stay in the basename class: excluding them punched a hole for
// every title containing one ("Don't Look Up").
const MEDIA_FILENAME_PATTERN =
  /([/\\])([^/\\"\n]+)\.(mp4|mkv|m4v|mov|avi|webm|mpg|mpeg|wmv|flv|m2ts|mts|m3u8|mpd|mp3|m4a|m4b|flac|aac|ogg|oga|opus|wav|wma|srt|ass|ssa|vtt|sub|idx|jpg|jpeg|png|webp|gif|bif|nfo)\b/gi;

// Credential query parameters can appear outside scheme-anchored URLs:
// server-relative paths ("/Videos/{id}/stream?ApiKey=...") and URLs broken by
// an unencoded space escape the URL regexes, so known credential params are
// redacted wherever they occur.
// `userId`/`deviceId` are not credentials, but they identify the person and
// their install across events, so they are redacted alongside the secrets.
const CREDENTIAL_PARAM_PATTERN =
  /([?&](?:api_key|apikey|x-emby-token|access_token|token|userid|deviceid)=)[^&\s"']+/gi;

// Native error strings can embed the private server address without a scheme:
// Android's OkHttp writes "Failed to connect to host/1.2.3.4:8096". Redact the
// known phrases plus any bare IPv4 (LAN servers are usually IPs).
const SCHEMELESS_HOST_PATTERN =
  /((?:failed to connect to|unable to resolve host)[: ]+)[^\s"']+/gi;
const IPV4_PATTERN = /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g;

// Jellyfin/Jellyseerr URLs carry credentials in the query string (api_key=...,
// the WebSocket's ApiKey=...) and the origin reveals the user's private server
// address, so both are scrubbed from everything that leaves the app; the
// request path survives because it's what makes an error debuggable.
const scrubUrl = (value: string): string =>
  value
    .replace(/((?:https?|wss?):\/\/[^\s"'?]+)\?[^\s"']*/g, "$1")
    .replace(/((?:https?|wss?):\/\/)[^/\s"']+/g, "$1[server]")
    .replace(CREDENTIAL_PARAM_PATTERN, "$1[redacted]")
    .replace(SCHEMELESS_HOST_PATTERN, "$1[server]")
    .replace(IPV4_PATTERN, "[ip]")
    .replace(MEDIA_FILENAME_PATTERN, "$1[media].$3");

// URLs can hide anywhere in an event, not just the fields with a `url` name:
// breadcrumbs and extra/contexts carry arbitrary payloads. So every string in
// the outgoing object is scrubbed, however deeply nested. Exported for tests —
// this is the privacy boundary for everything that leaves the app.
export const scrubDeep = (
  value: unknown,
  seen = new WeakSet<object>(),
): unknown => {
  if (typeof value === "string") {
    return scrubUrl(value);
  }
  if (value !== null && typeof value === "object") {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        value[i] = scrubDeep(value[i], seen);
      }
    } else {
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        record[key] = scrubDeep(record[key], seen);
      }
    }
  }
  return value;
};

// Touch and UI-interaction breadcrumbs record which control was tapped, and
// their labels are accessibility labels — on a media card that IS the title.
// They are also behaviour tracking, which this app deliberately doesn't do.
export const isUserInteractionBreadcrumb = (
  breadcrumb: Sentry.Breadcrumb,
): boolean =>
  breadcrumb.type === "user" ||
  breadcrumb.category === "touch" ||
  breadcrumb.category?.startsWith("ui.") === true;

/**
 * sentry-cocoa options that the React Native SDK forwards verbatim (it hands
 * the whole options object to the native SDK) but doesn't declare in its
 * TypeScript surface.
 *
 * These matter because natively-created breadcrumbs and natively-captured
 * events (native crashes, watchdog terminations) are assembled and sent by
 * the native layer — they NEVER pass through the `beforeSend` /
 * `beforeBreadcrumb` scrubbers below. Swizzling is what feeds them: it adds a
 * breadcrumb per NSURLSession request carrying the raw server URL and query
 * string (the user's private domain, and `userId=`), plus UIKit touch and
 * view-controller breadcrumbs. None of that is usable here — tracing is off,
 * and the JS layer already emits its own scrubbed XHR breadcrumbs — so it is
 * disabled at the source rather than filtered after the fact.
 */
const NATIVE_SDK_OPTIONS = {
  enableSwizzling: false,
  enableNetworkBreadcrumbs: false,
} as Partial<Parameters<typeof Sentry.init>[0]>;

const initializeSentry = () => {
  if (initialized || !SENTRY_DSN) return;
  initialized = true;
  try {
    // Build-identity tags so an event can be pinned to an exact source state.
    // `release`/`dist` stay at the SDK's native defaults — overriding them
    // would break the association with the source maps the Expo plugin
    // uploads under those default names.
    const build = getVersionInfo();
    Sentry.init({
      ...NATIVE_SDK_OPTIONS,
      dsn: SENTRY_DSN,
      environment: __DEV__ ? "development" : "production",
      sendDefaultPii: false,
      // Errors only — no performance tracing, session replay or screenshots.
      tracesSampleRate: 0,
      // Console output is unvetted — it interpolates whatever the code logs,
      // including media titles — so it must never become breadcrumbs. App
      // logs still flow via writeToLog's curated messages, and XHR
      // breadcrumbs stay on (their URLs go through the scrubbers).
      integrations: [Sentry.breadcrumbsIntegration({ console: false })],
      initialScope: {
        tags: {
          tv: String(Platform.isTV),
          "build.commit": build.commit ?? "unknown",
          "build.branch": build.branch ?? "unknown",
          "build.profile": build.profile ?? "local",
          "build.run": build.runNumber ?? "none",
        },
      },
      beforeSend: (event) => scrubDeep(event) as typeof event,
      beforeBreadcrumb: (breadcrumb) =>
        isUserInteractionBreadcrumb(breadcrumb)
          ? null
          : (scrubDeep(breadcrumb) as typeof breadcrumb),
    });
  } catch (error) {
    initialized = false;
    console.warn("Failed to initialize Sentry:", error);
  }
};

/** Starts Sentry at app launch, unless the user has opted out. */
export const initializeSentryIfConsented = () => {
  if (hasSentryConsent()) {
    initializeSentry();
  }
};

// Consent changes run strictly in sequence: Sentry.close() tears the native
// SDK down asynchronously, and an init racing ahead of an in-flight close
// (off-then-on double tap) would be shut down by it once it lands.
let lifecycle: Promise<unknown> = Promise.resolve();

/**
 * Applies a consent change at runtime. Enabling starts the SDK; disabling
 * stops it for this session, and the startup gate keeps it off on the next
 * launch.
 */
export const applySentryConsent = (enabled: boolean) => {
  lifecycle = lifecycle
    .then(() => {
      if (enabled) {
        initializeSentry();
      } else if (initialized) {
        initialized = false;
        return Sentry.close();
      }
    })
    .catch((error) => {
      console.warn("Failed to apply Sentry consent change:", error);
    });
};
