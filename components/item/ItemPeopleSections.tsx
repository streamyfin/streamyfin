import type {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { InteractionManager, View, type ViewProps } from "react-native";
import { MoreMoviesWithActor } from "@/components/MoreMoviesWithActor";
import { CastAndCrew } from "@/components/series/CastAndCrew";
import { useItemPeopleQuery } from "@/hooks/useItemPeopleQuery";
import { useOfflineMode } from "@/providers/OfflineModeProvider";

interface Props extends ViewProps {
  item: BaseItemDto;
}

export const ItemPeopleSections: React.FC<Props> = ({ item, ...props }) => {
  const isOffline = useOfflineMode();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (isOffline) return;
    const task = InteractionManager.runAfterInteractions(() =>
      setEnabled(true),
    );
    return () => task.cancel();
  }, [isOffline]);

  const { data, isLoading } = useItemPeopleQuery(
    item.Id,
    enabled && !isOffline,
  );

  const people = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const itemWithPeople = useMemo(() => {
    return { ...item, People: people } as BaseItemDto;
  }, [item, people]);

  // Jellyfin can list the same person several times (e.g. an actor also
  // credited as writer). Dedupe by Id so the same actor section isn't rendered
  // twice and we still surface 3 distinct people.
  const topPeople = useMemo(() => {
    const seen = new Set<string>();
    const unique: BaseItemPerson[] = [];
    for (const person of people) {
      if (!person.Id || seen.has(person.Id)) continue;
      seen.add(person.Id);
      unique.push(person);
      if (unique.length >= 3) break;
    }
    return unique;
  }, [people]);

  const renderActorSection = useCallback(
    (person: BaseItemPerson, idx: number, total: number) => {
      if (!person.Id) return null;

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

  const shouldSpaceCastAndCrew = topPeople.length > 0;

  return (
    <View {...props}>
      <CastAndCrew
        item={itemWithPeople}
        loading={isLoading}
        className={shouldSpaceCastAndCrew ? "mb-2" : undefined}
      />
      {topPeople.map((person, idx) =>
        renderActorSection(person, idx, topPeople.length),
      )}
    </View>
  );
};
