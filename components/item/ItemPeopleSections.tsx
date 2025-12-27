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

interface Props extends ViewProps {
  item: BaseItemDto;
  isOffline: boolean;
}

export const ItemPeopleSections: React.FC<Props> = ({
  item,
  isOffline,
  ...props
}) => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (isOffline) return;
    const task = InteractionManager.runAfterInteractions(() =>
      setEnabled(true),
    );
    return () => task.cancel();
  }, [isOffline]);

  const { data: people = [], isLoading } = useItemPeopleQuery(
    item.Id,
    enabled && !isOffline,
  );

  const itemWithPeople = useMemo(() => {
    return { ...item, People: people } as BaseItemDto;
  }, [item, people]);

  const topPeople = useMemo(() => people.slice(0, 3), [people]);

  const renderActorSection = useCallback(
    (person: BaseItemPerson) => {
      if (!person.Id) return null;

      return (
        <MoreMoviesWithActor
          key={person.Id}
          currentItem={item}
          actorId={person.Id}
          actorName={person.Name}
          className='mb-4'
        />
      );
    },
    [item],
  );

  if (isOffline || !enabled) return null;

  return (
    <View {...props}>
      <CastAndCrew item={itemWithPeople} loading={isLoading} className='mb-4' />
      {topPeople.map(renderActorSection)}
    </View>
  );
};
