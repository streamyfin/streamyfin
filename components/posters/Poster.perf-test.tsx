import Poster from "@/components/posters/Poster";
import { measureParentRerenders } from "@/test-utils/rerender";

describe("Poster Performance", () => {
  test("a Poster re-renders when its parent updates", async () => {
    await measureParentRerenders(() => (
      <Poster id='item-1' url='http://server.test/poster.jpg' />
    ));
  });
});
