import { APP_ROUTES } from "../../utils/seerr/routes";
import { type Fixture, fileNameFor, urlFor } from "./fixtures";
import { shapeOf } from "./shape";

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
): Promise<{ session: string; userId: number }> => {
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

  // The answer is the account itself, whose id some routes ask for.
  const { id } = (await answer.json()) as { id: number };
  return { session: cookie.split(";")[0], userId: id };
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

  const { session, userId } = await signIn(base, username, password);
  let written = 0;

  for (const route of APP_ROUTES) {
    const answer = await fetch(urlFor(route, base, userId), {
      headers: { Cookie: session },
    });

    const expected = route.expect ?? 200;
    if (answer.status !== expected) {
      throw new Error(
        `${route.template} answered ${answer.status}, expected ${expected}. Nothing was written: a fixture with no shape is a check that silently stops happening.`,
      );
    }

    const fixture: Fixture = {
      route: route.template,
      status: answer.status,
    };

    const body = answer.ok ? await answer.text() : "";
    if (body) {
      fixture.shape = shapeOf(JSON.parse(body));
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
