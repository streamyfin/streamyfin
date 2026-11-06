import {
  apiAtom as providerApiAtom,
  userAtom as providerUserAtom,
} from "@/providers/JellyfinProvider";
import { apiAtom, userAtom } from "@/utils/atoms/api";

test("the unit provider default reexports the session atoms", () => {
  expect(providerApiAtom).toBe(apiAtom);
  expect(providerUserAtom).toBe(userAtom);
});
