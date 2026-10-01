import { BlurView } from "expo-blur";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { TVButton, TVOptionCard } from "@/components/tv";
import { TVSettingsTextInput } from "@/components/tv/settings/TVSettingsTextInput";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useSeerr } from "@/hooks/useSeerr";
import { useTVBackPress } from "@/hooks/useTVBackPress";
import { tvIssueModalAtom } from "@/utils/atoms/tvIssueModal";
import { writeErrorLog } from "@/utils/log";
import { scaleSize } from "@/utils/scaleSize";
import { IssueType, IssueTypeName } from "@/utils/seerr/types";
import { store } from "@/utils/store";
import { createSubmission } from "@/utils/submission";

const ISSUE_TYPES = [
  IssueType.VIDEO,
  IssueType.AUDIO,
  IssueType.SUBTITLES,
  IssueType.OTHER,
];

/**
 * The TV's report issue sheet, as the phone's (a title's page): the kind of
 * issue, what is wrong, and Seerr files it against the title. Like the phone,
 * it asks for both before it sends.
 */
export default function TVIssueModal() {
  const router = useRouter();
  const { t } = useTranslation();
  const typography = useScaledTVTypography();
  const modalState = useAtomValue(tvIssueModalAtom);
  const { seerrApi } = useSeerr();

  const [issueType, setIssueType] = useState<IssueType>();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const submission = useRef(createSubmission()).current;

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(200)).current;

  useEffect(() => {
    submission.show();
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
    // Leaves no title behind for the next sheet, and no answer to come.
    return () => {
      submission.dismiss();
      store.set(tvIssueModalAtom, null);
    };
  }, [overlayOpacity, sheetTranslateY, submission]);

  // Once: an answer that comes after the user closed the sheet would close
  // the screen under it.
  const close = useCallback(() => {
    if (!submission.dismiss()) return;
    store.set(tvIssueModalAtom, null);
    router.back();
  }, [router, submission]);

  useTVBackPress(() => {
    close();
    return true;
  }, [close]);

  const submit = useCallback(async () => {
    if (!modalState || issueType === undefined || !message.trim()) return;
    // A second press in the same batch, before `sending` disables the
    // button, would file the issue twice.
    if (!submission.start()) return;
    setSending(true);
    try {
      // submitIssue says "Issue submitted!" itself.
      await seerrApi?.submitIssue(modalState.mediaId, issueType, message);
      if (submission.finish()) close();
    } catch (error) {
      // The response interceptor already reports the failure with its route.
      writeErrorLog("Seerr submitIssue failed", String(error));
      if (submission.finish()) setSending(false);
    }
  }, [modalState, issueType, message, seerrApi, close, submission]);

  if (!modalState) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
      <Animated.View style={{ transform: [{ translateY: sheetTranslateY }] }}>
        <BlurView intensity={80} tint='dark' style={styles.sheet}>
          <TVFocusGuideView
            autoFocus
            trapFocusUp
            trapFocusDown
            trapFocusLeft
            trapFocusRight
            style={styles.content}
          >
            <Text
              style={{
                fontSize: typography.heading,
                fontWeight: "bold",
                color: "white",
              }}
            >
              {t("seerr.whats_wrong")}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                fontSize: typography.callout,
                color: "rgba(255,255,255,0.6)",
                marginBottom: scaleSize(16),
              }}
            >
              {modalState.title}
            </Text>
            <Text style={[styles.label, { fontSize: typography.callout }]}>
              {t("seerr.issue_type")}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ overflow: "visible" }}
              contentContainerStyle={styles.types}
            >
              {ISSUE_TYPES.map((type, index) => (
                <TVOptionCard
                  key={type}
                  label={IssueTypeName[type]}
                  selected={issueType === type}
                  hasTVPreferredFocus={index === 0}
                  onPress={() => setIssueType(type)}
                  width={scaleSize(220)}
                  height={scaleSize(75)}
                />
              ))}
            </ScrollView>
            <View style={{ marginTop: scaleSize(16) }}>
              <TVSettingsTextInput
                label={t("seerr.whats_wrong")}
                placeholder={t("seerr.issue_details")}
                value={message}
                onChangeText={setMessage}
              />
            </View>
            <View style={styles.actions}>
              <TVButton onPress={close} variant='secondary'>
                <Text style={{ fontSize: typography.callout, color: "white" }}>
                  {t("seerr.cancel")}
                </Text>
              </TVButton>
              <TVButton
                onPress={submit}
                variant='primary'
                disabled={sending || issueType === undefined || !message.trim()}
              >
                <Text
                  style={{
                    fontSize: typography.callout,
                    fontWeight: "bold",
                    color: "black",
                  }}
                >
                  {t("seerr.submit_button")}
                </Text>
              </TVButton>
            </View>
          </TVFocusGuideView>
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: scaleSize(24),
    borderTopRightRadius: scaleSize(24),
    overflow: "hidden",
  },
  content: {
    paddingTop: scaleSize(32),
    paddingBottom: scaleSize(50),
    paddingHorizontal: scaleSize(48),
    overflow: "visible",
  },
  label: {
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
  },
  types: {
    paddingVertical: scaleSize(16),
    gap: scaleSize(12),
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: scaleSize(16),
    marginTop: scaleSize(16),
  },
});
