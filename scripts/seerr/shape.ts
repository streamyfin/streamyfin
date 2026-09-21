export type Shape = string | { [key: string]: Shape };

/** How deep a fixture describes a response before it says "object". */
const DEEPEST = 3;

/**
 * A response reduced to its keys and the type of each value.
 *
 * No value ever comes out of here. The fixtures live in the repository and are
 * read in review, so a captured title, address or token would be a leak rather
 * than a test. Keys are sorted for the same reason: two captures of one route
 * have to produce the same file.
 */
export const shapeOf = (value: unknown, depth = 0): Shape => {
  if (value === null) return "null";

  if (Array.isArray(value)) {
    if (value.length === 0) return "array<empty>";
    if (depth >= DEEPEST) return "array";
    return { "[]": shapeOf(value[0], depth + 1) };
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
