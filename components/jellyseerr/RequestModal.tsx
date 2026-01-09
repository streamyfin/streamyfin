import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type { BottomSheetModalMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { useQuery } from "@tanstack/react-query";
import { forwardRef, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import type {
  QualityProfile,
  RootFolder,
  Tag,
} from "@/utils/jellyseerr/server/api/servarr/base";
import type { MediaType } from "@/utils/jellyseerr/server/constants/media";
import type { MediaRequestBody } from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";
import { writeDebugLog } from "@/utils/log";

interface Props {
  id: number;
  title: string;
  requestBody?: MediaRequestBody;
  type: MediaType;
  isAnime?: boolean;
  is4k?: boolean;
  onRequested?: () => void;
  onDismiss?: () => void;
}

const RequestModal = forwardRef<
  BottomSheetModalMethods,
  Props & Omit<ViewProps, "id">
>(
  (
    { id, title, requestBody, type, isAnime = false, onRequested, onDismiss },
    ref,
  ) => {
    const { jellyseerrApi, jellyseerrUser, requestMedia } = useJellyseerr();
    const [requestOverrides, setRequestOverrides] = useState<MediaRequestBody>({
      mediaId: Number(id),
      mediaType: type,
      userId: jellyseerrUser?.id,
    });

    const [qualityProfileOpen, setQualityProfileOpen] = useState(false);
    const [rootFolderOpen, setRootFolderOpen] = useState(false);
    const [tagsOpen, setTagsOpen] = useState(false);
    const [usersOpen, setUsersOpen] = useState(false);

    const { t } = useTranslation();

    // Reset all dropdown states when modal closes
    const handleDismiss = useCallback(() => {
      setQualityProfileOpen(false);
      setRootFolderOpen(false);
      setTagsOpen(false);
      setUsersOpen(false);
      onDismiss?.();
    }, [onDismiss]);

    const { data: serviceSettings } = useQuery({
      queryKey: ["jellyseerr", "request", type, "service"],
      queryFn: async () =>
        jellyseerrApi?.service(type === "movie" ? "radarr" : "sonarr"),
      enabled: !!jellyseerrApi && !!jellyseerrUser,
      refetchOnMount: "always",
    });

    const { data: users } = useQuery({
      queryKey: ["jellyseerr", "users"],
      queryFn: async () =>
        jellyseerrApi?.user({ take: 1000, sort: "displayname" }),
      enabled: !!jellyseerrApi && !!jellyseerrUser,
      refetchOnMount: "always",
    });

    const defaultService = useMemo(
      () => serviceSettings?.find?.((v) => v.isDefault),
      [serviceSettings],
    );

    const { data: defaultServiceDetails } = useQuery({
      queryKey: [
        "jellyseerr",
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
        return jellyseerrApi?.serviceDetails(
          type === "movie" ? "radarr" : "sonarr",
          defaultService!.id,
        );
      },
      enabled: !!jellyseerrApi && !!jellyseerrUser && !!defaultService,
      refetchOnMount: "always",
    });

    const defaultProfile: QualityProfile = useMemo(
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

    const defaultFolder: RootFolder = useMemo(
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
        return t("jellyseerr.season_all");
      }
      return t("jellyseerr.season_number", {
        season_number: requestBody.seasons[0],
      });
    }, [requestBody?.seasons]);

    const pathTitleExtractor = (item: RootFolder) =>
      `${item.path} (${item.freeSpace.bytesToReadable()})`;

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
              selected:
                (requestOverrides.userId || jellyseerrUser?.id) === user.id,
              onPress: () =>
                setRequestOverrides((prev) => ({
                  ...prev,
                  userId: user.id,
                })),
            })) || [],
        },
      ],
      [users, jellyseerrUser, requestOverrides.userId],
    );

    const request = useCallback(() => {
      const body = {
        is4k: defaultService?.is4k || defaultServiceDetails?.server.is4k,
        profileId: defaultProfile?.id,
        rootFolder: defaultFolder?.path,
        tags: defaultTags.map((t) => t.id),
        ...requestBody,
        ...requestOverrides,
      };

      writeDebugLog("Sending Jellyseerr advanced request", body);

      requestMedia(
        seasonTitle ? `${title}, ${seasonTitle}` : title,
        body,
        onRequested,
      );
    }, [
      requestBody,
      requestOverrides,
      defaultProfile,
      defaultFolder,
      defaultTags,
    ]);

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
      >
        <BottomSheetView>
          <View className='flex flex-col space-y-4 px-4 pb-8 pt-2'>
            <View>
              <Text className='font-bold text-2xl text-neutral-100'>
                {t("jellyseerr.advanced")}
              </Text>
              {seasonTitle && (
                <Text className='text-neutral-300'>{seasonTitle}</Text>
              )}
            </View>
            <View className='flex flex-col space-y-2'>
              {defaultService && defaultServiceDetails && users && (
                <>
                  <View className='flex flex-col'>
                    <Text className='opacity-50 mb-1 text-xs'>
                      {t("jellyseerr.quality_profile")}
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
                      title={t("jellyseerr.quality_profile")}
                      open={qualityProfileOpen}
                      onOpenChange={setQualityProfileOpen}
                    />
                  </View>

                  <View className='flex flex-col'>
                    <Text className='opacity-50 mb-1 text-xs'>
                      {t("jellyseerr.root_folder")}
                    </Text>
                    <PlatformDropdown
                      groups={rootFolderOptions}
                      trigger={
                        <View className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'>
                          <Text numberOfLines={1}>
                            {defaultServiceDetails.rootFolders.find(
                              (f) =>
                                f.path ===
                                (requestOverrides.rootFolder ||
                                  defaultFolder?.path),
                            )
                              ? pathTitleExtractor(
                                  defaultServiceDetails.rootFolders.find(
                                    (f) =>
                                      f.path ===
                                      (requestOverrides.rootFolder ||
                                        defaultFolder?.path),
                                  )!,
                                )
                              : pathTitleExtractor(defaultFolder!)}
                          </Text>
                        </View>
                      }
                      title={t("jellyseerr.root_folder")}
                      open={rootFolderOpen}
                      onOpenChange={setRootFolderOpen}
                    />
                  </View>

                  <View className='flex flex-col'>
                    <Text className='opacity-50 mb-1 text-xs'>
                      {t("jellyseerr.tags")}
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
                      title={t("jellyseerr.tags")}
                      open={tagsOpen}
                      onOpenChange={setTagsOpen}
                    />
                  </View>

                  <View className='flex flex-col'>
                    <Text className='opacity-50 mb-1 text-xs'>
                      {t("jellyseerr.request_as")}
                    </Text>
                    <PlatformDropdown
                      groups={usersOptions}
                      trigger={
                        <View className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'>
                          <Text numberOfLines={1}>
                            {users.find(
                              (u) =>
                                u.id ===
                                (requestOverrides.userId || jellyseerrUser?.id),
                            )?.displayName || jellyseerrUser!.displayName}
                          </Text>
                        </View>
                      }
                      title={t("jellyseerr.request_as")}
                      open={usersOpen}
                      onOpenChange={setUsersOpen}
                    />
                  </View>
                </>
              )}
            </View>
            <Button className='mt-auto' onPress={request} color='purple'>
              {t("jellyseerr.request_button")}
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

export default RequestModal;
