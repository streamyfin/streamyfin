import type { BaseItemPerson } from "@jellyfin/sdk/lib/generated-client/models";
import { render, screen } from "@testing-library/react-native";
import { CastAndCrew } from "./CastAndCrew";

jest.mock("expo-router", () => ({
  useSegments: () => ["(auth)", "(tabs)", "(home)"],
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: () => {} }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  // The cards are built from the api's base path; nothing is requested.
  return { apiAtom: atom({ basePath: "http://server" }) };
});
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// The row itself is not under test: a card shows up as its two lines.
jest.mock("@/components/cards/CardRow", () => ({
  CardRow: ({
    cards,
  }: {
    cards: { id: string; title: string; subtitle?: string | null }[];
  }) => {
    const { Text: RowText } = jest.requireActual("react-native");
    return cards.map((card) => (
      <RowText key={card.id} testID={`subtitle-${card.id}`}>
        {card.subtitle ?? ""}
      </RowText>
    ));
  },
}));

const subtitleOf = (id: string) =>
  screen.getByTestId(`subtitle-${id}`).props.children;

const renderPeople = (people: BaseItemPerson[]) =>
  render(<CastAndCrew item={{ Id: "movie", People: people }} />);

describe("CastAndCrew", () => {
  // Crew members usually come without a Role. Merging two such credits used
  // to join the missing values into the literal text "undefined, undefined".
  test("a person credited twice without a role never reads undefined", async () => {
    await renderPeople([
      { Id: "nolan", Name: "Christopher Nolan", Type: "Director" },
      { Id: "nolan", Name: "Christopher Nolan", Type: "Writer" },
    ]);

    expect(subtitleOf("nolan")).toBe(
      "item_card.person_kind.Director, item_card.person_kind.Writer",
    );
  });

  test("a role next to a credit without one keeps both", async () => {
    await renderPeople([
      { Id: "eastwood", Name: "Clint Eastwood", Type: "Director" },
      { Id: "eastwood", Name: "Clint Eastwood", Type: "Actor", Role: "Walt" },
    ]);

    expect(subtitleOf("eastwood")).toBe("item_card.person_kind.Director, Walt");
  });

  test("an actor keeps the character name alone", async () => {
    await renderPeople([
      { Id: "actor", Name: "An Actor", Type: "Actor", Role: "Hero" },
    ]);

    expect(subtitleOf("actor")).toBe("Hero");
  });
});
