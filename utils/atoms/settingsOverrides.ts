/**
 * How admin (Streamyfin plugin) settings combine with the user's own.
 *
 * The rule, in one line: **locked pins a value, unlocked only supplies a
 * default.** An unlocked setting is one the admin left the user free to change,
 * so it may seed storage once and must never win at read time.
 *
 * Kept free of runtime imports (types only) so the policy is unit-testable
 * without dragging in i18n, the settings atom or React.
 */
import type { PluginLockableSettings, Settings } from "./settings";

export type AppliedPluginDefaults = Partial<Record<keyof Settings, unknown>>;

/** Coerce a raw plugin value into the shape a given setting expects. */
export type NormalizePluginValue = (
  key: keyof Settings,
  value: unknown,
) => unknown;

export const hasMeaningfulSettingValue = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== "";

/**
 * Settings an unlocked plugin default must never seed. Crash-report consent
 * can only change by explicit user action (or an admin lock): the intro sheet
 * is the opt-out surface and it is available before the first plugin sync
 * happens at login, so a deferred seed would silently re-enable reporting
 * over the user's explicit opt-out.
 */
const NEVER_SEED_KEYS: ReadonlySet<keyof Settings> = new Set(["sentryEnabled"]);

/**
 * Effective settings, in precedence order:
 *
 *   app defaults → unlocked plugin values (fallback only) → the user's stored
 *   values → admin-**locked** plugin values (pinned on top)
 *
 * An unlocked plugin value may only *fill a gap*. It applies when the user has
 * nothing meaningful of their own for that key — an admin-supplied server URL
 * has to work before the user has ever touched it — but it must never win over
 * a value the user holds, or the setting is unlocked in name only.
 *
 * The rule used to be "unlocked wins unless the user diverged from the app
 * default", which could not work: `updateSettings` backfills every default into
 * storage on the first write, so it could not tell "the user chose this" from
 * "never touched". Any setting whose plugin value differed from the app default
 * became permanently unchangeable — the displayed value came from the plugin,
 * so pressing a toggle wrote the value already in storage and the write was
 * discarded as a no-op.
 *
 * Briefly it was "unlocked never applies at read time", which broke the other
 * way: a plugin-supplied value was invisible until a plugin refresh seeded it,
 * so the Streamystats watchlists tab disappeared after a reload.
 */
export const resolveEffectiveSettings = (
  raw: Partial<Settings> | null,
  plugin: PluginLockableSettings | undefined,
  defaults: Settings,
  normalize: NormalizePluginValue,
): Settings => {
  const merged = { ...defaults, ...raw } as Record<string, unknown>;
  const unlockedFallbacks: Record<string, unknown> = {};
  const lockedOverrides: Record<string, unknown> = {};

  for (const [key, setting] of Object.entries(plugin ?? {})) {
    if (!setting) continue;
    const settingsKey = key as keyof Settings;
    const value = normalize(settingsKey, setting.value);

    if (setting.locked) {
      lockedOverrides[key] = value;
    } else if (
      !hasMeaningfulSettingValue(merged[key]) &&
      hasMeaningfulSettingValue(value)
    ) {
      unlockedFallbacks[key] = value;
    }
  }

  return { ...merged, ...unlockedFallbacks, ...lockedOverrides } as Settings;
};

/**
 * Unlocked plugin values that still need seeding into user storage.
 *
 * Seeded once per distinct admin default: `applied` records what was last
 * written, so re-running this is a no-op and a user's later change is never
 * reverted — while an admin *changing* the default does propagate.
 */
export const pendingPluginDefaults = (
  plugin: PluginLockableSettings | undefined,
  applied: AppliedPluginDefaults,
  normalize: NormalizePluginValue,
): Partial<Settings> => {
  const pending: Record<string, unknown> = {};
  for (const [key, setting] of Object.entries(plugin ?? {})) {
    if (!setting || setting.locked) continue;
    const settingsKey = key as keyof Settings;
    if (NEVER_SEED_KEYS.has(settingsKey)) continue;
    const value = normalize(settingsKey, setting.value);
    if (!hasMeaningfulSettingValue(value)) continue;
    // Structural compare: object-typed settings ({ key, value }) are rebuilt by
    // normalize on every call, so reference equality would re-seed forever.
    if (JSON.stringify(applied[settingsKey]) === JSON.stringify(value)) {
      continue;
    }
    pending[key] = value;
  }
  return pending as Partial<Settings>;
};

/**
 * The overlay a plugin refresh should write, computed against the user's
 * CURRENT settings, plus the applied-defaults record to persist (null when no
 * seed happened, so a streamystats-only refresh leaves the record alone and
 * the seed decision is retried on the next one).
 *
 * The refresh runs while the user can be changing settings — the intro sheet
 * is up during first-run login — so the caller must evaluate this inside the
 * settings write rather than merging against a render-time snapshot. Building
 * the merge from the snapshot instead resurrected whatever the user had just
 * overwritten when the refresh's fetch resolved after their toggle.
 */
export const pluginRefreshOverlay = (
  current: Partial<Settings>,
  plugin: PluginLockableSettings | undefined,
  applied: AppliedPluginDefaults,
  normalize: NormalizePluginValue,
): {
  overlay: Partial<Settings>;
  applied: AppliedPluginDefaults | null;
} | null => {
  const pending = pendingPluginDefaults(plugin, applied, normalize);
  const enableStreamystats =
    !!plugin?.streamyStatsServerUrl?.value &&
    current.searchEngine !== "Streamystats";
  if (Object.keys(pending).length === 0 && !enableStreamystats) {
    return null;
  }
  return {
    overlay: {
      ...pending,
      ...(enableStreamystats ? { searchEngine: "Streamystats" } : {}),
    },
    applied:
      Object.keys(pending).length > 0 ? { ...applied, ...pending } : null,
  };
};
