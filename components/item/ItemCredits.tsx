import type { BaseItemPerson } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";
import useRouter from "@/hooks/useAppRouter";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { getCreditLines } from "@/utils/jellyfin/people";

// Wide enough for the English labels, so the names of every line start at the
// same column.
const LABEL_MIN_WIDTH = 96;

interface Props extends ViewProps {
  people?: BaseItemPerson[] | null;
}

/** Labelled credits lines (directors, writers, ...), each name a link. */
export const ItemCredits: React.FC<Props> = ({ people, ...props }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const isOffline = useOfflineMode();
  const lines = useMemo(() => getCreditLines(people), [people]);

  if (lines.length === 0) return null;

  return (
    <View {...props}>
      {lines.map((line) => (
        <View key={line.kind} className='flex flex-row mb-1'>
          {/* A minimum, not a width: the lines align in English, and a
              longer translated label pushes its names over instead of
              breaking mid-word. */}
          <Text
            className='text-neutral-400 mr-2'
            style={{ minWidth: LABEL_MIN_WIDTH }}
          >
            {t(`item_card.credits.${line.kind}`, {
              count: line.people.length,
            })}
          </Text>
          <Text className='flex-1'>
            {line.people.map(({ id, name }, index) => (
              <Fragment key={id ?? name}>
                {index > 0 && ", "}
                {/* The person page is loaded from the server: offline, a
                    link would open onto an error. */}
                {id && !isOffline ? (
                  <Text
                    accessibilityRole='link'
                    className='text-purple-600'
                    onPress={() =>
                      router.push({
                        pathname: "/persons/[personId]",
                        params: { personId: id },
                      })
                    }
                  >
                    {name}
                  </Text>
                ) : (
                  name
                )}
              </Fragment>
            ))}
          </Text>
        </View>
      ))}
    </View>
  );
};
