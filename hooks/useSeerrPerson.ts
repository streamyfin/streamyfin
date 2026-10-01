import { useQuery } from "@tanstack/react-query";
import { orderBy, uniqBy } from "lodash";
import { useMemo } from "react";
import { useSeerr } from "@/hooks/useSeerr";
import type { PersonCreditCast } from "@/utils/seerr/types";

/**
 * A person on Seerr, for the phone's page and the TV's alike: who they are,
 * and the titles they played in, the best known first, each once.
 */
export const useSeerrPerson = (personId: string | undefined) => {
  const { seerrApi } = useSeerr();

  const { data } = useQuery({
    queryKey: ["seerr", "person", personId],
    queryFn: async () => ({
      details: await seerrApi?.personDetails(personId!),
      combinedCredits: await seerrApi?.personCombinedCredits(personId!),
    }),
    enabled: !!seerrApi && !!personId,
  });

  const roles: PersonCreditCast[] = useMemo(
    () =>
      uniqBy(
        orderBy(
          data?.combinedCredits?.cast,
          ["voteCount", "voteAverage"],
          "desc",
        ),
        "id",
      ),
    [data?.combinedCredits],
  );

  return { details: data?.details, roles };
};
