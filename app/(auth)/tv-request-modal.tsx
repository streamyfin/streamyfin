import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  TVFocusGuideView,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";
import { TVRequestOptionRow } from "@/components/jellyseerr/tv/TVRequestOptionRow";
import { TVToggleOptionRow } from "@/components/jellyseerr/tv/TVToggleOptionRow";
import { TVButton, TVOptionSelector } from "@/components/tv";
import type { TVOptionItem } from "@/components/tv/TVOptionSelector";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { tvRequestModalAtom } from "@/utils/atoms/tvRequestModal";
import type {
  QualityProfile,
  RootFolder,
  Tag,
} from "@/utils/jellyseerr/server/api/servarr/base";
import type { MediaRequestBody } from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";
import {
  hasPermission,
  Permission,
} from "@/utils/jellyseerr/server/lib/permissions";
import { store } from "@/utils/store";

export default function TVRequestModalPage() {
  const typography = useScaledTVTypography();
  const router = useRouter();
  const modalState = useAtomValue(tvRequestModalAtom);
  const { t } = useTranslation();
  const { jellyseerrApi, jellyseerrUser, requestMedia } = useJellyseerr();

  const canManageUsers = useMemo(
    () =>
      !!jellyseerrUser &&
      hasPermission(Permission.MANAGE_REQUESTS, jellyseerrUser.permissions),
    [jellyseerrUser],
  );

  const [isReady, setIsReady] = useState(false);
  const [requestOverrides, setRequestOverrides] = useState<MediaRequestBody>({
    mediaId: modalState?.id ? Number(modalState.id) : 0,
    mediaType: modalState?.mediaType,
  });

  const [activeSelector, setActiveSelector] = useState<
    "profile" | "folder" | "user" | null
  >(null);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(200)).current;

  // Animate in on mount
  useEffect(() => {
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

    const timer = setTimeout(() => setIsReady(true), 100);
    return () => {
      clearTimeout(timer);
      store.set(tvRequestModalAtom, null);
    };
  }, [overlayOpacity, sheetTranslateY]);

  const { data: serviceSettings } = useQuery({
    queryKey: ["jellyseerr", "request", modalState?.mediaType, "service"],
    queryFn: async () =>
      jellyseerrApi?.service(
        modalState?.mediaType === "movie" ? "radarr" : "sonarr",
      ),
    enabled: !!jellyseerrApi && !!jellyseerrUser && !!modalState,
  });

  const { data: users } = useQuery({
    queryKey: ["jellyseerr", "users"],
    queryFn: async () =>
      jellyseerrApi?.user({ take: 1000, sort: "displayname" }),
    enabled:
      !!jellyseerrApi && !!jellyseerrUser && !!modalState && canManageUsers,
  });

  const defaultService = useMemo(
    () => serviceSettings?.find?.((v) => v.isDefault),
    [serviceSettings],
  );

  const { data: defaultServiceDetails } = useQuery({
    queryKey: [
      "jellyseerr",
      "request",
      modalState?.mediaType,
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
        modalState?.mediaType === "movie" ? "radarr" : "sonarr",
        defaultService!.id,
      );
    },
    enabled:
      !!jellyseerrApi && !!jellyseerrUser && !!defaultService && !!modalState,
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
    if (!modalState) return;

    const body: MediaRequestBody = {
      is4k: defaultService?.is4k || defaultServiceDetails?.server.is4k,
      profileId: defaultProfile?.id,
      rootFolder: defaultFolder?.path,
      tags: defaultTags.map((t) => t.id),
      ...modalState.requestBody,
      ...requestOverrides,
    };

    if (!canManageUsers) {
      delete body.userId;
    }

    const seasonTitle =
      modalState.requestBody?.seasons?.length === 1
        ? t("jellyseerr.season_number", {
            season_number: modalState.requestBody.seasons[0],
          })
        : modalState.requestBody?.seasons &&
            modalState.requestBody.seasons.length > 1
          ? t("jellyseerr.season_all")
          : undefined;

    requestMedia(
      seasonTitle ? `${modalState.title}, ${seasonTitle}` : modalState.title,
      body,
      () => {
        modalState.onRequested();
        router.back();
      },
    );
  }, [
    modalState,
    requestOverrides,
    defaultProfile,
    defaultFolder,
    defaultTags,
    defaultService,
    defaultServiceDetails,
    requestMedia,
    router,
    t,
    canManageUsers,
  ]);

  if (!modalState) {
    return null;
  }

  const isDataLoaded =
    defaultService && defaultServiceDetails && (!canManageUsers || !!users);

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
      <Animated.View
        style={[
          styles.sheetContainer,
          { transform: [{ translateY: sheetTranslateY }] },
        ]}
      >
        <BlurView intensity={80} tint='dark' style={styles.blurContainer}>
          <TVFocusGuideView
            autoFocus
            trapFocusUp
            trapFocusDown
            trapFocusLeft
            trapFocusRight
            style={styles.content}
          >
            <Text style={[styles.heading, { fontSize: typography.heading }]}>
              {t("jellyseerr.advanced")}
            </Text>
            <Text style={[styles.subtitle, { fontSize: typography.callout }]}>
              {modalState.title}
            </Text>

            {isDataLoaded && isReady ? (
              <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.optionsContainer}>
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
                  {canManageUsers && (
                    <TVRequestOptionRow
                      label={t("jellyseerr.request_as")}
                      value={selectedUserName}
                      onPress={() => setActiveSelector("user")}
                    />
                  )}

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
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>{t("common.loading")}</Text>
              </View>
            )}

            {isReady && (
              <View style={styles.buttonContainer}>
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
                    style={[
                      styles.buttonText,
                      { fontSize: typography.callout },
                    ]}
                  >
                    {t("jellyseerr.request_button")}
                  </Text>
                </TVButton>
              </View>
            )}
          </TVFocusGuideView>
        </BlurView>
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
      {canManageUsers && (
        <TVOptionSelector
          visible={activeSelector === "user"}
          title={t("jellyseerr.request_as")}
          options={userOptions}
          onSelect={handleUserChange}
          onClose={() => setActiveSelector(null)}
          cancelLabel={t("jellyseerr.cancel")}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    width: "100%",
  },
  blurContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  content: {
    paddingTop: 24,
    paddingBottom: 50,
    paddingHorizontal: 44,
    overflow: "visible",
  },
  heading: {
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  subtitle: {
    color: "rgba(255,255,255,0.6)",
    marginBottom: 24,
  },
  scrollView: {
    maxHeight: 320,
    overflow: "visible",
  },
  optionsContainer: {
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  loadingContainer: {
    height: 200,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "rgba(255,255,255,0.5)",
  },
  buttonContainer: {
    marginTop: 24,
  },
  buttonText: {
    fontWeight: "bold",
    color: "#FFFFFF",
  },
});
