import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useSegments } from "expo-router";
import { useAtom } from "jotai";
import type React from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ViewProps } from "react-native";
import { CardRow } from "@/components/cards/CardRow";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { mergePeopleById } from "@/utils/jellyfin/people";

interface Props extends ViewProps {
  item?: BaseItemDto | null;
  loading?: boolean;
}

export const CastAndCrew: React.FC<Props> = ({ item, loading, ...props }) => {
  const [api] = useAtom(apiAtom);
  const segments = useSegments();
  const { t } = useTranslation();
  const router = useRouter();
  const from = (segments as string[])[2];

  // A missing kind label falls back to the server's own word for it, which is
  // what a kind newer than the catalogue shows as.
  const destinctPeople = useMemo(
    () =>
      mergePeopleById(item?.People, (kind) =>
        t(`item_card.person_kind.${kind}`, { defaultValue: kind }),
      ),
    [item?.People, t],
  );

  // People aren't BaseItemDto, so the cards are built here rather than by
  // CardRow's item mapping.
  const cards = useMemo(
    () =>
      destinctPeople.flatMap((person) =>
        person.Id
          ? [
              {
                id: person.Id,
                title: person.Name ?? "",
                subtitle: person.Role ?? null,
                imageUrl: getPrimaryImageUrl({ api, item: person }),
              },
            ]
          : [],
      ),
    [api, destinctPeople],
  );

  const openPerson = useCallback(
    (personId: string) => {
      router.push({
        pathname: "/persons/[personId]",
        params: { personId },
      });
    },
    [router],
  );

  if (!from) return null;

  return (
    <CardRow
      {...props}
      title={t("item_card.cast_and_crew")}
      kind='portrait'
      cards={cards}
      loading={loading}
      onPressId={openPerson}
    />
  );
};
