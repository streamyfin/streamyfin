import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";

interface Props {
  /** Usually the query's `refetch`. */
  onRetry: () => void;
  /** True while the retry is in flight. */
  retrying?: boolean;
}

/**
 * Full-screen state for a list whose first request failed. A failed load must
 * not fall through to the list's empty state, which would tell the user they
 * have nothing there.
 */
export const QueryErrorState: React.FC<Props> = ({ onRetry, retrying }) => {
  const { t } = useTranslation();

  return (
    <View className='flex-1 items-center justify-center px-8 py-12'>
      <Ionicons name='cloud-offline-outline' size={64} color='#4b5563' />
      <Text className='text-xl font-semibold mt-4 text-center'>
        {t("common.something_went_wrong")}
      </Text>
      <Text className='text-neutral-400 text-center mt-2 mb-6'>
        {t("common.load_failed_message")}
      </Text>
      <Button
        color='black'
        onPress={onRetry}
        loading={retrying}
        justify='center'
        className='px-6'
        iconRight={<Ionicons name='refresh' size={20} color='white' />}
      >
        {t("home.retry")}
      </Button>
    </View>
  );
};
