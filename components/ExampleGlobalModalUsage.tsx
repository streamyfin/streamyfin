/**
 * Example Usage of Global Modal
 *
 * This file demonstrates how to use the global modal system from anywhere in your app.
 * You can delete this file after understanding how it works.
 */

import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useGlobalModal } from "@/providers/GlobalModalProvider";

/**
 * Example 1: Simple Content Modal
 */
export const SimpleModalExample = () => {
  const { showModal } = useGlobalModal();

  const handleOpenModal = () => {
    showModal(
      <View className='p-6'>
        <Text className='text-2xl font-bold mb-4 text-white'>Simple Modal</Text>
        <Text className='text-white mb-4'>
          This is a simple modal with just some text content.
        </Text>
        <Text className='text-neutral-400'>
          Swipe down or tap outside to close.
        </Text>
      </View>,
    );
  };

  return (
    <TouchableOpacity
      onPress={handleOpenModal}
      className='bg-purple-600 px-4 py-2 rounded-lg'
    >
      <Text className='text-white font-semibold'>Open Simple Modal</Text>
    </TouchableOpacity>
  );
};

/**
 * Example 2: Modal with Custom Snap Points
 */
export const CustomSnapPointsExample = () => {
  const { showModal } = useGlobalModal();

  const handleOpenModal = () => {
    showModal(
      <View className='p-6' style={{ minHeight: 400 }}>
        <Text className='text-2xl font-bold mb-4 text-white'>
          Custom Snap Points
        </Text>
        <Text className='text-white mb-4'>
          This modal has custom snap points (25%, 50%, 90%).
        </Text>
        <View className='bg-neutral-800 p-4 rounded-lg'>
          <Text className='text-white'>
            Try dragging the modal to different heights!
          </Text>
        </View>
      </View>,
      {
        snapPoints: ["25%", "50%", "90%"],
        enableDynamicSizing: false,
      },
    );
  };

  return (
    <TouchableOpacity
      onPress={handleOpenModal}
      className='bg-blue-600 px-4 py-2 rounded-lg'
    >
      <Text className='text-white font-semibold'>Custom Snap Points</Text>
    </TouchableOpacity>
  );
};

/**
 * Example 3: Complex Component in Modal
 */
const SettingsModalContent = () => {
  const { hideModal } = useGlobalModal();

  const settings = [
    {
      id: 1,
      title: "Notifications",
      icon: "notifications-outline" as const,
      enabled: true,
    },
    { id: 2, title: "Dark Mode", icon: "moon-outline" as const, enabled: true },
    {
      id: 3,
      title: "Auto-play",
      icon: "play-outline" as const,
      enabled: false,
    },
  ];

  return (
    <View className='p-6'>
      <Text className='text-2xl font-bold mb-6 text-white'>Settings</Text>

      {settings.map((setting, index) => (
        <View
          key={setting.id}
          className={`flex-row items-center justify-between py-4 ${
            index !== settings.length - 1 ? "border-b border-neutral-700" : ""
          }`}
        >
          <View className='flex-row items-center gap-3'>
            <Ionicons name={setting.icon} size={24} color='white' />
            <Text className='text-white text-lg'>{setting.title}</Text>
          </View>
          <View
            className={`w-12 h-7 rounded-full ${
              setting.enabled ? "bg-purple-600" : "bg-neutral-600"
            }`}
          >
            <View
              className={`w-5 h-5 rounded-full bg-white shadow-md transform ${
                setting.enabled ? "translate-x-6" : "translate-x-1"
              }`}
              style={{ marginTop: 4 }}
            />
          </View>
        </View>
      ))}

      <TouchableOpacity
        onPress={hideModal}
        className='bg-purple-600 px-4 py-3 rounded-lg mt-6'
      >
        <Text className='text-white font-semibold text-center'>Close</Text>
      </TouchableOpacity>
    </View>
  );
};

export const ComplexModalExample = () => {
  const { showModal } = useGlobalModal();

  const handleOpenModal = () => {
    showModal(<SettingsModalContent />);
  };

  return (
    <TouchableOpacity
      onPress={handleOpenModal}
      className='bg-green-600 px-4 py-2 rounded-lg'
    >
      <Text className='text-white font-semibold'>Complex Component</Text>
    </TouchableOpacity>
  );
};

/**
 * Example 4: Modal Triggered from Function (e.g., API response)
 */
export const useShowSuccessModal = () => {
  const { showModal } = useGlobalModal();

  return (message: string) => {
    showModal(
      <View className='p-6 items-center'>
        <View className='bg-green-500 rounded-full p-4 mb-4'>
          <Ionicons name='checkmark' size={48} color='white' />
        </View>
        <Text className='text-2xl font-bold mb-2 text-white'>Success!</Text>
        <Text className='text-white text-center'>{message}</Text>
      </View>,
    );
  };
};

/**
 * Main Demo Component
 */
export const GlobalModalDemo = () => {
  const showSuccess = useShowSuccessModal();

  return (
    <View className='p-6 gap-4'>
      <Text className='text-2xl font-bold mb-4 text-white'>
        Global Modal Examples
      </Text>

      <SimpleModalExample />
      <CustomSnapPointsExample />
      <ComplexModalExample />

      <TouchableOpacity
        onPress={() => showSuccess("Operation completed successfully!")}
        className='bg-orange-600 px-4 py-2 rounded-lg'
      >
        <Text className='text-white font-semibold'>Show Success Modal</Text>
      </TouchableOpacity>
    </View>
  );
};
