import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { OfficialRatingsFilterButton } from "./OfficialRatingsFilterButton";

const mockShowModal = jest.fn();
const mockFetchOfficialRatings = jest.fn();

jest.mock("@/providers/GlobalModalProvider", () => ({
  useGlobalModal: () => ({ showModal: mockShowModal, hideModal: jest.fn() }),
}));
// The sheet is handed to the modal, never rendered here.
jest.mock("./FilterSheetContent", () => ({ FilterSheetContent: () => null }));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "http://jellyfin.test" }),
    userAtom: atom({ Id: "user-1" }),
  };
});
jest.mock("@/utils/library/officialRatings", () => ({
  ...jest.requireActual("@/utils/library/officialRatings"),
  fetchOfficialRatings: (...args: unknown[]) =>
    mockFetchOfficialRatings(...args),
}));

const renderChip = async (props: { enabled: boolean; values: string[] }) => {
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  await render(
    <QueryClientProvider client={client}>
      <OfficialRatingsFilterButton
        libraryId='shows'
        collectionType='tvshows'
        set={jest.fn()}
        title='Official ratings'
        {...props}
      />
    </QueryClientProvider>,
  );
};

// What the sheet would list once the chip is pressed.
const offeredOnPress = () => {
  fireEvent.press(screen.getByText("Official ratings"));
  return mockShowModal.mock.lastCall?.[0].props.data;
};

beforeEach(() => {
  mockShowModal.mockClear();
  mockFetchOfficialRatings.mockReset();
  mockFetchOfficialRatings.mockResolvedValue(["TV-14", "TV-MA"]);
});

test("asks for the ratings of the kind of item the grid lists", async () => {
  await renderChip({ enabled: true, values: [] });

  await waitFor(() => expect(offeredOnPress()).toEqual(["TV-14", "TV-MA"]));
  expect(mockFetchOfficialRatings).toHaveBeenCalledWith(expect.anything(), {
    userId: "user-1",
    parentId: "shows",
    includeItemTypes: ["Series"],
  });
});

test("keeps a saved rating the server no longer lists among the choices", async () => {
  await renderChip({ enabled: true, values: ["TV-Y7"] });

  await waitFor(() =>
    expect(offeredOnPress()).toEqual(["TV-14", "TV-MA", "TV-Y7"]),
  );
});

test("waits for the library before asking", async () => {
  await renderChip({ enabled: false, values: [] });

  expect(mockFetchOfficialRatings).not.toHaveBeenCalled();
});
