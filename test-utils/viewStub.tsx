import { View, type ViewProps } from "react-native";

/**
 * A native view stood in by a plain `View`, named so a scenario can find it.
 * Props pass through, so the element still renders (and is counted) as the
 * component under test drives it.
 */
export const viewStub = (testID: string) => (props: ViewProps) => (
  <View testID={testID} {...props} />
);
