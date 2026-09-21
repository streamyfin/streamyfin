import { describe, expect, test } from "bun:test";
import { hasPermission, Permission } from "./permissions";

describe("hasPermission", () => {
  test("lets an administrator through whatever is asked", () => {
    expect(hasPermission(Permission.MANAGE_REQUESTS, Permission.ADMIN)).toBe(
      true,
    );
  });

  test("refuses a permission the user does not hold", () => {
    expect(hasPermission(Permission.MANAGE_REQUESTS, Permission.REQUEST)).toBe(
      false,
    );
  });

  test("accepts a permission the user holds among others", () => {
    expect(
      hasPermission(
        Permission.REQUEST,
        Permission.REQUEST | Permission.REQUEST_MOVIE,
      ),
    ).toBe(true);
  });

  test("needs every permission when asked for all of them", () => {
    expect(
      hasPermission([Permission.REQUEST, Permission.VOTE], Permission.REQUEST, {
        type: "and",
      }),
    ).toBe(false);
  });

  test("needs only one when asked for any", () => {
    expect(
      hasPermission([Permission.REQUEST, Permission.VOTE], Permission.REQUEST, {
        type: "or",
      }),
    ).toBe(true);
  });

  // NONE is 0, and asking for nothing is not the same as being refused.
  test("asks for nothing and gets it", () => {
    expect(hasPermission(Permission.NONE, Permission.NONE)).toBe(true);
  });

  // The values are a bitmask a server sends as a plain number, so a wrong one
  // silently grants or refuses the wrong thing. These are the six the app
  // reads, checked against the values Seerr assigns them.
  test("keeps the values Seerr assigns", () => {
    expect(Permission.ADMIN).toBe(2);
    expect(Permission.MANAGE_REQUESTS).toBe(16);
    expect(Permission.REQUEST).toBe(32);
    expect(Permission.REQUEST_ADVANCED).toBe(8192);
    expect(Permission.REQUEST_MOVIE).toBe(262144);
    expect(Permission.REQUEST_TV).toBe(524288);
  });
});
