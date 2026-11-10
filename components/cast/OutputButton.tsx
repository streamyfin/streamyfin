import { useAtomValue, useStore } from "jotai";
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
  presentOutputPicker,
  useRemoteTarget,
} from "@/modules/mpv-player/src/cast";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { measureInWindow, nativeTagOf } from "@/utils/cast/measureInWindow";
import { buildOutputPickerStrings } from "@/utils/cast/outputPickerStrings";
import { musicPlayingHere } from "@/utils/cast/playingHere";
import { logAndCaptureError } from "@/utils/log";

type Props = Omit<HeaderButtonProps, "onPress" | "children" | "variant"> & {
  /** A header bar button, or a plain one among a screen's own controls, as the music player's. */
  variant?: "header" | "inline";
  /** The glyph's color while nothing is connected; white, as the header's icons. */
  idleTint?: ColorValue;
  /** A header renders outside its page's OfflineModeProvider: the page says whether it is offline. */
  offline?: boolean;
};

/**
 * The single Cast button: it opens the output sheet (this device, the Cast receivers, AirPlay on iOS) and shows
 * the connection. Discovery is the sheet's, while it is open. Spacing is owned by the surrounding
 * `HeaderButtonGroup`: this component must not carry margins of its own.
 */
export function OutputButton({
  variant = "header",
  idleTint,
  offline: offlinePage = false,
  ...props
}: Props) {
  const { t } = useTranslation();
  const target = useRemoteTarget();
  const offline = useOfflineMode() || offlinePage;
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const store = useStore();
  const syncPlay = useSyncPlay();
  const anchor = useRef<View>(null);

  // No sheet on a TV or a Mac, nothing to cast offline, and nothing to play without a server.
  const mac = Platform.OS === "ios" && Platform.isMacCatalyst;
  if (Platform.isTV || mac || offline || !api || !user) return null;

  const connected = target.state === "connected";
  // What the sheet answers goes to OutputPickerActions, mounted once for the whole app.
  const open = async () => {
    try {
      const [frame, playingHere] = await Promise.all([
        measureInWindow(anchor.current),
        musicPlayingHere(),
      ]);
      // A sign-out can land during the reads, or the page can go with this button: the store and the ref say so.
      if (!anchor.current || !store.get(apiAtom) || !store.get(userAtom)) {
        return;
      }
      await presentOutputPicker({
        strings: buildOutputPickerStrings(t),
        anchor: frame,
        anchorTag: nativeTagOf(anchor.current),
        playingHere,
        // A SyncPlay member plays the group's video: this device only stops the receiver.
        playHere: !syncPlay.enabled,
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
        : target.state === "connecting"
          ? t("cast.output.connecting")
          : t("accessibility.cast_not_connected"),
    },
  };

  return (
    // The frame the popover points at, measured when the sheet opens.
    <View ref={anchor} collapsable={false}>
      {variant === "header" ? (
        <HeaderButton
          testID='output-button'
          {...accessibility}
          onPress={open}
          {...props}
        >
          {glyph}
        </HeaderButton>
      ) : (
        <Pressable
          testID='output-button'
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
