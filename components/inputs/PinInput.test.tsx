import { fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable } from "react-native";
import { PinInput } from "@/components/inputs/PinInput";

// The sheet's input is a plain TextInput as far as this spec is concerned;
// the real one pulls in Reanimated.
jest.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetTextInput: jest.requireActual("react-native").TextInput,
}));

describe("PinInput", () => {
  // react-native-tvos puts a toolbar with a "Default" button above every iOS
  // number pad; upstream React Native and native apps show none. Naming an
  // accessory view that does not exist keeps it away, whatever else the input
  // carries.
  test("keeps the toolbar away from the iOS number pad", async () => {
    await render(<PinInput testID='pin' value='' onChangeText={() => {}} />);
    const input = screen.getByTestId("pin");

    expect(input.props.inputAccessoryViewID).toBeTruthy();
  });

  // A tap on the sheet around the field closes the keyboard, so a tap on the
  // cells, which opens it, must stop there.
  test("keeps a tap on the cells from reaching what is around them", async () => {
    const around = jest.fn();
    await render(
      <Pressable onPress={around}>
        <PinInput value='12' onChangeText={() => {}} />
      </Pressable>,
    );

    await fireEvent.press(screen.getByText("1"));
    expect(around).not.toHaveBeenCalled();
  });
});
