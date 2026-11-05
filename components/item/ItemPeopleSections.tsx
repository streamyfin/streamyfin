import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View, type ViewProps } from "react-native";
import { MoreMoviesWithActor } from "@/components/MoreMoviesWithActor";
import { CastAndCrew } from "@/components/series/CastAndCrew";
import { MORE_MOVIES_ACTORS_LIMIT } from "@/constants/CastCrew";
import { type CastCrewPerson, useCastCrew } from "@/hooks/useCastCrew";
import { useItemPeopleQuery } from "@/hooks/useItemPeopleQuery";
import { useOfflineMode } from "@/providers/OfflineModeProvider";

interface Props extends ViewProps {
  item: BaseItemDto;
}

export const ItemPeopleSections: React.FC<Props> = ({ item, ...props }) => {
  const isOffline = useOfflineMode();
  // The item the idle callback cleared for loading. The people are asked for
  // once the JS thread is idle, so the request does not compete with the rest
  // of the item page while it mounts. Moving to another item or going offline
  // clears it, so both wait for idle again.
  const [readyFor, setReadyFor] = useState<string | null>(null);

  useEffect(() => {
    if (isOffline) return;
    const itemId = item.Id ?? "";
    const handle = requestIdleCallback(() => setReadyFor(itemId));
    return () => {
      cancelIdleCallback(handle);
      setReadyFor(null);
    };
  }, [isOffline, item.Id]);

  const enabled = readyFor === (item.Id ?? "");

  const { data, isLoading } = useItemPeopleQuery(
    item.Id,
    enabled && !isOffline,
  );

  const people = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const itemWithPeople = useMemo(() => {
    return { ...item, People: people } as BaseItemDto;
  }, [item, people]);

  // The first distinct actors get a "more movies with" section of their own.
  const topActors = useCastCrew(people, {
    kind: "Actor",
    limit: MORE_MOVIES_ACTORS_LIMIT,
  });

  const renderActorSection = useCallback(
    (person: CastCrewPerson, idx: number, total: number) => {
      const spacingClassName = idx === total - 1 ? undefined : "mb-2";

      return (
        <MoreMoviesWithActor
          key={person.Id}
          currentItem={item}
          actorId={person.Id}
          actorName={person.Name}
          className={spacingClassName}
        />
      );
    },
    [item],
  );

  if (isOffline || !enabled) return null;

  return (
    <View {...props}>
      <CastAndCrew
        item={itemWithPeople}
        loading={isLoading}
        className={topActors.length > 0 ? "mb-2" : undefined}
      />
      {topActors.map((person, idx) =>
        renderActorSection(person, idx, topActors.length),
      )}
    </View>
  );
};
