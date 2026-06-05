import { expect, test } from "bun:test";
import { matchesQuery, normalize } from "./searchFilter";

test("normalize strips accents and lowercases", () => {
  expect(normalize("Légèreté")).toBe("legerete");
  expect(normalize("  AUDIO ")).toBe("audio");
});

test("matchesQuery matches title case/accent-insensitively", () => {
  expect(matchesQuery({ title: "Apparence", keywords: [] }, "appar")).toBe(
    true,
  );
  expect(
    matchesQuery({ title: "Audio", keywords: ["sous-titres"] }, "SOUS"),
  ).toBe(true);
  expect(matchesQuery({ title: "Music", keywords: [] }, "xyz")).toBe(false);
});

test("matchesQuery returns true for empty query", () => {
  expect(matchesQuery({ title: "Anything" }, "")).toBe(true);
  expect(matchesQuery({ title: "Anything" }, "   ")).toBe(true);
});
