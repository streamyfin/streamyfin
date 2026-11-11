import { zeroInsetsModule } from "./safeArea";

// Providers and views stay real, so a spec rendering `SafeAreaView` keeps it.
module.exports = {
  ...jest.requireActual("../node_modules/react-native-safe-area-context"),
  ...zeroInsetsModule,
};
