import { fireEvent, render, screen } from "@testing-library/react-native";
import { TVSyncPlayButton } from "./TVSyncPlayButton";

const mockOpen = jest.fn();
let mockState = { group: null as object | null, available: true };

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) => {
    const { Text } = jest.requireActual("react-native");
    return <Text>{name}</Text>;
  },
}));
jest.mock("@/providers/InactivityProvider", () => ({
  useInactivity: () => ({ resetInactivityTimer: () => {} }),
}));
jest.mock("@/hooks/useSyncPlaySheet", () => ({
  useSyncPlaySheet: () => mockOpen,
}));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => mockState,
}));

beforeEach(() => {
  mockOpen.mockClear();
  mockState = { group: null, available: true };
});

test("opens SyncPlay with what the page can queue", async () => {
  await render(
    <TVSyncPlayButton
      items={[{ Id: "movie", Type: "Movie" }]}
      title='Arrival'
    />,
  );
  await fireEvent.press(screen.getByText("people-outline"));
  expect(mockOpen).toHaveBeenCalledWith({ ids: ["movie"], title: "Arrival" });
});

test("opens it empty handed from a page a group cannot play", async () => {
  await render(
    <TVSyncPlayButton items={[{ Id: "s", Type: "Series" }]} title='Show' />,
  );
  await fireEvent.press(screen.getByText("people-outline"));
  expect(mockOpen).toHaveBeenCalledWith(undefined);
});

test("is filled while in a group", async () => {
  mockState.group = {};
  await render(<TVSyncPlayButton items={[]} />);
  expect(screen.getByText("people")).toBeTruthy();
});

test("is not there where SyncPlay cannot play", async () => {
  mockState.available = false;
  await render(<TVSyncPlayButton items={[]} />);
  expect(screen.queryByText("people-outline")).toBeNull();
});
