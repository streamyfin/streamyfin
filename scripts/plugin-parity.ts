/**
 * Says whether a pull request changes a setting the Jellyfin plugin mirrors, so
 * the plugin needs a pull request of its own.
 *
 * The plugin's generator (scripts/app-settings-manifest.js in
 * streamyfin/jellyfin-plugin-streamyfin) reads every setting of a checkout of
 * the app: its type, its default, the other names it is read under and the
 * values it is picked from. This runs it on the PR's base and on the PR and
 * compares the two, so only what the PR itself changes counts: the plugin can
 * lag behind develop, and a PR should not be flagged for that. Each change is
 * then looked up in the plugin's develop, which already has it when the plugin
 * PR landed first.
 *
 *     bun scripts/plugin-parity.ts gather <plugin> <base> <pr> <out>
 *     bun scripts/plugin-parity.ts render <report.json> <out>
 *
 * `gather` runs in plugin-parity.yml, on PR code: it writes what the generator
 * read to <out>/report.json, and the job summary to <out>/summary.md. `render`
 * runs in plugin-parity-comment.yml, from develop: it checks that report, which
 * the PR's run could have written anything into, and writes <out>/label (add,
 * remove or keep) and, when there is something to say, <out>/comment.md. Every
 * value the PR's code can reach lands in a code span, so the comment can only
 * ever say what this file words.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** One setting as the plugin's generator writes it. */
export interface Entry {
  key: string;
  type: string;
  default: unknown;
  hasDefault: boolean;
  noDefaultReason: "none" | "platform" | null;
  wireDefault: unknown;
  wireNote: string | null;
  wireNames?: string[];
  options?: { value: string; label: string }[];
}

/** What the generator made of one checkout. */
export type Outcome = { entries: Entry[] } | { error: string };

/** What `gather` writes and `render` reads. */
export interface Gathered {
  base: Outcome;
  head: Outcome;
  plugin: Entry[];
}

export interface ParityReport {
  /** Null when the PR changes nothing the plugin mirrors. */
  comment: string | null;
  label: "add" | "remove" | "keep";
  summary: string;
}

/** Bumped whenever report.json changes shape: render runs from develop. */
export const REPORT_VERSION = 1;
/** A value longer than this is cut, so one long list cannot fill the comment. */
export const MAX_VALUE_LENGTH = 80;
/** An error longer than this is cut: the start says what stopped the generator. */
export const MAX_ERROR_LENGTH = 500;
/** The values a list gains or loses that are named, the rest only counted. */
export const MAX_LISTED_VALUES = 10;
/** The settings listed under each heading, the rest only counted. */
export const MAX_LISTED_CHANGES = 50;
/** More settings than this in one checkout is not a report of the app's. */
export const MAX_ENTRIES = 1000;

const PLUGIN_REPO = "https://github.com/streamyfin/jellyfin-plugin-streamyfin";
const GUIDE =
  "https://github.com/streamyfin/streamyfin/blob/develop/.github/CONTRIBUTING.md#pull-request-guidelines";
const TITLE = "### 🧩 Plugin parity";
const NO_ACTION = `The author doesn't have to open it: a maintainer will. [Why this check exists](${GUIDE}).`;

interface Change {
  key: string;
  before?: Entry;
  after?: Entry;
  inPlugin: boolean;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** JSON with sorted keys, so two equal entries always read the same. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_, inner: unknown) =>
    isPlainObject(inner)
      ? Object.fromEntries(
          Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : inner,
  ) ?? "undefined";

/**
 * A code span that holds whatever the text has: on one line, since a blank
 * line would end it, cut to `limit`, with a fence longer than any run of
 * backticks in it. Nothing at all is said in words: an empty span is a run of
 * two backticks, which the next two in the line would close.
 */
const code = (text: string, limit = MAX_VALUE_LENGTH) => {
  const line = text.replace(/\s+/g, " ").trim();
  if (line === "") return "(empty)";
  const shown = line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
  const longest = Math.max(
    0,
    ...(shown.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(longest + 1);
  const pad = shown.startsWith("`") || shown.endsWith("`") ? " " : "";
  return `${fence}${pad}${shown}${pad}${fence}`;
};

const describeDefault = (entry: Entry) => {
  if (entry.hasDefault) return code(stable(entry.default));
  return entry.noDefaultReason === "platform"
    ? "depends on the platform"
    : "none";
};

/** `+a −b` for what a list gains and loses. */
const gainedAndLost = (before: string[], after: string[]) => {
  const moved = [
    ...after
      .filter((one) => !before.includes(one))
      .map((one) => `+${code(one)}`),
    ...before
      .filter((one) => !after.includes(one))
      .map((one) => `−${code(one)}`),
  ];
  const rest = moved.length - MAX_LISTED_VALUES;
  return [
    ...moved.slice(0, MAX_LISTED_VALUES),
    ...(rest > 0 ? [`and ${rest} more`] : []),
  ].join(" ");
};

// The fields a change is described by; any other the generator adds later is
// still reported, by name.
const DESCRIBED = new Set([
  "key",
  "type",
  "default",
  "hasDefault",
  "noDefaultReason",
  "wireDefault",
  "wireNote",
  "options",
  "wireNames",
]);

const describeChange = ({ before, after }: Change) => {
  if (!before && after) return `added, default ${describeDefault(after)}`;
  if (!after || !before) return "removed";

  const differs = (...fields: (keyof Entry)[]) =>
    fields.some((field) => stable(before[field]) !== stable(after[field]));
  const parts: string[] = [];

  if (differs("type")) {
    parts.push(`type ${code(before.type)} → ${code(after.type)}`);
  }
  if (differs("default", "hasDefault", "noDefaultReason")) {
    parts.push(
      `default ${describeDefault(before)} → ${describeDefault(after)}`,
    );
  }
  if (differs("wireDefault", "wireNote")) {
    parts.push("how the plugin sends it");
  }
  if (differs("options")) {
    const values = (entry: Entry) =>
      (entry.options ?? []).map((option) => option.value);
    parts.push(
      `options ${gainedAndLost(values(before), values(after)) || "relabelled"}`,
    );
  }
  if (differs("wireNames")) {
    parts.push(
      `other names ${gainedAndLost(before.wireNames ?? [], after.wireNames ?? [])}`,
    );
  }
  const others = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((field) => !DESCRIBED.has(field))
    .filter(
      (field) =>
        stable(before[field as keyof Entry]) !==
        stable(after[field as keyof Entry]),
    );
  for (const field of others.sort()) parts.push(`${code(field)} changed`);

  return parts.join(", ");
};

/** Every setting the PR adds, removes or changes, sorted by key. */
const compare = (base: Entry[], head: Entry[], plugin: Entry[]): Change[] => {
  const byKey = (entries: Entry[]) =>
    new Map(entries.map((entry) => [entry.key, entry]));
  const before = byKey(base);
  const after = byKey(head);
  const declared = byKey(plugin);

  return [...new Set([...before.keys(), ...after.keys()])]
    .sort()
    .flatMap((key) => {
      const was = before.get(key);
      const now = after.get(key);
      if (was && now && stable(was) === stable(now)) return [];
      const inPlugin = declared.get(key);
      return [
        {
          key,
          before: was,
          after: now,
          // A removed setting is covered once the plugin's manifest drops it too.
          inPlugin: now
            ? inPlugin !== undefined && stable(inPlugin) === stable(now)
            : inPlugin === undefined,
        },
      ];
    });
};

const changeList = (title: string, changes: Change[]) => {
  if (changes.length === 0) return [];
  const rest = changes.length - MAX_LISTED_CHANGES;
  return [
    title,
    "",
    ...changes
      .slice(0, MAX_LISTED_CHANGES)
      .map((change) => `- ${code(change.key)}: ${describeChange(change)}`),
    "",
    ...(rest > 0 ? [`And ${rest} more settings.`, ""] : []),
  ];
};

export const parityReport = ({
  base,
  head,
  plugin,
}: Gathered): ParityReport => {
  // Without the base there is nothing to compare the PR with, so whatever an
  // earlier run said stays.
  if ("error" in base) {
    return {
      comment: null,
      label: "keep",
      summary: `${TITLE}\n\nThe plugin's generator cannot read this PR's base, so nothing was compared: ${code(base.error, MAX_ERROR_LENGTH)}\n`,
    };
  }
  if ("error" in head) {
    const comment = [
      TITLE,
      "",
      `The plugin's settings generator cannot read this pull request: ${code(head.error, MAX_ERROR_LENGTH)}`,
      "",
      `Teaching it is a pull request on the [plugin](${PLUGIN_REPO}). ${NO_ACTION}`,
      "",
    ].join("\n");
    return { comment, label: "add", summary: comment };
  }

  const changes = compare(base.entries, head.entries, plugin);
  if (changes.length === 0) {
    return {
      comment: null,
      label: "remove",
      summary: `${TITLE}\n\nNo setting the plugin mirrors changed.\n`,
    };
  }

  const missing = changes.filter((change) => !change.inPlugin);
  const comment = [
    TITLE,
    "",
    missing.length > 0
      ? `This pull request changes settings the [Jellyfin plugin](${PLUGIN_REPO}) mirrors, so the plugin needs a pull request too. ${NO_ACTION}`
      : "This pull request changes settings the Jellyfin plugin mirrors, and the plugin's develop already has every one of them, so no plugin pull request is needed.",
    "",
    ...changeList("Not in the plugin's develop yet:", missing),
    ...changeList(
      "Already in the plugin's develop:",
      changes.filter((change) => change.inPlugin),
    ),
  ].join("\n");
  return {
    comment,
    label: missing.length > 0 ? "add" : "remove",
    summary: comment,
  };
};

/** The part of the plugin's generator this uses. */
export interface Generator {
  buildManifest: (appRoot: string, options: { before: Entry[] }) => Entry[];
}

/**
 * Whatever stops the generator is a result: its own refusals, and a PR that
 * moves a file it reads or breaks one it loads. A contributor can fix neither
 * from here, so neither fails the check.
 */
export const readApp = (
  generator: Generator,
  root: string,
  before: Entry[],
): Outcome => {
  try {
    return { entries: generator.buildManifest(resolve(root), { before }) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

// A key the app could declare. Anything else in a report is not the
// generator's, so a key or a field name is held to it.
const KEY = /^[A-Za-z_$][\w$]{0,99}$/;
const isKey = (value: unknown) => typeof value === "string" && KEY.test(value);

const fail = (where: string, what: string): never => {
  throw new Error(`report.json: ${where} ${what}`);
};

/** Text with something in it: whitespace alone has no code span of its own. */
const isText = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

const isTexts = (value: unknown) => Array.isArray(value) && value.every(isText);

const checkEntries = (value: unknown, where: string): Entry[] => {
  if (!Array.isArray(value)) return fail(where, "is not a list of settings");
  if (value.length > MAX_ENTRIES) {
    return fail(where, `has more than ${MAX_ENTRIES} settings`);
  }
  for (const [index, entry] of (value as unknown[]).entries()) {
    const at = `${where}[${index}]`;
    if (!isPlainObject(entry)) return fail(at, "is not a setting");
    if (!Object.keys(entry).every(isKey)) {
      fail(at, "has a field name the app could not declare");
    }
    if (!isKey(entry.key)) fail(at, "has a key the app could not declare");
    if (!isText(entry.type)) fail(at, "has no type");
    if (typeof entry.hasDefault !== "boolean") fail(at, "has no hasDefault");
    if (![null, "none", "platform"].includes(entry.noDefaultReason as never)) {
      fail(at, "has an unknown noDefaultReason");
    }
    if (entry.wireNote !== null && typeof entry.wireNote !== "string") {
      fail(at, "has a wireNote that is not text");
    }
    if (entry.wireNames !== undefined && !isTexts(entry.wireNames)) {
      fail(at, "has wireNames that are not text");
    }
    if (
      entry.options !== undefined &&
      !(
        Array.isArray(entry.options) &&
        entry.options.every(
          (option: unknown) =>
            isPlainObject(option) &&
            isText(option.value) &&
            isText(option.label),
        )
      )
    ) {
      fail(at, "has options that are not { value, label } text");
    }
  }
  return value as Entry[];
};

const checkOutcome = (value: unknown, where: string): Outcome => {
  if (isPlainObject(value) && "error" in value) {
    return isText(value.error)
      ? { error: value.error }
      : fail(where, "has an error that is not text");
  }
  if (isPlainObject(value) && "entries" in value) {
    return { entries: checkEntries(value.entries, `${where}.entries`) };
  }
  return fail(where, "is neither entries nor an error");
};

/** A report.json as the PR's run wrote it, refused unless it is one `gather` writes. */
export const readReport = (value: unknown): Gathered => {
  if (!isPlainObject(value) || value.version !== REPORT_VERSION) {
    return fail("version", `is not ${REPORT_VERSION}`);
  }
  return {
    base: checkOutcome(value.base, "base"),
    head: checkOutcome(value.head, "head"),
    plugin: checkEntries(value.plugin, "plugin"),
  };
};

const gather = (plugin: string, base: string, head: string, out: string) => {
  const generator = require(
    resolve(plugin, "scripts", "app-settings-manifest.js"),
  ) as Generator;
  const declared = JSON.parse(
    readFileSync(
      resolve(plugin, "Jellyfin.Plugin.Streamyfin", "AppSettingsManifest.json"),
      "utf8",
    ),
  ) as Entry[];

  const gathered: Gathered = {
    base: readApp(generator, base, declared),
    head: readApp(generator, head, declared),
    plugin: declared,
  };
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, "report.json"),
    JSON.stringify({ version: REPORT_VERSION, ...gathered }),
  );
  const { summary } = parityReport(gathered);
  writeFileSync(join(out, "summary.md"), summary);
  console.log(summary);
};

const render = (report: string, out: string) => {
  const { comment, label } = parityReport(
    readReport(JSON.parse(readFileSync(report, "utf8"))),
  );
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "label"), label);
  if (comment) writeFileSync(join(out, "comment.md"), comment);
  console.log(`label: ${label}, comment: ${comment ? "yes" : "none"}`);
};

if (require.main === module) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === "gather" && args.length === 4) {
    const [plugin, base, head, out] = args;
    gather(plugin, base, head, out);
  } else if (mode === "render" && args.length === 2) {
    const [report, out] = args;
    render(report, out);
  } else {
    console.error(
      "Usage: bun scripts/plugin-parity.ts gather <plugin> <base> <pr> <out>\n" +
        "       bun scripts/plugin-parity.ts render <report.json> <out>",
    );
    process.exit(2);
  }
}
