import React, { useState, useEffect } from "react";
import { View, StyleSheet, Platform, Pressable, ScrollView, FlatList, Image } from "react-native";
import { Text } from "@/components/common/Text";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useNavigation, useLocalSearchParams } from "expo-router";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { useQuery } from "@tanstack/react-query";
import JellyseerrPoster from "@/components/posters/JellyseerrPoster";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PersonPage: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const { personId } = params as { personId: string };
  const [focusedButton, setFocusedButton] = useState<string | null>(null);
  const [focusedItem, setFocusedItem] = useState<string | null>(null);
  const { jellyseerrApi } = useJellyseerr();
  const insets = useSafeAreaInsets();

  const handleBackPress = () => {
    navigation.goBack();
  };

  const { data: personData, isLoading: isPersonLoading } = useQuery({
    queryKey: ["jellyseerr", "person", personId],
    queryFn: async () => {
      return jellyseerrApi?.personDetails(parseInt(personId));
    },
    enabled: !!jellyseerrApi && !!personId,
  });

  const { data: creditsData, isLoading: isCreditsLoading } = useQuery({
    queryKey: ["jellyseerr", "person", personId, "credits"],
    queryFn: async () => {
      return jellyseerrApi?.personCombinedCredits(parseInt(personId));
    },
    enabled: !!jellyseerrApi && !!personId,
  });

  useEffect(() => {
    if (personData) {
      navigation.setOptions({
        title: personData.name,
      });
    }
  }, [personData]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const isLoading = isPersonLoading || isCreditsLoading;

  // Common rendering for both platforms
  const renderPersonDetails = () => (
    <>
      {personData && (
        <View style={styles.personInfoContainer}>
          <View style={styles.profileImageContainer}>
            {personData.profilePath ? (
              <Image
                source={{ uri: jellyseerrApi?.imageProxy(personData.profilePath, 'w600_and_h900_bestv2') }}
                style={styles.profileImage}
              />
            ) : (
              <View style={styles.noProfileImage}>
                <Ionicons name="person" size={64} color="#888" />
              </View>
            )}
          </View>
          
          <View style={styles.detailsContainer}>
            <Text style={styles.name}>{personData.name}</Text>
            
            {personData.birthday && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t("jellyseerr.born")}:</Text>
                <Text style={styles.infoValue}>{formatDate(personData.birthday)}</Text>
              </View>
            )}
            
            {personData.placeOfBirth && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t("jellyseerr.place_of_birth")}:</Text>
                <Text style={styles.infoValue}>{personData.placeOfBirth}</Text>
              </View>
            )}
            
            {personData.knownForDepartment && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t("jellyseerr.known_for")}:</Text>
                <Text style={styles.infoValue}>{personData.knownForDepartment}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {personData?.biography && (
        <View style={styles.biographyContainer}>
          <Text style={styles.sectionTitle}>{t("jellyseerr.biography")}</Text>
          <Text style={styles.biography}>{personData.biography}</Text>
        </View>
      )}

      {creditsData && creditsData.cast && creditsData.cast.length > 0 && (
        <View style={styles.creditsContainer}>
          <Text style={styles.sectionTitle}>{t("jellyseerr.appearances")}</Text>
          <FlatList
            data={creditsData.cast.slice(0, 20)} // Limit to 20 for performance
            keyExtractor={(item) => `${item.id}-${item.mediaType}`}
            horizontal={!Platform.isTV}
            numColumns={Platform.isTV ? 4 : undefined}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={Platform.isTV ? styles.tvCreditsGrid : styles.creditsRow}
            renderItem={({ item }) => (
              <View 
                style={[
                  styles.creditItem,
                  Platform.isTV && focusedItem === `${item.id}-${item.mediaType}` && styles.focusedItem
                ]}
              >
                <JellyseerrPoster 
                  item={item} 
                  key={`${item.id}-${item.mediaType}`}
                  onFocus={() => Platform.isTV && setFocusedItem(`${item.id}-${item.mediaType}`)}
                  onBlur={() => Platform.isTV && setFocusedItem(null)}
                />
              </View>
            )}
          />
        </View>
      )}
    </>
  );

  // TV-specific rendering
  if (Platform.isTV) {
    return (
      <View 
        style={[
          styles.container,
          {
            paddingLeft: insets.left,
            paddingRight: insets.right,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }
        ]}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>{t("library.options.loading")}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.tvScrollContent}>
            {renderPersonDetails()}
            
            <Pressable
              style={[
                styles.backButton,
                focusedButton === 'back' && styles.focusedButton
              ]}
              onFocus={() => setFocusedButton('back')}
              onBlur={() => setFocusedButton(null)}
              onPress={handleBackPress}
              hasTVPreferredFocus={!personData?.biography}
            >
              <Ionicons name="arrow-back" size={24} color="white" style={styles.backIcon} />
              <Text style={styles.backButtonText}>{t("home.downloads.back")}</Text>
            </Pressable>
          </ScrollView>
        )}
      </View>
    );
  }

  // Mobile rendering
  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t("library.options.loading")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {renderPersonDetails()}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  scrollContent: {
    padding: 16,
  },
  tvScrollContent: {
    padding: 40,
    paddingBottom: 100, // Extra space for the back button
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 18,
    color: "white",
  },
  personInfoContainer: {
    flexDirection: Platform.isTV ? 'row' : 'column',
    marginBottom: 24,
    alignItems: Platform.isTV ? 'flex-start' : 'center',
  },
  profileImageContainer: {
    marginRight: Platform.isTV ? 30 : 0,
    marginBottom: Platform.isTV ? 0 : 16,
  },
  profileImage: {
    width: Platform.isTV ? 240 : 150,
    height: Platform.isTV ? 360 : 225,
    borderRadius: 8,
  },
  noProfileImage: {
    width: Platform.isTV ? 240 : 150,
    height: Platform.isTV ? 360 : 225,
    borderRadius: 8,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  },
  detailsContainer: {
    flex: 1,
  },
  name: {
    fontSize: Platform.isTV ? 32 : 24,
    fontWeight: "bold",
    color: "white",
    marginBottom: 16,
    textAlign: Platform.isTV ? 'left' : 'center',
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: Platform.isTV ? 18 : 16,
    color: "#888",
    marginRight: 8,
  },
  infoValue: {
    fontSize: Platform.isTV ? 18 : 16,
    color: "white",
    flex: 1,
  },
  biographyContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: Platform.isTV ? 24 : 20,
    fontWeight: "bold",
    color: "white",
    marginBottom: 16,
  },
  biography: {
    fontSize: Platform.isTV ? 18 : 16,
    color: "white",
    lineHeight: Platform.isTV ? 28 : 24,
  },
  creditsContainer: {
    marginBottom: 24,
  },
  creditsRow: {
    paddingRight: 16,
  },
  tvCreditsGrid: {
    paddingBottom: 20,
  },
  creditItem: {
    marginRight: 16,
    marginBottom: 16,
  },
  focusedItem: {
    transform: [{ scale: 1.05 }],
  },
  backButton: {
    position: Platform.isTV ? 'absolute' : 'relative',
    bottom: Platform.isTV ? 40 : undefined,
    left: Platform.isTV ? 40 : undefined,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    alignSelf: Platform.isTV ? undefined : 'center',
    marginTop: Platform.isTV ? 0 : 20,
  },
  focusedButton: {
    backgroundColor: Colors.primary,
    transform: [{ scale: 1.05 }],
    borderWidth: 2,
    borderColor: "white",
  },
  backIcon: {
    marginRight: 10,
  },
  backButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  }
});

export default PersonPage;