#!/usr/bin/env node
/**
 * Check for unused translation keys in en.json
 * Usage: bun run scripts/check-unused-translations.js [--remove]
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const TRANSLATION_FILE = path.join(__dirname, "../translations/en.json");
const REMOVE_UNUSED = process.argv.includes("--remove");

// Read translation file
const translations = JSON.parse(fs.readFileSync(TRANSLATION_FILE, "utf8"));

// Flatten nested keys
function flattenKeys(obj, prefix = "") {
  let keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      keys = keys.concat(flattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// Search for key usage in codebase
function isKeyUsed(key) {
  try {
    // Escape special regex characters in the key
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Search in TypeScript/TSX files
    const result = execSync(
      // `2>nul` is cmd-only; omitted so this stays cross-platform (it would
      // create a literal `nul` file on Unix). `|| echo ""` handles no-match.
      `git grep -l "${escapedKey}" -- "*.ts" "*.tsx" || echo ""`,
      {
        encoding: "utf8",
        cwd: path.join(__dirname, ".."),
        maxBuffer: 10 * 1024 * 1024,
      },
    ).trim();

    return result.length > 0;
  } catch (_error) {
    // If grep fails, assume key is used to be safe
    return true;
  }
}

// Remove nested key from object
function removeNestedKey(obj, keyPath) {
  const keys = keyPath.split(".");
  const lastKey = keys.pop();
  let current = obj;

  for (const key of keys) {
    if (!current[key]) return false;
    current = current[key];
  }

  if (current[lastKey] !== undefined) {
    delete current[lastKey];

    // Clean up empty parent objects
    if (Object.keys(current).length === 0 && keys.length > 0) {
      removeNestedKey(obj, keys.join("."));
    }
    return true;
  }
  return false;
}

console.log("🔍 Checking for unused translation keys...\n");

const allKeys = flattenKeys(translations);
const unusedKeys = [];

for (const key of allKeys) {
  if (!isKeyUsed(key)) {
    unusedKeys.push(key);
  }
}

if (unusedKeys.length === 0) {
  console.log("✅ All translation keys are being used!");
  process.exit(0);
}

console.log(`Found ${unusedKeys.length} unused translation keys:\n`);
for (const key of unusedKeys) {
  console.log(`  ❌ ${key}`);
}

if (REMOVE_UNUSED) {
  console.log("\n🗑️  Removing unused keys...");

  let removed = 0;
  for (const key of unusedKeys) {
    if (removeNestedKey(translations, key)) {
      removed++;
    }
  }

  // Write back to file
  fs.writeFileSync(
    TRANSLATION_FILE,
    `${JSON.stringify(translations, null, 2)}\n`,
    "utf8",
  );

  console.log(`✅ Removed ${removed} unused translation keys from en.json`);
} else {
  console.log("\n💡 Run with --remove flag to remove these keys from en.json");
  console.log(
    "   Example: bun run scripts/check-unused-translations.js --remove",
  );
}
