// The app installs api.get, which custom endpoints go through, at launch.
import "@/augmentations/api";
import { makeApi } from "@/test-utils/jellyfinApi";
import type { HomeSection } from "@/utils/atoms/settings";
import { fetchCustomHomeSection } from "./customHomeSection";

const mockWriteToLog = jest.fn();
jest.mock("@/utils/log", () => ({
  writeToLog: (...args: unknown[]) => mockWriteToLog(...args),
}));

const LIBRARY_ID = "f137a2dd21bbc1b99aa5c0f6bf02a805";
const ITEMS = [{ Id: "9d7ad6afe9afa2dab1a2f6e00ad28fa6", Name: "Arrival" }];

// What Jellyfin answers an id parameter it cannot bind as a GUID with, the
// body Sentry REACT-NATIVE-1M recorded.
const VALIDATION_PROBLEM = {
  type: "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  title: "One or more validation errors occurred.",
  status: 400,
  errors: { parentId: ["The value is not valid."] },
};

const homeServer = () => {
  const api = makeApi();
  // A parentId that is there and is not 32 hex digits. An empty one binds as
  // no library at all.
  api.mock
    .onGet(/\/Items\?(.*&)?parentId=(?![0-9a-f]{32}(&|$))[^&]/i)
    .reply(400, VALIDATION_PROBLEM);
  api.mock.onGet(/\/Items(\?|$)/).reply(200, { Items: ITEMS });
  api.mock.onGet(/\/Shows\/NextUp/).reply(200, { Items: ITEMS });
  return api;
};

const fetchPage = (
  api: ReturnType<typeof makeApi>,
  section: HomeSection,
  index = 0,
) =>
  fetchCustomHomeSection(api, {
    section,
    index,
    userId: "user-1",
    pageParam: 0,
    pageSize: 10,
  });

beforeEach(() => mockWriteToLog.mockClear());

describe("an items section", () => {
  test("asks for the items of the library it names", async () => {
    const api = homeServer();

    await expect(
      fetchPage(api, { items: { parentId: LIBRARY_ID } }),
    ).resolves.toEqual(ITEMS);
    expect(api.mock.history.get[0].url).toContain(`parentId=${LIBRARY_ID}`);
  });

  test("asks for every library when it names none", async () => {
    const api = homeServer();

    await expect(fetchPage(api, { items: {} })).resolves.toEqual(ITEMS);
    expect(api.mock.history.get[0].url).not.toContain("parentId");
  });

  // What `parentId:` and `parentId: ""` read as. The SDK drops the first and
  // sends the second empty, and both asked for every library before.
  test("still asks for every library when its parentId is blank", async () => {
    for (const parentId of [null, ""]) {
      const api = homeServer();

      await expect(
        fetchPage(api, { items: { parentId: parentId as string } }),
      ).resolves.toEqual(ITEMS);
      expect(api.mock.history.get).toHaveLength(1);
    }
    expect(mockWriteToLog).not.toHaveBeenCalled();
  });

  // Sentry REACT-NATIVE-1M: the parentId is whatever the admin typed in the
  // plugin, and Jellyfin refuses anything that is not a GUID with a 400. The
  // phone home then also waited forever on its first two sections.
  test("asks for nothing when its library is not an id", async () => {
    const api = homeServer();

    await expect(
      fetchPage(api, { items: { parentId: "Movies" } }),
    ).resolves.toEqual([]);
    expect(api.mock.history.get).toHaveLength(0);
  });

  test("logs which section was left empty and what its parentId looked like", async () => {
    await fetchPage(homeServer(), { items: { parentId: "Movies" } }, 2);

    expect(mockWriteToLog).toHaveBeenCalledTimes(1);
    const [level, message] = mockWriteToLog.mock.calls[0];
    expect(level).toBe("WARN");
    expect(message).toContain("home section 3");
    expect(message).toContain("string of length 6");
    // The value came from the admin's settings.
    expect(message).not.toContain("Movies");
  });

  test("logs a section once however often the home refreshes", async () => {
    const api = homeServer();

    await fetchPage(api, { items: { parentId: "Shows" } }, 4);
    await fetchPage(api, { items: { parentId: "Shows" } }, 4);

    expect(mockWriteToLog).toHaveBeenCalledTimes(1);
  });
});

describe("a custom endpoint section", () => {
  test("asks for nothing when the parentId among its parameters is not an id", async () => {
    const api = homeServer();

    await expect(
      fetchPage(
        api,
        { custom: { endpoint: "/Items", query: { ParentId: "Movies" } } },
        5,
      ),
    ).resolves.toEqual([]);
    expect(api.mock.history.get).toHaveLength(0);
  });

  // The request passes every parameter on, so one variant holding an id does
  // not vouch for another that does not.
  test("asks for nothing when any parentId among its parameters is not an id", async () => {
    const api = homeServer();

    await expect(
      fetchPage(
        api,
        {
          custom: {
            endpoint: "/Items",
            query: { parentId: LIBRARY_ID, ParentId: "Movies" },
          },
        },
        6,
      ),
    ).resolves.toEqual([]);
    expect(api.mock.history.get).toHaveLength(0);
  });

  test("passes its parameters on as written when they hold an id", async () => {
    const api = homeServer();

    await expect(
      fetchPage(api, {
        custom: { endpoint: "/Items", query: { parentId: LIBRARY_ID } },
      }),
    ).resolves.toEqual(ITEMS);
    expect(api.mock.history.get[0].params).toMatchObject({
      parentId: LIBRARY_ID,
      userId: "user-1",
    });
  });
});

// The app never sends a next up or latest section's parentId, so whatever it
// holds does not stop the section from loading.
test("a next up section loads whatever its parentId holds", async () => {
  const api = homeServer();

  await expect(
    fetchPage(api, { nextUp: { parentId: "Movies" } }),
  ).resolves.toEqual(ITEMS);
  expect(api.mock.history.get[0].url).not.toContain("parentId");
});

// A section is one kind, picked in this order: a custom endpoint left beside
// a next up payload is never asked, so its parameters stop nothing.
test("a next up section ignores the parameters of a custom endpoint it does not use", async () => {
  const api = homeServer();

  await expect(
    fetchPage(api, {
      nextUp: {},
      custom: { endpoint: "/Items", query: { parentId: "Movies" } },
    }),
  ).resolves.toEqual(ITEMS);
  expect(api.mock.history.get[0].url).toContain("/Shows/NextUp");
});
