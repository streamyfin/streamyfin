import { render, screen } from "@testing-library/react-native";
import { TVFavoriteButton } from "./TVFavoriteButton";

jest.mock("@/hooks/useFavorite", () => ({
  useFavorite: () => ({ isFavorite: false, toggleFavorite: () => {} }),
}));
jest.mock("@/providers/InactivityProvider", () => ({
  useInactivity: () => ({ resetInactivityTimer: () => {} }),
}));

/** What the TV focus engine reads off the button's focusable host view. */
const requestsInitialFocus = () => {
  const tree = screen.toJSON();
  if (!tree || Array.isArray(tree)) throw new Error("expected one host view");
  return tree.props.hasTVPreferredFocus;
};

describe("TVFavoriteButton", () => {
  // The item page gives the initial focus to its Play button. An item that
  // cannot be played has no Play button, so the page hands the focus to this
  // one instead; without the prop reaching the host view nothing on the
  // screen asks for focus at all.
  test("asks for the initial focus when the screen hands it over", async () => {
    await render(<TVFavoriteButton item={{ Id: "1" }} hasTVPreferredFocus />);

    expect(requestsInitialFocus()).toBe(true);
  });

  // Exactly one element per screen may ask (docs/conventions/tv.md): next to
  // a Play button, or on the series page, this one must stay quiet.
  test("leaves the initial focus alone by default", async () => {
    await render(<TVFavoriteButton item={{ Id: "1" }} />);

    expect(requestsInitialFocus()).toBe(false);
  });

  test("a disabled button never asks for focus", async () => {
    await render(
      <TVFavoriteButton item={{ Id: "1" }} hasTVPreferredFocus disabled />,
    );

    expect(requestsInitialFocus()).toBe(false);
  });
});
