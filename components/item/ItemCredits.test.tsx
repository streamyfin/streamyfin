import type { BaseItemPerson } from "@jellyfin/sdk/lib/generated-client/models";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ItemCredits } from "./ItemCredits";

const mockPush = jest.fn();
let mockOffline = false;

jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: mockPush }),
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockOffline,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      `${key}:${options?.count}`,
  }),
}));

const PEOPLE: BaseItemPerson[] = [
  { Id: "actor", Name: "An Actor", Type: "Actor", Role: "Hero" },
  { Id: "nolan", Name: "Christopher Nolan", Type: "Director" },
  { Id: "nolan", Name: "Christopher Nolan", Type: "Writer" },
  { Id: "jonah", Name: "Jonathan Nolan", Type: "Writer" },
];

describe("ItemCredits", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockOffline = false;
  });

  test("labels each line by its kind and how many people it names", async () => {
    await render(<ItemCredits people={PEOPLE} />);

    expect(screen.getByText("item_card.credits.Director:1")).toBeTruthy();
    expect(screen.getByText("item_card.credits.Writer:2")).toBeTruthy();
    expect(screen.queryByText("An Actor")).toBeNull();
  });

  test("a name opens that person", async () => {
    await render(<ItemCredits people={PEOPLE} />);

    fireEvent.press(screen.getByText("Jonathan Nolan"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/persons/[personId]",
      params: { personId: "jonah" },
    });
  });

  // The person page is fetched from the server.
  test("offline, the names are there but lead nowhere", async () => {
    mockOffline = true;
    await render(<ItemCredits people={PEOPLE} />);

    expect(screen.getByText(/Jonathan Nolan/)).toBeTruthy();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  test("draws nothing for an item without credits", async () => {
    await render(<ItemCredits people={[PEOPLE[0]]} />);

    expect(screen.toJSON()).toBeNull();
  });
});
