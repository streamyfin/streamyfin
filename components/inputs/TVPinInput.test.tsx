import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { TVPinInput } from "./TVPinInput";

const mockTypography = { callout: 0, heading: 0 };
// The real scale reads the settings atom, which loads the whole settings UI.
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => mockTypography,
}));

// What useScaledTVTypography returns on a 1920x1080 Apple TV.
const SIZES = [
  ["Small", { callout: 16, heading: 19 }],
  ["Large", { callout: 22, heading: 27 }],
  ["Extra large", { callout: 25, heading: 31 }],
] as const;

// The PIN text followed none of the TV text sizes, and a fixed height clipped
// the larger ones once it did.
test.each(SIZES)(
  "sizes its text from the %s text size and grows with it",
  async (_size, sizes) => {
    Object.assign(mockTypography, sizes);
    await render(
      <TVPinInput
        label='PIN'
        placeholder='Enter PIN'
        value=''
        onChangeText={() => {}}
      />,
    );

    const label = StyleSheet.flatten(screen.getByText("PIN").props.style);
    const input = StyleSheet.flatten(
      screen.getByPlaceholderText("Enter PIN").props.style,
    );
    expect(label.fontSize).toBe(sizes.callout);
    expect(input.fontSize).toBe(sizes.heading);
    expect(input.height).toBeUndefined();
    expect(input.minHeight).toBe(56);
  },
);
