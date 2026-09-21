import { APP_ROUTES, type AppRoute } from "../../utils/seerr/routes";
import { type Shape, shapeOf } from "./shape";

/**
 * Measures what a real Seerr sends, as shapes.
 *
 * The spec is a contract on the way in and documentation on the way back, so
 * the only way to know what a response carries is to ask a server. This calls
 * the routes the app reads and writes their shape, keys and types, under
 * `utils/seerr/__fixtures__/`. The contract test then compares those with what
 * the spec declares, without touching the network.
 *
 * Run it with:
 *
 *   SEERR_URL=... SEERR_JELLYFIN_USER=... SEERR_JELLYFIN_PASSWORD=... \
 *     bun run seerr:capture
 *
 * The address and the credentials come from the environment rather than from
 * arguments, so they do not end up in a shell history.
 */

const FIXTURES = "utils/seerr/__fixtures__";

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

/** The path to call, with the parameters and the query filled in. */
export const urlFor = (route: AppRoute, base: string): string => {
  const path = route.template
    .replace(/^GET /, "")
    .replace(/\{(\w+)\}/g, (_, name: string) => {
      const value = route.params?.[name];
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

/**
 * Signs in the way the app does.
 *
 * Without `hostname`: a server that is already configured answers 500
 * "Jellyfin hostname already configured" when it is sent one, which reads as a
 * broken script rather than as the redundant argument it is.
 */
const signIn = async (
  base: string,
  username: string,
  password: string,
): Promise<string> => {
  const answer = await fetch(`${base}/api/v1/auth/jellyfin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!answer.ok) {
    throw new Error(`Signing in answered ${answer.status}`);
  }

  const cookie = answer.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("Signing in answered no session cookie");
  }

  return cookie.split(";")[0];
};

const capture = async (): Promise<void> => {
  const base = process.env.SEERR_URL?.replace(/\/$/, "");
  const username = process.env.SEERR_JELLYFIN_USER;
  const password = process.env.SEERR_JELLYFIN_PASSWORD;

  if (!base || !username || !password) {
    throw new Error(
      "Set SEERR_URL, SEERR_JELLYFIN_USER and SEERR_JELLYFIN_PASSWORD.",
    );
  }

  const session = await signIn(base, username, password);
  let written = 0;

  for (const route of APP_ROUTES) {
    const answer = await fetch(urlFor(route, base), {
      headers: { Cookie: session },
    });

    const fixture: Fixture = {
      route: route.template,
      status: answer.status,
    };

    if (answer.ok) {
      const body = await answer.text();
      if (body) {
        fixture.shape = shapeOf(JSON.parse(body));
      }
    }

    await Bun.write(
      `${FIXTURES}/${fileNameFor(route.template)}`,
      `${JSON.stringify(fixture, null, 1)}\n`,
    );

    written += 1;
    console.log(`${String(answer.status).padEnd(4)} ${route.template}`);
  }

  console.log(`\n${written} fixtures written to ${FIXTURES}`);
};

if (import.meta.main) {
  await capture();
}
