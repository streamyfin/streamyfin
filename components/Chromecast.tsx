import { useEffect } from "react";
import {
  showCastDialog,
  showExpandedControls,
  startCastDiscovery,
  useCastMediaStatus,
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
  const mediaStatus = useCastMediaStatus();

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
      onPress={() => {
        if (mediaStatus?.currentItemId) showExpandedControls();
        else showCastDialog();
      }}
      {...props}
    >
      <HeaderIcon name='cast' />
    </HeaderButton>
  );
}
