import React, {forwardRef, useCallback, useMemo, useState} from "react";
import {View, ViewProps} from "react-native";
import {useJellyseerr} from "@/hooks/useJellyseerr";
import {useQuery} from "@tanstack/react-query";
import {MediaType} from "@/utils/jellyseerr/server/constants/media";
import {BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal, BottomSheetView} from "@gorhom/bottom-sheet";
import Dropdown from "@/components/common/Dropdown";
import {QualityProfile, RootFolder, Tag} from "@/utils/jellyseerr/server/api/servarr/base";
import {MediaRequestBody} from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";
import {BottomSheetModalMethods} from "@gorhom/bottom-sheet/lib/typescript/types";
import {Button} from "@/components/Button";
import {Text} from "@/components/common/Text";
import { useTranslation } from "react-i18next";

interface Props {
  id: number;
  title: string,
  type: MediaType;
  isAnime?: boolean;
  is4k?: boolean;
  onRequested?: () => void;
}

const RequestModal = forwardRef<BottomSheetModalMethods, Props & Omit<ViewProps, 'id'>>(({
  id,
  title,
  type,
  isAnime = false,
  onRequested,
  ...props
}, ref) => {
  const {jellyseerrApi, jellyseerrUser, requestMedia} = useJellyseerr();
  const [requestOverrides, setRequestOverrides] =
    useState<MediaRequestBody>({
      mediaId: Number(id),
      mediaType: type,
      userId: jellyseerrUser?.id
    });

  const { t } = useTranslation();

  const [modalRequestProps, setModalRequestProps] = useState<MediaRequestBody>();

  const {data: serviceSettings} = useQuery({
    queryKey: ["jellyseerr", "request", type, 'service'],
    queryFn: async () => jellyseerrApi?.service(type == 'movie' ? 'radarr' : 'sonarr'),
    enabled: !!jellyseerrApi && !!jellyseerrUser,
    refetchOnMount: 'always'
  });

  const {data: users} = useQuery({
    queryKey: ["jellyseerr", "users"],
    queryFn: async () => jellyseerrApi?.user({take: 1000, sort: 'displayname'}),
    enabled: !!jellyseerrApi && !!jellyseerrUser,
    refetchOnMount: 'always'
  });

  const defaultService = useMemo(
    () => serviceSettings?.find?.(v => v.isDefault),
    [serviceSettings]
  );

  const {data: defaultServiceDetails} = useQuery({
    queryKey: ["jellyseerr", "request", type, 'service', 'details', defaultService?.id],
    queryFn: async () => {
      setRequestOverrides((prev) => ({
        ...prev,
        serverId: defaultService?.id
      }))
      return jellyseerrApi?.serviceDetails(type === 'movie' ? 'radarr' : 'sonarr', defaultService!!.id)
    },
    enabled: !!jellyseerrApi && !!jellyseerrUser && !!defaultService,
    refetchOnMount: 'always',
  });

  const defaultProfile: QualityProfile = useMemo(
    () => defaultServiceDetails?.profiles
      .find(p =>
        p.id === (isAnime ? defaultServiceDetails.server?.activeAnimeProfileId : defaultServiceDetails.server?.activeProfileId)
      ),
    [defaultServiceDetails]
  );

  const defaultFolder: RootFolder = useMemo(
    () => defaultServiceDetails?.rootFolders
      .find(f =>
        f.path === (isAnime ? defaultServiceDetails?.server.activeAnimeDirectory : defaultServiceDetails.server?.activeDirectory)
    ),
    [defaultServiceDetails]
  );

  const defaultTags: Tag[] = useMemo(
    () => {
      const tags =  defaultServiceDetails?.tags
        .filter(t =>
          (isAnime
            ? defaultServiceDetails?.server.activeAnimeTags
            : defaultServiceDetails?.server.activeTags
          )?.includes(t.id)
        ) ?? []

      console.log(tags)
      return tags
    },
    [defaultServiceDetails]
  );

  const seasonTitle = useMemo(
    () => modalRequestProps?.seasons?.length ? t("jellyseerr.season_x", {seasons: modalRequestProps?.seasons}) : undefined,
    [modalRequestProps?.seasons]
  );

  const request = useCallback(() => {requestMedia(
      seasonTitle ? `${title}, ${seasonTitle}` : title,
      {
        is4k: defaultService?.is4k || defaultServiceDetails?.server.is4k,
        profileId: defaultProfile.id,
        rootFolder: defaultFolder.path,
        tags: defaultTags.map(t => t.id),
        ...modalRequestProps,
        ...requestOverrides
      },
      onRequested
    )
  }, [modalRequestProps, requestOverrides, defaultProfile, defaultFolder, defaultTags]);

  const pathTitleExtractor = (item: RootFolder) => `${item.path} (${item.freeSpace.bytesToReadable()})`;

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enableDismissOnClose
      onDismiss={() => setModalRequestProps(undefined)}
      handleIndicatorStyle={{
        backgroundColor: "white",
      }}
      backgroundStyle={{
        backgroundColor: "#171717",
      }}
      backdropComponent={(sheetProps: BottomSheetBackdropProps) =>
        <BottomSheetBackdrop
          {...sheetProps}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      }
    >
      {(data) => {
        setModalRequestProps(data?.data as MediaRequestBody)
        return <BottomSheetView>
          <View className="flex flex-col space-y-4 px-4 pb-8 pt-2">
            <View>
              <Text className="font-bold text-2xl text-neutral-100">{t("jellyseerr.advanced")}</Text>
              {seasonTitle &&
                  <Text className="text-neutral-300">{seasonTitle}</Text>
              }
            </View>
            <View className="flex flex-col space-y-2">
              {(defaultService && defaultServiceDetails && users) && (
                <>
                  <Dropdown
                    data={defaultServiceDetails.profiles}
                    titleExtractor={(item) => item.name}
                    placeholderText={defaultProfile.name}
                    keyExtractor={(item) => item.id.toString()}
                    label={t("jellyseerr.quality_profile")}
                    onSelected={(item) =>
                      item && setRequestOverrides((prev) => ({
                        ...prev,
                        profileId: item?.id
                      }))
                    }
                    title={t("jellyseerr.quality_profile")}
                  />
                  <Dropdown
                    data={defaultServiceDetails.rootFolders}
                    titleExtractor={pathTitleExtractor}
                    placeholderText={defaultFolder ? pathTitleExtractor(defaultFolder) : ""}
                    keyExtractor={(item) => item.id.toString()}
                    label={t("jellyseerr.root_folder")}
                    onSelected={(item) =>
                      item && setRequestOverrides((prev) => ({
                        ...prev,
                        rootFolder: item.path
                      }))}
                    title={t("jellyseerr.root_folder")}
                  />
                  <Dropdown
                    multi={true}
                    data={defaultServiceDetails.tags}
                    titleExtractor={(item) => item.label}
                    placeholderText={defaultTags.map(t => t.label).join(",")}
                    keyExtractor={(item) => item.id.toString()}
                    label={t("jellyseerr.tags")}
                    onSelected={(...item) =>
                      item && setRequestOverrides((prev) => ({
                        ...prev,
                        tags: item.map(i => i.id)
                      }))
                    }
                    title={t("jellyseerr.tags")}
                  />
                  <Dropdown
                    data={users}
                    titleExtractor={(item) => item.displayName}
                    placeholderText={jellyseerrUser!!.displayName}
                    keyExtractor={(item) => item.id.toString() || ""}
                    label={t("jellyseerr.request_as")}
                    onSelected={(item) =>
                      item && setRequestOverrides((prev) => ({
                        ...prev,
                        userId: item?.id
                      }))
                    }
                    title={t("jellyseerr.request_as")}
                  />
                </>
              )
              }
            </View>
            <Button
              className="mt-auto"
              onPress={request}
              color="purple"
            >
              {t("jellyseerr.request_button")}
            </Button>
          </View>
        </BottomSheetView>
      }}
    </BottomSheetModal>
  );
});

export default RequestModal;