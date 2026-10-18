import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { type ReactNode, useState } from "react";
import { measureRenders } from "reassure";
import { StreamystatsRecommendations } from "@/components/home/StreamystatsRecommendations";
import { apiAtom } from "@/providers/JellyfinProvider";
import { makeItems } from "@/test-utils/baseItems";
import type { makeApi } from "@/test-utils/jellyfinApi";

jest.mock(
  "@/utils/atoms/settings",
  () =>
    jest.requireActual("@/test-utils/streamystatsSettings")
      .streamystatsSettingsModule,
);
// The Streamystats server is a second API; answering for it is all it is for.
jest.mock("@/utils/streamystats/api", () => ({
  createStreamystatsApi: () => ({
    getRecommendationIds: async () => ({
      data: {
        movies: Array.from({ length: 20 }, (_, index) => `Movie-${index}`),
        series: [],
      },
    }),
  }),
}));
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({ downloadedItems: [], processes: [] }),
}));
jest.mock("@/providers/GlobalModalProvider", () => ({
  useGlobalModal: () => ({ showModal: () => {}, hideModal: () => {} }),
}));

const api = getDefaultStore().get(apiAtom) as ReturnType<typeof makeApi>;

const stubServer = () => {
  api.mock.reset();
  api.mock.onGet(/\/System\/Info\/Public/).reply(200, { Id: "server-1" });
  api.mock
    .onGet(/\/Items\?/)
    .reply(200, { Items: makeItems(20, "Recommended", "Movie") });
};

const Wrapper = ({ children }: { children: ReactNode }) => {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("Streamystats Recommendations Performance", () => {
  beforeEach(() => {
    Object.assign(getDefaultStore().get(apiAtom) as object, {
      accessToken: "test-token",
    });
    stubServer();
  });

  test("a recommendations row loads its ids, then its items", async () => {
    await measureRenders(
      <StreamystatsRecommendations title='Recommended' type='Movie' />,
      {
        wrapper: Wrapper,
        scenario: async () => {
          await screen.findAllByText("Recommended 0");
          await act(async () => {
            jest.advanceTimersByTime(500);
          });
        },
      },
    );
  }, 60_000);
});
