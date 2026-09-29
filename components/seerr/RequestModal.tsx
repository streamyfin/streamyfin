import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import type { BottomSheetModalMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { useQuery } from "@tanstack/react-query";
import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWindowDimensions, View, type ViewProps } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { SeasonQuota } from "@/components/seerr/SeasonQuota";
import { SeasonRequestTable } from "@/components/seerr/SeasonRequestTable";
import { SHEET_MAX_HEIGHT_RATIO } from "@/constants/Values";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrPublicSettings } from "@/hooks/useSeerrPublicSettings";
import { writeDebugLog } from "@/utils/log";
import { hasPermission, Permission } from "@/utils/seerr/permissions";
import {
  roomForAll,
  roomForOneMore,
  seasonRows,
  toggleAllSeasons,
  toggleSeason,
  unrequestedSeasons,
} from "@/utils/seerr/seasons";
import type {
  MediaRequestBody,
  MediaType,
  QualityProfile,
  RootFolder,
  ServarrTag as Tag,
  TvDetails,
} from "@/utils/seerr/types";

interface Props {
  id: number;
  title: string;
  requestBody?: MediaRequestBody;
  type: MediaType;
  isAnime?: boolean;
  is4k?: boolean;
  /** A series' details: its seasons are chosen here, as on Seerr. */
  details?: TvDetails;
  /** Whether the user may pick the server, profile, folder, tags and user. */
  advanced?: boolean;
  onRequested?: () => void;
  onDismiss?: () => void;
}

const RequestModal = forwardRef<
  BottomSheetModalMethods,
  Props & Omit<ViewProps, "id">
>(
  (
    {
      id,
      title,
      requestBody,
      type,
      isAnime = false,
      details,
      advanced = true,
      onRequested,
      onDismiss,
    },
    ref,
  ) => {
    const { seerrApi, seerrUser, requestMedia } = useSeerr();
    const { height: windowHeight } = useWindowDimensions();
    const isSeries = type === "tv" && !!details;
    const [requestOverrides, setRequestOverrides] = useState<MediaRequestBody>({
      mediaId: Number(id),
      mediaType: type,
      userId: seerrUser?.id,
    });

    const [qualityProfileOpen, setQualityProfileOpen] = useState(false);
    const [rootFolderOpen, setRootFolderOpen] = useState(false);
    const [tagsOpen, setTagsOpen] = useState(false);
    const [usersOpen, setUsersOpen] = useState(false);

    const { t } = useTranslation();

    // What Seerr's own modal reads from the server: whether it shows the
    // specials, and whether it takes a series a season at a time.
    const publicSettings = useSeerrPublicSettings();
    const specials = publicSettings?.enableSpecialEpisodes === true;
    const partial = publicSettings?.partialRequestsEnabled !== false;

    const rows = useMemo(
      () => (isSeries && details ? seasonRows(details, { specials }) : []),
      [isSeries, details, specials],
    );
    const unrequested = useMemo(
      () =>
        isSeries && details ? unrequestedSeasons(details, { specials }) : [],
      [isSeries, details, specials],
    );
    const [selectedSeasons, setSelectedSeasons] = useState<number[]>([]);

    // The switches start from what the modal was opened with: none from the
    // request button, as on Seerr, and one from a season's own button.
    useEffect(() => {
      const opened = requestBody?.seasons ?? [];
      setSelectedSeasons(
        opened === "all"
          ? unrequested
          : opened.filter((season) => unrequested.includes(season)),
      );
    }, [requestBody, unrequested]);

    // The quota of whoever the request is for. Seerr only reads another
    // user's with MANAGE_USERS, which it asks for; without it that would be a
    // 403 each time the modal opens.
    const quotaUserId =
      (advanced ? requestOverrides.userId : undefined) ?? seerrUser?.id;
    const mayReadQuota =
      quotaUserId === seerrUser?.id ||
      hasPermission(Permission.MANAGE_USERS, seerrUser?.permissions ?? 0);
    const { data: quota } = useQuery({
      queryKey: ["seerr", "quota", quotaUserId],
      queryFn: async () => seerrApi?.userQuota(quotaUserId!),
      enabled:
        isSeries && !!seerrApi && quotaUserId !== undefined && mayReadQuota,
    });
    const tvQuota = quota?.tv;
    const limited = !!tvQuota?.limit;
    // A server that only takes whole series needs a quota for all of them.
    const overLimit =
      limited && !partial && unrequested.length > (tvQuota?.remaining ?? 0);
    const remaining = overLimit
      ? 0
      : (tvQuota?.remaining ?? 0) - selectedSeasons.length;

    // Seerr's isAllSeasons, which leaves the specials out of the count.
    const allSelected =
      selectedSeasons.filter((season) => season !== 0).length ===
      unrequested.filter((season) => season !== 0).length;

    const approvedAutomatically =
      isSeries &&
      unrequested.length > 0 &&
      !overLimit &&
      hasPermission(
        [
          Permission.MANAGE_REQUESTS,
          Permission.AUTO_APPROVE,
          Permission.AUTO_APPROVE_TV,
        ],
        seerrUser?.permissions ?? 0,
        { type: "or" },
      );

    // Reset all dropdown states when modal closes
    const handleDismiss = useCallback(() => {
      setQualityProfileOpen(false);
      setRootFolderOpen(false);
      setTagsOpen(false);
      setUsersOpen(false);
      onDismiss?.();
    }, [onDismiss]);

    const { data: serviceSettings } = useQuery({
      queryKey: ["seerr", "request", type, "service"],
      queryFn: async () =>
        seerrApi?.service(type === "movie" ? "radarr" : "sonarr"),
      enabled: advanced && !!seerrApi && !!seerrUser,
      refetchOnMount: "always",
    });

    const { data: users } = useQuery({
      queryKey: ["seerr", "users"],
      queryFn: async () => seerrApi?.user({ take: 1000, sort: "displayname" }),
      enabled: advanced && !!seerrApi && !!seerrUser,
      refetchOnMount: "always",
    });

    const defaultService = useMemo(
      () => serviceSettings?.find?.((v) => v.isDefault),
      [serviceSettings],
    );

    const { data: defaultServiceDetails } = useQuery({
      queryKey: [
        "seerr",
        "request",
        type,
        "service",
        "details",
        defaultService?.id,
      ],
      queryFn: async () => {
        setRequestOverrides((prev) => ({
          ...prev,
          serverId: defaultService?.id,
        }));
        return seerrApi?.serviceDetails(
          type === "movie" ? "radarr" : "sonarr",
          defaultService!.id,
        );
      },
      enabled: advanced && !!seerrApi && !!seerrUser && !!defaultService,
      refetchOnMount: "always",
    });

    const defaultProfile: QualityProfile | undefined = useMemo(
      () =>
        defaultServiceDetails?.profiles.find(
          (p) =>
            p.id ===
            (isAnime
              ? defaultServiceDetails.server?.activeAnimeProfileId
              : defaultServiceDetails.server?.activeProfileId),
        ),
      [defaultServiceDetails],
    );

    const defaultFolder: RootFolder | undefined = useMemo(
      () =>
        defaultServiceDetails?.rootFolders.find(
          (f) =>
            f.path ===
            (isAnime
              ? defaultServiceDetails?.server.activeAnimeDirectory
              : defaultServiceDetails.server?.activeDirectory),
        ),
      [defaultServiceDetails],
    );

    const defaultTags: Tag[] = useMemo(() => {
      const tags =
        defaultServiceDetails?.tags.filter((t) =>
          (isAnime
            ? defaultServiceDetails?.server.activeAnimeTags
            : defaultServiceDetails?.server.activeTags
          )?.includes(t.id),
        ) ?? [];
      return tags;
    }, [defaultServiceDetails]);

    const seasonTitle = useMemo(() => {
      if (!requestBody?.seasons || requestBody.seasons.length === 0) {
        return undefined;
      }
      if (requestBody.seasons.length > 1) {
        return t("seerr.season_all");
      }
      return t("seerr.season_number", {
        season_number: requestBody.seasons[0],
      });
    }, [requestBody?.seasons]);

    // freeSpace is optional on a root folder the service hasn't scanned yet.
    const pathTitleExtractor = (item: RootFolder) =>
      `${item.path}${item.freeSpace ? ` (${item.freeSpace.bytesToReadable()})` : ""}`;

    // The service's active directory may not match any root folder (changed
    // or removed server-side), so `defaultFolder` — despite its type — can be
    // undefined and must never be handed to pathTitleExtractor unchecked.
    const selectedFolder: RootFolder | undefined = useMemo(
      () =>
        defaultServiceDetails?.rootFolders.find(
          (f) =>
            f.path === (requestOverrides.rootFolder || defaultFolder?.path),
        ) ?? defaultFolder,
      [defaultServiceDetails, requestOverrides.rootFolder, defaultFolder],
    );

    const qualityProfileOptions = useMemo(
      () => [
        {
          options:
            defaultServiceDetails?.profiles.map((profile) => ({
              type: "radio" as const,
              label: profile.name,
              value: profile.id.toString(),
              selected:
                (requestOverrides.profileId || defaultProfile?.id) ===
                profile.id,
              onPress: () =>
                setRequestOverrides((prev) => ({
                  ...prev,
                  profileId: profile.id,
                })),
            })) || [],
        },
      ],
      [
        defaultServiceDetails?.profiles,
        defaultProfile,
        requestOverrides.profileId,
      ],
    );

    const rootFolderOptions = useMemo(
      () => [
        {
          options:
            defaultServiceDetails?.rootFolders.map((folder) => ({
              type: "radio" as const,
              label: pathTitleExtractor(folder),
              value: folder.id.toString(),
              selected:
                (requestOverrides.rootFolder || defaultFolder?.path) ===
                folder.path,
              onPress: () =>
                setRequestOverrides((prev) => ({
                  ...prev,
                  rootFolder: folder.path,
                })),
            })) || [],
        },
      ],
      [
        defaultServiceDetails?.rootFolders,
        defaultFolder,
        requestOverrides.rootFolder,
      ],
    );

    const tagsOptions = useMemo(
      () => [
        {
          options:
            defaultServiceDetails?.tags.map((tag) => ({
              type: "toggle" as const,
              label: tag.label,
              value:
                requestOverrides.tags?.includes(tag.id) ||
                defaultTags.some((dt) => dt.id === tag.id),
              onToggle: () =>
                setRequestOverrides((prev) => {
                  const currentTags = prev.tags || defaultTags.map((t) => t.id);
                  const hasTag = currentTags.includes(tag.id);
                  return {
                    ...prev,
                    tags: hasTag
                      ? currentTags.filter((id) => id !== tag.id)
                      : [...currentTags, tag.id],
                  };
                }),
            })) || [],
        },
      ],
      [defaultServiceDetails?.tags, defaultTags, requestOverrides.tags],
    );

    const usersOptions = useMemo(
      () => [
        {
          options:
            users?.map((user) => ({
              type: "radio" as const,
              label: user.displayName,
              value: user.id.toString(),
              selected: (requestOverrides.userId || seerrUser?.id) === user.id,
              onPress: () =>
                setRequestOverrides((prev) => ({
                  ...prev,
                  userId: user.id,
                })),
            })) || [],
        },
      ],
      [users, seerrUser, requestOverrides.userId],
    );

    const request = useCallback(() => {
      const body = {
        // Only a user who may choose them sends a server, profile, folder,
        // tags or another user: Seerr picks its defaults for everyone else.
        ...(advanced && {
          is4k: defaultService?.is4k || defaultServiceDetails?.server.is4k,
          profileId: defaultProfile?.id,
          rootFolder: defaultFolder?.path,
          tags: defaultTags.map((t) => t.id),
        }),
        ...requestBody,
        ...(advanced && requestOverrides),
        // A server that only takes whole series gets every season left.
        ...(isSeries && {
          seasons: [...(partial ? selectedSeasons : unrequested)].sort(
            (a, b) => a - b,
          ),
        }),
      } as MediaRequestBody;

      writeDebugLog("Sending Seerr request", body);

      requestMedia(
        !isSeries && seasonTitle ? `${title}, ${seasonTitle}` : title,
        body,
        onRequested,
      );
    }, [
      advanced,
      isSeries,
      partial,
      unrequested,
      selectedSeasons,
      requestBody,
      requestOverrides,
      defaultProfile,
      defaultFolder,
      defaultTags,
    ]);

    // Seerr's button: nothing left to ask for, the whole series, nothing
    // chosen yet, or how many seasons.
    const requestLabel = !isSeries
      ? t("seerr.request_button")
      : unrequested.length === 0
        ? t("seerr.already_requested")
        : !partial
          ? t("seerr.request_button")
          : selectedSeasons.length === 0
            ? t("seerr.select_seasons")
            : t("seerr.request_n_seasons", { count: selectedSeasons.length });
    const requestDisabled =
      isSeries &&
      ((!partial && limited && unrequested.length > (tvQuota?.limit ?? 0)) ||
        unrequested.length === 0 ||
        (partial && selectedSeasons.length === 0));

    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        enableDismissOnClose
        onDismiss={handleDismiss}
        handleIndicatorStyle={{
          backgroundColor: "white",
        }}
        backgroundStyle={{
          backgroundColor: "#171717",
        }}
        backdropComponent={(sheetProps: BottomSheetBackdropProps) => (
          <BottomSheetBackdrop
            {...sheetProps}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
          />
        )}
        stackBehavior='push'
        maxDynamicContentSize={windowHeight * SHEET_MAX_HEIGHT_RATIO}
      >
        <BottomSheetScrollView>
          <View className='flex flex-col space-y-4 px-4 pb-8 pt-2'>
            <View>
              <Text className='font-bold text-2xl text-neutral-100'>
                {isSeries ? t("seerr.request_series") : t("seerr.advanced")}
              </Text>
              {isSeries ? (
                <Text className='text-neutral-300'>{title}</Text>
              ) : (
                seasonTitle && (
                  <Text className='text-neutral-300'>{seasonTitle}</Text>
                )
              )}
            </View>
            {approvedAutomatically && (
              <View className='rounded-xl border border-indigo-500/40 bg-indigo-500/20 px-3 py-2'>
                <Text className='text-sm text-neutral-100'>
                  {t("seerr.request_approved_automatically")}
                </Text>
              </View>
            )}
            {isSeries && limited && (
              <SeasonQuota
                remaining={remaining}
                overLimit={overLimit ? unrequested.length : undefined}
                restricted={tvQuota?.restricted}
              />
            )}
            {isSeries && (
              <SeasonRequestTable
                rows={rows}
                selected={selectedSeasons}
                allSelected={allSelected}
                choosable={partial}
                roomForOneMore={roomForOneMore(selectedSeasons, tvQuota)}
                roomForAll={roomForAll(unrequested, tvQuota)}
                onToggle={(season) =>
                  setSelectedSeasons((selected) =>
                    toggleSeason(selected, season, unrequested, tvQuota),
                  )
                }
                onToggleAll={() =>
                  setSelectedSeasons((selected) =>
                    toggleAllSeasons(selected, unrequested, tvQuota),
                  )
                }
              />
            )}
            <View className='flex flex-col space-y-2'>
              {advanced && defaultService && defaultServiceDetails && users && (
                <>
                  <View className='flex flex-col'>
                    <Text className='opacity-50 mb-1 text-xs'>
                      {t("seerr.quality_profile")}
                    </Text>
                    <PlatformDropdown
                      groups={qualityProfileOptions}
                      trigger={
                        <View className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'>
                          <Text numberOfLines={1}>
                            {defaultServiceDetails.profiles.find(
                              (p) =>
                                p.id ===
                                (requestOverrides.profileId ||
                                  defaultProfile?.id),
                            )?.name || defaultProfile?.name}
                          </Text>
                        </View>
                      }
                      title={t("seerr.quality_profile")}
                      open={qualityProfileOpen}
                      onOpenChange={setQualityProfileOpen}
                    />
                  </View>

                  <View className='flex flex-col'>
                    <Text className='opacity-50 mb-1 text-xs'>
                      {t("seerr.root_folder")}
                    </Text>
                    <PlatformDropdown
                      groups={rootFolderOptions}
                      trigger={
                        <View className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'>
                          <Text numberOfLines={1}>
                            {selectedFolder
                              ? pathTitleExtractor(selectedFolder)
                              : "—"}
                          </Text>
                        </View>
                      }
                      title={t("seerr.root_folder")}
                      open={rootFolderOpen}
                      onOpenChange={setRootFolderOpen}
                    />
                  </View>

                  <View className='flex flex-col'>
                    <Text className='opacity-50 mb-1 text-xs'>
                      {t("seerr.tags")}
                    </Text>
                    <PlatformDropdown
                      groups={tagsOptions}
                      trigger={
                        <View className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'>
                          <Text numberOfLines={1}>
                            {requestOverrides.tags
                              ? defaultServiceDetails.tags
                                  .filter((t) =>
                                    requestOverrides.tags!.includes(t.id),
                                  )
                                  .map((t) => t.label)
                                  .join(", ") ||
                                defaultTags.map((t) => t.label).join(", ")
                              : defaultTags.map((t) => t.label).join(", ")}
                          </Text>
                        </View>
                      }
                      title={t("seerr.tags")}
                      open={tagsOpen}
                      onOpenChange={setTagsOpen}
                    />
                  </View>

                  <View className='flex flex-col'>
                    <Text className='opacity-50 mb-1 text-xs'>
                      {t("seerr.request_as")}
                    </Text>
                    <PlatformDropdown
                      groups={usersOptions}
                      trigger={
                        <View className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'>
                          <Text numberOfLines={1}>
                            {users.find(
                              (u) =>
                                u.id ===
                                (requestOverrides.userId || seerrUser?.id),
                            )?.displayName || seerrUser!.displayName}
                          </Text>
                        </View>
                      }
                      title={t("seerr.request_as")}
                      open={usersOpen}
                      onOpenChange={setUsersOpen}
                    />
                  </View>
                </>
              )}
            </View>
            <Button
              className='mt-auto'
              onPress={request}
              color='purple'
              disabled={requestDisabled}
            >
              {requestLabel}
            </Button>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

export default RequestModal;
