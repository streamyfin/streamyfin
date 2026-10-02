/**
 * Stands in for a secret or an identifier in anything the app writes out: the
 * exportable app log, Sentry events, the plugin settings it logs. The iOS
 * player keeps a copy (`redactedPlaceholder` in MPVLayerRenderer.swift), since
 * Swift can't import it.
 */
export const REDACTED_PLACEHOLDER = "[redacted]";
