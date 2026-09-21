import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import type { Fixture } from "../../scripts/seerr/capture";
import { pathsOf } from "../../scripts/seerr/shape";
import { CORRECTIONS } from "./corrections";
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
 */

const fixtures = await Array.fromAsync(
  new Glob("*.json").scan({ cwd: "utils/seerr/__fixtures__", absolute: true }),
).then((files) =>
  Promise.all(files.map((file) => Bun.file(file).json() as Promise<Fixture>)),
);

/** The leaf a path names in a shape, when the shape reaches that far. */
const at = (shape: unknown, path: string): unknown =>
  path
    .split(".")
    .flatMap((part) =>
      part
        .split("[]")
        .filter(Boolean)
        .concat(part.endsWith("[]") ? ["[]"] : []),
    )
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[key]
          : undefined,
      shape,
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

  expect(missing, "run `bun run seerr:capture`").toEqual([]);
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
      // some elements send and others do not.
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

      expect(
        unknown,
        "the spec moved: add these to corrections.ts with the date",
      ).toEqual([]);
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
      const stale = correction.added.filter((path) => spec.has(path));

      expect(stale, "upstream declares these now, drop them").toEqual([]);
    });

    // Only where the capture went. A film that is not in the library carries
    // no mediaInfo at all, and judging a correction on a branch the response
    // never had would fail on whichever server happened to be measured rather
    // than on anything about the correction.
    test(`${fixture.route} still sees what its other entries describe`, () => {
      const served = new Set(pathsOf(fixture.shape as never));
      const shape = fixture.shape as Record<string, unknown>;

      // A null that became a value, a required field that reappeared, or a
      // served name that moved: each means the entry has outlived its reason
      // and the type built on it is now describing something else.
      const wrong = [
        ...correction.nullable
          .filter((path) => served.has(path))
          .filter(
            (path) => !String(at(shape, path)).split("|").includes("null"),
          )
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

      expect(
        imagined,
        "these were corrected but the server does not send them",
      ).toEqual([]);
    });
  }
});
