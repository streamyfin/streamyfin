import { render, screen } from "@testing-library/react-native";
import { StyleSheet, Switch, TextInput } from "react-native";
import { ListItem } from "./ListItem";

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

  // A text field sizes to its text, and the label now wraps rather than
  // truncating: with no cap on the control, a long URL in a narrow row, or a
  // large system font, squeezed the label to a column of single letters.
  it("keeps a share of the row for the label next to a wide control", async () => {
    const url = "https://streamystats.a-long-home-server-name.example.com";
    await render(
      <ListItem title='URL' subtitle='Disabled by admin'>
        <TextInput value={url} />
      </ListItem>,
    );

    const control = screen.getByDisplayValue(url).parent;
    expect(StyleSheet.flatten(control?.props.style)).toMatchObject({
      maxWidth: "70%",
    });
  });
});
