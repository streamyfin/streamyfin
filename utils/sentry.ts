import * as Sentry from "@sentry/react-native";
import { isAxiosError } from "axios";
import * as Application from "expo-application";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { OFFICIAL_APPLICATION_IDS } from "@/constants/Sentry";
import {
  describeHttpError,
  isAbortLikeError,
  isEnvironmentError,
  isExpectedError,
} from "@/utils/errors";
import {
  readStoredPluginSettings,
  readStoredSettings,
} from "@/utils/storedSettings";
import { getVersionInfo } from "@/utils/version";

// Public Sentry DSN for org "streamyfin", project "react-native". A DSN only
// allows submitting events, so shipping it in the client bundle is fine.
// EXPO_PUBLIC_SENTRY_DSN overrides it (e.g. to point a fork at its own org).
const PROJECT_SENTRY_DSN =
  "https://5c548edf47663532bb529ba72b2ddbb1@o4509610343596032.ingest.de.sentry.io/4509610370728016";
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? PROJECT_SENTRY_DSN;

// Dev builds stay out of Sentry entirely. Their frames carry local absolute
// paths — the developer's username and worktree layout — Metro reloads throw
// errors that no user will ever hit, and the same bug grouped under a handful
// of different local paths fragments into separate issues that then compete
// with real reports. Tagging the environment isn't enough: the event still
// leaves the device and still lands in the project's issue stream.
//
// Set EXPO_PUBLIC_SENTRY_DEBUG=1 to smoke-test the pipeline from a dev build;
// those events report under the "development" environment.
export const sentryDebugInDev = process.env.EXPO_PUBLIC_SENTRY_DEBUG === "1";

export type BuildIdentity = {
  isDev: boolean;
  /** EXPO_PUBLIC_SENTRY_DEBUG=1: the build was made to test the pipeline. */
  debugOverride: boolean;
  /** The bundle identifier or application id the build runs under. */
  applicationId: string | null;
  /** False on a simulator or an emulator, null when it cannot be told. */
  isDevice: boolean | null;
  /** Whether events go to this project, and not to one a fork configured. */
  reportsToProject: boolean;
};

/**
 * Whether a build reports at all. The same reasoning that keeps dev builds
 * out applies to two more kinds of build, which were filing issues under
 * `production` next to the ones from the store:
 * - a simulator or an emulator is somebody trying a build, not a user
 * - a build under another identifier is a fork, or the app re-signed, and
 *   what it runs is not known to be what this repository ships. A fork that
 *   wants crash reports sets EXPO_PUBLIC_SENTRY_DSN, and then reports to its
 *   own project under whatever identifier it likes.
 *
 * An identifier or a device kind that cannot be read counts as official and
 * real: a failed read must not switch reporting off for the store build.
 * Exported for tests.
 */
export const reportsFromBuild = (build: BuildIdentity): boolean => {
  if (build.debugOverride) return true;
  if (build.isDev) return false;
  if (build.isDevice === false) return false;
  if (!build.reportsToProject) return true;
  return (
    build.applicationId === null ||
    OFFICIAL_APPLICATION_IDS.includes(build.applicationId)
  );
};

// Native values are read defensively: deciding whether to report must never
// be what crashes the app at startup.
const readNative = <T>(read: () => T): T | null => {
  try {
    return read() ?? null;
  } catch {
    return null;
  }
};

// Read at call time rather than module scope so the gate is observable in
// tests, which drive __DEV__ per case.
const reportsFromThisBuild = (): boolean =>
  reportsFromBuild({
    isDev: __DEV__,
    debugOverride: sentryDebugInDev,
    applicationId: readNative(() => Application.applicationId),
    isDevice: readNative(() => Device.isDevice),
    reportsToProject: SENTRY_DSN === PROJECT_SENTRY_DSN,
  });

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

// Jellyfin/Seerr URLs carry credentials in the query string (api_key=...,
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
  // "Non fully blocked" hangs are main-thread stalls where some run loop
  // still turns: every event so far was a 2-3s startup stall on a slow
  // device whose stack held only UIApplicationMain/CFRunLoop frames —
  // nothing to act on. Fully blocked hangs keep reporting.
  //
  // The key is spelled as sentry-cocoa reads it (Options+Dictionary.swift),
  // "Blocking", although the events it silences are titled "App Hang Non
  // Fully Blocked". The dictionary initialiser ignores a key it does not
  // know without a word, so the "Blocked" spelling this had first changed
  // nothing and the hangs kept arriving.
  enableReportNonFullyBlockingAppHangs: false,
} as Partial<Parameters<typeof Sentry.init>[0]>;

// The cast library's own hooks (useMediaStatus, useCastDevice, mounted on
// every screen by components/Chromecast.tsx) ask the native side for the
// media status and the device as soon as the session manager names a
// session, with `.then()` and no catch. On Android that includes the session
// the Cast SDK is still trying to resume from the previous launch: it is not
// connected yet, the native side has no session to ask, and it rejects with
// IllegalStateException("No session"). That is an unhandled rejection a few
// seconds after launch which no app code can catch, about a state the hooks
// correct themselves on the next session event.
const CAST_NATIVE_PACKAGE = "com.reactnative.googlecast.";
const CAST_NO_SESSION_MESSAGE = "No session";

const isCastNoSessionRejection = (
  event: Sentry.ErrorEvent,
  cause: unknown,
): boolean => {
  const exceptions = event.exception?.values ?? [];
  // Only the rejection nobody handled. The same error caught at a call site
  // of the app's own (loadMedia, stop) is a failed user action and reports.
  if (!exceptions.some((e) => e.mechanism?.type === "onunhandledrejection")) {
    return false;
  }
  const causeRecord =
    cause !== null && typeof cause === "object"
      ? (cause as { message?: unknown; nativeStackAndroid?: unknown })
      : undefined;
  const saysNoSession =
    causeRecord?.message === CAST_NO_SESSION_MESSAGE ||
    exceptions.some((e) => e.value === CAST_NO_SESSION_MESSAGE);
  if (!saysNoSession) return false;
  const nativeStack = Array.isArray(causeRecord?.nativeStackAndroid)
    ? (causeRecord.nativeStackAndroid as { class?: unknown }[])
    : [];
  return (
    nativeStack.some(
      (frame) =>
        typeof frame?.class === "string" &&
        frame.class.startsWith(CAST_NATIVE_PACKAGE),
    ) ||
    exceptions.some((e) =>
      e.stacktrace?.frames?.some((frame) =>
        frame.module?.startsWith(CAST_NATIVE_PACKAGE),
      ),
    )
  );
};

/**
 * The last line of defence for axios failures that reach Sentry OUTSIDE the
 * explicit capture paths (a floating promise → onunhandledrejection): those
 * events carry no app frames and none of the route identity the data-layer
 * and logAndCaptureError paths attach, so every such failure — any endpoint,
 * any status — regroups into one stackless issue. Apply the same rules here:
 * environment/aborted/expected failures never leave the app, and the rest
 * are fingerprinted by route and status.
 *
 * It is also where a rejection inside a dependency is dropped when no call
 * site of the app's could have caught it. Exported for tests.
 */
export const classifyOutgoingEvent = (
  event: Sentry.ErrorEvent,
  // Structural type: the RN SDK doesn't re-export @sentry/core's EventHint.
  hint: { originalException?: unknown } | undefined,
): Sentry.ErrorEvent | null => {
  const cause = hint?.originalException;
  if (isCastNoSessionRejection(event, cause)) return null;
  if (!isAxiosError(cause)) return event;
  if (
    isAbortLikeError(cause) ||
    isEnvironmentError(cause) ||
    isExpectedError(cause)
  ) {
    return null;
  }
  const http = describeHttpError(cause);
  if (http && !event.fingerprint) {
    event.contexts = { ...event.contexts, http };
    event.fingerprint = [
      "unhandled-http",
      http.method,
      http.path,
      String(http.status),
    ];
  }
  return event;
};

const initializeSentry = () => {
  if (initialized || !SENTRY_DSN || !reportsFromThisBuild()) return;
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
      beforeSend: (event, hint) => {
        const classified = classifyOutgoingEvent(event, hint);
        return classified ? (scrubDeep(classified) as typeof classified) : null;
      },
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
