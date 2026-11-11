import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, render, screen, within } from "@testing-library/react-native";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { SeasonDropdown } from "./SeasonDropdown";

jest.mock("react-i18next", () =>
  jest.requireActual("@/test-utils/realI18next"),
);

// The closed menu, then the options as their labels; the menu itself is not
// under test.
jest.mock("../PlatformDropdown", () => ({
  PlatformDropdown: ({
    groups,
    trigger,
  }: {
    groups: { options: { label: string }[] }[];
    trigger: React.ReactNode;
  }) => {
    const { Text, View } = jest.requireActual("react-native");
    return (
      <>
        <View testID='dropdown-trigger'>{trigger}</View>
        {groups[0].options.map((option) => (
          <Text key={option.label}>{option.label}</Text>
        ))}
      </>
    );
  },
}));

const SERIES: BaseItemDto = { Id: "series-1", Type: "Series", Name: "Show" };

beforeAll(() =>
  i18next.use(initReactI18next).init({
    lng: "en",
    resources: {
      en: {
        translation: { seerr: { season_number: "Season {{season_number}}" } },
      },
      fr: {
        translation: { seerr: { season_number: "Saison {{season_number}}" } },
      },
    },
  }),
);

afterEach(() => act(() => i18next.changeLanguage("en")));

describe("SeasonDropdown", () => {
  // A season the server gave no name, as the offline pages build them: the
  // dropdown names it in the app's language, and follows a language change.
  test("names a season without a name in the app's language", async () => {
    await render(
      <SeasonDropdown
        item={SERIES}
        seasons={[{ Id: "season-2", IndexNumber: 2 }]}
        state={{}}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByText("Season 2")).toBeTruthy();
    await act(() => i18next.changeLanguage("fr"));
    expect(screen.getByText("Saison 2")).toBeTruthy();
  });

  // The closed menu put "Season" and the number side by side: in Hungarian it
  // read "Évad 2" where the whole sentence is "2. évad", and a specials season
  // read "Season 0" there and "Specials" in the list.
  test("the closed menu names the season on screen as the list does", async () => {
    const seasons: BaseItemDto[] = [
      { Id: "season-0", IndexNumber: 0, Name: "Specials" },
      { Id: "season-2", IndexNumber: 2 },
    ];
    const view = await render(
      <SeasonDropdown
        item={SERIES}
        seasons={seasons}
        state={{ [SERIES.Id!]: 0 }}
        onSelect={jest.fn()}
      />,
    );
    const trigger = () => within(screen.getByTestId("dropdown-trigger"));
    expect(trigger().getByText("Specials")).toBeTruthy();

    await act(() => i18next.changeLanguage("fr"));
    await view.rerender(
      <SeasonDropdown
        item={SERIES}
        seasons={seasons}
        state={{ [SERIES.Id!]: 2 }}
        onSelect={jest.fn()}
      />,
    );
    expect(trigger().getByText("Saison 2")).toBeTruthy();
  });
});
