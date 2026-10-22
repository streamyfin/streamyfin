import { apiAtom as providerApiAtom } from "@/providers/JellyfinProvider";
import { apiAtom } from "@/utils/atoms/api";

// settings.ts reads the api from utils/atoms/api while a scenario answers
// requests on the provider's double, so the two must be one atom.
test("the provider and utils/atoms/api share the api double", () => {
  expect(apiAtom).toBe(providerApiAtom);
});
