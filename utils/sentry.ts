import * as Sentry from "@sentry/react-native";
import { storage } from "@/utils/mmkv";

// Public Sentry DSN for org "streamyfin", project "react-native". A DSN only
// allows submitting events, so shipping it in the client bundle is fine.
// EXPO_PUBLIC_SENTRY_DSN overrides it (e.g. to point a fork at its own org).
const SENTRY_DSN =
  process.env.EXPO_PUBLIC_SENTRY_DSN ??
  "https://5c548edf47663532bb529ba72b2ddbb1@o4509610343596032.ingest.de.sentry.io/4509610370728016";

let initialized = false;

/**
 * Reads the user's crash-report preference straight from MMKV. This runs at
 * app startup, before Jotai hydrates settingsAtom, so it parses the persisted
 * settings JSON directly instead of going through useSettings. Reporting is
 * on by default; only an explicit opt-out disables it.
 */
const hasSentryConsent = (): boolean => {
  try {
    const json = storage.getString("settings");
    return json ? JSON.parse(json).sentryEnabled !== false : true;
  } catch {
    return true;
  }
};

// Jellyfin/Jellyseerr URLs carry credentials in the query string (api_key=...,
// the WebSocket's ApiKey=...) and the origin reveals the user's private server
// address, so both are scrubbed from everything that leaves the app; the
// request path survives because it's what makes an error debuggable.
const scrubUrl = (value: string): string =>
  value
    .replace(/((?:https?|wss?):\/\/[^\s"'?]+)\?[^\s"']*/g, "$1")
    .replace(/((?:https?|wss?):\/\/)[^/\s"']+/g, "$1[server]");

// URLs can hide anywhere in an event, not just the fields with a `url` name:
// console breadcrumbs keep raw console arguments in data.arguments, and
// extra/contexts carry arbitrary payloads. So every string in the outgoing
// object is scrubbed, however deeply nested.
const scrubDeep = (value: unknown, seen = new WeakSet<object>()): unknown => {
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

const initializeSentry = () => {
  if (initialized || !SENTRY_DSN) return;
  initialized = true;
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: __DEV__ ? "development" : "production",
    sendDefaultPii: false,
    // Errors only — no performance tracing, session replay or screenshots.
    tracesSampleRate: 0,
    beforeSend: (event) => scrubDeep(event) as typeof event,
    beforeBreadcrumb: (breadcrumb) =>
      scrubDeep(breadcrumb) as typeof breadcrumb,
  });
};

/** Starts Sentry at app launch, unless the user has opted out. */
export const initializeSentryIfConsented = () => {
  if (hasSentryConsent()) {
    initializeSentry();
  }
};

/**
 * Applies a consent change at runtime (called from updateSettings when the
 * user flips the crash-report switch). Enabling starts the SDK immediately;
 * disabling stops it for this session, and the startup gate keeps it off on
 * the next launch.
 */
export const applySentryConsent = (enabled: boolean) => {
  if (enabled) {
    initializeSentry();
  } else if (initialized) {
    initialized = false;
    Sentry.close();
  }
};
