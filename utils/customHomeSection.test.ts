// The app installs api.get, which custom endpoints go through, at launch.
import "@/augmentations/api";
import { makeApi } from "@/test-utils/jellyfinApi";
import type { HomeSection } from "@/utils/atoms/settings";
import {
  fetchCustomHomeSection,
  resetLoggedHomeSections,
} from "./customHomeSection";

const mockWriteToLog = jest.fn();
jest.mock("@/utils/log", () => ({
  writeToLog: (...args: unknown[]) => mockWriteToLog(...args),
}));

const LIBRARY_ID = "f137a2dd21bbc1b99aa5c0f6bf02a805";
const DASHED_LIBRARY_ID = "f137a2dd-21bb-c1b9-9aa5-c0f6bf02a805";
const LIBRARY_ITEMS = [
  { Id: "9d7ad6afe9afa2dab1a2f6e00ad28fa6", Name: "Arrival" },
];
// What the server answers when no library narrows the request.
const EVERY_LIBRARY_ITEMS = [
  ...LIBRARY_ITEMS,
  { Id: "a656b907eb3a73532e40e44b968d0225", Name: "Severance" },
];

// What Jellyfin answers an id parameter it cannot bind as a GUID with, the
// body Sentry REACT-NATIVE-1M recorded.
const VALIDATION_PROBLEM = {
  type: "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  title: "One or more validation errors occurred.",
  status: 400,
  errors: { parentId: ["The value is not valid."] },
};

// The library's id in each form Jellyfin 12.2.0 answered with its items.
const LIBRARY_ID_FORMS = [
  LIBRARY_ID,
  DASHED_LIBRARY_ID,
  `{${DASHED_LIBRARY_ID}}`,
  `(${DASHED_LIBRARY_ID})`,
];

/**
 * A server binding parentId the way Jellyfin 12.2.0 does, from the url as
 * axios sends it: the first value sent under that name, whatever the name's
 * case. A blank one is no library, the library's id is read in any of its
 * forms, and anything else is a 400.
 */
const homeServer = () => {
  const api = makeApi();
  api.mock.onGet().reply((config) => {
    const url = new URL(api.axiosInstance.getUri(config));
    if (url.pathname.endsWith("/Shows/NextUp")) {
      return [200, { Items: LIBRARY_ITEMS }];
    }
    if (url.pathname.endsWith("/Items/Latest")) return [200, LIBRARY_ITEMS];
    if (!url.pathname.endsWith("/Items")) return [404];

    const parentId = [...url.searchParams]
      .find(([name]) => name.toLowerCase() === "parentid")?.[1]
      .trim()
      .toLowerCase();
    if (!parentId) return [200, { Items: EVERY_LIBRARY_ITEMS }];
    if (LIBRARY_ID_FORMS.includes(parentId)) {
      return [200, { Items: LIBRARY_ITEMS }];
    }
    return [400, VALIDATION_PROBLEM];
  });
  return api;
};

const fetchPage = (
  api: ReturnType<typeof makeApi>,
  section: HomeSection,
  index = 0,
  userId = "user-1",
) =>
  fetchCustomHomeSection(api, {
    section,
    index,
    userId,
    pageParam: 0,
    pageSize: 10,
  });

const customSection = (
  endpoint: string,
  query?: Record<string, string | null>,
): HomeSection => ({ custom: { endpoint, query } });

beforeEach(() => {
  mockWriteToLog.mockClear();
  resetLoggedHomeSections();
});

describe("an items section", () => {
  test("asks for the items of the library it names", async () => {
    const api = homeServer();

    await expect(
      fetchPage(api, { items: { parentId: LIBRARY_ID } }),
    ).resolves.toEqual(LIBRARY_ITEMS);
    expect(api.mock.history.get[0].url).toContain(`parentId=${LIBRARY_ID}`);
  });

  // Jellyfin binds an id the way .NET's Guid.TryParse reads one.
  test("asks for the library when its id is dashed, bracketed or padded", async () => {
    for (const parentId of [
      DASHED_LIBRARY_ID,
      `{${DASHED_LIBRARY_ID}}`,
      `(${DASHED_LIBRARY_ID})`,
      ` ${LIBRARY_ID} `,
      LIBRARY_ID.toUpperCase(),
    ]) {
      await expect(
        fetchPage(homeServer(), { items: { parentId } }),
      ).resolves.toEqual(LIBRARY_ITEMS);
    }
    expect(mockWriteToLog).not.toHaveBeenCalled();
  });

  test("asks for every library when it names none", async () => {
    const api = homeServer();

    await expect(fetchPage(api, { items: {} })).resolves.toEqual(
      EVERY_LIBRARY_ITEMS,
    );
    expect(api.mock.history.get[0].url).not.toContain("parentId");
  });

  // What `parentId:`, `parentId: ""` and a parentId of spaces read as. The SDK
  // drops the first and sends the others, which Jellyfin binds as no library.
  test("still asks for every library when its parentId is blank", async () => {
    for (const parentId of [null, "", "  "]) {
      const api = homeServer();

      await expect(
        fetchPage(api, { items: { parentId: parentId as string } }),
      ).resolves.toEqual(EVERY_LIBRARY_ITEMS);
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

  // The app keeps running across a sign out, and another server or account
  // has its own home, with its own sections to report.
  test("logs a section again for another server or another account", async () => {
    const section = { items: { parentId: "Shows" } };
    const api = homeServer();
    const otherServer = homeServer();
    otherServer.basePath = "https://other.example.com";

    await fetchPage(api, section, 4, "user-1");
    await fetchPage(otherServer, section, 4, "user-1");
    await fetchPage(api, section, 4, "user-2");

    expect(mockWriteToLog).toHaveBeenCalledTimes(3);
  });
});

describe("a custom endpoint section", () => {
  test("asks for nothing when the parentId among its parameters is not an id", async () => {
    const api = homeServer();

    await expect(
      fetchPage(api, customSection("/Items", { ParentId: "Movies" }), 5),
    ).resolves.toEqual([]);
    expect(api.mock.history.get).toHaveLength(0);
  });

  // Jellyfin binds the first parentId sent, whatever the case of its name:
  // 12.2.0 answers parentId=<id>&ParentId=Movies with the library's items, and
  // the same two the other way round with a 400.
  test("loads when the first parentId it sends is an id, whatever follows", async () => {
    const api = homeServer();

    await expect(
      fetchPage(
        api,
        customSection("/Items", { parentId: LIBRARY_ID, ParentId: "Movies" }),
      ),
    ).resolves.toEqual(LIBRARY_ITEMS);
    expect(mockWriteToLog).not.toHaveBeenCalled();
  });

  test("asks for nothing when the first parentId it sends is not an id, whatever follows", async () => {
    const api = homeServer();

    await expect(
      fetchPage(
        api,
        customSection("/Items", { ParentId: "Movies", parentId: LIBRARY_ID }),
      ),
    ).resolves.toEqual([]);
    expect(api.mock.history.get).toHaveLength(0);
  });

  // A blank first one binds as no library, and the server reads no further:
  // 12.2.0 answers parentId=&ParentId=Movies with every library's items.
  test("asks for every library when the first parentId it sends is blank, whatever follows", async () => {
    const api = homeServer();

    await expect(
      fetchPage(
        api,
        customSection("/Items", { parentId: "", ParentId: "Movies" }),
      ),
    ).resolves.toEqual(EVERY_LIBRARY_ITEMS);
  });

  // axios leaves a null out of the request, so the next one is the first sent.
  test("skips a parentId it does not send", async () => {
    const api = homeServer();

    await expect(
      fetchPage(
        api,
        customSection("/Items", { parentId: null, ParentId: "Movies" }),
      ),
    ).resolves.toEqual([]);
    expect(api.mock.history.get).toHaveLength(0);
  });

  test("passes its parameters on as written when they hold an id", async () => {
    const api = homeServer();

    await expect(
      fetchPage(api, customSection("/Items", { parentId: LIBRARY_ID })),
    ).resolves.toEqual(LIBRARY_ITEMS);
    expect(api.mock.history.get[0].params).toMatchObject({
      parentId: LIBRARY_ID,
      userId: "user-1",
    });
  });

  // The plugin sends an endpoint as the admin wrote it, parameters included,
  // and axios appends the query after them.
  describe("with parameters in its address", () => {
    test("asks for nothing when the address names something that is not an id", async () => {
      const api = homeServer();

      await expect(
        fetchPage(api, customSection("/Items?ParentId=Movies")),
      ).resolves.toEqual([]);
      expect(api.mock.history.get).toHaveLength(0);
    });

    test("reads the address before the query", async () => {
      const named = homeServer();
      await expect(
        fetchPage(
          named,
          customSection(`/Items?parentId=${LIBRARY_ID}`, {
            ParentId: "Movies",
          }),
        ),
      ).resolves.toEqual(LIBRARY_ITEMS);

      const unnamed = homeServer();
      await expect(
        fetchPage(
          unnamed,
          customSection("/Items?ParentId=Movies", { parentId: LIBRARY_ID }),
        ),
      ).resolves.toEqual([]);
      expect(unnamed.mock.history.get).toHaveLength(0);
    });

    // axios drops an address's fragment before it appends the query.
    test("ignores what follows a #", async () => {
      const api = homeServer();

      await expect(
        fetchPage(api, customSection("/Items#?ParentId=Movies")),
      ).resolves.toEqual(EVERY_LIBRARY_ITEMS);
    });
  });
});

// The app never sends a next up or latest section's parentId, so whatever it
// holds does not stop the section from loading.
test.each([
  ["next up", { nextUp: { parentId: "Movies" } }],
  ["latest", { latest: { parentId: "Movies" } }],
])("a %s section loads whatever its parentId holds", async (_kind, section) => {
  const api = homeServer();

  await expect(fetchPage(api, section)).resolves.toEqual(LIBRARY_ITEMS);
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
  ).resolves.toEqual(LIBRARY_ITEMS);
  expect(api.mock.history.get[0].url).toContain("/Shows/NextUp");
});
