import type React from "react";
import { Platform, Switch, type SwitchProps, View } from "react-native";

/**
 * Settings toggle. Android's native Switch lays out ~40px tall / ~56px wide and
 * inflates list rows (iOS renders it ~31px). A plain `transform: scale` is
 * visual-only and does NOT shrink the layout box, so we pin the Switch inside a
 * FIXED-SIZE box (overflow hidden) and center it:
 *  - the fixed height caps the row height (compact, uniform rows),
 *  - the fixed width + centering keep the switch in the exact same spot in the
 *    on/off states (a non-fixed wrapper let its width fluctuate between states,
 *    which shifted the switch sideways on toggle).
 * iOS renders the switch untouched.
 *
 * Tunables: BOX_H drives the row height; SCALE shrinks the visual to fit the
 * box; keep BOX_W >= scaled visual width to avoid clipping the switch sideways.
 */
const BOX_W = 40;
const BOX_H = 30;
const SCALE = 0.9;

export const SettingSwitch: React.FC<SwitchProps> = (props) => {
  if (Platform.OS !== "android") return <Switch {...props} />;
  return (
    <View
      style={{
        width: BOX_W,
        height: BOX_H,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <Switch
        {...props}
        style={[props.style, { transform: [{ scale: SCALE }] }]}
      />
    </View>
  );
};
