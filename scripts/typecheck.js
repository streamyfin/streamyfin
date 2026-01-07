const { execFileSync } = require("node:child_process");
const process = require("node:process");

// Enhanced ANSI color codes and styles
const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  underline: "\x1b[4m",
  bg: {
    red: "\x1b[41m",
    green: "\x1b[42m",
    yellow: "\x1b[43m",
    blue: "\x1b[44m",
  },
};

const border = "━".repeat(80);

// Center the title within the border
const title = "🔥 STREAMYFIN TYPESCRIPT CHECK";
const titlePadding = Math.floor((80 - title.length) / 2);
const centeredTitle = " ".repeat(titlePadding) + title;

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

function log(message, color = "") {
  if (useColor && color) {
    console.log(`${color}${message}${colors.reset}`);
  } else {
    console.log(String(message));
  }
}

function formatError(errorLine) {
  if (!useColor) return errorLine;

  // Color file paths in cyan
  let formatted = errorLine.replace(
    /^([^(]+\([^)]+\):)/,
    `${colors.cyan}$1${colors.reset}`,
  );

  // Color error codes in red bold
  formatted = formatted.replace(
    /(error TS\d+:)/g,
    `${colors.red}${colors.bold}$1${colors.reset}`,
  );

  // Color type names in yellow
  formatted = formatted.replace(
    /(Type '[^']*')/g,
    `${colors.yellow}$1${colors.reset}`,
  );

  // Color property names in magenta
  formatted = formatted.replace(
    /(Property '[^']*')/g,
    `${colors.magenta}$1${colors.reset}`,
  );

  return formatted;
}

function parseErrorsAndCreateSummary(errorOutput) {
  const lines = errorOutput.split("\n").filter((line) => line.trim());
  const errorsByFile = new Map();
  const formattedErrors = [];

  let currentError = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Check if this is the start of a new error (has file path and error code)
    const errorMatch = line.match(/^([^(]+\([^)]+\):)\s*(error TS\d+:)/);

    if (errorMatch) {
      // If we have a previous error, add it to the list
      if (currentError.length > 0) {
        formattedErrors.push(currentError.join("\n"));
        currentError = [];
      }

      // Extract file info for summary
      const filePath = errorMatch[1].split("(")[0];
      if (!errorsByFile.has(filePath)) {
        errorsByFile.set(filePath, 0);
      }
      errorsByFile.set(filePath, errorsByFile.get(filePath) + 1);

      // Start new error
      currentError.push(formatError(line));
    } else if (currentError.length > 0) {
      // This is a continuation of the current error
      currentError.push(`  ${colors.gray}${line}${colors.reset}`);
    } else if (line.match(/Found \d+ errors? in \d+ files?/)) {
      // Skip the summary line; no action needed for this line
    } else {
      // Standalone line
      formattedErrors.push(formatError(line));
    }
  }

  // Add the last error if exists
  if (currentError.length > 0) {
    formattedErrors.push(currentError.join("\n"));
  }

  return { formattedErrors, errorsByFile };
}

function createErrorSummaryTable(errorsByFile) {
  if (errorsByFile.size === 0) return "";

  const sortedFiles = Array.from(errorsByFile.entries()).sort(
    (a, b) => b[1] - a[1],
  ); // Sort by error count descending

  let table = `\n${colors.gray}${colors.bold}Errors  Files${colors.reset}\n`;

  for (const [file, count] of sortedFiles) {
    const paddedCount = String(count).padStart(6);
    table += `${colors.red}${paddedCount}${colors.reset}  ${colors.cyan}${file}${colors.reset}\n`;
  }

  return table;
}

function runTypeCheck() {
  const extraArgs = process.argv.slice(2);

  // Prefer local TypeScript binary when available
  const runnerArgs = ["-p", "tsconfig.json", "--noEmit", ...extraArgs];
  let execArgs = null;
  try {
    const tscBin = require.resolve("typescript/bin/tsc");
    execArgs = { cmd: process.execPath, args: [tscBin, ...runnerArgs] };
  } catch {
    // fallback to PATH tsc
    execArgs = {
      cmd: "tsc",
      args: ["-p", "tsconfig.json", "--noEmit", ...extraArgs],
    };
  }

  try {
    log(
      `🔍 ${colors.bold}Running TypeScript type check...${colors.reset} ${colors.gray}${extraArgs.join(" ")}${colors.reset}`.trim(),
      colors.blue,
    );

    const MAX_BUFFER_SIZE = 64 * 1024 * 1024; // 64MB

    execFileSync(execArgs.cmd, execArgs.args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: MAX_BUFFER_SIZE,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    log(
      `✅ ${colors.bold}TypeScript check passed${colors.reset} - no errors found!`,
      colors.green,
    );
    return { ok: true };
  } catch (error) {
    const errorOutput = (error && (error.stderr || error.stdout)) || "";

    // Filter out jellyseerr utils errors - this is a third-party git submodule
    // that generates a large volume of known type errors
    const filteredLines = errorOutput.split("\n").filter((line) => {
      const trimmedLine = line.trim();
      return trimmedLine && !trimmedLine.includes("utils/jellyseerr");
    });

    if (filteredLines.length > 0) {
      // Count TypeScript error occurrences (TS####)
      const remainingMatches = (
        filteredLines.join("\n").match(/\berror\s+TS\d+:/gi) || []
      ).length;

      // Parse errors and create formatted output with summary
      const { formattedErrors, errorsByFile } = parseErrorsAndCreateSummary(
        filteredLines.join("\n"),
      );

      // Enhanced error header
      log(
        `\n${colors.bg.red} ERROR ${colors.reset} ${colors.red}${colors.bold}TypeScript errors found:${colors.reset}`,
      );
      console.log();

      // Display errors with spacing between each error
      for (let i = 0; i < formattedErrors.length; i++) {
        console.log(formattedErrors[i]);

        // Add spacing between errors (but not after the last one)
        if (i < formattedErrors.length - 1) {
          console.log(); // Empty line between errors
        }
      }

      // Create and display summary table
      const summaryTable = createErrorSummaryTable(errorsByFile);
      if (summaryTable) {
        console.log(summaryTable);
      }

      // Clean summary - just the error count
      const errorIcon = "🚨";
      log(
        `${errorIcon} ${colors.red}${colors.bold}${remainingMatches} TypeScript error${remainingMatches !== 1 ? "s" : ""}${colors.reset}`,
        "",
      );

      return { ok: false };
    }

    log(
      `✅ ${colors.bold}TypeScript check passed${colors.reset} ${colors.gray}(jellyseerr utils errors ignored)${colors.reset}`,
      colors.green,
    );
    return { ok: true };
  }
}

// Enhanced header
console.log(`${colors.blue}${colors.bold}${border}${colors.reset}`);
console.log(`${colors.blue}${colors.bold}${centeredTitle}${colors.reset}`);
console.log(`${colors.blue}${colors.bold}${border}${colors.reset}`);
console.log();

// Main execution
const result = runTypeCheck();

console.log();
if (!result.ok) {
  log(
    `${colors.red}${colors.bold}🔥 Typecheck failed - please fix the errors above${colors.reset}`,
  );
  process.exitCode = 1;
} else {
  log(
    `${colors.green}${colors.bold}🎉 All checks passed! Ready to ship 🚀${colors.reset}`,
  );
}
