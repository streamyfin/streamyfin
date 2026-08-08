import { useEffect } from "react";
import { Platform, View } from "react-native";
import GoogleCast, {
  CastButton,
  CastContext,
  useCastDevice,
  useDevices,
  useMediaStatus,
  useRemoteMediaClient,
} from "react-native-google-cast";
import { HeaderButton, type HeaderButtonProps } from "./common/HeaderButton";
import { HeaderIcon } from "./common/HeaderIcon";

type Props = Omit<HeaderButtonProps, "onPress" | "children">;

/**
 * Header cast button. Spacing is owned by the surrounding `HeaderButtonGroup` —
 * this component must not carry margins of its own.
 */
export function Chromecast(props: Props) {
  const client = useRemoteMediaClient();
  const castDevice = useCastDevice();
  const devices = useDevices();
  const sessionManager = GoogleCast.getSessionManager();
  const discoveryManager = GoogleCast.getDiscoveryManager();
  const mediaStatus = useMediaStatus();

  useEffect(() => {
    (async () => {
      if (!discoveryManager) {
        console.warn("DiscoveryManager is not initialized");
        return;
      }

      await discoveryManager.startDiscovery();
    })();
  }, [client, devices, castDevice, sessionManager, discoveryManager]);

  return (
    <HeaderButton
      onPress={() => {
        if (mediaStatus?.currentItemId) CastContext.showExpandedControls();
        else CastContext.showCastDialog();
      }}
      {...props}
    >
      {/* Android needs a mounted CastButton for startDiscovery to work, but it
          must not take part in layout or it shifts the icon off the header
          grid — hence absolute + transparent rather than a sibling. */}
      {Platform.OS === "android" ? (
        <View style={{ position: "absolute", opacity: 0 }} pointerEvents='none'>
          <CastButton tintColor='transparent' />
        </View>
      ) : null}
      <HeaderIcon name='cast' />
    </HeaderButton>
  );
}
