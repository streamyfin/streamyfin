import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { AWAITED_TITLE_EVENT } from "@/constants/Notifications";
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from "@/utils/seerr/types";
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

let mockAwaitedOptions: unknown;

jest.mock("@/hooks/useAwaitedTitles", () => ({
  useAwaitedTitles: (options: unknown) => {
    mockAwaitedOptions = options;
    return mockAwaited;
  },
}));
jest.mock("@/hooks/useMyNotifications", () => ({
  useMyNotifications: () => ({ mine: mockMine }),
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
    <AwaitTitleButton
      details={details as never}
      mediaType={MediaType.MOVIE}
      seerrUserId={7}
    />,
  );

// The person asked for it themselves, so Seerr tells them when it is available.
const requested = {
  ...matrix,
  mediaInfo: {
    status: MediaStatus.PENDING,
    requests: [
      {
        requestedBy: { id: 7 },
        status: MediaRequestStatus.APPROVED,
        is4k: false,
      },
    ],
  },
};

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

    await fireEvent.press(screen.getByText("seerr.awaited.notify_me"));

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

    await fireEvent.press(screen.getByText("seerr.awaited.waiting"));

    expect(mockRemove).toHaveBeenCalledWith("movie", 603);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  // A second press before the first change answered could reach the plugin first, and leave
  // the title in the state the person just left.
  test("ignores a press while its change is on its way", async () => {
    let answer: () => void = () => {};
    mockAdd.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          answer = resolve;
        }),
    );
    await renderButton();

    await fireEvent.press(screen.getByText("seerr.awaited.notify_me"));
    await fireEvent.press(screen.getByText("seerr.awaited.notify_me"));
    expect(mockAdd).toHaveBeenCalledTimes(1);

    await act(async () => answer());
    await fireEvent.press(screen.getByText("seerr.awaited.notify_me"));
    expect(mockAdd).toHaveBeenCalledTimes(2);
    // Answered too: a press left on its way leaves the renders of the tests after it empty.
    await act(async () => answer());
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

  // Waiting for it, they keep a way to stop, whatever changed since: they requested it,
  // part of it arrived, or they turned the event off.
  test("stays for a title the person waits for, even once they requested it", async () => {
    mockAwaited.isAwaited = () => true;
    await renderButton(requested);

    await fireEvent.press(screen.getByText("seerr.awaited.waiting"));

    expect(mockRemove).toHaveBeenCalledWith("movie", 603);
  });

  test("stays for a title the person waits for, with the event turned off", async () => {
    mockAwaited.isAwaited = () => true;
    mockMine = {
      events: [
        { key: AWAITED_TITLE_EVENT, family: "requests", enabled: false },
      ],
    };
    await renderButton();

    expect(screen.getByText("seerr.awaited.waiting")).toBeTruthy();
  });

  test("is not offered for a title the person requested themselves", async () => {
    await renderButton(requested);

    expect(screen.queryByText("seerr.awaited.notify_me")).toBeNull();
  });

  // NativeWind hands an app component the classes it was given as a style.
  test("keeps the spacing the page gives it", async () => {
    await render(
      <AwaitTitleButton
        details={matrix as never}
        mediaType={MediaType.MOVIE}
        seerrUserId={7}
        className='mt-2'
      />,
    );

    const button = screen.getByLabelText("seerr.awaited.notify_me");
    expect(StyleSheet.flatten(button.props.style)).toEqual(
      expect.objectContaining({ marginTop: 8 }),
    );
  });

  // A plugin that does not offer the event has no list to read, and a phone on a server
  // without it would ask on every Seerr page.
  test("reads the list only where the event is offered", async () => {
    await renderButton();
    expect(mockAwaitedOptions).toEqual({ enabled: true });

    mockMine = { events: [] };
    await renderButton();
    expect(mockAwaitedOptions).toEqual({ enabled: false });

    mockMine = undefined;
    await renderButton();
    expect(mockAwaitedOptions).toEqual({ enabled: false });
  });

  test("is not offered for a title the server has", async () => {
    await renderButton({
      ...matrix,
      mediaInfo: { status: MediaStatus.AVAILABLE },
    });

    expect(screen.queryByText("seerr.awaited.notify_me")).toBeNull();
  });
});
