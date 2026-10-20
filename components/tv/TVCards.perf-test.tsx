import { makeItems } from "@/test-utils/baseItems";
import { stubReactNative } from "@/test-utils/reactNative";
import { measureParentRerenders } from "@/test-utils/rerender";

stubReactNative({ isTV: true });

// The TV components read Platform when they load, so they come after the stub.
const { TVActorCard } = require("@/components/tv/TVActorCard");
const { TVLanguageCard } = require("@/components/tv/TVLanguageCard");
const { TVOptionCard } = require("@/components/tv/TVOptionCard");
const { TVPosterCard } = require("@/components/tv/TVPosterCard");
const { TVSeriesSeasonCard } = require("@/components/tv/TVSeriesSeasonCard");
const { TVTrackCard } = require("@/components/tv/TVTrackCard");
const { TVUserCard } = require("@/components/tv/TVUserCard");

const noop = () => {};
const [movie] = makeItems(1);
const [episode] = makeItems(1, "Episode", "Episode");

const CARDS = {
  "a vertical TVPosterCard": () => (
    <TVPosterCard item={movie} orientation='vertical' onPress={noop} />
  ),
  "a horizontal TVPosterCard": () => (
    <TVPosterCard item={episode} orientation='horizontal' onPress={noop} />
  ),
  "a TVActorCard": () => (
    <TVActorCard
      person={{ Id: "p1", Name: "Actor", Role: "Role" }}
      onPress={noop}
    />
  ),
  "a TVSeriesSeasonCard": () => (
    <TVSeriesSeasonCard
      title='Season 1'
      subtitle='10 episodes'
      imageUrl={null}
      onPress={noop}
    />
  ),
  "a TVOptionCard": () => (
    <TVOptionCard label='Option' sublabel='Detail' selected onPress={noop} />
  ),
  "a TVTrackCard": () => (
    <TVTrackCard label='English' sublabel='AAC' selected onPress={noop} />
  ),
  "a TVLanguageCard": () => (
    <TVLanguageCard code='en' name='English' selected onPress={noop} />
  ),
  "a TVUserCard": () => (
    <TVUserCard username='user' securityType='none' onPress={noop} />
  ),
};

describe("TV cards", () => {
  test.each(Object.entries(CARDS))(
    "%s re-renders when its parent updates",
    async (_name, render) => {
      await measureParentRerenders(render);
    },
  );
});
