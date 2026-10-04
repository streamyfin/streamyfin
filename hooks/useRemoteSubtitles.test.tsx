import type { UserDto, UserPolicy } from "@jellyfin/sdk/lib/generated-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";
import { createStore, Provider as JotaiProvider } from "jotai";
import { isExpectedError } from "@/utils/errors";
import { SubtitleSearchNotAllowedError } from "@/utils/jellyfin/subtitleSearchAccess";
import {
  type SubtitleSearchResult,
  useRemoteSubtitles,
} from "./useRemoteSubtitles";

let mockUser: UserDto | null = null;
let mockOpenSubtitlesApiKey: string | undefined;
const mockSearchRemoteSubtitles = jest.fn();
const mockOpenSubtitlesSearch = jest.fn();

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "http://server" }),
    userAtom: atom(() => mockUser),
  };
});
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getSubtitleApi: () => ({
    searchRemoteSubtitles: mockSearchRemoteSubtitles,
  }),
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: { openSubtitlesApiKey: mockOpenSubtitlesApiKey },
  }),
}));
jest.mock("@/utils/atoms/downloadedSubtitles", () => ({
  addDownloadedSubtitle: jest.fn(),
}));
jest.mock("@/utils/opensubtitles/api", () => ({
  OpenSubtitlesApi: class {
    search = mockOpenSubtitlesSearch;
  },
}));

// Only the two fields the rule reads; the server sends the whole policy.
const userWith = (policy: Partial<UserPolicy>): UserDto => ({
  Policy: policy as UserPolicy,
});
const withoutPermission = userWith({
  IsAdministrator: false,
  EnableSubtitleManagement: false,
});
const withPermission = userWith({
  IsAdministrator: false,
  EnableSubtitleManagement: true,
});

const forbidden = () =>
  new AxiosError(
    "Request failed with status code 403",
    AxiosError.ERR_BAD_REQUEST,
    undefined,
    {},
    { status: 403, headers: {}, data: "", config: {} } as AxiosResponse,
  );

const search = async () => {
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  // A store per search: the user atom is read once per store.
  const store = createStore();
  const { result } = await renderHook(
    () => useRemoteSubtitles({ itemId: "item-1", item: { Id: "item-1" } }),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      ),
    },
  );
  // Settled inside act, so the mutation's state updates are flushed with it.
  let outcome: unknown;
  await act(async () => {
    outcome = await result.current
      .searchAsync({ language: "eng" })
      .catch((error: unknown) => ({ failure: error }));
    // React Query hands its state updates to a timer.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return outcome as SubtitleSearchResult[] | { failure: unknown };
};

describe("useRemoteSubtitles — who may search on the server", () => {
  beforeEach(() => {
    mockUser = null;
    mockOpenSubtitlesApiKey = undefined;
    mockSearchRemoteSubtitles.mockReset().mockResolvedValue({ data: [] });
    mockOpenSubtitlesSearch.mockReset().mockResolvedValue({ data: [] });
  });

  test("searches the server for a user who may", async () => {
    mockUser = withPermission;

    expect(await search()).toEqual([]);
    expect(mockSearchRemoteSubtitles).toHaveBeenCalledTimes(1);
  });

  // REACT-NATIVE-7M: the request went out, came back 403, was reported, and
  // the screen blamed a missing subtitle provider.
  test("does not ask the server for a user who may not, and says why", async () => {
    mockUser = withoutPermission;

    const { failure } = (await search()) as { failure: unknown };

    expect(failure).toBeInstanceOf(SubtitleSearchNotAllowedError);
    expect(isExpectedError(failure)).toBe(true);
    expect(mockSearchRemoteSubtitles).not.toHaveBeenCalled();
  });

  test("goes straight to the client-side lookup when there is one", async () => {
    mockUser = withoutPermission;
    mockOpenSubtitlesApiKey = "key";

    expect(await search()).toEqual([]);
    expect(mockSearchRemoteSubtitles).not.toHaveBeenCalled();
    expect(mockOpenSubtitlesSearch).toHaveBeenCalledTimes(1);
  });

  // The stored policy can be older than the one on the server.
  test("a 403 from the server is the same refusal", async () => {
    mockUser = withPermission;
    mockSearchRemoteSubtitles.mockRejectedValue(forbidden());

    const { failure } = (await search()) as { failure: unknown };

    expect(failure).toBeInstanceOf(SubtitleSearchNotAllowedError);
    expect(isExpectedError(failure)).toBe(true);
  });

  test("any other server failure is passed on as it came", async () => {
    mockUser = withPermission;
    const boom = new Error("boom");
    mockSearchRemoteSubtitles.mockRejectedValue(boom);

    expect(await search()).toEqual({ failure: boom });
  });
});
