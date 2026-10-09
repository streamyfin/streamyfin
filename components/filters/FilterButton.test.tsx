import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { ReactElement } from "react";
import { FilterButton } from "./FilterButton";

const mockShowModal = jest.fn();

jest.mock("@/providers/GlobalModalProvider", () => ({
  useGlobalModal: () => ({ showModal: mockShowModal, hideModal: jest.fn() }),
}));
// The sheet is handed to the modal, never rendered here.
jest.mock("./FilterSheetContent", () => ({ FilterSheetContent: () => null }));

const renderChip = async (chip: ReactElement) => {
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  await render(
    <QueryClientProvider client={client}>{chip}</QueryClientProvider>,
  );
};

// What the sheet would list once the chip is pressed.
const offeredOnPress = () => {
  fireEvent.press(screen.getByText("Audio languages"));
  // The latest call: a press that came before the options had loaded stays
  // in the list with the data it had then.
  return mockShowModal.mock.lastCall?.[0].props.data;
};

const chipProps = {
  id: "movies",
  queryKey: "audioLanguageFilter",
  title: "Audio languages",
  values: [] as string[],
  set: () => undefined,
  renderItemLabel: (item: string) => item,
};

let consoleError: jest.SpyInstance;

beforeEach(() => {
  mockShowModal.mockReset();
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

test("opens on the options it was handed, without a query", async () => {
  await renderChip(<FilterButton {...chipProps} options={["eng", "swe"]} />);

  expect(offeredOnPress()).toEqual(["eng", "swe"]);
  // React Query reports a query without a queryFn on every render, which in a
  // dev build is a red toast over the tab bar for each chip.
  expect(consoleError).not.toHaveBeenCalledWith(
    expect.stringContaining("No queryFn was passed"),
  );
});

test("still loads its options when it is given a query", async () => {
  const queryFn = jest.fn().mockResolvedValue(["Drama"]);

  await renderChip(<FilterButton {...chipProps} queryFn={queryFn} />);
  await waitFor(() => expect(offeredOnPress()).toEqual(["Drama"]));

  expect(queryFn).toHaveBeenCalledTimes(1);
});
