#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(new URL(import.meta.url).pathname);
const fixtureDir = resolve(scriptDir, "..");
const repoRoot = resolve(fixtureDir, "../../..");

const jellyfinUrl = process.env.JELLYFIN_URL || "http://localhost:8096";
const username = process.env.DEMO_USER || "admin";
const password = process.env.DEMO_PASSWORD || "admin";
const envFile = resolve(
  process.env.MAESTRO_ENV_FILE || resolve(repoRoot, "tests/maestro/.env.local"),
);

const authHeader =
  "MediaBrowser Client=StreamyfinMaestro, Device=Maestro, DeviceId=streamyfin-maestro, Version=1.0";
const discoveryRetries = Number(process.env.JELLYFIN_DISCOVERY_RETRIES || 20);
const discoveryRetryDelayMs = Number(
  process.env.JELLYFIN_DISCOVERY_RETRY_DELAY_MS || 1000,
);

const sleep = (ms) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const shouldRetry = (error, attempt) => {
  if (attempt >= discoveryRetries) {
    return false;
  }
  if (typeof error.status === "number") {
    return error.status >= 500;
  }
  return true;
};

const request = async (path, options = {}) => {
  for (let attempt = 1; attempt <= discoveryRetries; attempt++) {
    try {
      const response = await fetch(`${jellyfinUrl}${path}`, {
        ...options,
        headers: {
          Accept: "application/json",
          ...(options.headers || {}),
        },
      });

      if (!response.ok) {
        const body = await response.text();
        const error = new Error(
          `${response.status} ${response.statusText} for ${path}: ${body}`,
        );
        error.status = response.status;
        throw error;
      }

      return response.json();
    } catch (error) {
      if (!shouldRetry(error, attempt)) {
        throw error;
      }
      console.warn(
        `warning: ${path} request failed (${error.message}); retrying ${attempt}/${discoveryRetries}`,
      );
      await sleep(discoveryRetryDelayMs);
    }
  }
};

const authenticate = async () =>
  request("/Users/AuthenticateByName", {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ Username: username, Pw: password }),
  });

const findBy = (items, predicate, description) => {
  const item = items.find(predicate);
  if (!item?.Id) {
    throw new Error(`Could not find ${description}`);
  }
  return item;
};

const findMediaItem = async ({ token, userId, type, name }) => {
  const search = new URLSearchParams({
    Recursive: "true",
    IncludeItemTypes: type,
    SearchTerm: name,
    Limit: "20",
  });
  const result = await request(`/Users/${userId}/Items?${search}`, {
    headers: { Authorization: `MediaBrowser Token=${token}` },
  });
  const items = result.Items || [];
  return findBy(
    items,
    (item) => item.Name === name || item.Name?.startsWith(name),
    `${type} named ${name}`,
  );
};

const selectorForLibrary = (item) => `library-item-${item.Id}`;
const selectorForMedia = (item) => `media-item-${item.Id}`;

const upsertEnv = (file, values) => {
  let content = "";
  try {
    content = readFileSync(file, "utf8");
  } catch {
    mkdirSync(dirname(file), { recursive: true });
  }

  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    content = pattern.test(content)
      ? content.replace(pattern, line)
      : `${content}${content.endsWith("\n") || content === "" ? "" : "\n"}${line}\n`;
  }

  writeFileSync(file, content);
};

const main = async () => {
  const auth = await authenticate();
  const token = auth.AccessToken;
  const userId = auth.User?.Id || auth.UserId;

  if (!token || !userId) {
    throw new Error(
      "Authentication response did not include AccessToken and UserId",
    );
  }

  const views = await request(`/Users/${userId}/Views`, {
    headers: { Authorization: `MediaBrowser Token=${token}` },
  });
  const libraries = views.Items || [];

  const moviesLibrary = findBy(
    libraries,
    (item) => item.CollectionType === "movies" || item.Name === "Movies",
    "Movies library",
  );
  const showsLibrary = libraries.find(
    (item) => item.CollectionType === "tvshows" || item.Name === "Shows",
  );
  const musicLibrary = libraries.find(
    (item) => item.CollectionType === "music" || item.Name === "Music",
  );

  const steamboatWillie = await findMediaItem({
    token,
    userId,
    type: "Movie",
    name: "Steamboat Willie",
  });
  const bigBuckBunny = await findMediaItem({
    token,
    userId,
    type: "Movie",
    name: "Big Buck Bunny",
  });

  const values = {
    MAESTRO_MOVIES_LIBRARY_ID: selectorForLibrary(moviesLibrary),
    MAESTRO_STEAMBOAT_WILLIE_ID: selectorForMedia(steamboatWillie),
    MAESTRO_BIG_BUCK_BUNNY_ID: selectorForMedia(bigBuckBunny),
  };

  if (showsLibrary?.Id) {
    values.MAESTRO_SHOWS_LIBRARY_ID = selectorForLibrary(showsLibrary);
  }
  if (musicLibrary?.Id) {
    values.MAESTRO_MUSIC_LIBRARY_ID = selectorForLibrary(musicLibrary);
  }

  upsertEnv(envFile, values);

  console.log(`Discovered Maestro selectors from ${jellyfinUrl}`);
  for (const [key, value] of Object.entries(values)) {
    console.log(`  ${key}=${value}`);
  }
  console.log(`Wrote ${envFile}`);
};

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exit(1);
});
