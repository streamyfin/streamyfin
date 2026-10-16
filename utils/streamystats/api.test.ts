import axios from "axios";
import { createStreamystatsApi } from "./api";

jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);

const mockGet = axios.get as jest.Mock;

/** What the configured Streamystats server, or a proxy in front of it, answered with 200. */
const serverAnswers = (body: unknown) =>
  mockGet.mockResolvedValue({ data: body });

const streamystats = () =>
  createStreamystatsApi({
    serverUrl: "https://stats.example.com",
    jellyfinToken: "token",
  });

// Streamystats is a third-party server the user points the app at, so a 200 says
// nothing about the body: another version, an error object, or a proxy's own page
// all arrive here. Sentry REACT-NATIVE-AH and REACT-NATIVE-D5 were the home rows
// reading `data.movies` and `data.series` off a body that had no `data`, and
// REACT-NATIVE-H2 was the search screen doing the same.
const BODIES_WITHOUT_IDS: [string, unknown][] = [
  ["an error object", { error: "Server not found" }],
  ["a proxy's HTML page", "<!DOCTYPE html><html><body>Sign in</body></html>"],
  ["an empty body", ""],
  ["a JSON null", null],
  ["a null data field", { data: null }],
  ["the full format's list", { data: [{ item: { id: "a" } }] }],
];

describe("recommendation ids", () => {
  beforeEach(() => mockGet.mockReset());

  test.each(BODIES_WITHOUT_IDS)(
    "reads %s as no recommendations",
    async (_name, body) => {
      serverAnswers(body);

      const response = await streamystats().getRecommendationIds("server-id");

      expect(response.data).toEqual({ movies: [], series: [], total: 0 });
    },
  );

  test("keeps the ids of a well formed answer", async () => {
    serverAnswers({ data: { movies: ["m1", "m2"], series: ["s1"], total: 3 } });

    const response = await streamystats().getRecommendationIds("server-id");

    expect(response.data).toEqual({
      movies: ["m1", "m2"],
      series: ["s1"],
      total: 3,
    });
  });

  // Asked for one type, the server may leave the other list out altogether.
  test("reads a missing list as empty", async () => {
    serverAnswers({ data: { movies: ["m1"] } });

    const response = await streamystats().getRecommendationIds(
      "server-id",
      "Movie",
    );

    expect(response.data).toEqual({ movies: ["m1"], series: [], total: 1 });
  });

  // The ids go straight into a Jellyfin items request.
  test("drops what is not an id", async () => {
    serverAnswers({ data: { movies: ["m1", null, 7, ""], series: "s1" } });

    const response = await streamystats().getRecommendationIds("server-id");

    expect(response.data).toEqual({ movies: ["m1"], series: [], total: 1 });
  });

  test("keeps the server's error message", async () => {
    serverAnswers({ error: "Server not found" });

    const response = await streamystats().getRecommendationIds("server-id");

    expect(response.error).toBe("Server not found");
  });
});

describe("search ids", () => {
  beforeEach(() => mockGet.mockReset());

  const NO_RESULTS = {
    movies: [],
    series: [],
    episodes: [],
    seasons: [],
    audio: [],
    actors: [],
    directors: [],
    writers: [],
    total: 0,
  };

  test.each(BODIES_WITHOUT_IDS)(
    "reads %s as no results",
    async (_name, body) => {
      serverAnswers(body);

      const response = await streamystats().searchIds("alien");

      expect(response.data).toEqual(NO_RESULTS);
    },
  );

  test("keeps the ids of a well formed answer", async () => {
    serverAnswers({
      data: { movies: ["m1"], episodes: ["e1", "e2"], total: 3 },
    });

    const response = await streamystats().searchIds("alien");

    expect(response.data).toEqual({
      ...NO_RESULTS,
      movies: ["m1"],
      episodes: ["e1", "e2"],
      total: 3,
    });
  });
});
