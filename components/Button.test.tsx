import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Button } from "./Button";

jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));

// The row a button lays its icon and label out in: the label's parent.
const rowOf = (label: string) => screen.getByText(label).parent!;

// A button's icon and label sit in the middle of it together: a placeholder
// on the side without an icon, narrower than the icon, left Request more 20
// pixels from its left edge and 61 from its right on Android.
describe("Button", () => {
  test("centers an icon and its label as one block", async () => {
    await render(
      <Button iconLeft={<Text testID='icon'>i</Text>}>Request more</Button>,
    );
    const row = rowOf("Request more");
    expect(row.props.style).toMatchObject({ justifyContent: "center" });
    // The icon and the label, nothing weighing on one side.
    expect(row.children).toHaveLength(2);
  });

  test("keeps a label clear of both edges when spread out", async () => {
    await render(<Button justify='between'>Settings</Button>);
    const row = rowOf("Settings");
    expect(row.props.style).toMatchObject({
      justifyContent: "space-between",
    });
    expect(row.children).toHaveLength(3);
  });
});
