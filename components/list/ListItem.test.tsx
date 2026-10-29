import { render, screen } from "@testing-library/react-native";
import { Switch } from "react-native";
import { ListItem } from "./ListItem";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Android's wider font wrapped settings hints past a two-line cap, so they
// ended in an ellipsis next to the toggle while iOS showed them in full.
describe("ListItem", () => {
  const longTitle =
    "A setting title long enough to need a second line on a narrow phone";
  const longSubtitle =
    "Let this device search OpenSubtitles directly when your Jellyfin server has no subtitle provider of its own, so the hint runs to three lines.";

  it("wraps a long title and subtitle instead of truncating them", async () => {
    await render(
      <ListItem title={longTitle} subtitle={longSubtitle}>
        <Switch value />
      </ListItem>,
    );

    expect(screen.getByText(longTitle).props.numberOfLines).toBeUndefined();
    expect(screen.getByText(longSubtitle).props.numberOfLines).toBeUndefined();
  });
});
