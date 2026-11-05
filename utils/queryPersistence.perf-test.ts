import { measureFunction } from "reassure";
import { save, sessionCache } from "@/test-utils/tvSessionCache";
import { queryDehydrateOptions } from "./queryPersistence";

// Baseline for saving the query cache. The persister turns the whole dehydrated cache into one JSON string on the
// JS thread, at most once a second while queries change. This measures that
// work on a cache shaped like a TV session: the Home screen, a library browsed
// ten pages deep, and a few item pages.

// One save takes a fraction of a millisecond in Node. Fifty make a run of 10 ms
// or so, where the PR comment's 1 ms floor is a 10% change, not a 50% one.
const SAVES_PER_RUN = 50;

test("saving the query cache of a TV session fifty times", async () => {
  const client = sessionCache();

  // What the persister does on each save: dehydrate with the app's rules,
  // then serialise for MMKV.
  await measureFunction(
    () => {
      for (let index = 0; index < SAVES_PER_RUN; index++) {
        save(client, queryDehydrateOptions);
      }
    },
    // measureRenders collects garbage after each run and measureFunction does
    // not, so a run would start on whatever heap the earlier spec files left.
    { beforeEach: () => globalThis.gc?.() },
  );
  // Its garbage collection timers would keep Jest from exiting.
  client.clear();
});

test("restoring the query cache of a TV session fifty times", async () => {
  const client = sessionCache();
  const blob = save(client, queryDehydrateOptions);

  await measureFunction(() => {
    for (let restore = 0; restore < SAVES_PER_RUN; restore++) {
      JSON.parse(blob);
    }
  });
  client.clear();
});
