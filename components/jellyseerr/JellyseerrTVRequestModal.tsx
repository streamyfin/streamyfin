import React, { useState } from "react";
import { View, StyleSheet, Pressable, Modal } from "react-native";
import { Text } from "@/components/common/Text";
import { Colors } from "@/constants/Colors";
import { useTranslation } from "react-i18next";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import { MediaRequestBody } from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";
import { TvDetails } from "@/utils/jellyseerr/server/models/Tv";

interface JellyseerrTVRequestModalProps {
  visible: boolean;
  onClose: () => void;
  onRequest: (requestBody: MediaRequestBody) => void;
  title: string;
  mediaType: MediaType;
  mediaId: number;
  tvdbId?: number;
  seasons?: number[];
  isAnime?: boolean;
  details?: TvDetails;
}

const JellyseerrTVRequestModal: React.FC<JellyseerrTVRequestModalProps> = ({
  visible,
  onClose,
  onRequest,
  title,
  mediaType,
  mediaId,
  tvdbId,
  seasons,
  isAnime,
  details,
}) => {
  const { t } = useTranslation();
  const [focusedButton, setFocusedButton] = useState<string | null>(null);
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>(
    seasons || [],
  );
  const [focusedSeason, setFocusedSeason] = useState<string | null>(null);

  const handleRequest = () => {
    const requestBody: MediaRequestBody = {
      mediaId,
      mediaType,
      tvdbId,
      seasons: mediaType === MediaType.TV ? selectedSeasons : undefined,
    };

    onRequest(requestBody);
    onClose();
  };

  const toggleSeason = (seasonNumber: number) => {
    if (selectedSeasons.includes(seasonNumber)) {
      setSelectedSeasons(selectedSeasons.filter((s) => s !== seasonNumber));
    } else {
      setSelectedSeasons([...selectedSeasons, seasonNumber]);
    }
  };

  const selectAllSeasons = () => {
    if (details?.seasons) {
      const allSeasons = details.seasons
        .filter((s) => s.seasonNumber !== 0)
        .map((s) => s.seasonNumber);
      setSelectedSeasons(allSeasons);
    }
  };

  const clearAllSeasons = () => {
    setSelectedSeasons([]);
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>
            {t("jellyseerr.request_button")}: {title}
          </Text>

          {mediaType === MediaType.TV && details?.seasons && (
            <View style={styles.seasonsContainer}>
              <Text style={styles.sectionTitle}>{t("item_card.seasons")}</Text>

              <View style={styles.seasonSelectionButtons}>
                <Pressable
                  style={[
                    styles.button,
                    styles.selectAllButton,
                    focusedButton === "selectAll" && styles.focusedButton,
                  ]}
                  onFocus={() => setFocusedButton("selectAll")}
                  onBlur={() => setFocusedButton(null)}
                  onPress={selectAllSeasons}
                >
                  <Text style={styles.buttonText}>
                    {t("jellyseerr.select_all")}
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.button,
                    styles.clearButton,
                    focusedButton === "clear" && styles.focusedButton,
                  ]}
                  onFocus={() => setFocusedButton("clear")}
                  onBlur={() => setFocusedButton(null)}
                  onPress={clearAllSeasons}
                >
                  <Text style={styles.buttonText}>{t("jellyseerr.clear")}</Text>
                </Pressable>
              </View>

              <View style={styles.seasonsGrid}>
                {details.seasons
                  .filter((season) => season.seasonNumber !== 0)
                  .map((season) => (
                    <Pressable
                      key={`season-${season.seasonNumber}`}
                      style={[
                        styles.seasonButton,
                        selectedSeasons.includes(season.seasonNumber) &&
                          styles.selectedSeason,
                        focusedSeason === `season-${season.seasonNumber}` &&
                          styles.focusedButton,
                      ]}
                      onFocus={() =>
                        setFocusedSeason(`season-${season.seasonNumber}`)
                      }
                      onBlur={() => setFocusedSeason(null)}
                      onPress={() => toggleSeason(season.seasonNumber)}
                    >
                      <Text style={styles.seasonText}>
                        {t("jellyseerr.season_number", {
                          season_number: season.seasonNumber,
                        })}
                      </Text>
                    </Pressable>
                  ))}
              </View>
            </View>
          )}

          <View style={styles.buttonContainer}>
            <Pressable
              style={[
                styles.button,
                styles.cancelButton,
                focusedButton === "cancel" && styles.focusedButton,
              ]}
              onFocus={() => setFocusedButton("cancel")}
              onBlur={() => setFocusedButton(null)}
              onPress={onClose}
            >
              <Text style={styles.buttonText}>{t("jellyseerr.cancel")}</Text>
            </Pressable>

            <Pressable
              style={[
                styles.button,
                styles.requestButton,
                focusedButton === "request" && styles.focusedButton,
                mediaType === MediaType.TV &&
                  selectedSeasons.length === 0 &&
                  styles.disabledButton,
              ]}
              onFocus={() => setFocusedButton("request")}
              onBlur={() => setFocusedButton(null)}
              onPress={handleRequest}
              disabled={
                mediaType === MediaType.TV && selectedSeasons.length === 0
              }
              hasTVPreferredFocus={true}
            >
              <Text style={styles.buttonText}>
                {t("jellyseerr.request_button")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "70%",
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 30,
    alignItems: "center",
    maxHeight: "80%",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "white",
    marginBottom: 30,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 20,
    color: "white",
    marginBottom: 15,
    alignSelf: "flex-start",
  },
  seasonsContainer: {
    width: "100%",
    marginBottom: 30,
  },
  seasonSelectionButtons: {
    flexDirection: "row",
    marginBottom: 15,
  },
  seasonsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  seasonButton: {
    backgroundColor: "#333",
    padding: 15,
    borderRadius: 8,
    margin: 5,
    minWidth: 120,
    alignItems: "center",
  },
  selectedSeason: {
    backgroundColor: Colors.primary,
  },
  seasonText: {
    color: "white",
    fontSize: 16,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 20,
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    minWidth: 150,
    alignItems: "center",
  },
  selectAllButton: {
    backgroundColor: "#444",
    marginRight: 10,
  },
  clearButton: {
    backgroundColor: "#555",
  },
  cancelButton: {
    backgroundColor: "#333",
    marginRight: 15,
  },
  requestButton: {
    backgroundColor: Colors.primary,
  },
  disabledButton: {
    backgroundColor: "#555",
    opacity: 0.7,
  },
  focusedButton: {
    borderWidth: 2,
    borderColor: "white",
    transform: [{ scale: 1.05 }],
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
});

export default JellyseerrTVRequestModal;
