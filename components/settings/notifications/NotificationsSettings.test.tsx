import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type React from "react";
import { stubReactNative } from "@/test-utils/reactNative";
import { NotificationsSettings } from "./NotificationsSettings";

const mockUpdate = jest.fn();
const mockUnmute = jest.fn();
const mockRefetch = jest.fn();
const mockStopWaiting = jest.fn();
let mockState: Record<string, unknown> = {};
let mockAwaited: Record<string, unknown> = {};
let mockPermission = "granted";

jest.mock("@/hooks/useMyNotifications", () => ({
  useMyNotifications: () => mockState,
}));
jest.mock("@/hooks/useAwaitedTitles", () => ({
  useAwaitedTitles: () => mockAwaited,
}));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: () => Promise.resolve({ status: mockPermission }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/components/PlatformDropdown", () => ({
  PlatformDropdown: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));

const base = {
  pause: null,
  events: [
    { key: "itemAdded", family: "new-content", enabled: true },
    { key: "userLockedOut", family: "account", enabled: true },
  ],
  libraries: [{ id: "movies", name: "Movies", enabled: true }],
  follow: { favorites: true, started: true },
  mutedShows: [] as { id: string; name: string }[],
};

const state = (mine: unknown, extra: Record<string, unknown> = {}) => ({
  mine,
  supported: true,
  isLoading: false,
  isError: false,
  update: mockUpdate,
  pause: jest.fn(),
  resume: jest.fn(),
  unmute: mockUnmute,
  refetch: mockRefetch,
  ...extra,
});

describe("the Notifications screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stubReactNative();
    mockState = state(base);
    mockAwaited = { supported: true, titles: [], remove: mockStopWaiting };
    mockPermission = "granted";
  });

  test("shows no server alerts to somebody who gets none", async () => {
    await render(<NotificationsSettings />);

    expect(
      screen.getByText("home.settings.notifications.events.item_added"),
    ).toBeTruthy();
    expect(
      screen.queryByText("home.settings.notifications.groups.server"),
    ).toBeNull();
  });

  test("shows the server alerts the plugin sends", async () => {
    mockState = state({
      ...base,
      events: [
        ...base.events,
        { key: "taskFailed", family: "server-alerts", enabled: true },
      ],
    });

    await render(<NotificationsSettings />);

    expect(
      screen.getByText("home.settings.notifications.groups.server"),
    ).toBeTruthy();
  });

  test("sends a switched event at once", async () => {
    await render(<NotificationsSettings />);

    await fireEvent(
      screen.getByTestId("event-itemAdded"),
      "valueChange",
      false,
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        events: expect.arrayContaining([
          expect.objectContaining({ key: "itemAdded", enabled: false }),
        ]),
      }),
    );
  });

  test("turns one library off", async () => {
    await render(<NotificationsSettings />);

    await fireEvent(screen.getByTestId("library-movies"), "valueChange", false);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        libraries: [{ id: "movies", name: "Movies", enabled: false }],
      }),
    );
  });

  // With new movies and episodes off, the libraries decide nothing.
  test("greys the libraries out while new movies and episodes are off", async () => {
    mockState = state({
      ...base,
      events: [{ key: "itemAdded", family: "new-content", enabled: false }],
    });

    await render(<NotificationsSettings />);

    expect(screen.getByTestId("library-movies").props.disabled).toBe(true);
  });

  test("turns a show back on", async () => {
    mockState = state({
      ...base,
      mutedShows: [{ id: "bear", name: "The Bear" }],
    });

    await render(<NotificationsSettings />);
    await fireEvent.press(
      screen.getByText("home.settings.notifications.muted.turn_back_on"),
    );

    expect(mockUnmute).toHaveBeenCalledWith("bear");
  });

  // A phone that blocks notifications says so, and the choices stay editable.
  test("says when the phone blocks notifications", async () => {
    mockPermission = "denied";

    await render(<NotificationsSettings />);

    await waitFor(() =>
      expect(
        screen.getByText("home.settings.notifications.blocked.title"),
      ).toBeTruthy(),
    );
    expect(screen.getByTestId("event-itemAdded")).toBeTruthy();
  });

  // Opened from the iOS Settings on a server whose plugin has no such route.
  test("says so when the server does not offer it", async () => {
    mockState = state(undefined, { supported: false });

    await render(<NotificationsSettings />);

    expect(
      screen.getByText("home.settings.notifications.unsupported"),
    ).toBeTruthy();
  });

  test("offers to try again when the choices could not be read", async () => {
    mockState = state(undefined, { isError: true });

    await render(<NotificationsSettings />);
    await fireEvent.press(
      screen.getByText("home.settings.notifications.try_again"),
    );

    expect(mockRefetch).toHaveBeenCalled();
  });

  describe("the titles the person waits for", () => {
    const matrix = {
      mediaType: "movie",
      tmdbId: 603,
      title: "The Matrix",
      year: 1999,
      addedAt: "2026-10-08T08:00:00Z",
      arrived: false,
    };

    test("lists each title with its year", async () => {
      mockAwaited.titles = [matrix];
      await render(<NotificationsSettings />);

      expect(
        screen.getByText("home.settings.notifications.groups.awaited"),
      ).toBeTruthy();
      expect(screen.getByText("The Matrix")).toBeTruthy();
      expect(screen.getByText("1999")).toBeTruthy();
    });

    test("stops waiting for a title", async () => {
      mockAwaited.titles = [matrix];
      await render(<NotificationsSettings />);

      fireEvent.press(screen.getByText("The Matrix"));

      expect(mockStopWaiting).toHaveBeenCalledWith("movie", 603);
    });

    // It arrived during a pause, and is told once the pause ends.
    test("says when a title is already here, held by the pause", async () => {
      mockAwaited.titles = [{ ...matrix, arrived: true }];
      await render(<NotificationsSettings />);

      expect(
        screen.getByText("home.settings.notifications.awaited.arrived"),
      ).toBeTruthy();
    });

    test.each([
      ["the person waits for nothing", { titles: [] }],
      ["the list is not known yet", { titles: undefined }],
      // A 404 leaves the list unknown.
      [
        "the plugin does not know the route",
        { supported: false, titles: undefined },
      ],
      // A later read failing keeps the list the query had.
      [
        "the route went away after a list was read",
        { supported: false, titles: [matrix] },
      ],
    ])("shows no section when %s", async (_case, awaited) => {
      mockAwaited = { ...mockAwaited, ...awaited };
      await render(<NotificationsSettings />);

      expect(
        screen.queryByText("home.settings.notifications.groups.awaited"),
      ).toBeNull();
    });

    test("names the event that tells the person", async () => {
      mockState = state({
        ...base,
        events: [
          ...base.events,
          { key: "awaitedTitle", family: "requests", enabled: true },
        ],
      });
      await render(<NotificationsSettings />);

      expect(
        screen.getByText("home.settings.notifications.events.awaited_title"),
      ).toBeTruthy();
    });
  });
});
