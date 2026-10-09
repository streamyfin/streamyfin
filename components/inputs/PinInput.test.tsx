import { fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable } from "react-native";
import { PinInput } from "@/components/inputs/PinInput";
import { NO_KEYBOARD_TOOLBAR } from "@/constants/Keyboard";

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

    expect(input.props.inputAccessoryViewID).toMatch(
      new RegExp(`^${NO_KEYBOARD_TOOLBAR}`),
    );
  });

  // Fabric reuses a text input's native view and diffs the new props against
  // the ones that view had. Its reuse clears the id, so the same id again is
  // never set back and the toolbar returns from the second opening on.
  test("names another accessory view each time it mounts", async () => {
    const pin = <PinInput testID='pin' value='' onChangeText={() => {}} />;
    const { unmount } = await render(pin);
    const first = screen.getByTestId("pin").props.inputAccessoryViewID;
    await unmount();
    await render(pin);

    expect(screen.getByTestId("pin").props.inputAccessoryViewID).not.toBe(
      first,
    );
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
