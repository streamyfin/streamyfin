import { act, render, screen } from "@testing-library/react-native";
import type React from "react";
import { stubReactNative } from "@/test-utils/reactNative";
import {
  TVLibraryToolbar,
  type TVLibraryToolbarAction,
} from "./TVLibraryToolbar";

const mockRequestFocus: Record<string, jest.Mock> = {};

// The button is the focus engine's business. It stands in as its label and
// hands the toolbar a handle that records being asked for the focus.
jest.mock("@/components/tv/TVButton", () => {
  const { useEffect } = jest.requireActual("react");
  const { View: Box } = jest.requireActual("react-native");
  return {
    TVButton: ({
      children,
      refSetter,
      hasTVPreferredFocus,
    }: {
      children: React.ReactNode;
      refSetter?: (ref: unknown) => void;
      hasTVPreferredFocus?: boolean;
    }) => {
      useEffect(() => {
        const requestTVFocus = jest.fn();
        refSetter?.({
          requestTVFocus: () => mockRequestFocus.current?.(requestTVFocus),
        });
      }, [refSetter]);
      return <Box hasTVPreferredFocus={hasTVPreferredFocus}>{children}</Box>;
    },
  };
});
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ callout: 18, heading: 24 }),
}));

const actions: TVLibraryToolbarAction[] = [
  { key: "sort", icon: "swap-vertical", label: "Sort", onPress: () => {} },
  {
    key: "filters",
    icon: "funnel-outline",
    label: "Filters",
    onPress: () => {},
  },
];

describe("TVLibraryToolbar", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    stubReactNative({ OS: "ios", isTV: false });
  });
  afterEach(() => {
    jest.useRealTimers();
    stubReactNative();
  });

  const preferredFocusOf = (label: string) =>
    screen.getByText(label).parent?.props.hasTVPreferredFocus;

  // Movies disables Play all/Shuffle while its grid loads; tvOS can then fall
  // back to the native tab bar. Sort is always enabled and owns preferred
  // focus instead, before and after the grid arrives (docs/conventions/tv.md).
  test("on tvOS a queueable page prefers the always-enabled Sort action", async () => {
    stubReactNative({ OS: "ios", isTV: true });
    const queueable: TVLibraryToolbarAction[] = [
      {
        key: "play",
        icon: "play",
        label: "Play all",
        onPress: () => {},
        disabled: true,
      },
      {
        key: "shuffle",
        icon: "shuffle",
        label: "Shuffle",
        onPress: () => {},
        disabled: true,
      },
      { key: "sort", icon: "swap-vertical", label: "Sort", onPress: () => {} },
      {
        key: "filters",
        icon: "funnel-outline",
        label: "Filters",
        onPress: () => {},
      },
    ];
    const view = await render(
      <TVLibraryToolbar title='Movies' actions={queueable} />,
    );

    expect(preferredFocusOf("Sort")).toBe(true);
    expect(preferredFocusOf("Play all")).toBe(false);
    expect(preferredFocusOf("Shuffle")).toBe(false);

    await view.rerender(
      <TVLibraryToolbar
        title='Movies'
        actions={queueable.map((action) => ({ ...action, disabled: false }))}
      />,
    );
    expect(preferredFocusOf("Sort")).toBe(true);

    // A disabled Sort must not be picked either: the next enabled action is.
    await view.rerender(
      <TVLibraryToolbar
        title='Movies'
        actions={queueable.map((action) => ({
          ...action,
          disabled: action.key !== "filters",
        }))}
      />,
    );
    expect(preferredFocusOf("Filters")).toBe(true);
  });

  test("on Android TV the first action keeps preferred focus", async () => {
    stubReactNative({ OS: "android", isTV: true });
    const androidActions: TVLibraryToolbarAction[] = [
      { key: "play", icon: "play", label: "Play all", onPress: () => {} },
      { key: "sort", icon: "swap-vertical", label: "Sort", onPress: () => {} },
    ];
    await render(<TVLibraryToolbar title='Shows' actions={androidActions} />);

    expect(preferredFocusOf("Play all")).toBe(true);
    expect(preferredFocusOf("Sort")).toBe(false);
  });

  test("shows the library's name, its actions and what is filtered", async () => {
    await render(
      <TVLibraryToolbar
        title='Movies'
        actions={actions}
        summary='Audio languages: Japanese'
      />,
    );

    expect(screen.getByText("Movies")).toBeTruthy();
    expect(screen.getByText("Sort")).toBeTruthy();
    expect(screen.getByText("Filters")).toBeTruthy();
    expect(screen.getByText("Audio languages: Japanese")).toBeTruthy();
  });

  // A sheet that closes leaves Android TV with nothing focused: the next Back
  // then left the library instead of doing nothing.
  test("hands the focus back to the action it is asked for", async () => {
    const asked = jest.fn();
    mockRequestFocus.current = asked;
    const view = await render(
      <TVLibraryToolbar title='Movies' actions={actions} />,
    );
    await act(async () => jest.runAllTimers());
    expect(asked).not.toHaveBeenCalled();

    await view.rerender(
      <TVLibraryToolbar
        title='Movies'
        actions={actions}
        focusRequest={{ key: "filters" }}
      />,
    );
    await act(async () => jest.runAllTimers());

    expect(asked).toHaveBeenCalledTimes(1);
  });
});
