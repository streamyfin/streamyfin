import { mock } from "bun:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { notificationRoute } from "../utils/notificationRoute";

const require = createRequire(import.meta.url);
const routerRoot = join(
  dirname(require.resolve("expo-router/package.json")),
  "build",
);
const { validatePathConfig } = await import(
  `${routerRoot}/react-navigation/core/validatePathConfig.js`
);
// The parser only needs this pure validator from the native entrypoint.
mock.module(`${routerRoot}/react-navigation/native/index.js`, () => ({
  validatePathConfig,
}));
const { getRoutes } = await import(`${routerRoot}/getRoutes.js`);
const { getReactNavigationConfig } = await import(
  `${routerRoot}/getReactNavigationConfig.js`
);
const { getStateFromPath } = await import(
  `${routerRoot}/fork/getStateFromPath.js`
);

const appDirectory = fileURLToPath(new URL("../app/", import.meta.url));
const files = readdirSync(appDirectory, {
  recursive: true,
  encoding: "utf8",
}).filter((file) => /\.[jt]sx?$/.test(file));
// readdirSync joins with backslashes on Windows, but route keys are always
// slash separated, so unnormalised paths never form the route tree.
const context = Object.assign(() => ({ default: () => null }), {
  keys: () => files.map((file) => `./${file.replaceAll("\\", "/")}`),
});
const tree = getRoutes(context, {
  platform: "ios",
  ignoreEntryPoints: true,
  importMode: "lazy",
});
const config = getReactNavigationConfig(tree, true);

for (const [payload, expectedScreen, expectedId] of [
  [{ type: "Movie", id: "movie" }, "items/page", "movie"],
  [{ type: "Episode", id: "episode" }, "items/page", "episode"],
  [
    { type: "Episode", seriesId: "series", seasonIndex: 2 },
    "series/[id]",
    "series",
  ],
  [{ type: "Episode", seriesId: "series" }, "series/[id]", "series"],
] as const) {
  const path = notificationRoute(payload);
  assert.ok(path);
  let state = getStateFromPath(path, config);
  let route: { name: string; params?: { id?: string } } | undefined;
  while (state?.routes?.length) {
    const currentRoute = state.routes[state.index ?? state.routes.length - 1];
    route = currentRoute;
    state = currentRoute.state;
  }
  assert.equal(route?.name, expectedScreen, path);
  assert.equal(route?.params?.id, expectedId, path);
}
