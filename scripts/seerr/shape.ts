export type Shape = string | { [key: string]: Shape };

/**
 * How deep a fixture describes a response before it says "object".
 *
 * Deep enough for the paths the spec declares: a request nested in a media
 * entry nested in a film reaches `mediaInfo.requests[].requestedBy.id`, which
 * is six levels down, and a cutoff above it would hide a property the
 * contract test is there to compare.
 */
const DEEPEST = 7;

/**
 * A response reduced to its keys and the type of each value.
 *
 * No value ever comes out of here. The fixtures live in the repository and are
 * read in review, so a captured title, address or token would be a leak rather
 * than a test. Keys are sorted for the same reason: two captures of one route
 * have to produce the same file.
 */
/**
 * Two shapes of the same thing, as one.
 *
 * Elements of one array disagree in practice: a film with no release date
 * omits it. The union of what was seen is what the contract test needs, and a
 * leaf that disagrees with itself keeps the first reading rather than
 * inventing a third.
 */
const merge = (a: Shape, b: Shape): Shape => {
  if (typeof a === "string" || typeof b === "string") {
    if (a === b) return a;

    // A null on one element and a value on another is the field being
    // nullable, which is one of the three kinds of gap this measures. Keeping
    // only the value would throw away the thing worth recording.
    const both = [a, b].flatMap((side) =>
      typeof side === "string" ? side.split("|") : [],
    );

    return [...new Set(both)].sort((x, y) => x.localeCompare(y)).join("|");
  }

  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(
    (x, y) => x.localeCompare(y),
  );

  return Object.fromEntries(
    keys.map((key) => [
      key,
      key in a && key in b ? merge(a[key], b[key]) : (a[key] ?? b[key]),
    ]),
  );
};

export const shapeOf = (value: unknown, depth = 0): Shape => {
  if (value === null) return "null";

  if (Array.isArray(value)) {
    if (value.length === 0) return "array<empty>";
    if (depth >= DEEPEST) return "array";

    // Every element, not the first. A property the server omits on one title
    // and sends on the next would otherwise be missing from the fixture, and
    // the contract test would pass on a response it had never seen whole.
    return {
      "[]": value.reduce<Shape>(
        (merged, element) => merge(merged, shapeOf(element, depth + 1)),
        shapeOf(value[0], depth + 1),
      ),
    };
  }

  if (typeof value === "object") {
    if (depth >= DEEPEST) return "object";
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
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
 * sides is the only thing that makes that comparison mean anything.
 */
export const pathsOf = (shape: Shape, prefix = ""): string[] => {
  if (typeof shape === "string") return [];

  const keys = Object.keys(shape);

  if (keys.length === 1 && keys[0] === "[]") {
    const inner = `${prefix}[]`;
    return [inner, ...pathsOf(shape["[]"] as Shape, inner)];
  }

  return keys.flatMap((key) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return [path, ...pathsOf(shape[key] as Shape, path)];
  });
};
