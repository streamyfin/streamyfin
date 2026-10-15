import { fireEvent, render, screen } from "@testing-library/react-native";
import { ALPHABET } from "@/utils/jellyfin/alphabetJump";
import { AlphabetRail } from "./AlphabetRail";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const LETTER_HEIGHT = 10;
const RAIL_TOP = 200;
const offsetOf = (letter: string) =>
  ALPHABET.indexOf(letter) * LETTER_HEIGHT + LETTER_HEIGHT / 2;

/** A touch landing on a letter. */
const at = (letter: string) => ({
  nativeEvent: {
    pageY: RAIL_TOP + offsetOf(letter),
    locationY: offsetOf(letter),
  },
});
/**
 * The same finger further along. Android measures `locationY` against the
 * view it is over by now, a poster once it has slid off the narrow rail, so
 * only the position on the page still says which letter it is level with.
 */
const draggedTo = (letter: string) => ({
  nativeEvent: { pageY: RAIL_TOP + offsetOf(letter), locationY: 3 },
});

const renderRail = async (active: string | null = null) => {
  const onSelect = jest.fn();
  await render(<AlphabetRail active={active} onSelect={onSelect} />);
  const rail = screen.getByLabelText("library.jump_to_letter");
  await fireEvent(rail, "layout", {
    nativeEvent: { layout: { height: ALPHABET.length * LETTER_HEIGHT } },
  });
  return { rail, onSelect };
};

describe("AlphabetRail", () => {
  test("shows the non-letter entry and the whole alphabet", async () => {
    await renderRail();

    for (const letter of ALPHABET) {
      expect(screen.getByText(letter)).toBeTruthy();
    }
  });

  test("a tap on a letter jumps to it", async () => {
    const { rail, onSelect } = await renderRail();

    await fireEvent(rail, "responderGrant", at("M"));
    await fireEvent(rail, "responderRelease", at("M"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("M");
  });

  // Each jump refetches the library, so the letters a drag passes over must
  // not reach the list.
  test("a drag jumps once, to the letter it ends on", async () => {
    const { rail, onSelect } = await renderRail();

    await fireEvent(rail, "responderGrant", at("C"));
    await fireEvent(rail, "responderMove", draggedTo("H"));
    await fireEvent(rail, "responderMove", draggedTo("S"));
    expect(onSelect).not.toHaveBeenCalled();
    // The finger covers the rail, so the letter under it is called out.
    expect(screen.getAllByText("S")).toHaveLength(2);

    await fireEvent(rail, "responderRelease", draggedTo("S"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("S");
    expect(screen.getAllByText("S")).toHaveLength(1);
  });

  test("a touch the system takes over jumps nowhere", async () => {
    const { rail, onSelect } = await renderRail();

    await fireEvent(rail, "responderGrant", at("K"));
    await fireEvent(rail, "responderTerminate");

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getAllByText("K")).toHaveLength(1);
  });

  test("a screen reader steps through the letters from the current one", async () => {
    const step = (actionName: string) => ({ nativeEvent: { actionName } });
    const { rail, onSelect } = await renderRail("M");
    expect(rail.props.accessibilityValue).toEqual({ text: "M" });

    await fireEvent(rail, "accessibilityAction", step("increment"));
    await fireEvent(rail, "accessibilityAction", step("decrement"));

    expect(onSelect.mock.calls).toEqual([["N"], ["L"]]);
  });

  test("with no letter picked yet, a screen reader starts at the top", async () => {
    const { rail, onSelect } = await renderRail();

    await fireEvent(rail, "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });

    expect(onSelect).toHaveBeenCalledWith("#");
  });
});
