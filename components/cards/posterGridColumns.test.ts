import { posterGridColumns } from "./posterGridColumns";

describe("posterGridColumns", () => {
  test.each([
    ["a narrow window", 280, 2],
    ["a phone held upright", 390, 3],
    ["a small tablet upright", 744, 5],
    ["a phone turned to landscape", 844, 6],
    ["a tablet turned to landscape", 1194, 7],
    ["a desktop-sized window", 1600, 6],
  ])("gives %s (%i wide) %i columns", (_, width, columns) => {
    expect(posterGridColumns(width)).toBe(columns);
  });
});
