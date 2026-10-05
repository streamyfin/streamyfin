import { fireEvent, render, screen } from "@testing-library/react-native";
import { ALPHABET } from "@/utils/jellyfin/alphabetJump";
import { TVAlphabetRow } from "./TVAlphabetRow";

jest.mock("@/providers/InactivityProvider", () => ({
  useInactivity: () => ({ resetInactivityTimer: () => {} }),
}));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ callout: 18 }),
}));

describe("TVAlphabetRow", () => {
  test("pressing a letter jumps to it", async () => {
    const onSelect = jest.fn();
    await render(<TVAlphabetRow active={null} onSelect={onSelect} />);

    await fireEvent.press(screen.getByText("M"));
    await fireEvent.press(screen.getByText("#"));

    expect(onSelect.mock.calls).toEqual([["M"], ["#"]]);
  });

  test("marks the letter the list is anchored at, and only that one", async () => {
    await render(<TVAlphabetRow active='M' onSelect={() => {}} />);

    // getByRole throws on a second match.
    expect(screen.getByRole("button", { selected: true })).toHaveTextContent(
      "M",
    );
  });

  // Exactly one element per screen may ask for the initial focus
  // (docs/conventions/tv.md), and on the library page that is a filter button.
  test("no letter asks for the initial focus", async () => {
    await render(<TVAlphabetRow active='M' onSelect={() => {}} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(ALPHABET.length);
    for (const button of buttons) {
      expect(button.props.hasTVPreferredFocus).toBeFalsy();
    }
  });
});
