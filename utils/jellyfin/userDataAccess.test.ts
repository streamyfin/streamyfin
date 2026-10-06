import type { UserPolicy } from "@jellyfin/sdk/lib/generated-client";
import { canUpdateUserData } from "./userDataAccess";

const userWith = (policy: Partial<UserPolicy>) => ({
  Policy: policy as UserPolicy,
});

describe("canUpdateUserData", () => {
  test("a user with preference access may", () => {
    expect(
      canUpdateUserData(
        userWith({ IsAdministrator: false, EnableUserPreferenceAccess: true }),
      ),
    ).toBe(true);
  });

  test("a user without it may not", () => {
    expect(
      canUpdateUserData(
        userWith({ IsAdministrator: false, EnableUserPreferenceAccess: false }),
      ),
    ).toBe(false);
  });

  test("an administrator may, whatever the flag says", () => {
    expect(
      canUpdateUserData(
        userWith({ IsAdministrator: true, EnableUserPreferenceAccess: false }),
      ),
    ).toBe(true);
  });

  // The server has the last word, so what the app does not know is not held
  // against the user: no user yet, no policy on it, or a policy from a server
  // that does not send the flag.
  test.each([
    ["no user", null],
    ["a user without a policy", {}],
    ["a policy without the flag", userWith({ IsAdministrator: false })],
  ])("%s is let through", (_name, user) => {
    expect(canUpdateUserData(user)).toBe(true);
  });
});
