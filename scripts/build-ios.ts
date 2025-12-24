#!/usr/bin/env -S npx ts-node --transpile-only
/**
 * Standalone iOS Build Script
 *
 * Author: Victor Cristea (retrozenith) <80767544+retrozenith@users.noreply.github.com>
 *
 * This script builds iOS apps similar to `cross-env EXPO_TV=0 expo run:ios`
 * but as a completely separate standalone script.
 *
 * It also supports production builds similar to `eas build -p ios --local --non-interactive`
 * without requiring EAS login.
 *
 * Usage:
 *   EXPO_TV=0 npx ts-node scripts/build-ios.ts [options]
 *
 * Options:
 *   --configuration [Debug|Release]  Xcode build configuration (default: Debug)
 *   --device [name|udid]             Target device or simulator
 *   --scheme [name]                  Xcode scheme to build
 *   --no-bundler                     Skip starting Metro bundler
 *   --no-install                     Skip installing dependencies (pods)
 *   --clean                          Clean build before building
 *   --project-root [path]            Project root directory (default: cwd)
 *   --port [number]                  Metro bundler port (default: 8081)
 *   --production                     Build production IPA (like eas build --local)
 *   --output [path]                  Output path for production build artifact
 *   --simulator                      Build for simulator (production mode)
 *   --skip-credentials               Skip credentials setup (unsigned build)
 *   --verbose                        Show verbose output
 *   --help                           Show this help message
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const { spawn, execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const _os = require("node:os");

// =============================================================================
// Types
// =============================================================================

interface BuildOptions {
  configuration: "Debug" | "Release";
  device?: string;
  scheme?: string;
  bundler: boolean;
  install: boolean;
  clean: boolean;
  projectRoot: string;
  port: number;
  production: boolean;
  output?: string;
  simulator: boolean;
  skipCredentials: boolean;
  verbose: boolean;
}

interface XcodeProject {
  name: string;
  isWorkspace: boolean;
  path: string;
}

interface Device {
  udid: string;
  name: string;
  state: string;
  isSimulator: boolean;
}

// =============================================================================
// Argument Parsing
// =============================================================================

function parseArgs(argv: string[]): BuildOptions {
  const args = argv.slice(2);
  const options: BuildOptions = {
    configuration: "Debug",
    bundler: true,
    install: true,
    clean: false,
    projectRoot: process.cwd(),
    port: 8081,
    production: false,
    simulator: false,
    skipCredentials: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      case "--configuration":
        options.configuration = (args[++i] as "Debug" | "Release") || "Debug";
        break;
      case "--device":
      case "-d":
        options.device = args[++i];
        break;
      case "--scheme":
        options.scheme = args[++i];
        break;
      case "--no-bundler":
        options.bundler = false;
        break;
      case "--no-install":
        options.install = false;
        break;
      case "--clean":
        options.clean = true;
        break;
      case "--project-root":
        options.projectRoot = path.resolve(args[++i] || process.cwd());
        break;
      case "--port":
      case "-p":
        options.port = parseInt(args[++i], 10) || 8081;
        break;
      case "--production":
        options.production = true;
        options.configuration = "Release";
        options.skipCredentials = true; // Default to unsigned builds
        break;
      case "--output":
      case "-o":
        options.output = path.resolve(args[++i]);
        break;
      case "--simulator":
        options.simulator = true;
        break;
      case "--skip-credentials":
        options.skipCredentials = true;
        break;
      case "--sign":
        options.skipCredentials = false;
        break;
      case "--verbose":
        options.verbose = true;
        break;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Standalone iOS Build Script

Usage:
  EXPO_TV=0 npx ts-node scripts/build-ios.ts [options]

Development Build Options:
  --configuration [Debug|Release]  Xcode build configuration (default: Debug)
  --device, -d [name|udid]         Target device or simulator
  --scheme [name]                  Xcode scheme to build
  --no-bundler                     Skip starting Metro bundler
  --no-install                     Skip installing dependencies (pods)
  --clean                          Clean build before building
  --project-root [path]            Project root directory (default: cwd)
  --port, -p [number]              Metro bundler port (default: 8081)

Production Build Options:
  --production                     Build unsigned production archive (default: no signing)
  --output, -o [path]              Output path for build artifact
  --simulator                      Build .app for simulator instead of device
  --sign                           Enable code signing (creates signed IPA)
  --verbose                        Show verbose build output

General:
  --help, -h                       Show this help message

Environment Variables:
  EXPO_TV=0|1                      Set to 0 for phone, 1 for TV builds
  NODE_ENV                         Set to 'production' for Release builds

Examples:
  # Development build
  EXPO_TV=0 npx ts-node scripts/build-ios.ts
  EXPO_TV=0 npx ts-node scripts/build-ios.ts --device "iPhone 15"

  # Production unsigned build (default)
  EXPO_TV=0 npx ts-node scripts/build-ios.ts --production

  # Production signed IPA
  EXPO_TV=0 npx ts-node scripts/build-ios.ts --production --sign

  # Production simulator build
  EXPO_TV=0 npx ts-node scripts/build-ios.ts --production --simulator
`);
}

// =============================================================================
// Logging
// =============================================================================

const log = {
  info: (msg: string) => console.log(`\x1b[36m›\x1b[0m ${msg}`),
  success: (msg: string) => console.log(`\x1b[32m✓\x1b[0m ${msg}`),
  warn: (msg: string) => console.log(`\x1b[33m⚠\x1b[0m ${msg}`),
  error: (msg: string) => console.error(`\x1b[31m✖\x1b[0m ${msg}`),
  step: (msg: string) => console.log(`\x1b[1m› ${msg}\x1b[0m`),
};

// =============================================================================
// Platform Check
// =============================================================================

function assertPlatform(): void {
  if (process.platform !== "darwin") {
    log.error("iOS apps can only be built on macOS devices.");
    log.info("Use `eas build -p ios` to build in the cloud.");
    process.exit(1);
  }
}

// =============================================================================
// Xcode Project Resolution
// =============================================================================

function findXcodeProject(projectRoot: string): XcodeProject {
  const iosPath = path.join(projectRoot, "ios");

  if (!fs.existsSync(iosPath)) {
    log.error(`iOS directory not found at: ${iosPath}`);
    log.info("Run `npx expo prebuild` to generate the iOS project.");
    process.exit(1);
  }

  const files = fs.readdirSync(iosPath);

  // Prefer workspace over project
  const workspace = files.find((f: string) => f.endsWith(".xcworkspace"));
  if (workspace) {
    return {
      name: workspace,
      isWorkspace: true,
      path: path.join(iosPath, workspace),
    };
  }

  const project = files.find((f: string) => f.endsWith(".xcodeproj"));
  if (project) {
    return {
      name: project,
      isWorkspace: false,
      path: path.join(iosPath, project),
    };
  }

  log.error("No Xcode project or workspace found in ios/ directory");
  process.exit(1);
}

// =============================================================================
// Scheme Resolution
// =============================================================================

function getSchemes(xcodeProject: XcodeProject): string[] {
  try {
    const flag = xcodeProject.isWorkspace ? "-workspace" : "-project";
    const output = execSync(
      `xcodebuild -list ${flag} "${xcodeProject.path}" 2>/dev/null`,
      { encoding: "utf-8" },
    );

    const schemesMatch = output.match(/Schemes:\s*\n([\s\S]*?)(?:\n\n|\n$|$)/);
    if (schemesMatch) {
      return schemesMatch[1]
        .split("\n")
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
  } catch {
    // Fallback to inferring from project name
  }

  // Default scheme from project name
  const name = xcodeProject.name.replace(/\.(xcworkspace|xcodeproj)$/, "");
  return [name];
}

function resolveScheme(
  xcodeProject: XcodeProject,
  schemeName?: string,
): string {
  const schemes = getSchemes(xcodeProject);

  if (schemeName && schemes.includes(schemeName)) {
    return schemeName;
  }

  if (schemes.length === 0) {
    log.error("No schemes found in Xcode project");
    process.exit(1);
  }

  // Prefer scheme that matches project name
  const projectName = xcodeProject.name.replace(
    /\.(xcworkspace|xcodeproj)$/,
    "",
  );
  const matchingScheme = schemes.find((s) => s === projectName);

  return matchingScheme || schemes[0];
}

// =============================================================================
// Device Resolution
// =============================================================================

function getAvailableSimulators(): Device[] {
  try {
    const output = execSync("xcrun simctl list devices available --json", {
      encoding: "utf-8",
    });
    const data = JSON.parse(output);
    const devices: Device[] = [];

    for (const [runtime, deviceList] of Object.entries(data.devices || {})) {
      if (!runtime.includes("iOS")) continue;

      for (const device of deviceList as any[]) {
        devices.push({
          udid: device.udid,
          name: device.name,
          state: device.state,
          isSimulator: true,
        });
      }
    }

    return devices;
  } catch {
    return [];
  }
}

function resolveDevice(deviceName?: string): Device {
  const simulators = getAvailableSimulators();

  if (simulators.length === 0) {
    log.error("No iOS simulators available.");
    log.info("Create a simulator using Xcode or `xcrun simctl create`");
    process.exit(1);
  }

  if (deviceName) {
    // Match by name or UDID
    const match = simulators.find(
      (d) =>
        d.udid.toLowerCase() === deviceName.toLowerCase() ||
        d.name.toLowerCase().includes(deviceName.toLowerCase()),
    );
    if (match) {
      return match;
    }
    log.warn(`Device "${deviceName}" not found, using default simulator.`);
  }

  // Prefer booted simulator, otherwise pick the first iPhone
  const bootedDevice = simulators.find((d) => d.state === "Booted");
  if (bootedDevice) {
    return bootedDevice;
  }

  const iPhoneDevice = simulators.find((d) => d.name.includes("iPhone"));
  return iPhoneDevice || simulators[0];
}

// =============================================================================
// CocoaPods
// =============================================================================

function installPods(projectRoot: string): void {
  const iosPath = path.join(projectRoot, "ios");
  const podfilePath = path.join(iosPath, "Podfile");

  if (!fs.existsSync(podfilePath)) {
    log.info("No Podfile found, skipping pod install");
    return;
  }

  log.step("Installing CocoaPods dependencies...");

  try {
    execSync("pod install", {
      cwd: iosPath,
      stdio: "inherit",
      env: { ...process.env },
    });
    log.success("Pods installed successfully");
  } catch (_error) {
    log.warn("Pod install failed, trying with repo update...");
    try {
      execSync("pod install --repo-update", {
        cwd: iosPath,
        stdio: "inherit",
        env: { ...process.env },
      });
      log.success("Pods installed successfully");
    } catch {
      log.error("Failed to install CocoaPods dependencies");
      process.exit(1);
    }
  }
}

// =============================================================================
// Build Process
// =============================================================================

function getXcodeBuildArgs(
  xcodeProject: XcodeProject,
  scheme: string,
  device: Device,
  options: BuildOptions,
): string[] {
  const args = [
    xcodeProject.isWorkspace ? "-workspace" : "-project",
    xcodeProject.path,
    "-configuration",
    options.configuration,
    "-scheme",
    scheme,
    "-destination",
    `id=${device.udid}`,
  ];

  if (options.clean) {
    args.push("clean", "build");
  }

  return args;
}

function getProcessEnv(options: BuildOptions): NodeJS.ProcessEnv {
  return {
    ...process.env,
    RCT_METRO_PORT: options.port.toString(),
    RCT_NO_LAUNCH_PACKAGER: options.bundler ? undefined : "true",
    // Preserve EXPO_TV and other environment variables
    EXPO_TV: process.env.EXPO_TV,
  };
}

async function runXcodeBuild(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<string> {
  return new Promise((resolve, reject) => {
    log.step("Building iOS app...");
    log.info(`xcodebuild ${args.join(" ")}`);

    const buildProcess = spawn("xcodebuild", args, {
      env,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let output = "";
    let errorOutput = "";

    buildProcess.stdout?.on("data", (data: Buffer) => {
      const str = data.toString();
      output += str;
      // Simple progress indicator
      if (str.includes("Build succeeded")) {
        log.success("Build succeeded");
      } else if (str.includes("Compiling")) {
        // Show compilation progress
        const match = str.match(/Compiling\s+(\S+)/);
        if (match) {
          process.stdout.write(`\r  Compiling ${match[1]}...`.padEnd(60));
        }
      }
    });

    buildProcess.stderr?.on("data", (data: Buffer) => {
      errorOutput += data.toString();
    });

    buildProcess.on("close", (code: number | null) => {
      process.stdout.write("\n");
      if (code === 0) {
        resolve(output);
      } else {
        log.error(`xcodebuild exited with code ${code}`);
        if (errorOutput) {
          console.error(errorOutput);
        }
        reject(new Error(`Build failed with code ${code}`));
      }
    });
  });
}

function extractBinaryPath(buildOutput: string): string | null {
  // Extract CONFIGURATION_BUILD_DIR and UNLOCALIZED_RESOURCES_FOLDER_PATH
  const buildDirMatch = buildOutput.match(
    /export CONFIGURATION_BUILD_DIR\\?=(.+)$/m,
  );
  const appNameMatch = buildOutput.match(
    /export UNLOCALIZED_RESOURCES_FOLDER_PATH\\?=(.+)$/m,
  );

  if (buildDirMatch && appNameMatch) {
    return path.join(buildDirMatch[1], appNameMatch[1]);
  }

  // Fallback: find .app path in DerivedData
  const appPathMatch = buildOutput.match(
    /\/[\S]+\/DerivedData\/[\S]+\/Build\/Products\/[\S]+-[\S]+\/[\S]+\.app/,
  );
  return appPathMatch ? appPathMatch[0] : null;
}

// =============================================================================
// App Launch
// =============================================================================

async function launchApp(binaryPath: string, device: Device): Promise<void> {
  log.step("Installing and launching app...");

  // Boot simulator if not running
  if (device.state !== "Booted") {
    log.info(`Booting simulator: ${device.name}`);
    try {
      execSync(`xcrun simctl boot "${device.udid}"`, { stdio: "ignore" });
    } catch {
      // May already be booting
    }
  }

  // Open Simulator app
  execSync("open -a Simulator", { stdio: "ignore" });

  // Wait a moment for simulator to be ready
  await new Promise((r) => setTimeout(r, 2000));

  // Install the app
  log.info("Installing app on simulator...");
  try {
    execSync(`xcrun simctl install "${device.udid}" "${binaryPath}"`, {
      stdio: "inherit",
    });
  } catch (error) {
    log.error("Failed to install app on simulator");
    throw error;
  }

  // Get bundle ID from Info.plist
  const infoPlistPath = path.join(binaryPath, "Info.plist");
  let bundleId: string | null = null;

  try {
    const bundleIdOutput = execSync(
      `/usr/libexec/PlistBuddy -c "Print:CFBundleIdentifier" "${infoPlistPath}"`,
      { encoding: "utf-8" },
    );
    bundleId = bundleIdOutput.trim();
  } catch {
    log.warn("Could not read bundle ID from Info.plist");
  }

  if (bundleId) {
    log.info(`Launching app: ${bundleId}`);
    try {
      execSync(`xcrun simctl launch "${device.udid}" "${bundleId}"`, {
        stdio: "inherit",
      });
      log.success(`App launched on ${device.name}`);
    } catch (error) {
      log.error("Failed to launch app");
      throw error;
    }
  }
}

// =============================================================================
// Metro Bundler
// =============================================================================

function startMetroBundler(projectRoot: string, port: number): void {
  log.step("Starting Metro bundler...");

  const metro = spawn("npx", ["expo", "start", "--port", port.toString()], {
    cwd: projectRoot,
    stdio: "inherit",
    detached: true,
    env: { ...process.env },
  });

  metro.unref();
  log.info(`Metro bundler started on port ${port}`);
}

// =============================================================================
// Production Build (IPA/App Archive)
// =============================================================================

function getAppConfig(projectRoot: string): any {
  // Try to read app.json or app.config.js
  const appJsonPath = path.join(projectRoot, "app.json");
  const appConfigPath = path.join(projectRoot, "app.config.js");
  const appConfigTsPath = path.join(projectRoot, "app.config.ts");

  if (fs.existsSync(appJsonPath)) {
    const content = fs.readFileSync(appJsonPath, "utf-8");
    const parsed = JSON.parse(content);
    return parsed.expo || parsed;
  }

  // For JS/TS configs, we'd need to evaluate them - just return defaults
  if (fs.existsSync(appConfigPath) || fs.existsSync(appConfigTsPath)) {
    log.warn("Dynamic app config detected. Using defaults for bundle ID.");
    return {};
  }

  return {};
}

function getBundleIdentifier(
  projectRoot: string,
  xcodeProject: XcodeProject,
): string {
  const appConfig = getAppConfig(projectRoot);

  // Try from app config
  if (appConfig.ios?.bundleIdentifier) {
    return appConfig.ios.bundleIdentifier;
  }

  // Try from Xcode project
  const projectName = xcodeProject.name.replace(
    /\.(xcworkspace|xcodeproj)$/,
    "",
  );
  const pbxprojPath = path.join(
    projectRoot,
    "ios",
    `${projectName}.xcodeproj`,
    "project.pbxproj",
  );

  if (fs.existsSync(pbxprojPath)) {
    try {
      const content = fs.readFileSync(pbxprojPath, "utf-8");
      const match = content.match(
        /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*"?([^";]+)"?/,
      );
      if (match) {
        return match[1];
      }
    } catch {
      // Fall through
    }
  }

  // Default fallback
  return `com.example.${projectName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

function createExportOptionsPlist(
  options: BuildOptions,
  _projectRoot: string,
  outputDir: string,
): string {
  const plistPath = path.join(outputDir, "ExportOptions.plist");

  const exportMethod = options.simulator
    ? "development"
    : options.skipCredentials
      ? "development"
      : "ad-hoc";

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>${exportMethod}</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>stripSwiftSymbols</key>
    <true/>
    <key>compileBitcode</key>
    <false/>
</dict>
</plist>`;

  fs.writeFileSync(plistPath, plistContent);
  return plistPath;
}

async function runProductionBuild(options: BuildOptions): Promise<void> {
  log.step("Production Build Mode");
  console.log(
    `  Building ${options.simulator ? "Simulator" : "Device"} artifact...`,
  );
  console.log("");

  const xcodeProject = findXcodeProject(options.projectRoot);
  log.info(`Found Xcode project: ${xcodeProject.name}`);

  const scheme = resolveScheme(xcodeProject, options.scheme);
  log.info(`Using scheme: ${scheme}`);

  const bundleId = getBundleIdentifier(options.projectRoot, xcodeProject);
  log.info(`Bundle ID: ${bundleId}`);

  // Install pods if needed
  if (options.install) {
    installPods(options.projectRoot);
  }

  // Create output directory
  const outputDir = options.output
    ? path.dirname(options.output)
    : path.join(options.projectRoot, "build");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const archivePath = path.join(outputDir, `${scheme}.xcarchive`);
  const projectOrWorkspaceFlag = xcodeProject.isWorkspace
    ? "-workspace"
    : "-project";

  if (options.simulator) {
    // Simulator build - just build the .app
    log.step("Building for Simulator...");

    const buildArgs = [
      projectOrWorkspaceFlag,
      xcodeProject.path,
      "-scheme",
      scheme,
      "-configuration",
      options.configuration,
      "-sdk",
      "iphonesimulator",
      "-derivedDataPath",
      path.join(outputDir, "DerivedData"),
      "ONLY_ACTIVE_ARCH=NO",
      "CODE_SIGNING_ALLOWED=NO",
      "build",
    ];

    if (options.clean) {
      buildArgs.unshift("clean");
    }

    log.info(`xcodebuild ${buildArgs.join(" ")}`);

    try {
      execSync(`xcodebuild ${buildArgs.map((a) => `"${a}"`).join(" ")}`, {
        cwd: path.join(options.projectRoot, "ios"),
        stdio: options.verbose ? "inherit" : "pipe",
        env: {
          ...process.env,
          EXPO_TV: process.env.EXPO_TV,
        },
      });
    } catch (_error: any) {
      log.error("Simulator build failed");
      if (!options.verbose) {
        log.info("Run with --verbose to see full build output");
      }
      process.exit(1);
    }

    // Find the built .app
    const derivedDataPath = path.join(outputDir, "DerivedData");
    const productsPath = path.join(derivedDataPath, "Build", "Products");

    let appPath: string | null = null;

    if (fs.existsSync(productsPath)) {
      const configDir = fs
        .readdirSync(productsPath)
        .find((d: string) => d.includes("iphonesimulator"));
      if (configDir) {
        const configPath = path.join(productsPath, configDir);
        const appName = fs
          .readdirSync(configPath)
          .find((f: string) => f.endsWith(".app"));
        if (appName) {
          appPath = path.join(configPath, appName);
        }
      }
    }

    if (appPath && fs.existsSync(appPath)) {
      // Copy to output location
      const finalPath = options.output || path.join(outputDir, `${scheme}.app`);
      if (fs.existsSync(finalPath)) {
        fs.rmSync(finalPath, { recursive: true });
      }
      execSync(`cp -R "${appPath}" "${finalPath}"`);

      console.log("");
      log.success("Simulator build complete!");
      log.info(`Output: ${finalPath}`);
    } else {
      log.warn("Build completed but .app not found");
    }
  } else {
    // Device build - create archive and export IPA
    log.step("Creating Archive...");

    const archiveArgs = [
      projectOrWorkspaceFlag,
      xcodeProject.path,
      "-scheme",
      scheme,
      "-configuration",
      options.configuration,
      "-archivePath",
      archivePath,
      "archive",
    ];

    if (!options.skipCredentials) {
      archiveArgs.push(
        "CODE_SIGN_STYLE=Automatic",
        "-allowProvisioningUpdates",
      );
    } else {
      archiveArgs.push("CODE_SIGNING_ALLOWED=NO", "CODE_SIGNING_REQUIRED=NO");
    }

    if (options.clean) {
      archiveArgs.unshift("clean");
    }

    log.info(`xcodebuild ${archiveArgs.join(" ")}`);

    try {
      execSync(`xcodebuild ${archiveArgs.map((a) => `"${a}"`).join(" ")}`, {
        cwd: path.join(options.projectRoot, "ios"),
        stdio: options.verbose ? "inherit" : "pipe",
        env: {
          ...process.env,
          EXPO_TV: process.env.EXPO_TV,
        },
      });
    } catch (error: any) {
      log.error("Archive creation failed");
      if (!options.verbose && error.stderr) {
        console.error("\n--- Build Error Output ---");
        console.error(error.stderr.toString());
        console.error("--- End Build Error Output ---\n");
      } else if (!options.verbose && error.stdout) {
        // Sometimes errors are in stdout
        const output = error.stdout.toString();
        const errorLines = output
          .split("\n")
          .filter(
            (line: string) =>
              line.includes("error:") ||
              line.includes("Error:") ||
              line.includes("fatal error"),
          );
        if (errorLines.length > 0) {
          console.error("\n--- Build Errors ---");
          for (const line of errorLines) {
            console.error(line);
          }
          console.error("--- End Build Errors ---\n");
        }
      }
      log.info("Run with --verbose to see full build output");
      process.exit(1);
    }

    if (!fs.existsSync(archivePath)) {
      log.error("Archive was not created");
      process.exit(1);
    }

    log.success(`Archive created: ${archivePath}`);

    if (!options.skipCredentials) {
      // Export IPA
      log.step("Exporting IPA...");

      const exportDir = path.join(outputDir, "export");
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }

      const exportPlistPath = createExportOptionsPlist(
        options,
        options.projectRoot,
        outputDir,
      );

      const exportArgs = [
        "-exportArchive",
        "-archivePath",
        archivePath,
        "-exportPath",
        exportDir,
        "-exportOptionsPlist",
        exportPlistPath,
        "-allowProvisioningUpdates",
      ];

      log.info(`xcodebuild ${exportArgs.join(" ")}`);

      try {
        execSync(`xcodebuild ${exportArgs.map((a) => `"${a}"`).join(" ")}`, {
          cwd: path.join(options.projectRoot, "ios"),
          stdio: options.verbose ? "inherit" : "pipe",
          env: {
            ...process.env,
            EXPO_TV: process.env.EXPO_TV,
          },
        });
      } catch (_error: any) {
        log.error("IPA export failed");
        if (!options.verbose) {
          log.info("Run with --verbose to see full build output");
        }
        process.exit(1);
      }

      // Find the IPA
      const ipaFile = fs
        .readdirSync(exportDir)
        .find((f: string) => f.endsWith(".ipa"));
      if (ipaFile) {
        const ipaPath = path.join(exportDir, ipaFile);
        const finalPath =
          options.output || path.join(outputDir, `${scheme}.ipa`);

        if (finalPath !== ipaPath) {
          fs.copyFileSync(ipaPath, finalPath);
        }

        console.log("");
        log.success("Production build complete!");
        log.info(`IPA: ${finalPath}`);
        log.info(`Archive: ${archivePath}`);
      } else {
        log.warn("IPA not found in export directory");
        log.info(`Archive available at: ${archivePath}`);
      }
    } else {
      // Create unsigned IPA manually from the archive
      log.step("Creating unsigned IPA from archive...");

      const productsPath = path.join(archivePath, "Products", "Applications");
      if (!fs.existsSync(productsPath)) {
        log.error("Could not find Products/Applications in archive");
        log.info(`Archive available at: ${archivePath}`);
        process.exit(1);
      }

      const appName = fs
        .readdirSync(productsPath)
        .find((f: string) => f.endsWith(".app"));
      if (!appName) {
        log.error("Could not find .app in archive");
        log.info(`Archive available at: ${archivePath}`);
        process.exit(1);
      }

      const appPath = path.join(productsPath, appName);
      const payloadDir = path.join(outputDir, "Payload");
      const ipaPath = options.output || path.join(outputDir, `${scheme}.ipa`);

      // Clean up previous Payload directory if exists
      if (fs.existsSync(payloadDir)) {
        fs.rmSync(payloadDir, { recursive: true });
      }
      fs.mkdirSync(payloadDir, { recursive: true });

      // Copy .app to Payload
      log.info("Copying app to Payload folder...");
      execSync(`cp -R "${appPath}" "${payloadDir}/"`, { stdio: "pipe" });

      // Create IPA (zip the Payload folder)
      log.info("Creating IPA...");
      execSync(`cd "${outputDir}" && zip -r -q "${ipaPath}" Payload`, {
        stdio: "pipe",
      });

      // Clean up Payload directory
      fs.rmSync(payloadDir, { recursive: true });

      console.log("");
      log.success("Unsigned IPA created!");
      log.info(`IPA: ${ipaPath}`);
      log.info(`Archive: ${archivePath}`);
      log.warn(
        "Note: This IPA is unsigned and cannot be installed on devices without signing.",
      );
    }
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  assertPlatform();

  const options = parseArgs(process.argv);

  console.log("\n");
  log.step("Standalone iOS Build Script");
  console.log(`  EXPO_TV=${process.env.EXPO_TV || "not set"}`);
  console.log(`  Mode: ${options.production ? "Production" : "Development"}`);
  console.log(`  Configuration: ${options.configuration}`);
  console.log(`  Project Root: ${options.projectRoot}`);
  console.log("\n");

  // Production build mode
  if (options.production) {
    await runProductionBuild(options);
    return;
  }

  // Development build mode (original behavior)
  // Find Xcode project
  const xcodeProject = findXcodeProject(options.projectRoot);
  log.info(`Found Xcode project: ${xcodeProject.name}`);

  // Resolve scheme
  const scheme = resolveScheme(xcodeProject, options.scheme);
  log.info(`Using scheme: ${scheme}`);

  // Resolve device
  const device = resolveDevice(options.device);
  log.info(`Target device: ${device.name} (${device.udid})`);

  // Install pods if needed
  if (options.install) {
    installPods(options.projectRoot);
  }

  // Build the app
  const buildArgs = getXcodeBuildArgs(xcodeProject, scheme, device, options);
  const buildEnv = getProcessEnv(options);

  try {
    const buildOutput = await runXcodeBuild(buildArgs, buildEnv);

    // Find the built binary
    const binaryPath = extractBinaryPath(buildOutput);

    if (binaryPath && fs.existsSync(binaryPath)) {
      log.success(`Built app at: ${binaryPath}`);

      // Start Metro bundler if needed
      if (options.bundler && options.configuration === "Debug") {
        startMetroBundler(options.projectRoot, options.port);
      }

      // Launch the app
      await launchApp(binaryPath, device);

      console.log("\n");
      log.success("Build complete!");

      if (options.bundler) {
        log.info("Metro bundler is running. Press Ctrl+C to stop.");
      }
    } else {
      log.warn("Built successfully but could not locate app binary");
      log.info("Check the Xcode build output for the .app location");
    }
  } catch (_error) {
    log.error("Build failed");
    process.exit(1);
  }
}

main().catch((error) => {
  log.error(error.message);
  process.exit(1);
});
