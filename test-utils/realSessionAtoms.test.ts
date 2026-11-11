import {
  apiAtom as providerApiAtom,
  userAtom as providerUserAtom,
} from "@/providers/JellyfinProvider";
import { apiAtom, userAtom } from "@/utils/atoms/api";

jest.mock("@/providers/JellyfinProvider", () =>
  jest.requireActual("@/test-utils/realSessionAtoms"),
);

test("the provider double re-exports the real session atoms", () => {
  expect(providerApiAtom).toBe(apiAtom);
  expect(providerUserAtom).toBe(userAtom);
});
