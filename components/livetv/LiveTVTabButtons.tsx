import { Button, Host } from "@expo/ui/swift-ui";
import { Platform, TouchableOpacity, View } from "react-native";
import { Tag } from "@/components/GenreTags";

export type LiveTVTab = "programs" | "guide" | "channels" | "recordings";

const TABS: { key: LiveTVTab; labelKey: string }[] = [
  { key: "guide", labelKey: "live_tv.guide" },
  { key: "channels", labelKey: "live_tv.channels" },
  { key: "programs", labelKey: "live_tv.programs" },
  { key: "recordings", labelKey: "live_tv.recordings" },
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
  if (Platform.OS === "ios") {
    return (
      <View style={{ flexDirection: "row", gap: 8 }}>
        {TABS.map(({ key, labelKey }) => (
          <Host key={key} style={{ height: 40, minWidth: 80 }}>
            <Button
              variant={activeTab === key ? "glassProminent" : "glass"}
              onPress={() => onChange(key)}
            >
              {t(labelKey)}
            </Button>
          </Host>
        ))}
      </View>
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
