import { blankIconsModule } from "./stubModules";

// Everything but `Ionicons` stays real. `requireActual` must name the package
// by path: the bare specifier resolves back through `moduleNameMapper` to this
// file.
module.exports = {
  ...jest.requireActual("../node_modules/@expo/vector-icons"),
  ...blankIconsModule,
};
