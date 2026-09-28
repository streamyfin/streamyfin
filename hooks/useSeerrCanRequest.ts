import { useMemo } from "react";
import { useJellyseerr } from "@/hooks/useSeerr";
import { hasPermission, Permission } from "@/utils/seerr/permissions";
import { canRequest } from "@/utils/seerr/requests";
import type {
  MovieDetails,
  MovieResult,
  PersonCreditCast,
  TvDetails,
  TvResult,
} from "@/utils/seerr/types";

export const useJellyseerrCanRequest = (
  item?: MovieResult | TvResult | MovieDetails | TvDetails | PersonCreditCast,
) => {
  const { jellyseerrUser } = useJellyseerr();

  const canRequestItem = useMemo(
    () => !!jellyseerrUser && canRequest(item, jellyseerrUser.permissions),
    [item, jellyseerrUser],
  );

  const hasAdvancedRequestPermission = useMemo(() => {
    if (!jellyseerrUser) return false;

    return hasPermission(
      [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
      jellyseerrUser.permissions,
      { type: "or" },
    );
  }, [jellyseerrUser]);

  return [canRequestItem, hasAdvancedRequestPermission];
};
