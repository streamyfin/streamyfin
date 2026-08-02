// Web shim: the iOS 26 "liquid glass" effect has no browser equivalent, so the
// container degrades to a plain translucent View and its children render
// unchanged.
import { View, type ViewProps } from "react-native";

export const GlassEffectView: React.FC<ViewProps> = ({
  children,
  style,
  ...props
}) => (
  <View
    {...props}
    style={[{ backgroundColor: "rgba(255,255,255,0.08)" }, style]}
  >
    {children}
  </View>
);

export const isGlassEffectAvailable = () => false;

export default GlassEffectView;
