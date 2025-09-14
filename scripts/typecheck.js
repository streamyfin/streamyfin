const { execSync } = require("node:child_process");
const process = require("node:process");

// ANSI color codes for better output
const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function runTypeCheck() {
  try {
    log("🔍 Running TypeScript type check...", colors.blue);

    execSync("tsc -p tsconfig.json --noEmit", {
      encoding: "utf8",
      stdio: "pipe",
    });

    log("✅ TypeScript check passed - no errors found!", colors.green);
    return true;
  } catch (error) {
    const errorOutput = error.stderr || error.stdout || "";

    // Filter out jellyseerr utils errors
    const filteredLines = errorOutput.split("\n").filter((line) => {
      const trimmedLine = line.trim();
      return trimmedLine && !trimmedLine.includes("utils/jellyseerr");
    });

    if (filteredLines.length > 0) {
      log("❌ TypeScript errors found:", colors.red + colors.bold);
      console.error(filteredLines.join("\n"));
      log(
        `\n📊 Found ${filteredLines.length} error(s) (excluding jellyseerr utils)`,
        colors.yellow,
      );
      return false;
    }

    log(
      "✅ TypeScript check passed (jellyseerr utils errors ignored)",
      colors.green,
    );
    return true;
  }
}

// Main execution
const success = runTypeCheck();

if (!success) {
  process.exit(1);
}
