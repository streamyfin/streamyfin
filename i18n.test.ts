import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import i18n, { APP_LANGUAGES } from "./i18n";

// i18n starts in the stored app language, which it reads from storage.
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

// Crowdin's sync writes one catalogue per language into translations/, but i18n.ts
// imports them one by one. A catalogue it never imports is synced, translated and never
// shown: Luxembourgish (lb-LU.json) stayed out of the app that way.
describe("i18n", () => {
  const source = readFileSync(path.join(__dirname, "i18n.ts"), "utf8");
  const imported = [
    ...source.matchAll(/from "\.\/translations\/([\w-]+)\.json"/g),
  ].map((match) => match[1]);

  const catalogues = readdirSync(path.join(__dirname, "translations"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""));

  it.each(catalogues)("loads translations/%s.json", (catalogue) => {
    expect(imported).toContain(catalogue);
  });

  it("offers only languages it has a catalogue for", () => {
    const resources = Object.keys(i18n.options.resources ?? {});

    expect(
      APP_LANGUAGES.map((language) => language.value).filter(
        (value) => !resources.includes(value),
      ),
    ).toEqual([]);
  });
});
