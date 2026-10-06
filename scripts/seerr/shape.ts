/**
 * A response reduced to its keys and the type of each value.
 *
 * A leaf is a type name, or several joined with `|` when the elements of an
 * array disagree: `null|string` for a date some titles send as null. An object
 * maps its keys to their shapes, and an array is an object whose one key,
 * `[]`, describes its elements.
 *
 * Reading more than one element adds two marks. A key some element went
 * without ends in `?`, as in TypeScript. And a structure some element sent as
 * null keeps its shape, with `null` under the key `|` beside it.
 */
export type Shape = string | { [key: string]: Shape };

type Structure = Exclude<Shape, string>;

/**
 * How deep a fixture describes a response before it says "object".
 *
 * Deep enough for the paths the spec declares: a request nested in a media
 * entry nested in a film reaches `mediaInfo.requests[].requestedBy.id`, which
 * is six levels down, and a cutoff above it would hide a property the
 * contract test is there to compare.
 */
const DEEPEST = 7;

/** The key an object or an array keeps its other readings under. */
const OR = "|";

const EMPTY = "array<empty>";

interface Property {
  shape: Shape;
  /** Some element went without the key. */
  optional: boolean;
}

/** An object's or an array's keys, by their bare names. */
const propertiesOf = (shape: Structure) =>
  new Map<string, Property>(
    Object.entries(shape)
      .filter(([key]) => key !== OR)
      .map(([key, inner]) =>
        key.endsWith("?")
          ? [key.slice(0, -1), { shape: inner, optional: true }]
          : [key, { shape: inner, optional: false }],
      ),
  );

const byName = (a: string, b: string) => a.localeCompare(b);

/** Readings as one leaf, in the same order whatever order they came in. */
const leafOf = (readings: string[]): string => {
  const all = new Set(readings);

  // An empty array says nothing about what an array holds once another
  // reading does.
  if (all.has("array")) all.delete(EMPTY);

  return [...all].sort(byName).join("|");
};

/** A structure with what a leaf read noted beside it. */
const withReadings = (structure: Structure, leaf: string): Structure => {
  const isArray = Object.hasOwn(structure, "[]");
  const readings = leaf
    .split("|")
    .filter((reading) => !(isArray && reading === EMPTY));
  if (readings.length === 0) return structure;

  const { [OR]: before, ...properties } = structure;
  const known = typeof before === "string" ? before.split("|") : [];

  return { [OR]: leafOf([...known, ...readings]), ...properties };
};

/**
 * Two shapes of the same thing, as one.
 *
 * Elements of one array disagree in practice, and each way they do is kept
 * rather than letting one side win. A key only some elements carry comes out
 * marked. A null where another element sends an object is noted beside the
 * object instead of replacing it, so nothing under the object drops out of
 * the comparison. An empty array says nothing about what an array holds, so
 * a filled one decides. In every case the order of the elements does not
 * change the result.
 */
const merge = (a: Shape, b: Shape): Shape => {
  if (typeof a === "string") {
    return typeof b === "string"
      ? leafOf([...a.split("|"), ...b.split("|")])
      : withReadings(b, a);
  }
  if (typeof b === "string") return withReadings(a, b);

  // Keys and a description of elements cannot share one object, and keeping
  // either would describe something the server did not send.
  if (Object.hasOwn(a, "[]") !== Object.hasOwn(b, "[]")) {
    throw new Error(
      "One element sends an array where another sends an object, and a shape cannot hold both.",
    );
  }

  const left = propertiesOf(a);
  const right = propertiesOf(b);
  const names = [...new Set([...left.keys(), ...right.keys()])].sort(byName);

  const properties = Object.fromEntries(
    names.map((name) => {
      const sides = [left.get(name), right.get(name)].filter(
        (side) => side !== undefined,
      );
      const optional = sides.length < 2 || sides.some((side) => side.optional);

      return [
        optional ? `${name}?` : name,
        sides.map((side) => side.shape).reduce(merge),
      ];
    }),
  );

  const others = [a[OR], b[OR]].filter((side) => typeof side === "string");

  return others.length > 0
    ? { [OR]: leafOf(others.flatMap((side) => side.split("|"))), ...properties }
    : properties;
};

/**
 * A response as a shape.
 *
 * No value ever comes out of here. The fixtures live in the repository and are
 * read in review, so a captured title, address or token would be a leak rather
 * than a test. Keys are sorted for the same reason: two captures of one route
 * have to produce the same file.
 */
export const shapeOf = (value: unknown, depth = 0): Shape => {
  if (value === null) return "null";

  if (Array.isArray(value)) {
    if (value.length === 0) return EMPTY;
    if (depth >= DEEPEST) return "array";

    // Every element, not the first. A property the server omits on one title
    // and sends on the next would otherwise be missing from the fixture, and
    // the contract test would pass on a response it had never seen whole.
    return {
      "[]": value.map((element) => shapeOf(element, depth + 1)).reduce(merge),
    };
  }

  if (typeof value === "object") {
    if (depth >= DEEPEST) return "object";
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => byName(a, b))
        .map(([key, inner]) => [key, shapeOf(inner, depth + 1)]),
    );
  }

  return typeof value;
};

/**
 * A shape flattened into property paths.
 *
 * Written the way `generate-types.ts` writes the declared ones, because the
 * contract test puts the two lists side by side. The same flattening on both
 * sides is the only thing that makes that comparison mean anything, so the
 * marks stay out of it.
 */
export const pathsOf = (shape: Shape, prefix = ""): string[] => {
  if (typeof shape === "string") return [];

  const properties = propertiesOf(shape);

  if (properties.size === 1 && properties.has("[]")) {
    const inner = `${prefix}[]`;
    return [inner, ...pathsOf(shape["[]"], inner)];
  }

  return [...properties].flatMap(([name, property]) => {
    const path = prefix ? `${prefix}.${name}` : name;
    return [path, ...pathsOf(property.shape, path)];
  });
};

/**
 * What a path leads to in a shape, and whether the last key on the way was
 * one some element went without. Undefined where the capture never went.
 *
 * The path is written the way `pathsOf` writes it, without the marks.
 */
export const propertyAt = (
  shape: Shape | undefined,
  path: string,
): Property | undefined =>
  (path.match(/\[\]|[^.[\]]+/g) ?? []).reduce<Property | undefined>(
    (found, step) =>
      found && typeof found.shape !== "string"
        ? propertiesOf(found.shape).get(step)
        : undefined,
    shape === undefined ? undefined : { shape, optional: false },
  );

/** Whether some element sent null here, as a leaf or instead of a structure. */
export const allowsNull = (shape: Shape): boolean => {
  const readings = typeof shape === "string" ? shape : shape[OR];
  return typeof readings === "string" && readings.split("|").includes("null");
};
