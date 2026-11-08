import { fireEvent, render, screen } from "@testing-library/react-native";
import type { Trailer } from "@/utils/jellyfin/media/trailers";
import { ItemActions } from "./SeriesActions";

let mockTrailers: Trailer[] = [];
const mockPlayTrailer = jest.fn();
const mockShowActionSheet = jest.fn();

jest.mock("@/hooks/useTrailers", () => ({
  useTrailers: () => ({ trailers: mockTrailers, playTrailer: mockPlayTrailer }),
}));
jest.mock("@expo/react-native-action-sheet", () => ({
  useActionSheet: () => ({ showActionSheetWithOptions: mockShowActionSheet }),
}));
const mockBottomInset = 24;
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    right: 0,
    bottom: mockBottomInset,
    left: 0,
  }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}:${options.name}` : key,
  }),
}));

const library: Trailer = {
  source: "library",
  id: "trailer-1",
  name: "Theatrical trailer",
  item: { Id: "trailer-1" },
};
const remote: Trailer = {
  source: "remote",
  url: "https://youtu.be/a",
  name: "Official trailer",
};

/** Answers the action sheet the way a tap on entry `index` would. */
const pickFromSheet = (index: number | undefined) => {
  const [, onSelect] = mockShowActionSheet.mock.calls[0];
  onSelect(index);
};

beforeEach(() => {
  mockTrailers = [library, remote];
  mockPlayTrailer.mockReset();
  mockShowActionSheet.mockReset();
});

describe("ItemActions", () => {
  test("shows no button when the item has no trailer to play", async () => {
    mockTrailers = [];
    await render(<ItemActions item={{ Id: "movie-1" }} />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  test("a tap plays the preferred trailer", async () => {
    await render(<ItemActions item={{ Id: "movie-1" }} />);

    await fireEvent.press(screen.getByRole("button"));

    expect(mockPlayTrailer).toHaveBeenCalledWith(library);
    expect(mockShowActionSheet).not.toHaveBeenCalled();
  });

  test("a long press lists every trailer with where it plays from", async () => {
    await render(<ItemActions item={{ Id: "movie-1" }} />);

    await fireEvent(screen.getByRole("button"), "longPress");

    expect(mockShowActionSheet.mock.calls[0][0]).toMatchObject({
      options: [
        "item_card.trailer_library:Theatrical trailer",
        "item_card.trailer_remote:Official trailer",
        "common.cancel",
      ],
      cancelButtonIndex: 2,
      containerStyle: { paddingBottom: mockBottomInset },
    });
    pickFromSheet(1);
    expect(mockPlayTrailer).toHaveBeenCalledWith(remote);
  });

  test("cancelling the list plays nothing", async () => {
    await render(<ItemActions item={{ Id: "movie-1" }} />);

    await fireEvent(screen.getByRole("button"), "longPress");
    pickFromSheet(2);
    pickFromSheet(undefined);

    expect(mockPlayTrailer).not.toHaveBeenCalled();
  });

  test("marks how many trailers there are once there is more than one", async () => {
    await render(<ItemActions item={{ Id: "movie-1" }} />);

    expect(screen.getByText("2")).toBeTruthy();
  });

  test("a single trailer carries no count", async () => {
    mockTrailers = [library];
    await render(<ItemActions item={{ Id: "movie-1" }} />);

    expect(screen.queryByText("1")).toBeNull();
  });

  test("the header button plays and lists the same way", async () => {
    await render(<ItemActions item={{ Id: "movie-1" }} variant='header' />);

    await fireEvent.press(screen.getByRole("button"));
    await fireEvent(screen.getByRole("button"), "longPress");

    expect(mockPlayTrailer).toHaveBeenCalledWith(library);
    expect(mockShowActionSheet).toHaveBeenCalledTimes(1);
  });
});
