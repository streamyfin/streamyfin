import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
// i18n starts in the stored app language, which it reads from storage.
import i18n, { APP_LANGUAGES } from "./i18n";

type Catalogue = Record<string, unknown>;

const readCatalogue = (file: string): Catalogue =>
  JSON.parse(readFileSync(path.join(__dirname, "translations", file), "utf8"));

const flatten = (catalogue: Catalogue, prefix = ""): [string, string][] =>
  Object.entries(catalogue).flatMap(([key, value]) =>
    typeof value === "object" && value !== null
      ? flatten(value as Catalogue, `${prefix}${key}.`)
      : [[`${prefix}${key}`, String(value)] as [string, string]],
  );

const english = new Map(flatten(readCatalogue("en.json")));

// Crowdin's sync writes one catalogue per language into translations/, but i18n.ts
// lists them one by one. A catalogue it never lists is synced, translated and never
// shown: Luxembourgish (lb-LU.json) stayed out of the app that way.
describe("i18n", () => {
  const source = readFileSync(path.join(__dirname, "i18n.ts"), "utf8");
  const imported = [
    ...source.matchAll(/require\("\.\/translations\/([\w-]+)\.json"\)/g),
  ].map((match) => match[1]);

  const catalogues = readdirSync(path.join(__dirname, "translations"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""));

  it.each(catalogues)("loads translations/%s.json", (catalogue) => {
    expect(imported).toContain(catalogue);
  });

  // Language code to the catalogue file it must show. nb and no share the one
  // Norwegian file, and devices report the "zh" macrolanguage.
  const ALIASES: [string, string][] = [
    ["ar", "ar-SA"],
    ["nb", "no-NO"],
    ["no", "no-NO"],
    ["nn", "nn"],
    ["pt", "pt-PT"],
    ["pt-BR", "pt-BR"],
    ["th", "th-TH"],
    ["tlh", "tlh-AA"],
    ["zh", "zh-CN"],
    ["zh-CN", "zh-CN"],
    ["zh-TW", "zh-TW"],
  ];

  const translatedKey = (file: string) => {
    const own = new Map(flatten(readCatalogue(`${file}.json`)));
    const key = [...own.keys()].find((k) => own.get(k) !== english.get(k));
    if (!key) throw new Error(`${file} has nothing that differs from English`);
    return { key, value: own.get(key) };
  };

  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("offers only languages it has a catalogue for", async () => {
    for (const { value } of APP_LANGUAGES) {
      await i18n.changeLanguage(value);
      expect(i18n.hasResourceBundle(value, "translation")).toBe(true);
    }
  });

  // Every catalogue evaluated at launch is parse time nobody asked for.
  it("holds only the active language and English after loading", () => {
    let fresh: typeof i18n | undefined;
    jest.isolateModules(() => {
      fresh = require("./i18n").default;
    });

    expect(fresh?.hasResourceBundle("en", "translation")).toBe(true);
    expect(
      APP_LANGUAGES.map((language) => language.value)
        .filter((value) => value !== "en")
        .filter((value) => fresh?.hasResourceBundle(value, "translation")),
    ).toEqual([]);
  });

  it("translates synchronously right after the module loads", () => {
    let fresh: typeof i18n | undefined;
    jest.isolateModules(() => {
      fresh = require("./i18n").default;
    });
    const [key, value] = [...english.entries()][0];

    expect(fresh?.isInitialized).toBe(true);
    expect(fresh?.t(key)).toBe(value);
  });

  it("loads a catalogue by itself when the language changes", async () => {
    const { key, value } = translatedKey("de-DE");
    let fresh: typeof i18n = i18n;
    jest.isolateModules(() => {
      fresh = require("./i18n").default;
    });
    expect(fresh.hasResourceBundle("de", "translation")).toBe(false);

    await fresh.changeLanguage("de");

    expect(fresh.t(key)).toBe(value);
  });

  it.each(ALIASES)("shows %s from %s.json", async (language, file) => {
    const { key, value } = translatedKey(file);

    await i18n.changeLanguage(language);

    expect(i18n.t(key)).toBe(value);
  });

  it("falls back to English for a language it has no catalogue for", async () => {
    const [key, value] = [...english.entries()][0];

    await expect(i18n.changeLanguage("xx")).resolves.toBeDefined();

    expect(i18n.t(key)).toBe(value);
  });

  it("falls back to English for a key a catalogue lacks", async () => {
    const eo = new Map(flatten(readCatalogue("eo.json")));
    const key = [...english.keys()].find((k) => !eo.has(k));
    if (!key) throw new Error("eo.json has every key");

    await i18n.changeLanguage("eo");

    expect(i18n.t(key)).toBe(english.get(key));
  });
});
