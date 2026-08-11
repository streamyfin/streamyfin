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
 * Effective settings = app defaults, then the user's stored values, then any
 * admin-**locked** plugin values pinned on top.
 *
 * Unlocked plugin values are deliberately absent. They used to be applied here,
 * guarded by a "did the user diverge from the app default" heuristic — but
 * `updateSettings` backfills every default into storage on the first write, so
 * that heuristic could not tell "the user chose this" from "never touched". Any
 * setting whose plugin value differed from the app default became permanently
 * unchangeable despite being unlocked: the displayed value came from the
 * plugin, so pressing a toggle wrote the value already in storage, and the
 * write was discarded as a no-op.
 */
export const resolveEffectiveSettings = (
  raw: Partial<Settings> | null,
  plugin: PluginLockableSettings | undefined,
  defaults: Settings,
  normalize: NormalizePluginValue,
): Settings => {
  const lockedOverrides: Record<string, unknown> = {};
  for (const [key, setting] of Object.entries(plugin ?? {})) {
    if (!setting?.locked) continue;
    const settingsKey = key as keyof Settings;
    lockedOverrides[key] = normalize(settingsKey, setting.value);
  }
  return { ...defaults, ...raw, ...lockedOverrides } as Settings;
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
