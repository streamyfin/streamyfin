#!/usr/bin/env bun
/**
 * i18n key checker for Streamyfin.
 *
 * Detects:
 *   - MISSING keys: a static `t("a.b.c")` / `i18nKey="a.b.c"` referenced in the code
 *     that does not exist in the source locale (translations/en.json). These are bugs —
 *     the app renders the raw key. Always fails CI.
 *   - UNUSED (dead) keys: a key in the source locale that is referenced nowhere in the
 *     code, neither statically nor via a detected dynamic prefix (`t(`a.b.${x}`)`).
 *     These are dead weight that also clutter every locale on Crowdin.
 *
 * Dynamic usage is handled conservatively:
 *   - `t(`prefix.${x}`)`  -> every key starting with `prefix.` is considered used.
 *   - `t(`${x}`)`         -> fully dynamic, reported for manual review, never used to
 *                            whitelist keys (in Streamyfin these are user-defined section
 *                            titles, not translation keys).
 *   - Edge cases the static scan cannot see can be allow-listed in the config file.
 *
 * Usage:
 *   bun scripts/check-i18n-keys.mjs                # report + exit 1 on missing OR unused
 *   bun scripts/check-i18n-keys.mjs --unused=warn  # exit 1 only on missing; unused = warning
 *   bun scripts/check-i18n-keys.mjs --unused=off   # ignore unused entirely
 *   bun scripts/check-i18n-keys.mjs --json         # machine-readable output
 *   bun scripts/check-i18n-keys.mjs --fix-unused   # remove dead keys from en.json (Crowdin syncs the rest)
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const flag = (name, def) => {
  const a = args.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return def;
  const [, v] = a.split("=");
  return v === undefined ? true : v;
};
const UNUSED_MODE = String(flag("unused", "error")); // error | warn | off
const JSON_OUT = !!flag("json", false);
const FIX_UNUSED = !!flag("fix-unused", false);

// ---- config ----
const CONFIG_PATH = join(ROOT, "scripts", "i18n-keys.config.json");
const DEFAULT_CONFIG = {
  localesDir: "translations",
  sourceLocale: "en",
  // Scan the whole repo by default so keys referenced outside the obvious dirs
  // (e.g. packages/, key constants in utils/atoms) are not wrongly flagged as dead.
  srcDirs: ["."],
  srcExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
  excludeDirs: [
    "node_modules",
    "ios",
    "android",
    ".expo",
    ".git",
    "dist",
    "build",
    "translations",
    "scripts",
  ],
  // Keys (or glob-ish prefixes ending with .* or *) known to be used dynamically / externally.
  ignoreUnused: [],
};
const config = existsSync(CONFIG_PATH)
  ? { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_PATH, "utf8")) }
  : DEFAULT_CONFIG;

// ---- helpers ----
const flatten = (obj, prefix = "", out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
};

const globMatch = (key, pattern) => {
  if (pattern.endsWith(".*"))
    return key === pattern.slice(0, -2) || key.startsWith(pattern.slice(0, -1));
  if (pattern.endsWith("*")) return key.startsWith(pattern.slice(0, -1));
  return key === pattern;
};

const walk = (dir, files = []) => {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (config.excludeDirs.includes(name)) continue;
      walk(full, files);
    } else if (config.srcExtensions.includes(extname(name))) {
      files.push(full);
    }
  }
  return files;
};

// ---- load source keys ----
const sourcePath = join(ROOT, config.localesDir, `${config.sourceLocale}.json`);
const sourceKeys = Object.keys(
  flatten(JSON.parse(readFileSync(sourcePath, "utf8"))),
);
const sourceKeySet = new Set(sourceKeys);

// ---- scan code ----
const STATIC_RE = /\bt\(\s*(['"])((?:\\.|(?!\1).)+?)\1/g; // t("a.b") / t('a.b')
const TPL_STATIC_RE = /\bt\(\s*`([^`$]+)`/g; // t(`a.b`) no interpolation
const TPL_DYN_RE = /\bt\(\s*`([^`$]*)\$\{/g; // t(`a.b.${x}`) -> prefix "a.b."
const I18NKEY_RE = /\bi18nKey\s*=\s*(?:\{\s*)?(['"])((?:\\.|(?!\1).)+?)\1/g; // <Trans i18nKey="a.b">
const KEY_SHAPE = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)+$/; // dotted key, e.g. home.x.y

const usedStatic = new Set(); // keys passed to t(...) / i18nKey — used for MISSING detection
const dynamicPrefixes = new Set();
const fullyDynamic = []; // { file, line }
let codeBlob = ""; // all (comment-stripped) source text — searched for delimited key literals

// Strip comments so keys mentioned in comments (e.g. `// t("old.key")`) are not counted as
// usage. Block comments and JSX {/* */} are blanked (preserving newlines for line numbers);
// line comments are only stripped when `//` follows start/whitespace/punctuation, which keeps
// `://` inside string URLs intact.
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[\s;{}()[\],=>])\/\/[^\n]*/g, (_m, p) => p);

const files = config.srcDirs.flatMap((d) =>
  walk(join(ROOT, d === "." ? "" : d) || ROOT),
);
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const clean = stripComments(text);
  codeBlob += `\n${clean}`;
  for (const m of clean.matchAll(STATIC_RE)) usedStatic.add(m[2]);
  for (const m of clean.matchAll(TPL_STATIC_RE)) usedStatic.add(m[1]);
  for (const m of clean.matchAll(I18NKEY_RE)) usedStatic.add(m[2]);
  for (const m of clean.matchAll(TPL_DYN_RE)) {
    const prefix = m[1];
    if (prefix?.includes(".")) dynamicPrefixes.add(prefix);
    else {
      const idx = clean.slice(0, m.index).split("\n").length;
      fullyDynamic.push({ file: relative(ROOT, file), line: idx });
    }
  }
}

const prefixList = [...dynamicPrefixes];
// A key counts as used if its EXACT delimited literal ("k" / 'k' / `k`) appears anywhere in
// the code (covers t("k"), <Trans i18nKey>, and keys stored as bare string constants in
// arrays/config then resolved via t(variable)), or it is reached via a dynamic prefix, or
// explicitly allow-listed. Delimited search avoids substring false-matches (e.g. a.b vs a.b_c).
const literalUsed = (key) =>
  codeBlob.includes(`"${key}"`) ||
  codeBlob.includes(`'${key}'`) ||
  codeBlob.includes(`\`${key}\``);
const isUsed = (key) =>
  literalUsed(key) ||
  prefixList.some((p) => key.startsWith(p)) ||
  config.ignoreUnused.some((g) => globMatch(key, g));

// ---- compute ----
const unused = sourceKeys.filter((k) => !isUsed(k)).sort();
// Static references are always validated, even under a dynamic prefix: a dynamic prefix only
// affects the UNUSED calculation, never MISSING.
const missing = [...usedStatic]
  .filter((k) => KEY_SHAPE.test(k) && !sourceKeySet.has(k))
  .sort();
// Known limitation: only keys seen in a static t("…") / i18nKey="…" / t(`…`) call are
// validated for MISSING. A key stored as a bare string constant and resolved via t(variable)
// counts as USED (via literalUsed → not flagged unused) but its existence in en.json is not
// checked here — static analysis can't resolve which key a runtime variable holds. Streamyfin
// keys are static literals in practice; revisit if dynamic key constants become common.

// ---- optional fix: strip dead keys from the source locale (en.json) ----
const removeKey = (obj, parts) => {
  const [head, ...rest] = parts;
  if (!(head in obj)) return;
  if (rest.length === 0) {
    delete obj[head];
    return;
  }
  removeKey(obj[head], rest);
  if (
    obj[head] &&
    typeof obj[head] === "object" &&
    Object.keys(obj[head]).length === 0
  )
    delete obj[head];
};
if (FIX_UNUSED && unused.length) {
  // Only edit the SOURCE locale (en.json). Crowdin owns the target locales and removes
  // the keys from them automatically on the next sync once they disappear from the source.
  const data = JSON.parse(readFileSync(sourcePath, "utf8"));
  for (const key of unused) removeKey(data, key.split("."));
  writeFileSync(sourcePath, `${JSON.stringify(data, null, 2)}\n`);
  console.log(
    `🧹 Removed ${unused.length} dead key(s) from ${config.sourceLocale}.json (Crowdin will sync the other locales).`,
  );
}

// ---- report ----
if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        sourceKeys: sourceKeys.length,
        missing,
        unused,
        dynamicPrefixes: prefixList,
        fullyDynamic,
      },
      null,
      2,
    ),
  );
} else {
  console.log(
    `🔑 i18n key check — source: ${relative(ROOT, sourcePath)} (${sourceKeys.length} keys), scanned ${files.length} files`,
  );
  if (prefixList.length)
    console.log(
      `   dynamic prefixes treated as used: ${prefixList.map((p) => `${p}*`).join(", ")}`,
    );
  if (fullyDynamic.length)
    console.log(
      `   ⚠️  ${fullyDynamic.length} fully-dynamic t(\`\${…}\`) call(s) (not key-based, manual review): ${fullyDynamic.map((d) => `${d.file}:${d.line}`).join(", ")}`,
    );

  if (missing.length) {
    console.log(
      `\n❌ MISSING keys (used in code, absent from ${config.sourceLocale}.json) — ${missing.length}:`,
    );
    for (const k of missing) console.log(`   - ${k}`);
  } else console.log("\n✅ No missing keys.");

  if (UNUSED_MODE !== "off") {
    if (unused.length) {
      console.log(
        `\n${UNUSED_MODE === "error" ? "❌" : "⚠️ "} UNUSED keys (in ${config.sourceLocale}.json, referenced nowhere) — ${unused.length}:`,
      );
      for (const k of unused) console.log(`   - ${k}`);
      console.log(
        `\n   → remove with: bun scripts/check-i18n-keys.mjs --fix-unused`,
      );
      console.log(
        `   → or allow-list a dynamic key in scripts/i18n-keys.config.json ("ignoreUnused").`,
      );
    } else console.log("\n✅ No unused keys.");
  }
}

const fail =
  missing.length > 0 || (UNUSED_MODE === "error" && unused.length > 0);
process.exit(fail ? 1 : 0);
