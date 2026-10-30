import { Platform, TouchableOpacity, View } from "react-native";
import { Tag } from "@/components/GenreTags";

// @expo/ui's SwiftUI native module (ExpoUI) does not exist in tvOS builds.
// A static top-level import crashes the route tree on tvOS at module load.
const { Button, Host, HStack, Spacer } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui"))
  : require("@expo/ui/swift-ui");
const { buttonStyle } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui/modifiers"))
  : require("@expo/ui/swift-ui/modifiers");

export type LiveTVTab = "programs" | "guide" | "channels" | "recordings";

const TABS: { key: LiveTVTab; labelKey: string }[] = [
  { key: "channels", labelKey: "live_tv.tabs.channels" },
  { key: "guide", labelKey: "live_tv.tabs.guide" },
  { key: "programs", labelKey: "live_tv.tabs.programs" },
  { key: "recordings", labelKey: "live_tv.tabs.recordings" },
];

interface Props {
  activeTab: LiveTVTab;
  onChange: (tab: LiveTVTab) => void;
  t: (key: string) => string;
}

export const LiveTVTabButtons: React.FC<Props> = ({
  activeTab,
  onChange,
  t,
}) => {
  if (Platform.OS === "ios" && !Platform.isTV) {
    return (
      <Host style={{ height: 40, flex: 1 }}>
        <HStack spacing={8}>
          {TABS.map(({ key, labelKey }) => (
            <Button
              key={key}
              modifiers={[
                buttonStyle(activeTab === key ? "glassProminent" : "glass"),
              ]}
              onPress={() => onChange(key)}
              label={t(labelKey)}
            />
          ))}
          <Spacer />
        </HStack>
      </Host>
    );
  }

  return (
    <View className='flex flex-row gap-1'>
      {TABS.map(({ key, labelKey }) => (
        <TouchableOpacity key={key} onPress={() => onChange(key)}>
          <Tag
            text={t(labelKey)}
            textClass='p-1'
            className={activeTab === key ? "bg-purple-600" : undefined}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
};
