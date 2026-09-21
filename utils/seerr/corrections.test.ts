import { describe, expect, test } from "bun:test";
import { CORRECTIONS } from "./corrections";
import declared from "./generated/api-shapes.json";

describe("the corrections", () => {
  test("each say what was measured and when", () => {
    for (const [route, correction] of Object.entries(CORRECTIONS)) {
      expect(correction.measured, `${route} has no measurement date`).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
      expect(correction.note.length, `${route} has no note`).toBeGreaterThan(
        20,
      );

      const total =
        correction.added.length +
        correction.nullable.length +
        correction.absent.length +
        correction.renamed.length;
      expect(total, `${route} corrects nothing`).toBeGreaterThan(0);
    }
  });

  // A key that names no route is a typo, and a typo here is a correction that
  // silently stops applying.
  test("name routes the spec declares", () => {
    const routes = new Set(Object.keys(declared));

    for (const route of Object.keys(CORRECTIONS)) {
      expect(routes.has(route), `${route} is not a route in the spec`).toBe(
        true,
      );
    }
  });

  // Correcting a property the spec already declares means the spec moved and
  // the entry outlived its reason, which is the outcome we are working towards.
  test("do not add a property the spec already declares", () => {
    for (const [route, correction] of Object.entries(CORRECTIONS)) {
      const known = new Set(declared[route as keyof typeof declared] ?? []);
      const stale = correction.added.filter((path) => known.has(path));

      expect(stale, `${route}: upstream now declares these, drop them`).toEqual(
        [],
      );
    }
  });

  test("rename only what the spec actually declares under the old name", () => {
    for (const [route, correction] of Object.entries(CORRECTIONS)) {
      const known = new Set(declared[route as keyof typeof declared] ?? []);

      for (const [before, after] of correction.renamed) {
        expect(
          known.has(before),
          `${route}: ${before} is no longer declared`,
        ).toBe(true);
        expect(known.has(after), `${route}: ${after} is declared already`).toBe(
          false,
        );
      }
    }
  });
});
