import { AUTHORIZATION_HEADER } from "@jellyfin/sdk/lib/constants";
import { AxiosHeaders } from "axios";
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

const verbs = {
  get: "pluginGet",
  post: "pluginPost",
  put: "pluginPut",
  delete: "pluginDelete",
} as const;

const sent = async (method: keyof typeof verbs) => {
  const api = makeApi({ Items: [] });
  if (method === "post" || method === "put") {
    await api[verbs[method]]("/Custom/Endpoint", {}, { headers: OWN_HEADERS });
  } else {
    await api[verbs[method]]("/Custom/Endpoint", { headers: OWN_HEADERS });
  }
  const [request] = api.mock.history[method];
  return { api, headers: request.headers ?? {} };
};

describe.each(["get", "post", "put", "delete"] as const)(
  "api.plugin %s",
  (method) => {
    test("sends the headers the request was given", async () => {
      const { headers } = await sent(method);
      expect(headers["X-Section"]).toBe("on-deck");
    });

    test("still sends the session's authorization", async () => {
      const { api, headers } = await sent(method);
      expect(AxiosHeaders.from(headers).get(AUTHORIZATION_HEADER)).toBe(
        api.authorizationHeader,
      );
    });
  },
);

// Header names are matched without case, and false asks axios to drop one:
// axios merges a request's headers caselessly, the later key winning, and the
// session's comes last.
test.each([
  [
    "cannot replace the session's authorization",
    { [AUTHORIZATION_HEADER]: "MediaBrowser Token=other" },
  ],
  [
    "cannot replace it under a lower case name",
    { authorization: "MediaBrowser Token=other" },
  ],
  ["cannot drop it with false", { authorization: false }],
])("a request %s", async (_name, headers) => {
  const api = makeApi({ Items: [] });
  await api.pluginGet("/Custom/Endpoint", { headers });
  const [request] = api.mock.history.get;
  expect(AxiosHeaders.from(request.headers).get(AUTHORIZATION_HEADER)).toBe(
    api.authorizationHeader,
  );
});
