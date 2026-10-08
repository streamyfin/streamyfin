import { render, screen } from "@testing-library/react-native";
import { PinInput } from "@/components/inputs/PinInput";

// The sheet's input is a plain TextInput as far as this spec is concerned;
// the real one pulls in Reanimated.
jest.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetTextInput: jest.requireActual("react-native").TextInput,
}));
// A real translation for the key under test, so handing over the raw key
// fails.
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => (key === "common.ok" ? "OK" : key),
  }),
}));

describe("PinInput", () => {
  // iOS has no return key on the number pad, so React Native adds a toolbar
  // above it whose button reads the return key type: "Default", in English,
  // unless a label is given.
  test("labels the number pad's toolbar button with a translated OK", async () => {
    await render(<PinInput testID='pin' value='' onChangeText={() => {}} />);

    expect(screen.getByTestId("pin").props.inputAccessoryViewButtonLabel).toBe(
      "OK",
    );
  });
});
