import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { TVInput } from "./TVInput";

// The real scale reads the settings atom, which loads the whole settings UI.
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ heading: 31 }),
}));

// The text follows the TV text size setting. A fixed height cut the top of it
// off on Android TV at Extra large, where a TextInput pads its text inside
// that height, so the field may only set a minimum.
test("grows with the text size instead of clipping it", async () => {
  await render(<TVInput placeholder='Username' />);

  const style = StyleSheet.flatten(
    screen.getByPlaceholderText("Username").props.style,
  );
  expect(style.fontSize).toBe(31);
  expect(style.height).toBeUndefined();
  expect(style.minHeight).toBeGreaterThan(0);
});
