#!/usr/bin/env -S bun --transpile-only
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
 *   EXPO_TV=0 bun scripts/ios/build-ios.ts [options]
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
const fs = require("node:fs");
const path = require("node:path");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawn, execSync, spawnSync } = require("node:child_process");

import type { ChildProcess } from "node:child_process";

// Track Metro bundler process for cleanup
let metroProcess: ChildProcess | null = null;

// =============================================================================
// Configuration Constants
// =============================================================================

/** Default Metro bundler port */
const DEFAULT_METRO_PORT = 8081;

/** Minimum allowed port number (avoiding privileged ports) */
const MIN_PORT = 1024;

/** Maximum allowed port number */
const MAX_PORT = 65535;

/** Progress line width for padding */
const PROGRESS_LINE_WIDTH = 60;

/** Maximum buffer size for xcodebuild output (100MB) */
const MAX_BUILD_BUFFER = 100 * 1024 * 1024;

/** Default build timeout in milliseconds (30 minutes) */
const DEFAULT_BUILD_TIMEOUT_MS = 30 * 60 * 1000;

/** Regex to find .app path in DerivedData build output */
const DERIVED_DATA_APP_PATH_REGEX =
  /\/[\S]+\/DerivedData\/[\S]+\/Build\/Products\/[\S]+-[\S]+\/[\S]+\.app/;

/** Name of the iOS directory */
const IOS_DIR_NAME = "ios";

/** Maximum build timeout in milliseconds (2 hours) */
const MAX_BUILD_TIMEOUT_MS = 2 * 60 * 60 * 1000;

/** Simulator boot wait time in milliseconds (30 seconds max) */
const SIMULATOR_BOOT_WAIT_MS = 30 * 1000;

/** Number of output lines to show when no errors found */
const ERROR_OUTPUT_TAIL_LINES = 50;

// =============================================================================
// Security Helpers
// =============================================================================

/**
 * Validates and sanitizes a path to prevent command injection.
 * Throws an error if the path contains dangerous characters.
 * @param inputPath - The path to sanitize
 * @param projectRoot - Optional project root to verify path doesn't escape
 * @param mustExist - If true, validates that the path exists (default: false)
 * @returns The validated absolute path
 * @throws Error if validation fails
 */
function sanitizePath(
  inputPath: string,
  projectRoot?: string,
  mustExist = false,
): string {
  // Validate input is a string
  if (typeof inputPath !== "string" || inputPath.trim() === "") {
    throw new Error("Path must be a non-empty string");
  }

  // Check for null bytes (common injection technique)
  if (inputPath.includes("\0")) {
    throw new Error("Path contains null byte");
  }

  // Resolve to absolute path to prevent traversal
  const resolved = path.resolve(inputPath);

  // Check for dangerous shell metacharacters (allow tilde for Unix home paths)
  const dangerousChars = /[`$&|;<>(){}[\]!#]/;
  if (dangerousChars.test(resolved)) {
    throw new Error(
      `Path contains potentially dangerous characters: ${resolved}`,
    );
  }

  // If projectRoot provided, ensure path doesn't escape it
  if (projectRoot) {
    const absProjectRoot = path.resolve(projectRoot);
    // Allow system temp directories for build artifacts
    const systemTempDir = require("node:os").tmpdir();
    if (
      !resolved.startsWith(absProjectRoot) &&
      !resolved.startsWith(systemTempDir)
    ) {
      throw new Error(
        `Path escapes project boundary: ${resolved} (expected within ${absProjectRoot})`,
      );
    }
  }

  // Optionally validate path exists
  if (mustExist && !fs.existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`);
  }

  // Check for symlink traversal (optional additional security)
  if (mustExist && fs.existsSync(resolved)) {
    try {
      const realPath = fs.realpathSync(resolved);
      if (projectRoot) {
        const absProjectRoot = path.resolve(projectRoot);
        const systemTempDir = require("node:os").tmpdir();
        if (
          !realPath.startsWith(absProjectRoot) &&
          !realPath.startsWith(systemTempDir)
        ) {
          throw new Error(
            `Symlink resolves outside project boundary: ${realPath}`,
          );
        }
      }
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message?.includes("project boundary")
      ) {
        throw error;
      }
      // Ignore other errors (e.g., permission issues)
    }
  }

  return resolved;
}

/**
 * Validates a bundle ID to prevent command injection.
 * Bundle IDs should only contain alphanumeric, dots, and hyphens.
 */
function validateBundleId(bundleId: string): string {
  if (!/^[a-zA-Z0-9.-]+$/.test(bundleId)) {
    throw new Error(`Invalid bundle ID format: ${bundleId}`);
  }
  return bundleId;
}

/**
 * Validates a scheme name to prevent command injection.
 * Scheme names should only contain alphanumeric, spaces, dashes, and underscores.
 */
function validateSchemeName(scheme: string): string {
  if (!/^[a-zA-Z0-9 _-]+$/.test(scheme)) {
    throw new Error(`Invalid scheme name format: ${scheme}`);
  }
  return scheme;
}

/**
 * Validates a port number to ensure it's within valid range.
 * Ports must be between 1024 and 65535 (avoiding privileged ports).
 * @param port - The port number to validate
 * @returns The validated port number
 * @throws Error if port is invalid
 */
function validatePort(port: number): number {
  if (!Number.isInteger(port)) {
    throw new Error(`Port must be an integer, got: ${port}`);
  }
  if (port < MIN_PORT || port > MAX_PORT) {
    throw new Error(
      `Port must be between ${MIN_PORT} and ${MAX_PORT} (got ${port}). Privileged ports (below ${MIN_PORT}) are not allowed.`,
    );
  }
  return port;
}

/**
 * Validates a timeout value in milliseconds.
 * @param timeoutMs - The timeout in milliseconds
 * @returns The validated timeout value
 * @throws Error if timeout is invalid
 */
function validateTimeout(timeoutMs: number): number {
  if (!Number.isInteger(timeoutMs)) {
    throw new Error(`Timeout must be an integer, got: ${timeoutMs}`);
  }
  if (timeoutMs < 0) {
    throw new Error(
      `Timeout cannot be negative, got ${timeoutMs}ms. Use --no-timeout to disable timeout.`,
    );
  }
  // Warn but allow large timeouts
  if (timeoutMs > MAX_BUILD_TIMEOUT_MS) {
    console.warn(
      `\x1b[33m⚠ Warning: Custom timeout ${timeoutMs / 1000}s exceeds default limit of ${MAX_BUILD_TIMEOUT_MS / 1000}s. Proceeding anyway.\x1b[0m`,
    );
  }
  return timeoutMs;
}

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
  buildTimeout: number;
  noTimeout: boolean;
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
    port: DEFAULT_METRO_PORT,
    production: false,
    simulator: false,
    skipCredentials: false,
    verbose: false,
    buildTimeout: DEFAULT_BUILD_TIMEOUT_MS,
    noTimeout: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      case "--configuration": {
        const configArg = args[++i];
        if (!configArg) {
          throw new Error("--configuration requires an argument");
        }
        options.configuration = configArg as "Debug" | "Release";
        break;
      }
      case "--device":
      case "-d": {
        const deviceArg = args[++i];
        if (!deviceArg) {
          throw new Error("--device requires an argument");
        }
        options.device = deviceArg;
        break;
      }
      case "--scheme": {
        const schemeArg = args[++i];
        if (!schemeArg) {
          throw new Error("--scheme requires an argument");
        }
        options.scheme = schemeArg;
        break;
      }
      case "--no-bundler":
        options.bundler = false;
        break;
      case "--no-install":
        options.install = false;
        break;
      case "--clean":
        options.clean = true;
        break;
      case "--project-root": {
        const rootPath = args[++i];
        if (!rootPath) {
          throw new Error("--project-root requires a path argument");
        }
        const resolved = path.resolve(rootPath);
        if (!fs.existsSync(resolved)) {
          throw new Error(`Project root does not exist: ${resolved}`);
        }
        if (!fs.statSync(resolved).isDirectory()) {
          throw new Error(`Project root is not a directory: ${resolved}`);
        }
        options.projectRoot = resolved;
        break;
      }
      case "--port":
      case "-p": {
        const portArg = args[++i];
        if (!portArg) {
          throw new Error("--port requires an argument");
        }
        const effectivePort = parseInt(portArg, 10);
        // Handle 0 or NaN validly based on PR suggestion logic
        // Using isNaN check allows 0 to be a valid input if that was intended,
        // though typically 0 means "random free port".
        // The original PR suggestion was: const effectivePort = Number.isNaN(parsedPort) ? DEFAULT_METRO_PORT : parsedPort;
        const validPort = Number.isNaN(effectivePort)
          ? DEFAULT_METRO_PORT
          : effectivePort;
        options.port = validatePort(validPort);
        break;
      }
      case "--production":
        options.production = true;
        options.configuration = "Release";
        options.skipCredentials = true; // Default to unsigned builds
        break;
      case "--output":
      case "-o": {
        const outputArg = args[++i];
        if (!outputArg) {
          throw new Error("--output requires a path argument");
        }
        const resolvedOutput = path.resolve(outputArg);
        const outputDir = path.dirname(resolvedOutput);
        if (!fs.existsSync(outputDir)) {
          throw new Error(`Output directory does not exist: ${outputDir}`);
        }
        if (!fs.statSync(outputDir).isDirectory()) {
          throw new Error(`Output path is not a directory: ${outputDir}`);
        }
        options.output = resolvedOutput;
        break;
      }
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
      case "--no-timeout":
        options.noTimeout = true;
        break;
      case "--timeout": {
        const timeoutArg = args[++i];
        if (!timeoutArg) {
          throw new Error("--timeout requires an argument");
        }
        const timeoutSeconds = parseInt(timeoutArg, 10);
        if (Number.isNaN(timeoutSeconds)) {
          throw new Error(
            "Invalid timeout value. Must be a number in seconds.",
          );
        }
        options.buildTimeout = validateTimeout(timeoutSeconds * 1000);
        break;
      }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Standalone iOS Build Script

Usage:
  EXPO_TV=0 bun scripts/ios/build-ios.ts [options]

Development Build Options:
  --configuration [Debug|Release]  Xcode build configuration (default: Debug)
  --device, -d [name|udid]         Target device or simulator
  --scheme [name]                  Xcode scheme to build
  --no-bundler                     Skip starting Metro bundler
  --no-install                     Skip installing dependencies (pods)
  --clean                          Clean build before building
  --project-root [path]            Project root directory (default: cwd)
  --port, -p [number]              Metro bundler port (default: ${DEFAULT_METRO_PORT})

Production Build Options:
  --production                     Build unsigned production archive (default: no signing)
  --output, -o [path]              Output path for build artifact
  --simulator                      Build .app for simulator instead of device
  --sign                           Enable code signing (creates signed IPA)
  --timeout [seconds]              Build timeout in seconds (default: ${DEFAULT_BUILD_TIMEOUT_MS / 1000}s = 30min)
  --no-timeout                     Disable build timeout entirely

Output Options:
  --verbose                        Stream full xcodebuild output to console.
                                   When disabled, only errors are shown on failure.
                                   Note: CI uses --verbose for PRs to aid debugging.
  --help, -h                       Show this help message

Environment Variables:
  EXPO_TV=0|1                      Set to 0 for phone, 1 for TV builds
  NODE_ENV                         Set to 'production' for Release builds

Examples:
  # Development build
  EXPO_TV=0 bun scripts/ios/build-ios.ts
  EXPO_TV=0 bun scripts/ios/build-ios.ts --device "iPhone 15"

  # Production unsigned build (default)
  EXPO_TV=0 bun scripts/ios/build-ios.ts --production

  # Production signed IPA
  EXPO_TV=0 bun scripts/ios/build-ios.ts --production --sign

  # Production simulator build
  EXPO_TV=0 bun scripts/ios/build-ios.ts --production --simulator

  # Long build without timeout
  EXPO_TV=0 bun scripts/ios/build-ios.ts --production --no-timeout
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

/**
 * Displays build error output in a structured format.
 * Shows stderr, extracts error lines from stdout, or falls back to showing last N lines.
 * @param stderr - Standard error output from the build process
 * @param stdout - Standard output from the build process
 * @param errorPatterns - Patterns to search for in stdout to identify errors
 */
function displayBuildError(
  stderr: string,
  stdout: string,
  errorPatterns: string[] = [
    "error:",
    "Error:",
    "fatal error",
    "** BUILD FAILED **",
    "** ARCHIVE FAILED **",
    "** EXPORT FAILED **",
  ],
): void {
  // Show stderr if present (may contain warnings or errors)
  if (stderr.trim()) {
    console.error("\n--- Build Error Output (stderr) ---");
    console.error(stderr);
    console.error("--- End stderr ---\n");
  }

  // Extract and show actual error lines from stdout
  const errorLines = stdout
    .split("\n")
    .filter((line: string) =>
      errorPatterns.some((pattern) => line.includes(pattern)),
    );

  if (errorLines.length > 0) {
    console.error("\n--- Build Errors (from stdout) ---");
    for (const line of errorLines) {
      console.error(line);
    }
    console.error("--- End Build Errors ---\n");
  }

  // Linker failures ("Undefined symbols for architecture …", the SwiftUICore
  // autolink rejection, "ld: …") don't carry an "error:" token, so the pattern
  // filter above drops the symbol name and "referenced from" context that
  // actually pinpoints the culprit. Surface that block explicitly.
  const stdoutLines = stdout.split("\n");
  const undefIdx = stdoutLines.findIndex((line: string) =>
    line.includes("Undefined symbols"),
  );
  if (undefIdx >= 0) {
    console.error("\n--- Linker error detail ---");
    console.error(stdoutLines.slice(undefIdx, undefIdx + 40).join("\n"));
    console.error("--- End linker error detail ---\n");
  } else if (errorLines.length === 0 && stdout.trim()) {
    // No specific error patterns found, show last N lines of stdout
    const lastLines = stdoutLines.slice(-ERROR_OUTPUT_TAIL_LINES).join("\n");
    console.error(
      `\n--- Last ${ERROR_OUTPUT_TAIL_LINES} lines of build output ---`,
    );
    console.error(lastLines);
    console.error("--- End build output ---\n");
  }
}

/**
 * Sleeps for a specified duration.
 * @param ms - Duration in milliseconds
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

/**
 * Finds the Xcode project or workspace in the iOS directory.
 * Prefers .xcworkspace over .xcodeproj when both exist.
 * @param projectRoot - The root directory of the project
 * @returns XcodeProject object containing project information
 * @throws Error if iOS directory is not found or not readable
 */
function findXcodeProject(projectRoot: string): XcodeProject {
  const iosPath = path.join(projectRoot, IOS_DIR_NAME);

  try {
    if (!fs.existsSync(iosPath)) {
      log.error(`iOS directory not found at: ${iosPath}`);
      log.info("Run `bunx expo prebuild` to generate the iOS project.");
      process.exit(1);
    }

    let files: string[];
    try {
      files = fs.readdirSync(iosPath);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log.error(`Failed to read iOS directory: ${errorMessage}`);
      log.info(`Check permissions for directory: ${iosPath}`);
      process.exit(1);
    }

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
    log.info("Run `bunx expo prebuild` to generate the iOS project.");
    process.exit(1);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Unexpected error finding Xcode project: ${errorMessage}`);
    throw error;
  }
}

// =============================================================================
// Scheme Resolution
// =============================================================================

/**
 * Retrieves available schemes from an Xcode project.
 * Falls back to project name if xcodebuild command fails.
 * @param xcodeProject - The Xcode project to query
 * @returns Array of scheme names
 */
function getSchemes(xcodeProject: XcodeProject): string[] {
  try {
    const flag = xcodeProject.isWorkspace ? "-workspace" : "-project";
    const safePath = sanitizePath(xcodeProject.path);
    const result = spawnSync("xcodebuild", ["-list", flag, safePath], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output = result.stdout || "";

    const schemesMatch = output.match(/Schemes:\s*\n([\s\S]*?)(?:\n\n|\n$|$)/);
    if (schemesMatch) {
      return schemesMatch[1]
        .split("\n")
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
  } catch (error) {
    // xcodebuild -list failed; log a warning and fall back to inferring from project name
    console.warn(
      `Warning: Failed to list Xcode schemes for project "${xcodeProject.path}". Falling back to project-name-based scheme inference.`,
      error,
    );
  }

  // Default scheme from project name
  const name = xcodeProject.name.replace(/\.(xcworkspace|xcodeproj)$/, "");
  return [name];
}

/**
 * Resolves and validates the scheme name for building.
 * Uses provided scheme if valid, otherwise selects best match.
 * @param xcodeProject - The Xcode project
 * @param schemeName - Optional scheme name to use
 * @returns The validated scheme name
 * @throws Error if no schemes are available
 */
function resolveScheme(
  xcodeProject: XcodeProject,
  schemeName?: string,
): string {
  const schemes = getSchemes(xcodeProject);

  if (schemeName && schemes.includes(schemeName)) {
    return validateSchemeName(schemeName);
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

  const finalScheme = matchingScheme || schemes[0];
  return validateSchemeName(finalScheme);
}

// =============================================================================
// Device Resolution
// =============================================================================

/**
 * Retrieves list of available iOS simulators.
 * @returns Array of Device objects representing available simulators
 */
function getAvailableSimulators(): Device[] {
  try {
    const output = execSync("xcrun simctl list devices available --json", {
      encoding: "utf-8",
    });
    const devicesData = JSON.parse(output);
    const devices: Device[] = [];

    for (const [runtime, deviceList] of Object.entries(
      devicesData.devices || {},
    )) {
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

/**
 * Resolves target device for installation.
 * Prefers booted simulator or matches by name/UDID.
 * @param deviceName - Optional device name or UDID to match
 * @returns Device object for the resolved target
 * @throws Error if no simulators are available
 */
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

/**
 * Installs CocoaPods dependencies for the iOS project.
 * Tries `pod install` first, falls back to `pod install --repo-update`.
 * @param projectRoot - Project root directory
 */
function installPods(projectRoot: string): void {
  const iosPath = path.join(projectRoot, IOS_DIR_NAME);
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
  verbose = false,
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

    // Always capture stdout for binary path extraction
    buildProcess.stdout?.on("data", (data: Buffer) => {
      const str = data.toString();
      output += str;

      if (verbose) {
        process.stdout.write(str);
      } else {
        // Simple progress indicator
        if (str.includes("Build succeeded")) {
          log.success("Build succeeded");
        } else if (str.includes("Compiling")) {
          // Show compilation progress
          const match = str.match(/Compiling\s+(\S+)/);
          if (match) {
            process.stdout.write(
              `\r  Compiling ${match[1]}...`.padEnd(PROGRESS_LINE_WIDTH),
            );
          }
        }
      }
    });

    buildProcess.stderr?.on("data", (data: Buffer) => {
      const str = data.toString();
      errorOutput += str;
      if (verbose) {
        process.stderr.write(str);
      }
    });

    buildProcess.on("close", (code: number | null) => {
      if (!verbose) {
        process.stdout.write("\n");
      }
      if (code === 0) {
        resolve(output);
      } else if (code === null) {
        log.error("xcodebuild process terminated abnormally (no exit code)");
        if (errorOutput && !verbose) {
          console.error(errorOutput);
        }
        reject(new Error("Build process exited without code"));
      } else {
        log.error(`xcodebuild exited with code ${code}`);
        if (errorOutput && !verbose) {
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
  const appPathMatch = buildOutput.match(DERIVED_DATA_APP_PATH_REGEX);
  return appPathMatch ? appPathMatch[0] : null;
}

// =============================================================================
// App Launch
// =============================================================================

/**
 * Waits for simulator to boot by polling its state.
 * @param udid - Simulator UDID
 * @param maxWaitMs - Maximum time to wait in milliseconds
 * @throws Error if simulator doesn't boot within timeout
 */
async function waitForSimulatorBoot(
  udid: string,
  maxWaitMs: number,
): Promise<void> {
  const startTime = Date.now();
  const pollIntervalMs = 1000; // Check every second

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const result = execSync("xcrun simctl list devices --json", {
        encoding: "utf-8",
      });
      const data = JSON.parse(result);

      // Find the device in the JSON output
      let isBooted = false;
      const devices = data.devices || {};

      for (const runtime in devices) {
        if (Object.hasOwn(devices, runtime)) {
          const deviceList = devices[runtime];
          if (Array.isArray(deviceList)) {
            const device = deviceList.find((d: any) => d.udid === udid);
            if (device && device.state === "Booted") {
              isBooted = true;
              break;
            }
          }
        }
      }

      if (isBooted) {
        log.info("Simulator is ready");
        return;
      }
    } catch {
      // Simulator not found or not booted yet, continue polling
    }

    // Wait before next poll
    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Simulator failed to boot within ${maxWaitMs / 1000} seconds`,
  );
}

/**
 * Installs and launches the app on the specified simulator.
 * Handles simulator booting, app installation, and launching.
 * @param binaryPath - Path to the compiled .app directory
 * @param device - Target simulator device
 * @throws Error if installation or launch fails
 */
async function launchApp(binaryPath: string, device: Device): Promise<void> {
  log.step("Installing and launching app...");

  const sanitizedBinaryPath = sanitizePath(binaryPath);

  // Boot simulator if not running
  if (device.state !== "Booted") {
    log.info(`Booting simulator: ${device.name}`);
    try {
      // Use spawnSync with array to prevent command injection via device.udid
      spawnSync("xcrun", ["simctl", "boot", device.udid], { stdio: "ignore" });
    } catch {
      // May already be booting
    }
  }

  // Open Simulator app
  spawnSync("open", ["-a", "Simulator"], { stdio: "ignore" });

  // Wait for simulator to be ready with polling
  await waitForSimulatorBoot(device.udid, SIMULATOR_BOOT_WAIT_MS);

  // Install the app
  log.info("Installing app on simulator...");
  try {
    // Use spawnSync with array to prevent command injection
    const installResult = spawnSync(
      "xcrun",
      ["simctl", "install", device.udid, sanitizedBinaryPath],
      { stdio: "inherit" },
    );
    if (installResult.status !== 0) {
      throw new Error("simctl install failed");
    }
  } catch (error) {
    log.error("Failed to install app on simulator");
    throw error;
  }

  // Get bundle ID from Info.plist
  const infoPlistPath = path.join(sanitizedBinaryPath, "Info.plist");
  let bundleId: string | null = null;

  try {
    const bundleIdResult = spawnSync(
      "/usr/libexec/PlistBuddy",
      ["-c", "Print:CFBundleIdentifier", infoPlistPath],
      { encoding: "utf-8" },
    );
    if (bundleIdResult.status === 0 && bundleIdResult.stdout) {
      bundleId = validateBundleId(bundleIdResult.stdout.toString().trim());
    }
  } catch {
    log.warn("Could not read bundle ID from Info.plist");
  }

  if (bundleId) {
    log.info(`Launching app: ${bundleId}`);
    try {
      // Use spawnSync with array to prevent command injection
      const launchResult = spawnSync(
        "xcrun",
        ["simctl", "launch", device.udid, bundleId],
        { stdio: "inherit" },
      );
      if (launchResult.status !== 0) {
        throw new Error("simctl launch failed");
      }
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

/**
 * Starts the Metro bundler in a detached process.
 * Tracks the process for cleanup on script exit.
 * @param projectRoot - Project root directory
 * @param port - Port to run Metro on
 */
function startMetroBundler(projectRoot: string, port: number): void {
  log.step("Starting Metro bundler...");

  metroProcess = spawn("bunx", ["expo", "start", "--port", port.toString()], {
    cwd: sanitizePath(projectRoot),
    stdio: "inherit",
    detached: true,
    env: { ...process.env },
  });

  if (metroProcess) {
    metroProcess.unref();
  }
  log.info(`Metro bundler started on port ${port}`);
}

/**
 * Cleanup handler for Metro bundler process.
 * Ensures Metro is killed when script exits.
 */
function cleanupMetroBundler(): void {
  if (metroProcess && !metroProcess.killed) {
    try {
      metroProcess.kill();
      log.info("Metro bundler stopped");
    } catch (_error) {
      // Process might already be killed, ignore error
    }
  }
}

// Register cleanup handler for process exit
process.on("exit", cleanupMetroBundler);
// Handle process termination for graceful cleanup
const handleExit = (signal: NodeJS.Signals, exitCode: number) => () => {
  log.info(`Received ${signal}, shutting down gracefully...`);
  cleanupMetroBundler();
  process.exit(exitCode);
};

process.on("SIGINT", handleExit("SIGINT", 130));
process.on("SIGTERM", handleExit("SIGTERM", 143));

// =============================================================================
// Production Build (IPA/App Archive)
// =============================================================================

interface AppConfig {
  expo?: {
    ios?: {
      bundleIdentifier?: string;
    };
  };
  ios?: {
    bundleIdentifier?: string;
  };
}

/**
 * Reads and parses the app configuration.
 * @param projectRoot - Project root directory
 * @returns Parsed app configuration object
 */
function getAppConfig(projectRoot: string): AppConfig {
  // Try to read app.json or app.config.js
  const appJsonPath = path.join(projectRoot, "app.json");
  const appConfigPath = path.join(projectRoot, "app.config.js");
  const appConfigTsPath = path.join(projectRoot, "app.config.ts");

  if (fs.existsSync(appJsonPath)) {
    try {
      const content = fs.readFileSync(appJsonPath, "utf-8");
      const parsed = JSON.parse(content);
      return parsed.expo || parsed;
    } catch (error) {
      log.warn(
        `Failed to parse app.json: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      log.info("Continuing with default configuration");
      return {};
    }
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
    IOS_DIR_NAME,
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

/**
 * Creates the ExportOptions.plist file for IPA export.
 * @param options - Build options
 * @param outputDir - Directory to write the plist to
 * @returns Path to the created plist file
 * @throws Error if file creation fails
 */
function createExportOptionsPlist(
  options: BuildOptions,
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

  try {
    fs.writeFileSync(plistPath, plistContent);

    if (!fs.existsSync(plistPath)) {
      throw new Error("Failed to write ExportOptions.plist");
    }

    return plistPath;
  } catch (error) {
    log.error(
      `Failed to create export options: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    throw error;
  }
}

/**
 * Executes xcodebuild command with standardized error handling and options.
 * @param args - Arguments for xcodebuild
 * @param options - Build options
 * @param errorContext - Description of action for error messages
 */
function runXcodeBuildCommand(
  args: string[],
  options: BuildOptions,
  errorContext: string,
): void {
  log.info(`xcodebuild ${args.join(" ")}`);

  const result = spawnSync("xcodebuild", args, {
    cwd: sanitizePath(path.join(options.projectRoot, IOS_DIR_NAME)),
    stdio: options.verbose ? "inherit" : "pipe",
    maxBuffer: MAX_BUILD_BUFFER,
    timeout: options.noTimeout ? undefined : options.buildTimeout,
    env: {
      ...process.env,
      EXPO_TV: process.env.EXPO_TV,
    },
  });

  if (result.status !== 0) {
    log.error(`${errorContext} failed`);
    if (!options.verbose && result.stderr) {
      const stderr = result.stderr.toString();
      const stdout = result.stdout?.toString() || "";
      displayBuildError(stderr, stdout);
      log.info("Run with --verbose to see full build output");
    } else if (!options.verbose) {
      log.info(
        "No detailed error output available. Run with --verbose to see more.",
      );
    }
    process.exit(1);
  }
}

/**
 * Orchestrates the production build process (Archive -> Export IPA).
 * Handles both device (IPA) and simulator (.app) builds.
 * @param options - Build options
 * @throws Error if build, archive, or export fails
 */
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
      sanitizePath(xcodeProject.path),
      "-scheme",
      scheme,
      "-configuration",
      options.configuration,
      "-sdk",
      "iphonesimulator",
      "-derivedDataPath",
      sanitizePath(path.join(outputDir, "DerivedData")),
      "ONLY_ACTIVE_ARCH=NO",
      "CODE_SIGNING_ALLOWED=NO",
      "build",
    ];

    if (options.clean) {
      buildArgs.unshift("clean");
    }

    runXcodeBuildCommand(buildArgs, options, "Simulator build");

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
      const finalPath = sanitizePath(
        options.output || path.join(outputDir, `${scheme}.app`),
        options.projectRoot,
      );
      if (fs.existsSync(finalPath)) {
        fs.rmSync(finalPath, { recursive: true });
      }
      fs.cpSync(sanitizePath(appPath), finalPath, {
        recursive: true,
      });

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
      sanitizePath(xcodeProject.path),
      "-scheme",
      scheme,
      "-configuration",
      options.configuration,
      "-archivePath",
      sanitizePath(archivePath),
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

    runXcodeBuildCommand(archiveArgs, options, "Archive creation");

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

      const exportPlistPath = createExportOptionsPlist(options, outputDir);

      const exportArgs = [
        "-exportArchive",
        "-archivePath",
        sanitizePath(archivePath),
        "-exportPath",
        sanitizePath(exportDir),
        "-exportOptionsPlist",
        sanitizePath(exportPlistPath),
        "-allowProvisioningUpdates",
      ];

      runXcodeBuildCommand(exportArgs, options, "IPA export");

      // Find the IPA
      const ipaFile = fs
        .readdirSync(exportDir)
        .find((f: string) => f.endsWith(".ipa"));
      if (ipaFile) {
        const ipaPath = path.join(exportDir, ipaFile);
        const finalPath = sanitizePath(
          options.output || path.join(outputDir, `${scheme}.ipa`),
          options.projectRoot,
        );

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
      const ipaPath = sanitizePath(
        options.output || path.join(outputDir, `${scheme}.ipa`),
        options.projectRoot,
      );

      // Clean up previous Payload directory if exists
      if (fs.existsSync(payloadDir)) {
        fs.rmSync(payloadDir, { recursive: true });
      }
      fs.mkdirSync(payloadDir, { recursive: true });

      // Copy .app to Payload
      log.info("Copying app to Payload folder...");
      fs.cpSync(
        sanitizePath(appPath),
        path.join(payloadDir, path.basename(appPath)),
        {
          recursive: true,
        },
      );

      // Create IPA (zip the Payload folder)
      log.info("Creating IPA...");
      const safeOutputDir = sanitizePath(outputDir);
      const safeIpaPath = ipaPath; // Already sanitized above

      // Zip Payload directory to create IPA
      // Using /usr/bin/zip to ensure compatibility
      const zipArgs = ["-r", "-y", safeIpaPath, "Payload"];

      const zipResult = spawnSync("zip", zipArgs, {
        cwd: safeOutputDir, // Run zip from output dir so Payload is at root of archive
        stdio: options.verbose ? "inherit" : "pipe",
        env: { ...process.env },
      });

      if (zipResult.status !== 0) {
        log.error("Failed to create IPA");
        if (!options.verbose) {
          console.error(zipResult.stderr?.toString());
        }
        process.exit(1);
      }

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

/**
 * Main entry point for the iOS build script.
 * Handles argument parsing, environment setup, and dispatching to appropriate build flow.
 * @throws Error if build fails to complete
 */
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
  const env = getProcessEnv(options);
  try {
    const buildOutput = await runXcodeBuild(buildArgs, env, options.verbose);

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
    log.error("Development build failed");
    process.exit(1);
  }
}

main().catch((error) => {
  log.error(error.message);
  process.exit(1);
});
