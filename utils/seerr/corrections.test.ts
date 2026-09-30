import { CORRECTIONS, type Correction } from "./corrections";
import declared from "./generated/api-shapes.json";

// Jest's expect takes no message, so each check lists what fails it: a
// failure names the routes and paths at fault.
const failing = (
  check: (correction: Correction, route: string) => boolean,
): string[] =>
  Object.entries(CORRECTIONS)
    .filter(([route, correction]) => !check(correction, route))
    .map(([route]) => route);

const declaredFor = (route: string) =>
  new Set<string>(declared[route as keyof typeof declared] ?? []);

describe("the corrections", () => {
  test("each say what was measured and when", () => {
    // No measurement date.
    expect(failing((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.measured))).toEqual([]);
    // No note.
    expect(failing((c) => c.note.length > 20)).toEqual([]);
    // Corrects nothing.
    expect(
      failing(
        (c) =>
          c.added.length +
            c.nullable.length +
            c.absent.length +
            c.renamed.length +
            c.underDeclared.length >
          0,
      ),
    ).toEqual([]);
  });

  // A key that names no route is a typo, and a typo here is a correction that
  // silently stops applying.
  test("name routes the spec declares", () => {
    const routes = new Set(Object.keys(declared));
    expect(failing((_, route) => routes.has(route))).toEqual([]);
  });

  // Correcting a property the spec already declares means the spec moved and
  // the entry outlived its reason, which is the outcome we are working towards.
  test("do not add a property the spec already declares", () => {
    const stale = Object.entries(CORRECTIONS).flatMap(([route, correction]) =>
      correction.added
        .filter((path) => declaredFor(route).has(path))
        .map((path) => `${route}: ${path}`),
    );
    // Upstream declares these now: drop them.
    expect(stale).toEqual([]);
  });

  // A nullable or absent entry is about a property the spec does declare: one
  // it promises non-null, or one it marks required. A path missing from the
  // declared list means the entry names something that no longer exists.
  test("only nullable and absent what the spec declares", () => {
    const undeclared = Object.entries(CORRECTIONS).flatMap(
      ([route, correction]) =>
        [...correction.nullable, ...correction.absent]
          .filter((path) => !declaredFor(route).has(path))
          .map((path) => `${route}: ${path}`),
    );
    expect(undeclared).toEqual([]);
  });

  test("rename only what the spec actually declares under the old name", () => {
    // Only the declared side is asserted. The served side can be declared
    // too and mean something else: watchProviders is declared as an array of
    // arrays, so the path the server sends is the one the spec uses for the
    // outer level.
    const gone = Object.entries(CORRECTIONS).flatMap(([route, correction]) =>
      correction.renamed
        .filter(([before]) => !declaredFor(route).has(before))
        .map(([before]) => `${route}: ${before}`),
    );
    // No longer declared under the old name: drop the rename.
    expect(gone).toEqual([]);
  });
});
