import { AUTHORIZATION_HEADER } from "@jellyfin/sdk";
import { makeApi } from "@/test-utils/jellyfinApi";
import "./api";

// The plugin settings reader the module installs reaches the app log, and
// through it MMKV.
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

// A custom home section from the plugin carries headers of its own for its
// endpoint, and goes through these helpers (fetchCustomHomeSection).
const OWN_HEADERS = { "X-Section": "on-deck" };

const sent = async (method: "get" | "post" | "put" | "delete") => {
  const api = makeApi({ Items: [] });
  if (method === "post" || method === "put") {
    await api[method]("/Custom/Endpoint", {}, { headers: OWN_HEADERS });
  } else {
    await api[method]("/Custom/Endpoint", { headers: OWN_HEADERS });
  }
  const [request] = api.mock.history[method];
  return { api, headers: request.headers ?? {} };
};

describe.each(["get", "post", "put", "delete"] as const)("api.%s", (method) => {
  test("sends the headers the request was given", async () => {
    const { headers } = await sent(method);
    expect(headers["X-Section"]).toBe("on-deck");
  });

  test("still sends the session's authorization", async () => {
    const { api, headers } = await sent(method);
    expect(headers[AUTHORIZATION_HEADER]).toBe(api.authorizationHeader);
  });
});

test("a request cannot replace the session's authorization", async () => {
  const api = makeApi({ Items: [] });
  await api.get("/Custom/Endpoint", {
    headers: { [AUTHORIZATION_HEADER]: "MediaBrowser Token=other" },
  });
  const [request] = api.mock.history.get;
  expect(request.headers?.[AUTHORIZATION_HEADER]).toBe(api.authorizationHeader);
});
