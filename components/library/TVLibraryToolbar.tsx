import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useEffect, useRef } from "react";
import { TVFocusGuideView, View } from "react-native";
import { Text } from "@/components/common/Text";
import { TVButton } from "@/components/tv/TVButton";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";

// One fixed width for every action: neighbours of uneven size read as a
// rendering bug on TV, and the labels differ in length in every language.
const ACTION_WIDTH = scaleSize(210);
const DISABLED_OPACITY = 0.4;
// Long enough for the sheet's route to have left the screen.
const FOCUS_RESTORE_DELAY_MS = 300;

export interface TVLibraryToolbarAction {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

interface Props {
  title: string;
  /** The library's tabs, when it has more than one. */
  tabs?: React.ReactNode;
  actions: TVLibraryToolbarAction[];
  /**
   * A tab without filters has no actions. They are hidden rather than
   * unmounted: mounted again, the first one's preferred focus would pull the
   * focus off the tab that was just pressed.
   */
  actionsHidden?: boolean;
  /** What the filters are set to, shown under the row while any is. */
  summary?: string;
  /**
   * The action to hand the focus back to, by key. A sheet that closes leaves
   * Android TV with nothing focused, and the next Back then leaves the page:
   * the page asks for the button that opened the sheet. A new object asks
   * again.
   */
  focusRequest?: { key: string } | null;
}

/**
 * The one row above a TV library's posters: its name, its tabs and its
 * actions. Everything an action sets lives in a sheet, so the posters start
 * right below. A focus guide as wide as the page: tvOS only moves the focus
 * to what lies straight ahead, and the posters are narrower than this row.
 */
export const TVLibraryToolbar: React.FC<Props> = ({
  title,
  tabs,
  actions,
  actionsHidden = false,
  summary,
  focusRequest,
}) => {
  const typography = useScaledTVTypography();
  const buttons = useRef<Record<string, View | null>>({});

  useEffect(() => {
    if (!focusRequest) return;
    const timer = setTimeout(
      () => (buttons.current[focusRequest.key] as any)?.requestTVFocus?.(),
      FOCUS_RESTORE_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [focusRequest]);

  return (
    <View style={{ paddingBottom: scaleSize(24) }}>
      <TVFocusGuideView
        autoFocus
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: scaleSize(24),
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            fontSize: typography.heading,
            fontWeight: "bold",
            color: "#FFFFFF",
            flexShrink: 1,
          }}
        >
          {title}
        </Text>
        {tabs}
        <View style={{ flex: 1 }} />
        <View
          style={{
            display: actionsHidden ? "none" : "flex",
            flexDirection: "row",
            gap: scaleSize(12),
          }}
        >
          {actions.map(({ key, icon, label, onPress, disabled }, index) => (
            <TVButton
              key={key}
              onPress={onPress}
              disabled={disabled}
              variant='glass'
              hasTVPreferredFocus={index === 0}
              refSetter={(ref) => {
                buttons.current[key] = ref;
              }}
              style={{
                width: ACTION_WIDTH,
                opacity: disabled ? DISABLED_OPACITY : 1,
              }}
            >
              <Ionicons
                name={icon}
                size={scaleSize(24)}
                color='#FFFFFF'
                style={{ marginRight: scaleSize(8) }}
              />
              <Text
                numberOfLines={1}
                style={{
                  fontSize: typography.callout,
                  fontWeight: "bold",
                  color: "#FFFFFF",
                  flexShrink: 1,
                }}
              >
                {label}
              </Text>
            </TVButton>
          ))}
        </View>
      </TVFocusGuideView>
      {!!summary && !actionsHidden && (
        <Text
          numberOfLines={1}
          style={{
            fontSize: typography.callout,
            color: "rgba(255,255,255,0.6)",
            paddingTop: scaleSize(16),
          }}
        >
          {summary}
        </Text>
      )}
    </View>
  );
};
