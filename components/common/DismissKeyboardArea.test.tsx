import { fireEvent, render, screen } from "@testing-library/react-native";
import { Keyboard, Pressable, Text } from "react-native";
import { DismissKeyboardArea } from "@/components/common/DismissKeyboardArea";

describe("DismissKeyboardArea", () => {
  const dismiss = jest.spyOn(Keyboard, "dismiss");
  beforeEach(() => dismiss.mockClear());

  // A number pad has no return key: a tap beside the field is how it goes.
  test("closes the keyboard on a tap beside the field", async () => {
    await render(
      <DismissKeyboardArea>
        <Text>Quick Connect</Text>
      </DismissKeyboardArea>,
    );

    await fireEvent.press(screen.getByText("Quick Connect"));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  // A disabled button takes no touch, so a tap on it is a tap beside the field.
  test("closes the keyboard on a tap on a disabled button", async () => {
    const save = jest.fn();
    await render(
      <DismissKeyboardArea>
        <Pressable disabled onPress={save}>
          <Text>Save</Text>
        </Pressable>
      </DismissKeyboardArea>,
    );

    await fireEvent.press(screen.getByText("Save"));
    expect(save).not.toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  test("leaves a button inside to its own press", async () => {
    const authorize = jest.fn();
    await render(
      <DismissKeyboardArea>
        <Pressable onPress={authorize}>
          <Text>Authorize</Text>
        </Pressable>
      </DismissKeyboardArea>,
    );

    await fireEvent.press(screen.getByText("Authorize"));
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(dismiss).not.toHaveBeenCalled();
  });
});
