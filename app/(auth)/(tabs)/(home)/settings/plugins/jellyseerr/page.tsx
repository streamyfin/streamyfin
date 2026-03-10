import CookieManager from "@react-native-cookies/cookies";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { Button } from "@/components/Button";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { JellyseerrSettings } from "@/components/settings/Jellyseerr";
import { useSettings } from "@/utils/atoms/settings";
import { storage } from "@/utils/mmkv";

export default function page() {
  const { pluginSettings } = useSettings();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <DisabledSetting
        disabled={pluginSettings?.jellyseerrServerUrl?.locked === true}
        className='px-4'
      >
        <JellyseerrSettings />
      </DisabledSetting>
      {__DEV__ && (
        <View className='px-4 pt-2'>
          <Button
            color='purple'
            onPress={async () => {
              await CookieManager.clearAll();
              // Keep MMKV cookies non-empty so jellyseerrApi stays alive
              storage.setAny("JELLYSEERR_COOKIES", ["XSRF-TOKEN=invalid"]);
              toast.info("DEV: Session invalidated – open Discover");
            }}
          >
            DEV: Simulate expired session
          </Button>
        </View>
      )}
    </ScrollView>
  );
}
