/*
 * What the type generator decides, apart from fetching and writing: plain
 * functions, so they run under Jest as well as under Bun.
 */
import { createHash } from "node:crypto";

export interface Pin {
  /** The repository the spec is published from. */
  repo: string;
  /** A tag, so the generated types never move under us. */
  ref: string;
  /**
   * Of the spec source. It catches a tag that moved, which is the one thing
   * a ref alone cannot promise. It says nothing about the generated files:
   * regenerating and finding a clean tree is what covers those.
   */
  sha256: string;
}

export const pinUrl = (pin: Pin): string =>
  `https://raw.githubusercontent.com/${pin.repo}/${pin.ref}/seerr-api.yml`;

export const fingerprint = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

/**
 * Refuses a spec whose tag moved under us.
 *
 * A pin with no fingerprint is the first run, which records one rather than
 * having something to compare against.
 */
export const checkPin = (pin: Pin, sha256: string): void => {
  if (pin.sha256 && pin.sha256 !== sha256) {
    throw new Error(
      `The spec at ${pin.ref} no longer matches the pin. Its sha256 was ${pin.sha256}, it is now ${sha256}.`,
    );
  }
};

export type Schema = Record<string, unknown>;

/**
 * The property paths one response declares, flattened.
 *
 * The contract test compares these against what a real server sends, so the
 * answer is a flat list of names rather than a schema: it is compared, not
 * validated. An array contributes its own name and `[]`, so a property under
 * it reads as `results[].id`.
 */
export const declaredShapes = (spec: Schema): Record<string, string[]> => {
  const schemas = ((spec.components as Schema)?.schemas ?? {}) as Record<
    string,
    Schema
  >;

  // Schema names already on this path are refused rather than every name
  // already seen, so a type reached twice by different properties is still
  // described under both.
  const deref = (
    node: Schema | undefined,
    seen: string[],
  ): [Schema | undefined, string[]] => {
    let current = node;
    let names = seen;

    while (current && typeof current.$ref === "string") {
      const name = current.$ref.split("/").pop() as string;
      if (names.includes(name)) return [undefined, names];
      names = [...names, name];
      current = schemas[name];
    }

    return [current, names];
  };

  const walk = (
    node: Schema | undefined,
    prefix: string,
    seen: string[],
  ): string[] => {
    const [resolved, names] = deref(node, seen);
    if (!resolved) return [];

    // allOf is one shape assembled from parts. anyOf and oneOf are several
    // shapes a caller may receive, and the caller gets the union of them,
    // so both collapse the same way here. Duplicates are dropped because a
    // property two variants share would otherwise be listed twice.
    const parts = (resolved.allOf ?? resolved.anyOf ?? resolved.oneOf) as
      | Schema[]
      | undefined;

    if (Array.isArray(parts)) {
      return [...new Set(parts.flatMap((part) => walk(part, prefix, names)))];
    }

    // `items` rather than `type`, because the spec has both: WatchProviders
    // declares `buy` as an array and `flatrate` with items alone, and reading
    // only `type` dropped everything under the second one.
    if (resolved.items) {
      const inner = `${prefix}[]`;
      return [inner, ...walk(resolved.items as Schema, inner, names)];
    }

    const properties = resolved.properties as
      | Record<string, Schema>
      | undefined;

    if (!properties) {
      // A map whose keys are data, such as the certifications keyed by
      // country code. Describing the keys would describe the server's
      // content, so the value shape is described once under `*` and the
      // contract test matches any key against it.
      const values = resolved.additionalProperties;
      if (values && typeof values === "object") {
        const any = prefix ? `${prefix}.*` : "*";
        return [any, ...walk(values as Schema, any, names)];
      }
      return [];
    }

    return Object.entries(properties).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return [path, ...walk(value, path, names)];
    });
  };

  const shapes: Record<string, string[]> = {};

  for (const [route, item] of Object.entries(
    (spec.paths ?? {}) as Record<string, Schema>,
  )) {
    for (const [method, operation] of Object.entries(item)) {
      const responses = (operation as Schema).responses as
        | Record<string, Schema>
        | undefined;
      const answered = Object.entries(responses ?? {}).find(([code]) =>
        code.startsWith("2"),
      );
      const body = (answered?.[1].content as Schema | undefined)?.[
        "application/json"
      ] as Schema | undefined;

      if (!body?.schema) continue;

      shapes[`${method.toUpperCase()} ${route}`] = walk(
        body.schema as Schema,
        "",
        [],
      );
    }
  }

  return shapes;
};
