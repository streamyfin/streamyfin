import {
  accessibilityLabel,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Children, type ReactElement } from "react";
import { stubReactNative } from "@/test-utils/reactNative";
import { swiftUiPickerProps } from "@/test-utils/swiftUi";
import {
  type AudiobookPlayerTabItem,
  AudiobookPlayerTabs,
} from "./AudiobookPlayerTabs";

const tabs: AudiobookPlayerTabItem[] = [
  { tab: "player", label: "Now playing" },
  { tab: "chapters", label: "Chapters" },
  { tab: "bookmarks", label: "Bookmarks" },
  { tab: "queue", label: "Up next" },
];

// iOS draws the system's segmented control, Android the app's own. Both are
// the same four views to whoever uses them.
describe.each(["ios", "android"] as const)(
  "AudiobookPlayerTabs on %s",
  (OS) => {
    beforeEach(() => {
      stubReactNative({ OS });
    });

    test("marks the view showing", async () => {
      await render(
        <AudiobookPlayerTabs
          tabs={tabs}
          activeTab='chapters'
          onSelect={() => {}}
        />,
      );

      const segments = screen.getAllByRole("tab");
      expect(segments).toHaveLength(4);
      expect(segments[1]).toBeSelected();
      expect(segments[0]).not.toBeSelected();
    });

    test("reports the view that was picked", async () => {
      const onSelect = jest.fn();
      await render(
        <AudiobookPlayerTabs
          tabs={tabs}
          activeTab='player'
          onSelect={onSelect}
        />,
      );

      await fireEvent.press(screen.getAllByRole("tab")[3]);

      expect(onSelect).toHaveBeenCalledWith("queue");
    });
  },
);

describe("AudiobookPlayerTabs", () => {
  test("is the system's segmented control on iOS", async () => {
    stubReactNative({ OS: "ios" });
    await render(
      <AudiobookPlayerTabs
        tabs={tabs}
        activeTab='player'
        onSelect={() => {}}
      />,
    );

    expect(swiftUiPickerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: "player",
        modifiers: [pickerStyle("segmented")],
      }),
    );
  });

  // The segments are symbols: VoiceOver reads each one's name instead.
  test("names every symbol for VoiceOver", async () => {
    stubReactNative({ OS: "ios" });
    await render(
      <AudiobookPlayerTabs
        tabs={tabs}
        activeTab='player'
        onSelect={() => {}}
      />,
    );

    const { children } = swiftUiPickerProps.mock.calls.at(-1)[0];
    const modifiers = Children.toArray(children).map(
      (child) =>
        (child as ReactElement<{ modifiers: unknown[] }>).props.modifiers,
    );
    expect(modifiers).toEqual(
      tabs.map(({ tab, label }) => [tag(tab), accessibilityLabel(label)]),
    );
  });

  test("names every button on Android", async () => {
    stubReactNative({ OS: "android" });
    await render(
      <AudiobookPlayerTabs
        tabs={tabs}
        activeTab='player'
        onSelect={() => {}}
      />,
    );

    expect(screen.getByRole("tab", { name: "Up next" })).toBeTruthy();
    expect(swiftUiPickerProps).not.toHaveBeenCalled();
  });
});
