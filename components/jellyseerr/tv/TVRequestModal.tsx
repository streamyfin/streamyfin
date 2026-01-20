import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  BackHandler,
  Easing,
  ScrollView,
  TVFocusGuideView,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";
import { TVButton, TVOptionSelector } from "@/components/tv";
import type { TVOptionItem } from "@/components/tv/TVOptionSelector";
import { TVTypography } from "@/constants/TVTypography";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import type {
  QualityProfile,
  RootFolder,
  Tag,
} from "@/utils/jellyseerr/server/api/servarr/base";
import type { MediaType } from "@/utils/jellyseerr/server/constants/media";
import type { MediaRequestBody } from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";
import { TVRequestOptionRow } from "./TVRequestOptionRow";
import { TVToggleOptionRow } from "./TVToggleOptionRow";

interface TVRequestModalProps {
  visible: boolean;
  requestBody?: MediaRequestBody;
  title: string;
  id: number;
  mediaType: MediaType;
  onClose: () => void;
  onRequested: () => void;
}

export const TVRequestModal: React.FC<TVRequestModalProps> = ({
  visible,
  requestBody,
  title,
  id,
  mediaType,
  onClose,
  onRequested,
}) => {
  const { t } = useTranslation();
  const { jellyseerrApi, jellyseerrUser, requestMedia } = useJellyseerr();

  const [requestOverrides, setRequestOverrides] = useState<MediaRequestBody>({
    mediaId: Number(id),
    mediaType,
    userId: jellyseerrUser?.id,
  });

  const [activeSelector, setActiveSelector] = useState<
    "profile" | "folder" | "user" | null
  >(null);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(200)).current;

  useEffect(() => {
    if (visible) {
      overlayOpacity.setValue(0);
      sheetTranslateY.setValue(200);

      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, overlayOpacity, sheetTranslateY]);

  // Handle back button to close modal
  useEffect(() => {
    if (!visible) return;

    const handleBackPress = () => {
      // If a sub-selector is open, close it first
      if (activeSelector) {
        setActiveSelector(null);
      } else {
        onClose();
      }
      return true; // Prevent default back behavior
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackPress,
    );

    return () => subscription.remove();
  }, [visible, activeSelector, onClose]);

  const { data: serviceSettings } = useQuery({
    queryKey: ["jellyseerr", "request", mediaType, "service"],
    queryFn: async () =>
      jellyseerrApi?.service(mediaType === "movie" ? "radarr" : "sonarr"),
    enabled: !!jellyseerrApi && !!jellyseerrUser && visible,
  });

  const { data: users } = useQuery({
    queryKey: ["jellyseerr", "users"],
    queryFn: async () =>
      jellyseerrApi?.user({ take: 1000, sort: "displayname" }),
    enabled: !!jellyseerrApi && !!jellyseerrUser && visible,
  });

  const defaultService = useMemo(
    () => serviceSettings?.find?.((v) => v.isDefault),
    [serviceSettings],
  );

  const { data: defaultServiceDetails } = useQuery({
    queryKey: [
      "jellyseerr",
      "request",
      mediaType,
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
        mediaType === "movie" ? "radarr" : "sonarr",
        defaultService!.id,
      );
    },
    enabled: !!jellyseerrApi && !!jellyseerrUser && !!defaultService && visible,
  });

  const defaultProfile: QualityProfile | undefined = useMemo(
    () =>
      defaultServiceDetails?.profiles.find(
        (p) => p.id === defaultServiceDetails.server?.activeProfileId,
      ),
    [defaultServiceDetails],
  );

  const defaultFolder: RootFolder | undefined = useMemo(
    () =>
      defaultServiceDetails?.rootFolders.find(
        (f) => f.path === defaultServiceDetails.server?.activeDirectory,
      ),
    [defaultServiceDetails],
  );

  const defaultTags: Tag[] = useMemo(() => {
    return (
      defaultServiceDetails?.tags.filter((t) =>
        defaultServiceDetails?.server.activeTags?.includes(t.id),
      ) ?? []
    );
  }, [defaultServiceDetails]);

  const pathTitleExtractor = (item: RootFolder) =>
    `${item.path} (${item.freeSpace.bytesToReadable()})`;

  // Option builders
  const qualityProfileOptions: TVOptionItem<number>[] = useMemo(
    () =>
      defaultServiceDetails?.profiles.map((profile) => ({
        label: profile.name,
        value: profile.id,
        selected:
          (requestOverrides.profileId || defaultProfile?.id) === profile.id,
      })) || [],
    [
      defaultServiceDetails?.profiles,
      defaultProfile,
      requestOverrides.profileId,
    ],
  );

  const rootFolderOptions: TVOptionItem<string>[] = useMemo(
    () =>
      defaultServiceDetails?.rootFolders.map((folder) => ({
        label: pathTitleExtractor(folder),
        value: folder.path,
        selected:
          (requestOverrides.rootFolder || defaultFolder?.path) === folder.path,
      })) || [],
    [
      defaultServiceDetails?.rootFolders,
      defaultFolder,
      requestOverrides.rootFolder,
    ],
  );

  const userOptions: TVOptionItem<number>[] = useMemo(
    () =>
      users?.map((user) => ({
        label: user.displayName,
        value: user.id,
        selected: (requestOverrides.userId || jellyseerrUser?.id) === user.id,
      })) || [],
    [users, jellyseerrUser, requestOverrides.userId],
  );

  const tagItems = useMemo(() => {
    return (
      defaultServiceDetails?.tags.map((tag) => ({
        id: tag.id,
        label: tag.label,
        selected:
          requestOverrides.tags?.includes(tag.id) ||
          defaultTags.some((dt) => dt.id === tag.id),
      })) ?? []
    );
  }, [defaultServiceDetails?.tags, defaultTags, requestOverrides.tags]);

  // Selected display values
  const selectedProfileName = useMemo(() => {
    const profile = defaultServiceDetails?.profiles.find(
      (p) => p.id === (requestOverrides.profileId || defaultProfile?.id),
    );
    return profile?.name || defaultProfile?.name || t("jellyseerr.select");
  }, [
    defaultServiceDetails?.profiles,
    requestOverrides.profileId,
    defaultProfile,
    t,
  ]);

  const selectedFolderName = useMemo(() => {
    const folder = defaultServiceDetails?.rootFolders.find(
      (f) => f.path === (requestOverrides.rootFolder || defaultFolder?.path),
    );
    return folder
      ? pathTitleExtractor(folder)
      : defaultFolder
        ? pathTitleExtractor(defaultFolder)
        : t("jellyseerr.select");
  }, [
    defaultServiceDetails?.rootFolders,
    requestOverrides.rootFolder,
    defaultFolder,
    t,
  ]);

  const selectedUserName = useMemo(() => {
    const user = users?.find(
      (u) => u.id === (requestOverrides.userId || jellyseerrUser?.id),
    );
    return (
      user?.displayName || jellyseerrUser?.displayName || t("jellyseerr.select")
    );
  }, [users, requestOverrides.userId, jellyseerrUser, t]);

  // Handlers
  const handleProfileChange = useCallback((profileId: number) => {
    setRequestOverrides((prev) => ({ ...prev, profileId }));
    setActiveSelector(null);
  }, []);

  const handleFolderChange = useCallback((rootFolder: string) => {
    setRequestOverrides((prev) => ({ ...prev, rootFolder }));
    setActiveSelector(null);
  }, []);

  const handleUserChange = useCallback((userId: number) => {
    setRequestOverrides((prev) => ({ ...prev, userId }));
    setActiveSelector(null);
  }, []);

  const handleTagToggle = useCallback(
    (tagId: number) => {
      setRequestOverrides((prev) => {
        const currentTags = prev.tags || defaultTags.map((t) => t.id);
        const hasTag = currentTags.includes(tagId);
        return {
          ...prev,
          tags: hasTag
            ? currentTags.filter((id) => id !== tagId)
            : [...currentTags, tagId],
        };
      });
    },
    [defaultTags],
  );

  const handleRequest = useCallback(() => {
    const body = {
      is4k: defaultService?.is4k || defaultServiceDetails?.server.is4k,
      profileId: defaultProfile?.id,
      rootFolder: defaultFolder?.path,
      tags: defaultTags.map((t) => t.id),
      ...requestBody,
      ...requestOverrides,
    };

    const seasonTitle =
      requestBody?.seasons?.length === 1
        ? t("jellyseerr.season_number", {
            season_number: requestBody.seasons[0],
          })
        : requestBody?.seasons && requestBody.seasons.length > 1
          ? t("jellyseerr.season_all")
          : undefined;

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
    defaultService,
    defaultServiceDetails,
    title,
    requestMedia,
    onRequested,
    t,
  ]);

  if (!visible) return null;

  const isDataLoaded = defaultService && defaultServiceDetails && users;

  return (
    <>
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          justifyContent: "flex-end",
          zIndex: 1000,
          opacity: overlayOpacity,
        }}
      >
        <Animated.View
          style={{
            width: "100%",
            transform: [{ translateY: sheetTranslateY }],
          }}
        >
          <BlurView
            intensity={80}
            tint='dark'
            style={{
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              overflow: "hidden",
            }}
          >
            <TVFocusGuideView
              autoFocus
              trapFocusUp
              trapFocusDown
              trapFocusLeft
              trapFocusRight
              style={{
                paddingTop: 24,
                paddingBottom: 50,
                paddingHorizontal: 44,
                overflow: "visible",
              }}
            >
              <Text
                style={{
                  fontSize: TVTypography.heading,
                  fontWeight: "bold",
                  color: "#FFFFFF",
                  marginBottom: 8,
                }}
              >
                {t("jellyseerr.advanced")}
              </Text>
              <Text
                style={{
                  fontSize: TVTypography.callout,
                  color: "rgba(255,255,255,0.6)",
                  marginBottom: 24,
                }}
              >
                {title}
              </Text>

              {isDataLoaded ? (
                <ScrollView
                  style={{ maxHeight: 320, overflow: "visible" }}
                  showsVerticalScrollIndicator={false}
                >
                  <View
                    style={{
                      gap: 12,
                      paddingVertical: 8,
                      paddingHorizontal: 4,
                    }}
                  >
                    <TVRequestOptionRow
                      label={t("jellyseerr.quality_profile")}
                      value={selectedProfileName}
                      onPress={() => setActiveSelector("profile")}
                      hasTVPreferredFocus
                    />
                    <TVRequestOptionRow
                      label={t("jellyseerr.root_folder")}
                      value={selectedFolderName}
                      onPress={() => setActiveSelector("folder")}
                    />
                    <TVRequestOptionRow
                      label={t("jellyseerr.request_as")}
                      value={selectedUserName}
                      onPress={() => setActiveSelector("user")}
                    />

                    {tagItems.length > 0 && (
                      <TVToggleOptionRow
                        label={t("jellyseerr.tags")}
                        items={tagItems}
                        onToggle={handleTagToggle}
                      />
                    )}
                  </View>
                </ScrollView>
              ) : (
                <View
                  style={{
                    height: 200,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "rgba(255,255,255,0.5)" }}>
                    {t("common.loading")}
                  </Text>
                </View>
              )}

              <View style={{ marginTop: 24 }}>
                <TVButton
                  onPress={handleRequest}
                  variant='secondary'
                  disabled={!isDataLoaded}
                >
                  <Ionicons
                    name='add'
                    size={22}
                    color='#FFFFFF'
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={{
                      fontSize: TVTypography.callout,
                      fontWeight: "bold",
                      color: "#FFFFFF",
                    }}
                  >
                    {t("jellyseerr.request_button")}
                  </Text>
                </TVButton>
              </View>
            </TVFocusGuideView>
          </BlurView>
        </Animated.View>
      </Animated.View>

      {/* Sub-selectors */}
      <TVOptionSelector
        visible={activeSelector === "profile"}
        title={t("jellyseerr.quality_profile")}
        options={qualityProfileOptions}
        onSelect={handleProfileChange}
        onClose={() => setActiveSelector(null)}
        cancelLabel={t("jellyseerr.cancel")}
      />
      <TVOptionSelector
        visible={activeSelector === "folder"}
        title={t("jellyseerr.root_folder")}
        options={rootFolderOptions}
        onSelect={handleFolderChange}
        onClose={() => setActiveSelector(null)}
        cancelLabel={t("jellyseerr.cancel")}
        cardWidth={280}
      />
      <TVOptionSelector
        visible={activeSelector === "user"}
        title={t("jellyseerr.request_as")}
        options={userOptions}
        onSelect={handleUserChange}
        onClose={() => setActiveSelector(null)}
        cancelLabel={t("jellyseerr.cancel")}
      />
    </>
  );
};
