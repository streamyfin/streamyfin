import { menuOrder } from "@expo/ui/swift-ui/modifiers";
import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";
import {
  type OptionGroup,
  PlatformDropdown,
} from "@/components/PlatformDropdown";
import { renderedMenuModifiers } from "@/test-utils/expoUi";

jest.mock(
  "@expo/ui/swift-ui",
  () => jest.requireActual("@/test-utils/expoUi").swiftUiModule,
);
jest.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetScrollView: jest.requireActual("react-native").View,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/providers/GlobalModalProvider", () => ({
  useGlobalModal: () => ({
    showModal: jest.fn(),
    hideModal: jest.fn(),
    isVisible: false,
  }),
}));

const groups: OptionGroup[] = [
  {
    title: "Quality",
    options: [
      {
        type: "radio",
        label: "1080p",
        value: "1080",
        selected: true,
        onPress: jest.fn(),
      },
      {
        type: "radio",
        label: "720p",
        value: "720",
        selected: false,
        onPress: jest.fn(),
      },
    ],
  },
  {
    options: [{ type: "action", label: "Reset", onPress: jest.fn() }],
  },
];

describe("PlatformDropdown on iOS", () => {
  // UIMenu orders items by distance to the anchor, so a menu that opens upward
  // lists them backwards. #1847 fixed it and #1937 moved the fix to the
  // upstream modifier; a squash on a stale base in #1543 then dropped it.
  test("keeps the items of the menu and its submenu in the given order", async () => {
    await render(
      <PlatformDropdown
        trigger={
          <View>
            <Text>Open</Text>
          </View>
        }
        groups={groups}
      />,
    );

    const modifiers = renderedMenuModifiers(screen);
    expect(modifiers).toHaveLength(2);
    for (const list of modifiers) {
      expect(list).toContainEqual(menuOrder("fixed"));
    }
  });
});
