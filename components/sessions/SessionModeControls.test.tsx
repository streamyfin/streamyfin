import type { SessionInfoDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { REMOTE_MODE_CONFIRM_TIMEOUT } from "@/constants/Playback";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { SessionModeControls } from "./SessionModeControls";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  const { makeApi: make } = jest.requireActual("@/test-utils/jellyfinApi");
  const mockApi = make();
  return { apiAtom: atom(mockApi), mockApi };
});

const api: ReturnType<typeof makeApi> = jest.requireMock(
  "@/providers/JellyfinProvider",
).mockApi;

const COMMAND_URL = "https://jellyfin.example.com/Sessions/session-1/Command";

const sessionWith = (
  playState: SessionInfoDto["PlayState"] = {},
  supported: SessionInfoDto["SupportedCommands"] = [
    "SetRepeatMode",
    "SetShuffleQueue",
  ],
): SessionInfoDto => ({
  Id: "session-1",
  PlayState: playState,
  SupportedCommands: supported,
});

/** The commands sent so far, as the client on the other end receives them. */
const sentCommands = () =>
  api.mock.history.post.map((request) => JSON.parse(request.data));

describe("SessionModeControls", () => {
  beforeEach(() => {
    api.mock.reset();
    api.mock.onPost(COMMAND_URL).reply(204);
  });

  test("shows nothing for a client that takes neither command", async () => {
    await render(<SessionModeControls session={sessionWith({}, ["Play"])} />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  test("shows only the control the client supports", async () => {
    await render(
      <SessionModeControls session={sessionWith({}, ["SetShuffleQueue"])} />,
    );

    expect(screen.getByLabelText("music.shuffle")).toBeTruthy();
    expect(screen.queryByLabelText("home.sessions.repeat_off")).toBeNull();
  });

  test("turns shuffle on with the value jellyfin-web sends", async () => {
    await render(<SessionModeControls session={sessionWith()} />);

    await fireEvent.press(screen.getByLabelText("music.shuffle"));

    await waitFor(() =>
      expect(sentCommands()).toEqual([
        { Name: "SetShuffleQueue", Arguments: { ShuffleMode: "Shuffle" } },
      ]),
    );
  });

  test("turns shuffle off for a session that reports it on", async () => {
    await render(
      <SessionModeControls
        session={sessionWith({ PlaybackOrder: "Shuffle" })}
      />,
    );

    const button = screen.getByLabelText("music.shuffle");
    expect(button.props.accessibilityState.selected).toBe(true);
    await fireEvent.press(button);

    await waitFor(() =>
      expect(sentCommands()).toEqual([
        { Name: "SetShuffleQueue", Arguments: { ShuffleMode: "Sorted" } },
      ]),
    );
  });

  // The session reports a new mode seconds after the command. A second tap in
  // between has to move on from the mode just requested, not repeat it.
  test("a second tap on repeat moves on before the session answers", async () => {
    await render(<SessionModeControls session={sessionWith()} />);

    await fireEvent.press(screen.getByLabelText("home.sessions.repeat_off"));
    await fireEvent.press(
      await screen.findByLabelText("home.sessions.repeat_all"),
    );

    await waitFor(() =>
      expect(sentCommands()).toEqual([
        { Name: "SetRepeatMode", Arguments: { RepeatMode: "RepeatAll" } },
        { Name: "SetRepeatMode", Arguments: { RepeatMode: "RepeatOne" } },
      ]),
    );
    expect(screen.getByLabelText("home.sessions.repeat_one")).toBeTruthy();
  });

  // A poll can catch the session between two commands. That report is the
  // first tap taking effect, not the session refusing the second.
  test("keeps the requested mode while the session catches up", async () => {
    const view = await render(<SessionModeControls session={sessionWith()} />);
    await fireEvent.press(screen.getByLabelText("home.sessions.repeat_off"));
    await fireEvent.press(screen.getByLabelText("home.sessions.repeat_all"));

    await view.rerender(
      <SessionModeControls
        session={sessionWith({ RepeatMode: "RepeatAll" })}
      />,
    );

    expect(screen.getByLabelText("home.sessions.repeat_one")).toBeTruthy();
  });

  test("follows the session again once it has confirmed the mode", async () => {
    const view = await render(<SessionModeControls session={sessionWith()} />);
    await fireEvent.press(screen.getByLabelText("music.shuffle"));
    await view.rerender(
      <SessionModeControls
        session={sessionWith({ PlaybackOrder: "Shuffle" })}
      />,
    );

    // Someone at the device turns shuffle back off right away.
    await view.rerender(<SessionModeControls session={sessionWith()} />);

    expect(
      screen.getByLabelText("music.shuffle").props.accessibilityState.selected,
    ).toBe(false);
  });

  test("goes back to the reported mode when the command fails", async () => {
    api.mock.reset();
    api.mock.onPost(COMMAND_URL).networkError();
    await render(<SessionModeControls session={sessionWith()} />);

    await fireEvent.press(screen.getByLabelText("home.sessions.repeat_off"));

    await waitFor(() => expect(api.mock.history.post).toHaveLength(1));
    expect(
      await screen.findByLabelText("home.sessions.repeat_off"),
    ).toBeTruthy();
  });

  // The commands are not queued behind each other, so the failure of the
  // first can come in after the second tap. It speaks for the first only.
  test("a failed command leaves a later request standing", async () => {
    let failFirst = () => {};
    api.mock.reset();
    api.mock.onPost(COMMAND_URL).replyOnce(
      () =>
        new Promise((resolve) => {
          failFirst = () => resolve([500]);
        }),
    );
    api.mock.onPost(COMMAND_URL).reply(204);
    await render(<SessionModeControls session={sessionWith()} />);

    await fireEvent.press(screen.getByLabelText("home.sessions.repeat_off"));
    await fireEvent.press(screen.getByLabelText("home.sessions.repeat_all"));
    await waitFor(() => expect(api.mock.history.post).toHaveLength(2));
    await act(async () => failFirst());

    expect(screen.getByLabelText("home.sessions.repeat_one")).toBeTruthy();
  });

  test("gives up on a mode the client never confirms", async () => {
    jest.useFakeTimers();
    try {
      await render(<SessionModeControls session={sessionWith()} />);
      await fireEvent.press(screen.getByLabelText("music.shuffle"));
      expect(
        screen.getByLabelText("music.shuffle").props.accessibilityState
          .selected,
      ).toBe(true);

      await act(async () => {
        jest.advanceTimersByTime(REMOTE_MODE_CONFIRM_TIMEOUT);
      });

      expect(
        screen.getByLabelText("music.shuffle").props.accessibilityState
          .selected,
      ).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
