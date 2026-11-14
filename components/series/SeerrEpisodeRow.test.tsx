import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { SeerrEpisodeRow } from "./SeerrEpisodeRow";

const episode = {
  id: 1,
  episodeNumber: 1,
  name: "Pilot",
  overview: "",
} as unknown as ComponentProps<typeof SeerrEpisodeRow>["episode"];

// A still that fails on one URL is not broken for good: it moves to Seerr's image cache once the
// server's public settings are in, and the row kept its error over the new URL.
test("tries a new still URL after the last one failed", async () => {
  const { rerender } = await render(
    <SeerrEpisodeRow
      episode={episode}
      still='https://image.tmdb.org/t/p/w300/a.jpg'
    />,
  );

  const first = "image https://image.tmdb.org/t/p/w300/a.jpg";
  await act(() => fireEvent(screen.getByTestId(first), "error"));
  expect(screen.queryByTestId(first)).toBeNull();

  await rerender(
    <SeerrEpisodeRow
      episode={episode}
      still='https://seerr.example/imageproxy/tmdb/t/p/w300/a.jpg'
    />,
  );
  expect(
    screen.getByTestId(
      "image https://seerr.example/imageproxy/tmdb/t/p/w300/a.jpg",
    ),
  ).toBeTruthy();
});
