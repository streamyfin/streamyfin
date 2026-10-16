/*
 * What a fixture is, and where the capture reads and writes one: plain
 * functions, so they run under Jest as well as under Bun.
 */
import { type AppRoute, SIGNED_IN_USER } from "../../utils/seerr/routes";
import type { Shape } from "./shape";

export interface Fixture {
  /**
   * The route this came from, as the spec templates it. Kept in the file so a
   * fixture says what it describes, in review and to the contract test, rather
   * than having its name read backwards.
   */
  route: string;
  /** What the server answered. */
  status: number;
  /** Its body, reduced to keys and types. Absent when there was no body. */
  shape?: Shape;
}

/** The file a route's fixture is written to. */
export const fileNameFor = (template: string): string =>
  `${template
    .replace(/^GET /, "")
    .replace(/[{}]/g, "")
    .replace(/^\//, "")
    .replace(/\//g, "-")}.json`;

/**
 * The path to call, with the parameters and the query filled in, the account
 * signed in standing where a route asks for it.
 */
export const urlFor = (
  route: AppRoute,
  base: string,
  signedIn?: number,
): string => {
  const path = route.template
    .replace(/^GET /, "")
    .replace(/\{(\w+)\}/g, (_, name: string) => {
      const value = route.params?.[name];
      if (value === SIGNED_IN_USER) {
        if (signedIn === undefined) {
          throw new Error(`${route.template} needs the account signed in`);
        }
        return String(signedIn);
      }
      if (value === undefined) {
        throw new Error(`${route.template} has no value for {${name}}`);
      }
      return String(value);
    });

  const query = new URLSearchParams(
    Object.entries(route.query ?? {}).map(([k, v]) => [k, String(v)]),
  ).toString();

  return `${base}/api/v1${path}${query ? `?${query}` : ""}`;
};
