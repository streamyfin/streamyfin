import { fireEvent, render, screen } from "@testing-library/react-native";
import { AWAITED_TITLE_EVENT } from "@/constants/Notifications";
import { MediaStatus, MediaType } from "@/utils/seerr/types";
import { AwaitTitleButton } from "./AwaitTitleButton";

const mockAdd = jest.fn();
const mockRemove = jest.fn();
let mockAwaited: {
  supported: boolean;
  titles: unknown[] | undefined;
  isAwaited: () => boolean;
  add: typeof mockAdd;
  remove: typeof mockRemove;
};
let mockMine:
  | { events: { key: string; family: string; enabled: boolean }[] }
  | undefined;

jest.mock("@/hooks/useAwaitedTitles", () => ({
  useAwaitedTitles: () => mockAwaited,
}));
jest.mock("@/hooks/useMyNotifications", () => ({
  useMyNotifications: () => ({ mine: mockMine }),
}));
jest.mock("@/hooks/useSeerr", () => ({
  useSeerr: () => ({ seerrUser: { id: 7 } }),
}));
// Button reaches the settings, and through them native modules, for its haptics.
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const matrix = {
  id: 603,
  title: "The Matrix",
  releaseDate: "1999-03-30",
  mediaInfo: { status: MediaStatus.UNKNOWN },
};

const renderButton = (details: unknown = matrix) =>
  render(
    <AwaitTitleButton details={details as never} mediaType={MediaType.MOVIE} />,
  );

describe("waiting for a title from its Seerr page", () => {
  beforeEach(() => {
    mockAdd.mockReset();
    mockRemove.mockReset();
    mockAwaited = {
      supported: true,
      titles: [],
      isAwaited: () => false,
      add: mockAdd,
      remove: mockRemove,
    };
    mockMine = {
      events: [{ key: AWAITED_TITLE_EVENT, family: "requests", enabled: true }],
    };
  });

  test("offers to tell the person when a title the server does not have arrives", async () => {
    await renderButton();

    fireEvent.press(screen.getByText("seerr.awaited.notify_me"));

    expect(mockAdd).toHaveBeenCalledWith({
      mediaType: "movie",
      tmdbId: 603,
      title: "The Matrix",
      year: 1999,
    });
  });

  test("says the person will be told, and stops waiting on a second press", async () => {
    mockAwaited.isAwaited = () => true;
    await renderButton();

    fireEvent.press(screen.getByText("seerr.awaited.waiting"));

    expect(mockRemove).toHaveBeenCalledWith("movie", 603);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  test("is not offered by a plugin that does not know the route", async () => {
    mockAwaited.supported = false;
    await renderButton();

    expect(screen.queryByText("seerr.awaited.notify_me")).toBeNull();
  });

  test("is not offered before the list and the person's events are known", async () => {
    mockAwaited.titles = undefined;
    await renderButton();
    expect(screen.queryByText("seerr.awaited.notify_me")).toBeNull();

    mockAwaited.titles = [];
    mockMine = undefined;
    await renderButton();
    expect(screen.queryByText("seerr.awaited.notify_me")).toBeNull();
  });

  test("is not offered for a title the server has", async () => {
    await renderButton({
      ...matrix,
      mediaInfo: { status: MediaStatus.AVAILABLE },
    });

    expect(screen.queryByText("seerr.awaited.notify_me")).toBeNull();
  });
});
