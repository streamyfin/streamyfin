import {
  apiAtom as providerApiAtom,
  userAtom as providerUserAtom,
} from "@/providers/JellyfinProvider";
import { apiAtom, userAtom } from "@/utils/atoms/api";

jest.mock("@/providers/JellyfinProvider", () =>
  jest.requireActual("@/test-utils/jellyfinProviderModule"),
);

test("the unit provider default reexports the session atoms", () => {
  expect(providerApiAtom).toBe(apiAtom);
  expect(providerUserAtom).toBe(userAtom);
});
