import { fireEvent, render, screen } from "@testing-library/react-native";
import { createStore, Provider } from "jotai";
import "@/augmentations/number";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { size?: string }) =>
      options?.size ? `${key}:${options.size}` : key,
  }),
}));
const mockPush = jest.fn();
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: mockPush }),
}));
// The hook module loads the whole download stack; the notice reads one atom.
jest.mock("@/providers/Downloads/hooks/useNextEpisodesDownloads", () => {
  const { atom } = jest.requireActual("jotai");
  return { nextEpisodesHoldAtom: atom(null) };
});

import { nextEpisodesHoldAtom } from "@/providers/Downloads/hooks/useNextEpisodesDownloads";
import { NextEpisodesNotice } from "./NextEpisodesNotice";

const renderNotice = async (hold: "low_space" | "waiting_for_wifi" | null) => {
  const store = createStore();
  store.set(nextEpisodesHoldAtom as never, hold);
  await render(
    <Provider store={store}>
      <NextEpisodesNotice />
    </Provider>,
  );
};

beforeEach(() => jest.clearAllMocks());

describe("NextEpisodesNotice", () => {
  test("shows nothing while nothing holds the next episodes back", async () => {
    await renderNotice(null);
    expect(screen.toJSON()).toBeNull();
  });

  test("says storage is low, and how much has to be free", async () => {
    await renderNotice("low_space");
    expect(
      screen.getByText("home.downloads.next_episodes.low_space_title"),
    ).toBeTruthy();
    expect(
      screen.getByText("home.downloads.next_episodes.low_space:2 GB"),
    ).toBeTruthy();
  });

  test("says the next episodes are waiting for Wi-Fi", async () => {
    await renderNotice("waiting_for_wifi");
    expect(
      screen.getByText("home.downloads.next_episodes.waiting_for_wifi"),
    ).toBeTruthy();
  });

  test("opens the download settings", async () => {
    await renderNotice("waiting_for_wifi");
    await fireEvent.press(screen.getByRole("button"));
    expect(mockPush).toHaveBeenCalledWith("/settings/downloads/page");
  });
});
