import type { TFunction } from "i18next";
import { BITRATES, bitrateOptions } from "./BitrateSelector";

jest.mock("./PlatformDropdown", () => ({ PlatformDropdown: () => null }));

const t = ((key: string) => `translated:${key}`) as TFunction;

const AUTO = { key: "Auto", value: undefined };
const MAX = { key: "Max", value: undefined };

// The choices the settings offer, on the phone and on TV, and the item pages.
describe("the quality choices", () => {
  test("offer Auto first, named in the app language", () => {
    expect(bitrateOptions(t, MAX)[0]).toEqual({
      label: "translated:item_card.quality_auto",
      value: AUTO,
      selected: false,
    });
  });

  test("offer every quality there is", () => {
    expect(bitrateOptions(t, MAX).map((option) => option.value)).toEqual(
      BITRATES,
    );
  });

  // Neither carries a bitrate, so they are told apart by their key.
  test("tell Auto and Max apart", () => {
    const picked = (selected: { key: string }) =>
      bitrateOptions(t, selected)
        .filter((option) => option.selected)
        .map((option) => option.value.key);

    expect(picked(AUTO)).toEqual(["Auto"]);
    expect(picked(MAX)).toEqual(["Max"]);
    expect(picked({ key: "8 Mb/s" })).toEqual(["8 Mb/s"]);
  });
});
