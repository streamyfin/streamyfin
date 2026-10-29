import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { useFavorite } from "./useFavorite";

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom(null), userAtom: atom({ Id: "user-1" }) };
});

const channel = (id: string, isFavorite: boolean): BaseItemDto => ({
  Id: id,
  UserData: { Key: id, IsFavorite: isFavorite },
});

describe("useFavorite", () => {
  // A list mounts one hook per row, and each publishes its item's state.
  test("a row doesn't re-render when another row publishes its state", async () => {
    const renders: Record<string, number> = {};
    const Row = ({ item }: { item: BaseItemDto }) => {
      useFavorite(item);
      renders[item.Id!] = (renders[item.Id!] ?? 0) + 1;
      return null;
    };
    const client = new QueryClient();
    const store = createStore();
    const List = ({ items }: { items: BaseItemDto[] }) => (
      <QueryClientProvider client={client}>
        <JotaiProvider store={store}>
          {items.map((item) => (
            <Row key={item.Id} item={item} />
          ))}
        </JotaiProvider>
      </QueryClientProvider>
    );

    const first = channel("channel-1", true);
    const view = await render(<List items={[first]} />);
    await act(async () => {});
    const settled = renders["channel-1"];

    await view.rerender(<List items={[first, channel("channel-2", false)]} />);
    await act(async () => {});

    // The parent's re-render renders the row once more; the other row's
    // write must not add to that.
    expect(renders["channel-1"]).toBe(settled + 1);
  });

  test("reads the favorite state an item was mounted with", async () => {
    let isFavorite: boolean | undefined;
    const Row = () => {
      ({ isFavorite } = useFavorite(channel("channel-1", true)));
      return null;
    };
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <JotaiProvider store={createStore()}>
          <Row />
        </JotaiProvider>
      </QueryClientProvider>,
    );

    expect(isFavorite).toBe(true);
  });
});
