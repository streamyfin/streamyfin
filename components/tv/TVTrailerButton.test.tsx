import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Provider as JotaiProvider } from "jotai";
import type React from "react";
import { TV_MODAL_FOCUS_RESTORE_MS } from "@/constants/Values";
import { tvOptionModalAtom } from "@/utils/atoms/tvOptionModal";
import type { Trailer } from "@/utils/jellyfin/media/trailers";
import { store } from "@/utils/store";
import { TVTrailerButton } from "./TVTrailerButton";

let mockTrailers: Trailer[] = [];
const mockPlayTrailer = jest.fn();
const mockRequestTVFocus = jest.fn();

jest.mock("@/hooks/useTrailers", () => ({
  useTrailers: () => ({ trailers: mockTrailers, playTrailer: mockPlayTrailer }),
}));
// The focus engine is TVButton's business; hand the component a ref that
// records being asked for the focus back.
jest.mock("./TVButton", () => {
  const { View: Box } = jest.requireActual("react-native");
  return {
    TVButton: ({
      children,
      onPress,
      onLongPress,
      refSetter,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      onLongPress?: () => void;
      refSetter?: (ref: unknown) => void;
    }) => {
      refSetter?.({ requestTVFocus: mockRequestTVFocus });
      return (
        <Box onPress={onPress} onLongPress={onLongPress}>
          {children}
        </Box>
      );
    },
  };
});
jest.mock("@/providers/InactivityProvider", () => ({
  useInactivity: () => ({ resetInactivityTimer: () => {} }),
}));
// Opening the list stands in for the modal route: it puts the list in the atom.
jest.mock("@/hooks/useTVOptionModal", () => ({
  useTVOptionModal: () => ({
    showOptions: (params: unknown) =>
      jest
        .requireActual("@/utils/store")
        .store.set(
          jest.requireActual("@/utils/atoms/tvOptionModal").tvOptionModalAtom,
          params,
        ),
  }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const library: Trailer = {
  source: "library",
  id: "trailer-1",
  item: { Id: "trailer-1" },
};
const remote: Trailer = { source: "remote", url: "https://youtu.be/a" };

const renderButton = () =>
  render(
    <JotaiProvider store={store}>
      <TVTrailerButton item={{ Id: "movie-1" }} />
    </JotaiProvider>,
  );

// The button is the whole tree: its pressable is the root host view.
const pressable = () => {
  if (!screen.root) throw new Error("expected the trailer button");
  return screen.root;
};

/** The modal route closing, and the wait for it to leave the screen. */
const closeList = async () => {
  await act(async () => {
    store.set(tvOptionModalAtom, null);
  });
  await act(async () => {
    jest.advanceTimersByTime(TV_MODAL_FOCUS_RESTORE_MS);
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  mockTrailers = [library, remote];
  mockPlayTrailer.mockReset();
  mockRequestTVFocus.mockReset();
  store.set(tvOptionModalAtom, null);
});

afterEach(() => jest.useRealTimers());

describe("TVTrailerButton", () => {
  test("is left out when the item has no trailer to play", async () => {
    mockTrailers = [];
    await renderButton();

    expect(screen.toJSON()).toBeNull();
  });

  test("pressing plays the preferred trailer", async () => {
    await renderButton();

    await fireEvent.press(pressable());

    expect(mockPlayTrailer).toHaveBeenCalledWith(library);
  });

  test("holding select lists every trailer", async () => {
    await renderButton();

    await fireEvent(pressable(), "longPress");

    expect(store.get(tvOptionModalAtom)?.options.map((o) => o.value)).toEqual([
      library,
      remote,
    ]);
  });

  // A player pushed while the list's route is still up is swallowed, so the
  // pick plays once the route has gone.
  test("plays the picked trailer only after the list has closed", async () => {
    await renderButton();
    await fireEvent(pressable(), "longPress");

    await act(async () => store.get(tvOptionModalAtom)?.onSelect(remote));
    expect(mockPlayTrailer).not.toHaveBeenCalled();

    await closeList();
    expect(mockPlayTrailer).toHaveBeenCalledWith(remote);
  });

  test("a dismissed list plays nothing", async () => {
    await renderButton();
    await fireEvent(pressable(), "longPress");

    await closeList();

    expect(mockPlayTrailer).not.toHaveBeenCalled();
  });

  test("hands the focus back to the button once a dismissed list has closed", async () => {
    await renderButton();
    await fireEvent(pressable(), "longPress");

    await closeList();

    expect(mockRequestTVFocus).toHaveBeenCalledTimes(1);
  });

  test("does not request the focus back when a trailer was picked", async () => {
    await renderButton();
    await fireEvent(pressable(), "longPress");

    await act(async () => store.get(tvOptionModalAtom)?.onSelect(remote));
    await closeList();

    expect(mockRequestTVFocus).not.toHaveBeenCalled();
  });
});
