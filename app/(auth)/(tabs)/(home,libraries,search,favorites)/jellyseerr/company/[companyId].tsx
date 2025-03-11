import React, { useState } from "react";
import { View, StyleSheet, Platform, Pressable, ScrollView } from "react-native";
import { Text } from "@/components/common/Text";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useNavigation } from "expo-router";

// Combined version with TV-specific handling
const CompanyPage: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [focusedButton, setFocusedButton] = useState<string | null>(null);

  const handleBackPress = () => {
    navigation.goBack();
  };

  // For TV platform, render a simplified but functional version
  if (Platform.isTV) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.content}>
            <Ionicons name="business-outline" size={64} color={Colors.primary} style={styles.icon} />
            <Text style={styles.title}>{t("jellyseerr.company_details")}</Text>
            
            {/* Company details would go here */}
            <Text style={styles.message}>
              Company details are currently simplified on TV devices.
            </Text>
            
            {/* Add a focusable back button for TV navigation */}
            <Pressable
              style={[
                styles.backButton,
                focusedButton === 'back' && styles.focusedButton
              ]}
              onFocus={() => setFocusedButton('back')}
              onBlur={() => setFocusedButton(null)}
              onPress={handleBackPress}
              hasTVPreferredFocus={true}
            >
              <Ionicons name="arrow-back" size={24} color="white" style={styles.backIcon} />
              <Text style={styles.backButtonText}>{t("home.downloads.back")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  // Original mobile implementation would go here
  // For now, just return a placeholder
  return (
    <View>
      <Text>Company Details</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
    marginBottom: 20,
  },
  message: {
    fontSize: 24,
    color: "white",
    textAlign: "center",
    marginBottom: 30,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginTop: 20,
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

export default CompanyPage;