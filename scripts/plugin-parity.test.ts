import {
  type Entry,
  type Generator,
  MAX_ERROR_LENGTH,
  MAX_LISTED_CHANGES,
  MAX_LISTED_VALUES,
  MAX_VALUE_LENGTH,
  type Outcome,
  parityReport,
  readApp,
  readReport,
} from "./plugin-parity";

const setting = (key: string, overrides: Partial<Entry> = {}): Entry => ({
  key,
  type: "number",
  default: 1,
  hasDefault: true,
  noDefaultReason: null,
  wireDefault: null,
  wireNote: null,
  ...overrides,
});

const read = (...entries: Entry[]): Outcome => ({ entries });

const SPEED = setting("defaultPlaybackSpeed");
const RATIO = setting("autoBitrateRatio", { default: 0.8 });

const NOT_YET = "Not in the plugin's develop yet:";
const ALREADY = "Already in the plugin's develop:";

describe("parityReport", () => {
  it("stays silent and clears the label when no setting changed", () => {
    const report = parityReport({
      base: read(SPEED),
      head: read(SPEED),
      plugin: [SPEED],
    });

    expect(report.comment).toBeNull();
    expect(report.label).toBe("remove");
    expect(report.summary).toContain("No setting the plugin mirrors changed");
  });

  it.each([
    [
      "an added setting",
      read(SPEED),
      read(SPEED, RATIO),
      [SPEED],
      "- `autoBitrateRatio`: added, default `0.8`",
    ],
    [
      "a removed setting the plugin still declares",
      read(SPEED, RATIO),
      read(SPEED),
      [SPEED, RATIO],
      "- `autoBitrateRatio`: removed",
    ],
    [
      "a changed default",
      read(SPEED),
      read(setting("defaultPlaybackSpeed", { default: 1.5 })),
      [SPEED],
      "- `defaultPlaybackSpeed`: default `1` → `1.5`",
    ],
  ])("asks for a plugin PR for %s", (_, base, head, plugin, line) => {
    const report = parityReport({ base, head, plugin });

    expect(report.label).toBe("add");
    expect(report.comment).toContain(`${NOT_YET}\n\n${line}\n`);
    expect(report.comment).toContain("needs a pull request too");
    expect(report.comment).not.toContain(ALREADY);
  });

  // The plugin PR can land first; the app PR is then already covered.
  it("lists a change the plugin's develop already has, without the label", () => {
    const report = parityReport({
      base: read(SPEED),
      head: read(SPEED, RATIO),
      plugin: [SPEED, RATIO],
    });

    expect(report.label).toBe("remove");
    expect(report.comment).toContain(
      `${ALREADY}\n\n- \`autoBitrateRatio\`: added, default \`0.8\`\n`,
    );
    expect(report.comment).not.toContain(NOT_YET);
    expect(report.comment).toContain("already has every one");
  });

  it("says when a default stops being one, or depends on the platform", () => {
    const report = parityReport({
      base: read(SPEED, RATIO),
      head: read(
        setting("defaultPlaybackSpeed", {
          default: null,
          hasDefault: false,
          noDefaultReason: "none",
        }),
        setting("autoBitrateRatio", {
          default: null,
          hasDefault: false,
          noDefaultReason: "platform",
        }),
      ),
      plugin: [SPEED, RATIO],
    });

    expect(report.comment).toContain(
      "- `autoBitrateRatio`: default `0.8` → depends on the platform\n",
    );
    expect(report.comment).toContain(
      "- `defaultPlaybackSpeed`: default `1` → none\n",
    );
  });

  it("names the values a list gains and loses, and the other names it is read under", () => {
    const language = (values: string[], wireNames?: string[]) =>
      setting("preferedLanguage", {
        type: "string",
        default: null,
        hasDefault: false,
        noDefaultReason: "none",
        options: values.map((value) => ({ value, label: value })),
        ...(wireNames ? { wireNames } : {}),
      });

    const report = parityReport({
      base: read(language(["de", "en", "xx"], ["appLanguage"])),
      head: read(language(["de", "en", "fr"])),
      plugin: [],
    });

    expect(report.comment).toContain(
      "- `preferedLanguage`: options +`fr` −`xx`, other names −`appLanguage`\n",
    );
  });

  // The error is the one thing to act on, so it is quoted whole, however long.
  it("asks for a plugin PR when the generator cannot read the PR, quoting why", () => {
    const error = `the default of autoBitrateTtlMinutes: cannot read "${"X".repeat(90)}"`;
    const report = parityReport({
      base: read(SPEED),
      head: { error },
      plugin: [SPEED],
    });

    expect(report.label).toBe("add");
    expect(report.comment).toContain(`\`${error}\``);
  });

  // The generator quotes the source it could not read, blank lines and all,
  // and a blank line would end the code span.
  it("quotes an error that spans several lines on one", () => {
    const report = parityReport({
      base: read(SPEED),
      head: { error: 'cannot read "{\n\n  # a: 1,\n}"' },
      plugin: [SPEED],
    });

    expect(report.comment).toContain('`cannot read "{ # a: 1, }"`');
  });

  // Nothing about this PR is known, so neither a comment nor a label is touched.
  it("leaves the PR alone when the generator cannot read its base", () => {
    const report = parityReport({
      base: { error: "cannot read the base" },
      head: read(SPEED),
      plugin: [SPEED],
    });

    expect(report.comment).toBeNull();
    expect(report.label).toBe("keep");
    expect(report.summary).toContain("cannot read the base");
  });

  it("keeps a value with backticks inside its code span, and shortens a long one", () => {
    const report = parityReport({
      base: read(SPEED),
      head: read(
        SPEED,
        setting("odd", { type: "string", default: "a`b" }),
        setting("long", { type: "string", default: "x".repeat(200) }),
      ),
      plugin: [],
    });

    expect(report.comment).toContain('default ``"a`b"``');
    const long = report.comment
      ?.split("\n")
      .find((line) => line.startsWith("- `long`"));
    expect(long).toContain("…");
    expect(long?.length).toBeLessThan(MAX_VALUE_LENGTH + 40);
  });
});

// Each value the PR's run wrote has to stay inside its code span, or the bot
// posts the PR's own markdown: an empty one used to open a span of two
// backticks that the next two closed, letting the link after them out.
describe("a value from the PR", () => {
  it.each(["", "  "])(
    "shows %j as empty rather than as a code span",
    (empty) => {
      const report = parityReport({
        base: read(setting("t", { type: empty })),
        head: read(setting("t", { type: "a``[x](https://e.example)" })),
        plugin: [],
      });

      expect(report.comment).toContain(
        "- `t`: type (empty) → ```a``[x](https://e.example)```\n",
      );
    },
  );

  it("cuts a long error, so the comment never has to be cut", () => {
    const report = parityReport({
      base: read(SPEED),
      head: { error: "y".repeat(MAX_ERROR_LENGTH * 2) },
      plugin: [],
    });

    expect(report.comment).toContain(
      `\`${"y".repeat(MAX_ERROR_LENGTH - 1)}…\``,
    );
  });

  it("lists the first values a list gains, and counts the rest", () => {
    const values = Array.from(
      { length: MAX_LISTED_VALUES + 3 },
      (_, i) => `v${i}`,
    );
    const report = parityReport({
      base: read(setting("lang", { options: [] })),
      head: read(
        setting("lang", {
          options: values.map((value) => ({ value, label: value })),
        }),
      ),
      plugin: [],
    });

    expect(report.comment).toContain("+`v9` and 3 more\n");
  });

  it("lists the first settings, and counts the rest", () => {
    const added = Array.from({ length: MAX_LISTED_CHANGES + 2 }, (_, i) =>
      setting(`k${String(i).padStart(3, "0")}`),
    );
    const report = parityReport({
      base: read(),
      head: read(...added),
      plugin: [],
    });

    expect(report.comment?.match(/^- /gm)).toHaveLength(MAX_LISTED_CHANGES);
    expect(report.comment).toContain("And 2 more settings.");
  });
});

describe("readApp", () => {
  const generator = (fail?: Error): Generator => ({
    buildManifest: () => {
      if (fail) throw fail;
      return [SPEED];
    },
  });

  it("gives the entries the generator writes", () => {
    expect(readApp(generator(), "app", [])).toEqual({ entries: [SPEED] });
  });

  // A PR that renames settings.ts fails in the generator's readFileSync, not
  // as one of its own refusals, and a contributor cannot fix either.
  it("turns any failure of the generator into a result", () => {
    expect(
      readApp(generator(new Error("ENOENT: settings.ts")), "app", []),
    ).toEqual({ error: "ENOENT: settings.ts" });
  });
});

describe("readReport", () => {
  const gathered = {
    base: read(SPEED),
    head: { error: "cannot read" },
    plugin: [SPEED, setting("preferedLanguage", { wireNames: ["a"] })],
  };
  const valid = { version: 1, ...gathered };

  it("takes what the PR's run gathered", () => {
    expect(readReport(JSON.parse(JSON.stringify(valid)))).toEqual(gathered);
  });

  // The PR's run wrote it, so its shape is what keeps the comment ours.
  it.each([
    ["another version", { ...valid, version: 2 }],
    ["a key that is markdown", { ...valid, base: read(setting("[x](y)")) }],
    [
      "a field of the wrong type",
      { ...valid, plugin: [{ ...SPEED, type: 1 }] },
    ],
    ["no entries", { ...valid, base: {} }],
    ["an empty type", { ...valid, plugin: [{ ...SPEED, type: " " }] }],
    [
      "an empty other name",
      { ...valid, plugin: [{ ...SPEED, wireNames: [""] }] },
    ],
    [
      "an empty option",
      {
        ...valid,
        plugin: [{ ...SPEED, options: [{ value: "", label: "x" }] }],
      },
    ],
    [
      "a field name that is markdown",
      { ...valid, plugin: [{ ...SPEED, "[x](y)": 1 }] },
    ],
    ["an empty error", { ...valid, head: { error: "" } }],
    ["an error that is not text", { ...valid, head: { error: {} } }],
    [
      "too many entries",
      {
        ...valid,
        plugin: Array.from({ length: 1001 }, (_, index) =>
          setting(`key${index}`),
        ),
      },
    ],
  ])("refuses %s", (_, report) => {
    expect(() => readReport(report)).toThrow();
  });
});
