import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Fixture } from "../../scripts/seerr/fixtures";
import { allowsNull, pathsOf, propertyAt } from "../../scripts/seerr/shape";
import { ALWAYS_SENT, CORRECTIONS } from "./corrections";
import declared from "./generated/api-shapes.json";
import { APP_ROUTES } from "./routes";

/**
 * Holds the types against what a Seerr server actually sends.
 *
 * Seerr validates requests against its spec and nothing on the way back, so
 * the response half has drifted. `__fixtures__` carries shapes measured on a
 * running server, `generated/api-shapes.json` carries what the spec declares,
 * and `corrections.ts` carries the difference we already know about. This puts
 * the three together, with no network and no secret, on every run.
 *
 * Two things fail it. A property a server sends that neither the spec nor a
 * correction knows about, which is upstream moving. And a correction the spec
 * has caught up with, which is upstream fixing something and our layer being
 * one entry too big.
 *
 * One limit worth knowing. Paths are compared, not variants, so on a route
 * whose results are a union the declared set is the union of all three shapes.
 * A person's `name` passes because a series declares one, even though
 * `PersonResult` does not. Telling them apart would mean reading the
 * discriminant of every element, and a fixture carries types rather than the
 * values a discriminant is made of.
 */

// Read before the tests are declared: Jest collects them synchronously.
const FIXTURES = join(__dirname, "__fixtures__");
const fixtures = readdirSync(FIXTURES)
  .filter((file) => file.endsWith(".json"))
  .map(
    (file) => JSON.parse(readFileSync(join(FIXTURES, file), "utf8")) as Fixture,
  );

const declaredFor = (route: string): string[] =>
  declared[route as keyof typeof declared] ?? [];

/**
 * Whether the spec declares a served path.
 *
 * Exact, one property at a time, except for a free-form map: a key under one
 * matches the `*` its level was declared with, because the certifications are
 * keyed by country code and those keys are the server's data rather than
 * declared properties.
 */
const isDeclared = (path: string, declared: Set<string>): boolean => {
  if (declared.has(path)) return true;

  const parts = path.split(".");
  return parts.some((_, index) =>
    declared.has(
      [...parts.slice(0, index), "*", ...parts.slice(index + 1)].join("."),
    ),
  );
};

/**
 * Whether a correction covers a served path.
 *
 * A correction covers everything under it, unlike a declaration. Saying the
 * spec does not know about `keywords` says it cannot know about
 * `keywords[].id` either, and listing every branch of an undeclared subtree
 * would be noise that goes stale on its own.
 */
const isCorrected = (path: string, corrected: string[]): boolean =>
  corrected.some(
    (entry) =>
      path === entry ||
      path.startsWith(`${entry}.`) ||
      path.startsWith(`${entry}[`),
  );

/**
 * Whether a path sits under a schema the spec declares but does not describe.
 *
 * MediaInfo declares 6 of its 25 properties and arrives nested in a film, a
 * series, a search result and a credit alike. Naming the schema once per route
 * says that; naming every property under it at every depth would say the same
 * thing fifty times and rot fifty times over.
 */
const isUnderDeclared = (path: string, shallow: string[]): boolean =>
  shallow.some((entry) =>
    [".", "["].some((sep) => path.includes(`${entry}${sep}`)),
  );

test("a fixture exists for every route the app reads", () => {
  const captured = new Set(fixtures.map((fixture) => fixture.route));
  const missing = APP_ROUTES.map((route) => route.template).filter(
    (template) => !captured.has(template),
  );

  // Run `bun run seerr:capture`.
  expect(missing).toEqual([]);
});

test("every fixture holds the status its route expects", () => {
  // The capture refuses any other status before writing, but a fixture edited
  // by hand or left from an older route list never went through it, and one
  // holding a 401 has no shape for the tests below to compare.
  const wrong = APP_ROUTES.flatMap((route) => {
    const fixture = fixtures.find(
      (candidate) => candidate.route === route.template,
    );
    const expected = route.expect ?? 200;
    return fixture && fixture.status !== expected
      ? [`${route.template} holds ${fixture.status}, expected ${expected}`]
      : [];
  });

  // Run `bun run seerr:capture`.
  expect(wrong).toEqual([]);
});

test("no fixture carries a value", () => {
  const types = new Set([
    "string",
    "number",
    "boolean",
    "null",
    "object",
    "array",
    "array<empty>",
  ]);

  // Walked rather than matched with a pattern: a leaf that is a number or a
  // boolean carries no quotes, so a regular expression over the text would
  // pass a fixture holding a real value.
  const leaves = (shape: unknown, at: string): string[] => {
    if (typeof shape === "string") {
      // A leaf can carry more than one reading, `null|string` for a field
      // some elements send as null, and so can what sits beside an object.
      const unknown = shape.split("|").filter((part) => !types.has(part));
      return unknown.length ? [`${at}: ${shape}`] : [];
    }
    if (shape && typeof shape === "object") {
      return Object.entries(shape).flatMap(([key, inner]) =>
        leaves(inner, at ? `${at}.${key}` : key),
      );
    }
    return [`${at}: ${typeof shape}`];
  };

  const leaked = fixtures.flatMap((fixture) =>
    leaves(fixture.shape ?? {}, fixture.route),
  );

  expect(leaked).toEqual([]);
});

describe("what a real server sends", () => {
  for (const fixture of fixtures) {
    if (!fixture.shape) continue;

    const spec = new Set(declaredFor(fixture.route));
    const corrected = [
      ...(CORRECTIONS[fixture.route]?.added ?? []),
      ...(CORRECTIONS[fixture.route]?.renamed.map(([, served]) => served) ??
        []),
    ];

    test(`${fixture.route} sends nothing we do not know about`, () => {
      const shallow = CORRECTIONS[fixture.route]?.underDeclared ?? [];
      const unknown = pathsOf(fixture.shape as never).filter(
        (path) =>
          !isDeclared(path, spec) &&
          !isCorrected(path, corrected) &&
          !isUnderDeclared(path, shallow),
      );

      // The spec moved: add these to corrections.ts with the date.
      expect(unknown).toEqual([]);
    });
  }
});

describe("the corrections", () => {
  for (const fixture of fixtures) {
    const correction = CORRECTIONS[fixture.route];
    if (!correction || !fixture.shape) continue;

    // The one that makes this layer shrink: when upstream declares a property
    // we were correcting, the entry has outlived its reason.
    test(`${fixture.route} still needs the ones it carries`, () => {
      const spec = new Set(declaredFor(fixture.route));
      const stale = [
        ...correction.added
          .filter((path) => spec.has(path))
          .map((path) => `${path} is declared now`),
        // A rename is judged on the name the spec got wrong, not on the served
        // one: `watchProviders[]` is declared already, as the middle of the
        // array of arrays the spec describes.
        ...correction.renamed
          .filter(([declared]) => !spec.has(declared))
          .map(([declared]) => `${declared} is no longer declared`),
      ];

      // Upstream fixed these, drop them.
      expect(stale).toEqual([]);
    });

    // Only where the capture went. A film that is not in the library carries
    // no mediaInfo at all, and judging a correction on a branch the response
    // never had would fail on whichever server happened to be measured rather
    // than on anything about the correction.
    test(`${fixture.route} still sees what its other entries describe`, () => {
      const served = new Set(pathsOf(fixture.shape as never));

      // A null that became a value, a required field that reappeared, or a
      // served name that moved: each means the entry has outlived its reason
      // and the type built on it is now describing something else.
      const wrong = [
        ...correction.nullable
          .filter((path) => {
            const found = propertyAt(fixture.shape, path);
            return found !== undefined && !allowsNull(found.shape);
          })
          .map((path) => `${path} is no longer null`),
        ...correction.absent
          .filter((path) => served.has(path))
          .map((path) => `${path} is sent after all`),
        ...correction.renamed
          .map(([, after]) => after)
          .filter((path) => !served.has(path))
          .map((path) => `${path} is not sent under that name`),
      ];

      expect(wrong).toEqual([]);
    });

    test(`${fixture.route} corrects what the server actually sends`, () => {
      const served = new Set(pathsOf(fixture.shape as never));
      const reached = (path: string) => {
        const parent = path.replace(/[.[][^.[]*$/, "");
        return parent === path || served.has(parent);
      };

      const imagined = correction.added.filter(
        (path) => reached(path) && !served.has(path),
      );

      // These were corrected but the server does not send them.
      expect(imagined).toEqual([]);
    });
  }
});

describe("the fields the types treat as always sent", () => {
  // The spec marks almost every property optional, and `types.ts` makes one
  // required only where a capture carried it. Inside an array that means on
  // every element, which the fixture can tell: it marks a key some element
  // went without, and notes a null beside an object as beside a leaf. A field
  // never sent, sent by some elements only, or sent as null fails here.
  for (const [type, { route, at: where, keys }] of Object.entries(
    ALWAYS_SENT,
  )) {
    test(`${type} carries ${keys.join(", ")} on ${route}`, () => {
      const fixture = fixtures.find((candidate) => candidate.route === route);
      // The route has no fixture: run `bun run seerr:capture`.
      expect(fixture?.shape).toBeDefined();

      const wrong = keys.flatMap((key) => {
        const found = propertyAt(
          fixture?.shape,
          where ? `${where}.${key}` : key,
        );

        if (!found) return [`${key} is not sent`];
        if (found.optional) return [`${key} is missing from some elements`];
        if (allowsNull(found.shape)) return [`${key} is sent as null`];
        return [];
      });

      // Take these out of ALWAYS_SENT, the types cannot require them.
      expect(wrong).toEqual([]);
    });
  }
});
