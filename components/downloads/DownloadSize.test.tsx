import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { render, screen } from "@testing-library/react-native";
// Number.prototype.bytesToReadable, which the app loads at startup.
import "@/augmentations/number";
import { DownloadSize } from "./DownloadSize";

const mockDownloadedItems: unknown[] = [];
const mockGetDownloadedItemSize = jest.fn();

jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    downloadedItems: mockDownloadedItems,
    getDownloadedItemSize: mockGetDownloadedItemSize,
  }),
}));

const FILES: { item: BaseItemDto }[] = [
  { item: { Id: "a" } },
  { item: { Id: "b" } },
];

// The downloads header builds the list inside its render function, so the
// component gets a new array with the same items on every header render.
const Header = () => <DownloadSize items={FILES.map((file) => file.item)} />;

describe("DownloadSize", () => {
  beforeEach(() => {
    mockGetDownloadedItemSize
      .mockReset()
      .mockImplementation((id: string) => (id === "a" ? 1024 : 2048));
  });

  test("shows the size of the items together", async () => {
    await render(<Header />);

    expect(screen.getByText((3072).bytesToReadable())).toBeTruthy();
  });

  // REACT-NATIVE-4N: every header render re-ran an effect that added the
  // sizes up again and set state, which is where React gave up with "Maximum
  // update depth exceeded" when something kept re-rendering the header.
  test("a render with the same items does not add them up again", async () => {
    const view = await render(<Header />);
    const calls = mockGetDownloadedItemSize.mock.calls.length;

    await view.rerender(<Header />);
    await view.rerender(<Header />);

    expect(mockGetDownloadedItemSize).toHaveBeenCalledTimes(calls);
    expect(screen.getByText((3072).bytesToReadable())).toBeTruthy();
  });
});
