import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Colors } from "@/constants/Colors";
import {
  CastState,
  showCastDialog,
  showExpandedControls,
  startCastDiscovery,
  useCastMediaStatus,
  useCastState,
} from "@/modules/mpv-player/src/cast";
import { logAndCaptureError } from "@/utils/log";
import { HeaderButton, type HeaderButtonProps } from "./common/HeaderButton";
import { HeaderIcon } from "./common/HeaderIcon";

type Props = Omit<HeaderButtonProps, "onPress" | "children">;

/**
 * Header cast button. Spacing is owned by the surrounding `HeaderButtonGroup`:
 * this component must not carry margins of its own.
 */
export function Chromecast(props: Props) {
  const { t } = useTranslation();
  const mediaStatus = useCastMediaStatus();
  const connected = useCastState() === CastState.CONNECTED;

  useEffect(() => {
    // Discovery is asked of the module directly; Android no longer needs a mounted
    // Cast button for the receivers to show up.
    startCastDiscovery().catch((error) => {
      // Previously an unhandled rejection: cast devices just never appear.
      logAndCaptureError("Chromecast discovery failed to start", error);
    });
  }, []);

  return (
    <HeaderButton
      accessibilityRole='button'
      accessibilityLabel={t("accessibility.cast_button")}
      // Always a value: React Native Android clears the whole content
      // description, label included, once the value turns undefined. Android
      // joins the two ("Cast button, Connected"), so flows match the name as a
      // prefix.
      accessibilityValue={{
        text: connected
          ? t("accessibility.cast_connected")
          : t("accessibility.cast_not_connected"),
      }}
      onPress={() => {
        if (mediaStatus?.currentItemId) showExpandedControls();
        else showCastDialog();
      }}
      {...props}
    >
      <HeaderIcon
        name={connected ? "castConnected" : "cast"}
        tintColor={connected ? Colors.primary : undefined}
      />
    </HeaderButton>
  );
}
