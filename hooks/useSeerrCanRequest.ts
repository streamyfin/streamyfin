import { useMemo } from "react";
import { useSeerr } from "@/hooks/useSeerr";
import { hasPermission, Permission } from "@/utils/seerr/permissions";
import { canRequest } from "@/utils/seerr/requests";
import type {
  MovieDetails,
  MovieResult,
  PersonCreditCast,
  TvDetails,
  TvResult,
} from "@/utils/seerr/types";

export const useSeerrCanRequest = (
  item?: MovieResult | TvResult | MovieDetails | TvDetails | PersonCreditCast,
) => {
  const { seerrUser } = useSeerr();

  const canRequestItem = useMemo(
    () => !!seerrUser && canRequest(item, seerrUser.permissions),
    [item, seerrUser],
  );

  const hasAdvancedRequestPermission = useMemo(() => {
    if (!seerrUser) return false;

    return hasPermission(
      [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
      seerrUser.permissions,
      { type: "or" },
    );
  }, [seerrUser]);

  return [canRequestItem, hasAdvancedRequestPermission];
};
