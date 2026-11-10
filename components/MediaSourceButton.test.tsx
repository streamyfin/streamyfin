import {
  accessibilityLabel,
  background,
  frame,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { render } from "@testing-library/react-native";
import type React from "react";
import { View } from "react-native";
import { MediaSourceButton } from "@/components/MediaSourceButton";
import { stubReactNative } from "@/test-utils/reactNative";

// What the button hands the dropdown: the native label is the part under test.
let mockDropdownProps: { nativeLabel?: React.ReactNode } = {};
jest.mock("./PlatformDropdown", () => ({
  PlatformDropdown: (props: { nativeLabel?: React.ReactNode }) => {
    mockDropdownProps = props;
    return null;
  },
}));
// The SwiftUI views stand in as views that keep what they were given.
jest.mock("@expo/ui/swift-ui", () => {
  const { View } = jest.requireActual("react-native");
  return {
    Image: (props: object) => <View testID='swiftui-image' {...props} />,
    ProgressView: (props: object) => (
      <View testID='swiftui-progress' {...props} />
    ),
  };
});
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: {} }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const MOVIE: BaseItemDto = {
  Id: "movie-1",
  Type: "Movie",
  MediaSources: [{ Id: "source-1", MediaStreams: [] }],
};
const COLORS = { primary: "#7c3aed", text: "#ffffff" };

const renderButton = async (item?: BaseItemDto) => {
  await render(
    <MediaSourceButton
      item={item}
      selectedOptions={{} as never}
      setSelectedOptions={jest.fn()}
      colors={COLORS}
    />,
  );
  return render(<View>{mockDropdownProps.nativeLabel}</View>);
};

beforeEach(() => {
  mockDropdownProps = {};
  stubReactNative({ OS: "ios" });
});

describe("MediaSourceButton", () => {
  // A React Native trigger inside the SwiftUI menu is hosted in a view whose
  // frame both layout engines set, and the button could be left below its
  // place on the page. A label drawn by SwiftUI has nothing to be hosted.
  test("draws its label in SwiftUI on iOS: the list symbol on the poster's color", async () => {
    const { getByTestId } = await renderButton(MOVIE);

    const image = getByTestId("swiftui-image");
    expect(image.props.systemName).toBe("list.bullet");
    expect(image.props.color).toBe(COLORS.text);
    expect(image.props.modifiers).toEqual([
      frame({ width: 48, height: 48 }),
      background("#7c3aedb3", shapes.circle()),
      accessibilityLabel("item_card.media_options"),
    ]);
  });

  // The progress view stands for the button while it loads, so a screen
  // reader names it as the button, not as a bare progress indicator.
  test("shows a native progress view on that circle until the item is there", async () => {
    const { getByTestId, queryByTestId } = await renderButton(undefined);

    expect(queryByTestId("swiftui-image")).toBeNull();
    expect(getByTestId("swiftui-progress").props.modifiers).toEqual([
      frame({ width: 48, height: 48 }),
      background("#7c3aedb3", shapes.circle()),
      accessibilityLabel("item_card.media_options"),
    ]);
  });

  test("keeps its React Native trigger alone on Android", async () => {
    stubReactNative({ OS: "android" });
    await renderButton(MOVIE);

    expect(mockDropdownProps.nativeLabel).toBeUndefined();
  });
});
