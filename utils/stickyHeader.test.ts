import { describe, expect, test } from "bun:test";
import { stickyHeaderOffset } from "./stickyHeader";

// A section 600 points tall, 1000 points down the content, with a 48 point
// header, under a bar whose bottom edge is 100 points down the screen.
const section = {
  viewTop: 0,
  sectionOffset: 1000,
  sectionHeight: 600,
  headerHeight: 48,
  top: 100,
};

describe("stickyHeaderOffset", () => {
  test("leaves the header in place while the section is below the bar", () => {
    expect(stickyHeaderOffset({ ...section, scroll: 0 })).toBe(0);
    expect(stickyHeaderOffset({ ...section, scroll: 900 })).toBe(0);
  });

  test("slides the header down as the section scrolls under the bar", () => {
    expect(stickyHeaderOffset({ ...section, scroll: 950 })).toBe(50);
    expect(stickyHeaderOffset({ ...section, scroll: 1200 })).toBe(300);
  });

  test("stops the header at the section's last row", () => {
    expect(stickyHeaderOffset({ ...section, scroll: 1452 })).toBe(552);
    expect(stickyHeaderOffset({ ...section, scroll: 5000 })).toBe(552);
  });

  // Where the scroll view starts on screen counts: a page that begins under
  // its own bar pins the header lower.
  test("counts where the scroll view starts on screen", () => {
    expect(stickyHeaderOffset({ ...section, viewTop: 100, scroll: 1100 })).toBe(
      100,
    );
  });

  test("never moves a header that fills its section", () => {
    expect(
      stickyHeaderOffset({ ...section, sectionHeight: 48, scroll: 2000 }),
    ).toBe(0);
  });
});
