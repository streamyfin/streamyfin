import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Modal } from 'react-native';
import { Text } from '@/components/common/Text';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useTranslation } from 'react-i18next';
import { IssueType, IssueTypeName } from '@/utils/jellyseerr/server/constants/issue';

interface JellyseerrTVIssueModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (issueType: IssueType, message: string) => void;
}

const JellyseerrTVIssueModal: React.FC<JellyseerrTVIssueModalProps> = ({
  visible,
  onClose,
  onSubmit
}) => {
  const { t } = useTranslation();
  const [selectedIssueType, setSelectedIssueType] = useState<IssueType | null>(null);
  const [focusedButton, setFocusedButton] = useState<string | null>(null);
  const [focusedIssueType, setFocusedIssueType] = useState<string | null>(null);
  
  // Convert IssueTypeName to array for easier rendering
  const issueTypes = Object.entries(IssueTypeName).map(([key, value]) => ({
    key: key as unknown as IssueType,
    value
  }));

  const handleSubmit = () => {
    if (selectedIssueType !== null) {
      onSubmit(selectedIssueType, ''); // No message input on TV for simplicity
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>{t("jellyseerr.whats_wrong")}</Text>
          
          <View style={styles.issueTypesContainer}>
            <Text style={styles.sectionTitle}>{t("jellyseerr.issue_type")}</Text>
            
            {issueTypes.map((issue) => (
              <Pressable
                key={issue.key}
                style={[
                  styles.issueTypeButton,
                  selectedIssueType === issue.key && styles.selectedIssueType,
                  focusedIssueType === issue.key.toString() && styles.focusedButton
                ]}
                onFocus={() => setFocusedIssueType(issue.key.toString())}
                onBlur={() => setFocusedIssueType(null)}
                onPress={() => setSelectedIssueType(issue.key)}
              >
                <Text style={styles.issueTypeText}>{issue.value}</Text>
              </Pressable>
            ))}
          </View>
          
          <View style={styles.buttonContainer}>
            <Pressable
              style={[
                styles.button,
                styles.cancelButton,
                focusedButton === 'cancel' && styles.focusedButton
              ]}
              onFocus={() => setFocusedButton('cancel')}
              onBlur={() => setFocusedButton(null)}
              onPress={onClose}
            >
              <Text style={styles.buttonText}>{t("jellyseerr.cancel")}</Text>
            </Pressable>
            
            <Pressable
              style={[
                styles.button,
                styles.submitButton,
                focusedButton === 'submit' && styles.focusedButton,
                !selectedIssueType && styles.disabledButton
              ]}
              onFocus={() => setFocusedButton('submit')}
              onBlur={() => setFocusedButton(null)}
              onPress={handleSubmit}
              disabled={!selectedIssueType}
            >
              <Text style={styles.buttonText}>{t("jellyseerr.submit_button")}</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '60%',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    color: 'white',
    marginBottom: 15,
    alignSelf: 'flex-start',
  },
  issueTypesContainer: {
    width: '100%',
    marginBottom: 30,
  },
  issueTypeButton: {
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    width: '100%',
  },
  selectedIssueType: {
    backgroundColor: Colors.primary,
  },
  issueTypeText: {
    color: 'white',
    fontSize: 18,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    minWidth: 150,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#333',
    marginRight: 15,
  },
  submitButton: {
    backgroundColor: Colors.primary,
  },
  disabledButton: {
    backgroundColor: '#555',
    opacity: 0.7,
  },
  focusedButton: {
    borderWidth: 2,
    borderColor: 'white',
    transform: [{ scale: 1.05 }],
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default JellyseerrTVIssueModal;