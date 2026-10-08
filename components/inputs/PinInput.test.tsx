import { render, screen } from "@testing-library/react-native";
import { PinInput } from "@/components/inputs/PinInput";

// The sheet's input is a plain TextInput as far as this spec is concerned;
// the real one pulls in Reanimated.
jest.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetTextInput: jest.requireActual("react-native").TextInput,
}));

describe("PinInput", () => {
  // react-native-tvos puts a toolbar with a "Default" button above every iOS
  // number pad; upstream React Native and native apps show none. Naming an
  // accessory view that does not exist is what keeps it away, and a label
  // would bring it back.
  test("keeps the toolbar away from the iOS number pad", async () => {
    await render(<PinInput testID='pin' value='' onChangeText={() => {}} />);
    const input = screen.getByTestId("pin");

    expect(input.props.inputAccessoryViewID).toBeTruthy();
    expect(input.props.inputAccessoryViewButtonLabel).toBeUndefined();
  });
});
