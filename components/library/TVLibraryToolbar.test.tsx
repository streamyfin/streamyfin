import { act, render, screen } from "@testing-library/react-native";
import type React from "react";
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
    }: {
      children: React.ReactNode;
      refSetter?: (ref: unknown) => void;
    }) => {
      useEffect(() => {
        const requestTVFocus = jest.fn();
        refSetter?.({
          requestTVFocus: () => mockRequestFocus.current?.(requestTVFocus),
        });
      }, [refSetter]);
      return <Box>{children}</Box>;
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
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

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
