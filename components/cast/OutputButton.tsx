import { useAtomValue } from "jotai";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  type ColorValue,
  Platform,
  Pressable,
  View,
} from "react-native";
import {
  HeaderButton,
  type HeaderButtonProps,
} from "@/components/common/HeaderButton";
import { HeaderIcon } from "@/components/common/HeaderIcon";
import { Colors } from "@/constants/Colors";
import {
  type CastSubscription,
  onOutputPickerAction,
  presentOutputPicker,
  showExpandedControls,
  useRemoteTarget,
} from "@/modules/mpv-player/src/cast";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { measureInWindow } from "@/utils/cast/measureInWindow";
import { buildOutputPickerStrings } from "@/utils/cast/outputPickerStrings";
import { musicPlayingHere } from "@/utils/cast/playingHere";
import { logAndCaptureError } from "@/utils/log";

type Props = Omit<HeaderButtonProps, "onPress" | "children" | "variant"> & {
  /** A header bar button, or a plain one among a screen's own controls, as the music player's. */
  variant?: "header" | "inline";
  /** The glyph's color while nothing is connected; white, as the header's icons. */
  idleTint?: ColorValue;
};

// One listener at a time, taken again at each opening: whichever button opened the sheet, its remote opens the
// expanded controls once.
let remoteListener: CastSubscription | null = null;
const listenForRemote = () => {
  remoteListener?.remove();
  remoteListener = onOutputPickerAction((action) => {
    if (action !== "remote") return;
    showExpandedControls().catch((error) => {
      logAndCaptureError("The Cast expanded controls failed to open", error);
    });
  });
};

/**
 * The single Cast button: it opens the output sheet (this device, the Cast receivers, AirPlay on iOS) and shows
 * the connection. Discovery is the sheet's, while it is open. Spacing is owned by the surrounding
 * `HeaderButtonGroup`: this component must not carry margins of its own.
 */
export function OutputButton({
  variant = "header",
  idleTint,
  ...props
}: Props) {
  const { t } = useTranslation();
  const target = useRemoteTarget();
  const offline = useOfflineMode();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const anchor = useRef<View>(null);

  // No sheet on a TV or a Mac, nothing to cast offline, and nothing to play without a server.
  const mac = Platform.OS === "ios" && Platform.isMacCatalyst;
  if (Platform.isTV || mac || offline || !api || !user) return null;

  const connected = target.state === "connected";
  const open = async () => {
    listenForRemote();
    try {
      const [frame, playingHere] = await Promise.all([
        measureInWindow(anchor.current),
        musicPlayingHere(),
      ]);
      await presentOutputPicker({
        strings: buildOutputPickerStrings(t),
        anchor: frame,
        playingHere,
      });
    } catch (error) {
      logAndCaptureError("The output sheet failed to open", error);
    }
  };
  const glyph =
    target.state === "connecting" ? (
      <ActivityIndicator
        testID='output-button-connecting'
        size='small'
        color={Colors.primary}
      />
    ) : (
      <HeaderIcon
        name={connected ? "castConnected" : "cast"}
        tintColor={connected ? Colors.primary : idleTint}
      />
    );
  const accessibility = {
    accessibilityRole: "button" as const,
    accessibilityLabel: t("accessibility.cast_button"),
    // Always a value: React Native Android clears the whole content description, label included, once the
    // value turns undefined. Android joins the two ("Cast button, Connected"), so flows match the name as a
    // prefix.
    accessibilityValue: {
      text: connected
        ? t("accessibility.cast_connected")
        : t("accessibility.cast_not_connected"),
    },
  };

  return (
    // The frame the popover points at, measured when the sheet opens.
    <View ref={anchor} collapsable={false}>
      {variant === "header" ? (
        <HeaderButton {...accessibility} onPress={open} {...props}>
          {glyph}
        </HeaderButton>
      ) : (
        <Pressable
          {...accessibility}
          onPress={open}
          hitSlop={10}
          style={props.style}
        >
          {glyph}
        </Pressable>
      )}
    </View>
  );
}
