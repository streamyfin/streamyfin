import { act, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { measureRenders } from "reassure";
import SearchPage from "@/app/(auth)/(tabs)/(search)/index";
import { apiAtom } from "@/providers/JellyfinProvider";
import { makeItems } from "@/test-utils/baseItems";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { QueryWrapper } from "@/test-utils/queryWrapper";

// The header search bar is native: the screen hands its options to the
// navigation, and typing calls the `onChangeText` it put there.
const mockHeaderOptions: { onChangeText?: (e: unknown) => void } = {};
jest.mock("expo-router", () => {
  const navigation = {
    setOptions: ({
      headerSearchBarOptions,
    }: {
      headerSearchBarOptions?: typeof mockHeaderOptions;
    }) => Object.assign(mockHeaderOptions, headerSearchBarOptions),
    addListener: () => () => {},
  };
  return {
    ...jest.requireActual("@/test-utils/expoRouter").expoRouterModule,
    useNavigation: () => navigation,
  };
});
jest.mock(
  "@/providers/NetworkStatusProvider",
  () => jest.requireActual("@/test-utils/appProviders").networkStatusModule,
);
jest.mock(
  "@/providers/DownloadProvider",
  () => jest.requireActual("@/test-utils/appProviders").downloadModule,
);
jest.mock("@/hooks/useTVItemActionModal", () => ({
  useTVItemActionModal: () => ({ showItemActions: () => {} }),
}));
jest.mock("@/hooks/useServerVersion", () => ({
  useServerVersion: () => "10.9.0",
}));
jest.mock("@/hooks/useSeerr", () => ({
  useSeerr: () => ({ seerrApi: undefined }),
}));

const api = getDefaultStore().get(apiAtom) as ReturnType<typeof makeApi>;

const stubServer = () => {
  api.mock.reset();
  api.mock
    .onGet(/\/Items\?/)
    .reply(() => [200, { Items: makeItems(10, "Result") }]);
  api.mock.onGet(/\/Persons/).reply(200, { Items: [] });
  api.mock.onGet(/\/Studios/).reply(200, { Items: [] });
};

const type = async (text: string) => {
  await act(async () => {
    mockHeaderOptions.onChangeText?.({ nativeEvent: { text } });
  });
};

describe("Search Performance", () => {
  beforeEach(() => {
    stubServer();
  });

  test("typing a query debounces, then loads every result section", async () => {
    await measureRenders(<SearchPage />, {
      wrapper: QueryWrapper,
      scenario: async () => {
        for (const text of ["l", "lo", "lor", "lord"]) {
          await type(text);
        }
        await act(async () => {
          jest.advanceTimersByTime(300);
        });
        await screen.findAllByText("Result 0");
      },
    });
  });

  test("refining a query re-renders the loaded results", async () => {
    await measureRenders(<SearchPage />, {
      wrapper: QueryWrapper,
      scenario: async () => {
        await type("lord");
        await act(async () => {
          jest.advanceTimersByTime(300);
        });
        await screen.findAllByText("Result 0");
        for (const text of ["lord ", "lord o", "lord of"]) {
          await type(text);
        }
        await act(async () => {
          jest.advanceTimersByTime(300);
        });
        await screen.findAllByText("Result 0");
      },
    });
  });
});
