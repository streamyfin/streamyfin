import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { episodeRowState } from "./episodeRowState";

const loaded = { data: [{ Id: "s1" }], isLoading: false, errorUpdateCount: 0 };
const pending = { data: undefined, isLoading: true, errorUpdateCount: 0 };

// What a failed request leaves in a real query, then what its next fetch puts
// back while it runs: query-core resets a query with no data to "pending".
async function failedThenRefetching() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const observer = new QueryObserver(client, {
    queryKey: ["episodes", "season-1"],
    queryFn: () => Promise.reject(new Error("503")),
  });
  const unsubscribe = observer.subscribe(() => {});
  await observer.refetch();
  const failed = observer.getCurrentResult();
  const refetch = observer.refetch();
  const refetching = observer.getCurrentResult();
  await refetch;
  unsubscribe();
  client.clear();
  return { failed, refetching };
}

test("the row waits for the seasons: no season is picked before they arrive", () => {
  expect(episodeRowState(pending, { ...pending, isLoading: false })).toBe(
    "loading",
  );
});

test("the row waits for the season's episodes", () => {
  expect(episodeRowState(loaded, pending)).toBe("loading");
});

// Phone, first open of a series: the seasons are in, but the default season
// is picked by an effect one render later, and its episodes are not asked
// for until then. The empty text flashed under the spinner.
test("the row waits while a season is being picked", () => {
  const notAskedYet = {
    data: undefined,
    isLoading: false,
    errorUpdateCount: 0,
  };
  expect(episodeRowState(loaded, notAskedYet, true)).toBe("loading");
  expect(episodeRowState(loaded, notAskedYet)).toBe("ready");
});

test("a season whose episodes came back empty is an empty season", () => {
  expect(
    episodeRowState(loaded, {
      data: [],
      isLoading: false,
      errorUpdateCount: 0,
    }),
  ).toBe("ready");
});

// TV, Jellyfin answering 5xx: the row read the failure as an empty season,
// then flipped between the placeholders and that text on every refetch.
test("episodes that failed stay failed while they are asked for again", async () => {
  const { failed, refetching } = await failedThenRefetching();

  expect(refetching.isLoading).toBe(true);
  expect(episodeRowState(loaded, failed)).toBe("failed");
  expect(episodeRowState(loaded, refetching)).toBe("failed");
});

test("seasons that failed fail the row too", async () => {
  const { failed, refetching } = await failedThenRefetching();

  expect(episodeRowState(failed, { ...pending, isLoading: false })).toBe(
    "failed",
  );
  expect(episodeRowState(refetching, { ...pending, isLoading: false })).toBe(
    "failed",
  );
});

test("a failed refresh of episodes already shown keeps them", () => {
  expect(
    episodeRowState(loaded, {
      data: [{ Id: "e1" }],
      isLoading: false,
      errorUpdateCount: 1,
    }),
  ).toBe("ready");
});
