import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import type { BottomSheetModalMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { useQuery } from "@tanstack/react-query";
import { forwardRef, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  useWindowDimensions,
  View,
  type ViewProps,
} from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { SeasonPicker } from "@/components/seerr/SeasonPicker";
import { SeasonQuota } from "@/components/seerr/SeasonQuota";
import { Colors, SheetColors } from "@/constants/Colors";
import { SHEET_MAX_HEIGHT_RATIO } from "@/constants/Values";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrSeasonRequest } from "@/hooks/useSeerrSeasonRequest";
import { writeDebugLog } from "@/utils/log";
import { canRequestForOthers } from "@/utils/seerr/requests";
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
    // No user named until one is picked: Seerr refuses a request naming one,
    // even the caller's own, from anyone who may not request for others.
    const [requestOverrides, setRequestOverrides] = useState<MediaRequestBody>({
      mediaId: Number(id),
      mediaType: type,
    });
    const forOthers = canRequestForOthers(seerrUser?.permissions ?? 0);

    const [qualityProfileOpen, setQualityProfileOpen] = useState(false);
    const [rootFolderOpen, setRootFolderOpen] = useState(false);
    const [tagsOpen, setTagsOpen] = useState(false);
    const [usersOpen, setUsersOpen] = useState(false);

    const { t } = useTranslation();

    // The seasons, the quota and the button's state, shared with the TV's
    // season sheet.
    const {
      partial,
      rows,
      unrequested,
      selected: selectedSeasons,
      toggle: toggleSelectedSeason,
      toggleAll: toggleAllSelectedSeasons,
      selecting,
      canToggleAll,
      roomForOneMore: roomForOneMoreSeason,
      tvQuota,
      limited,
      overLimit,
      overQuota,
      remaining,
      approvedAutomatically,
      seasons: seasonsToRequest,
      label: seriesLabel,
      blocked: seriesBlocked,
    } = useSeerrSeasonRequest({
      details,
      enabled: isSeries,
      opened: requestBody,
      // The quota of whoever the request is for. Someone else's is read under
      // the same two permissions as requesting for them, so only a user who
      // may pick someone else reads it; for anyone else it would be a 403.
      quotaUserId:
        (advanced && forOthers ? requestOverrides.userId : undefined) ??
        seerrUser?.id,
    });

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
      enabled: advanced && forOthers && !!seerrApi && !!seerrUser,
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
        ...(isSeries && { seasons: seasonsToRequest }),
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
      seasonsToRequest,
      requestBody,
      requestOverrides,
      defaultProfile,
      defaultFolder,
      defaultTags,
    ]);

    const requestLabel = isSeries ? seriesLabel : t("seerr.request_button");
    const requestDisabled = isSeries && seriesBlocked;

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
          backgroundColor: SheetColors.background,
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
          {/* Spaced with styles: a release build drops the space-y classes. */}
          <View
            style={{
              paddingHorizontal: 18,
              paddingTop: 8,
              paddingBottom: 32,
              gap: 18,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text className='font-bold text-2xl text-neutral-100'>
                  {isSeries ? t("seerr.request_series") : t("seerr.advanced")}
                </Text>
                {isSeries ? (
                  <Text className='text-neutral-300' style={{ marginTop: 2 }}>
                    {title}
                  </Text>
                ) : (
                  seasonTitle && (
                    <Text className='text-neutral-300'>{seasonTitle}</Text>
                  )
                )}
              </View>
              {isSeries && partial && unrequested.length > 0 && (
                <Pressable
                  accessibilityRole='button'
                  disabled={!canToggleAll}
                  hitSlop={8}
                  onPress={toggleAllSelectedSeasons}
                  style={{ paddingVertical: 4 }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      color: canToggleAll ? Colors.primary : SheetColors.idle,
                    }}
                  >
                    {selecting
                      ? t("seerr.select_all")
                      : t("seerr.clear_selection")}
                  </Text>
                </Pressable>
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
                limit={tvQuota?.limit}
                days={tvQuota?.days}
                overLimit={
                  overLimit
                    ? unrequested.length
                    : overQuota
                      ? selectedSeasons.length
                      : undefined
                }
                restricted={tvQuota?.restricted}
              />
            )}
            {isSeries && (
              <>
                {!partial && (
                  <Text className='text-sm text-neutral-400'>
                    {t("seerr.whole_series_only")}
                  </Text>
                )}
                <SeasonPicker
                  rows={rows}
                  // A whole-series server requests every season left.
                  selected={partial ? selectedSeasons : unrequested}
                  choosable={partial}
                  roomForOneMore={roomForOneMoreSeason}
                  onToggle={toggleSelectedSeason}
                />
              </>
            )}
            <View style={{ gap: 8 }}>
              {advanced && defaultService && defaultServiceDetails && (
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

                  {forOthers && users && (
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
                  )}
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
