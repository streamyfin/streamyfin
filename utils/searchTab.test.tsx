import { render } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { stubReactNative } from "@/test-utils/reactNative";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("@/components/tv/TVNavBar", () => ({ TVNavBar: () => null }));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: {} }),
}));
jest.mock("@/components/music/MiniPlayerBar", () => ({
  MiniPlayerBar: () => null,
}));
jest.mock("@/components/music/MusicPlaybackEngine", () => ({
  MusicPlaybackEngine: () => null,
}));

// The native tab bar is not in Jest: a stand-in that keeps the props each
// trigger was given.
const mockTriggers: Record<string, Record<string, unknown>> = {};
jest.mock("expo-router/native-tabs", () => {
  const Trigger = ({
    children,
    ...props
  }: {
    name: string;
    children?: ReactNode;
  }) => {
    mockTriggers[props.name] = props;
    return null;
  };
  Trigger.Label = () => null;
  Trigger.Icon = () => null;
  const NativeTabs = ({ children }: { children?: ReactNode }) => children;
  NativeTabs.Trigger = Trigger;
  return { NativeTabs };
});

const renderTabs = async () => {
  const TabsLayout = jest.requireActual("@/app/(auth)/(tabs)/_layout").default;
  await render(<TabsLayout />);
  return mockTriggers["(search)"];
};

beforeEach(() => {
  for (const name of Object.keys(mockTriggers)) delete mockTriggers[name];
  stubReactNative();
});

describe("the Search tab", () => {
  // Selecting a search tab that activates its field turns closing the field
  // into leaving the tab: iOS goes back to the tab you came from.
  test("does not activate its field when selected, so closing it stays on Search", async () => {
    const search = await renderTabs();
    expect(search.role).toBe("search");
    expect(search.disableAutomaticSearchActivation).toBe(true);
  });

  // On iOS 27 a search tab that is not activated on selection loses its own
  // place in the bar; prominent puts it back on its own surface.
  test("keeps its own surface in the phone bar", async () => {
    const search = await renderTabs();
    expect(search.prominent).toBe(true);
  });

  test("stays a plain labelled tab on TV", async () => {
    stubReactNative({ isTV: true });
    const search = await renderTabs();
    expect(search.role).toBeUndefined();
    expect(search.prominent).toBe(false);
  });
});
