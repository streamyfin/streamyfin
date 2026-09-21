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
        correction.renamed.length +
        correction.underDeclared.length;
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

  // A nullable or absent entry is about a property the spec does declare: one
  // it promises non-null, or one it marks required. A path missing from the
  // declared list means the entry names something that no longer exists.
  test("only nullable and absent what the spec declares", () => {
    for (const [route, correction] of Object.entries(CORRECTIONS)) {
      const known = new Set(declared[route as keyof typeof declared] ?? []);

      for (const path of [...correction.nullable, ...correction.absent]) {
        expect(known.has(path), `${route}: ${path} is not declared`).toBe(true);
      }
    }
  });

  test("rename only what the spec actually declares under the old name", () => {
    for (const [route, correction] of Object.entries(CORRECTIONS)) {
      const known = new Set(declared[route as keyof typeof declared] ?? []);

      // Only the declared side is asserted. The served side can be declared
      // too and mean something else: watchProviders is declared as an array of
      // arrays, so the path the server sends is the one the spec uses for the
      // outer level.
      for (const [before] of correction.renamed) {
        expect(
          known.has(before),
          `${route}: ${before} is no longer declared, drop the rename`,
        ).toBe(true);
      }
    }
  });
});
