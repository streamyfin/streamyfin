#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

const MIN_VIDEO_CONTENT_RATIO = 0.12;
const MAX_LAUNCHER_LOWER_SATURATION_RATIO = 0.18;
const MAX_LAUNCHER_LOWER_BRIGHT_RATIO = 0.14;
const MAX_IOS_OPEN_PROMPT_RATIO = 0.22;
const MAX_STREAMYFIN_CONNECTION_CHROME_RATIO = 0.015;
const MAX_DETAIL_SCREEN_BOTTOM_NAV_PURPLE_RATIO = 0.006;

function analyzePlaybackScreenshot(path) {
  const image = PNG.sync.read(readFileSync(path));
  const xStart = Math.floor(image.width * 0.05);
  const xEnd = Math.floor(image.width * 0.95);
  const yStart = Math.floor(image.height * 0.25);
  const yEnd = Math.floor(image.height * 0.72);

  let total = 0;
  let videoContent = 0;
  let black = 0;
  let whiteControls = 0;
  let lowerTotal = 0;
  let lowerSaturated = 0;
  let lowerBright = 0;
  let promptTotal = 0;
  let promptBright = 0;
  let appChromeTotal = 0;
  let streamyfinPurple = 0;
  let bottomNavTotal = 0;
  let bottomNavPurple = 0;
  const launcherYStart = Math.floor(image.height * 0.55);
  const promptXStart = Math.floor(image.width * 0.14);
  const promptXEnd = Math.floor(image.width * 0.86);
  const promptYStart = Math.floor(image.height * 0.42);
  const promptYEnd = Math.floor(image.height * 0.62);
  const appChromeYStart = Math.floor(image.height * 0.2);
  const appChromeYEnd = Math.floor(image.height * 0.68);
  const bottomNavYStart = Math.floor(image.height * 0.82);
  const bottomNavYEnd = Math.floor(image.height * 0.98);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * image.width + x) * 4;
      const alpha = image.data[offset + 3];
      if (alpha < 10) continue;

      const red = image.data[offset];
      const green = image.data[offset + 1];
      const blue = image.data[offset + 2];
      const luminance = (red + green + blue) / 3;
      const maxChannel = Math.max(red, green, blue);
      const minChannel = Math.min(red, green, blue);

      if (y >= launcherYStart) {
        lowerTotal += 1;
        if (maxChannel - minChannel > 70 && maxChannel > 120) {
          lowerSaturated += 1;
        }
        if (luminance > 220) {
          lowerBright += 1;
        }
      }

      if (
        x >= promptXStart &&
        x < promptXEnd &&
        y >= promptYStart &&
        y < promptYEnd
      ) {
        promptTotal += 1;
        if (luminance > 185 && maxChannel - minChannel < 80) {
          promptBright += 1;
        }
      }

      if (y >= appChromeYStart && y < appChromeYEnd) {
        appChromeTotal += 1;
        if (
          red >= 65 &&
          red <= 180 &&
          green <= 95 &&
          blue >= 115 &&
          blue <= 235 &&
          blue - green >= 55 &&
          red - green >= 20
        ) {
          streamyfinPurple += 1;
        }
      }

      if (y >= bottomNavYStart && y < bottomNavYEnd) {
        bottomNavTotal += 1;
        if (
          red >= 100 &&
          red <= 210 &&
          green <= 80 &&
          blue >= 150 &&
          blue <= 255 &&
          blue - green >= 80 &&
          red - green >= 50
        ) {
          bottomNavPurple += 1;
        }
      }

      if (y < yStart || y >= yEnd) {
        continue;
      }

      total += 1;

      if (luminance < 12) {
        black += 1;
      } else if (luminance > 210 && maxChannel - minChannel < 40) {
        whiteControls += 1;
      } else {
        videoContent += 1;
      }
    }
  }

  const videoContentRatio = total === 0 ? 0 : videoContent / total;
  const blackRatio = total === 0 ? 0 : black / total;
  const lowerSaturationRatio =
    lowerTotal === 0 ? 0 : lowerSaturated / lowerTotal;
  const lowerBrightRatio = lowerTotal === 0 ? 0 : lowerBright / lowerTotal;
  const iosOpenPromptRatio = promptTotal === 0 ? 0 : promptBright / promptTotal;
  const streamyfinConnectionChromeRatio =
    appChromeTotal === 0 ? 0 : streamyfinPurple / appChromeTotal;
  const detailScreenBottomNavPurpleRatio =
    bottomNavTotal === 0 ? 0 : bottomNavPurple / bottomNavTotal;

  return {
    path,
    total,
    videoContent,
    black,
    whiteControls,
    videoContentRatio,
    blackRatio,
    lowerSaturationRatio,
    lowerBrightRatio,
    iosOpenPromptRatio,
    streamyfinConnectionChromeRatio,
    detailScreenBottomNavPurpleRatio,
  };
}

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("usage: verify-ios-playback-artifacts.mjs <screenshot.png>...");
  process.exit(2);
}

let failed = false;

for (const path of paths) {
  const result = analyzePlaybackScreenshot(path);
  const ratio = result.videoContentRatio.toFixed(4);
  const blackRatio = result.blackRatio.toFixed(4);
  const lowerSaturationRatio = result.lowerSaturationRatio.toFixed(4);
  const lowerBrightRatio = result.lowerBrightRatio.toFixed(4);
  const iosOpenPromptRatio = result.iosOpenPromptRatio.toFixed(4);
  const streamyfinConnectionChromeRatio =
    result.streamyfinConnectionChromeRatio.toFixed(4);
  const detailScreenBottomNavPurpleRatio =
    result.detailScreenBottomNavPurpleRatio.toFixed(4);
  console.log(
    `${path}: videoContentRatio=${ratio} blackRatio=${blackRatio} lowerSaturationRatio=${lowerSaturationRatio} lowerBrightRatio=${lowerBrightRatio} iosOpenPromptRatio=${iosOpenPromptRatio} streamyfinConnectionChromeRatio=${streamyfinConnectionChromeRatio} detailScreenBottomNavPurpleRatio=${detailScreenBottomNavPurpleRatio} videoContent=${result.videoContent}`,
  );

  if (result.videoContentRatio < MIN_VIDEO_CONTENT_RATIO) {
    failed = true;
    console.error(
      `${path}: looks black or stuck before video rendered; videoContentRatio ${ratio} < ${MIN_VIDEO_CONTENT_RATIO}`,
    );
  }

  if (result.lowerSaturationRatio > MAX_LAUNCHER_LOWER_SATURATION_RATIO) {
    failed = true;
    console.error(
      `${path}: looks like a launcher or home screen; lowerSaturationRatio ${lowerSaturationRatio} > ${MAX_LAUNCHER_LOWER_SATURATION_RATIO}`,
    );
  }

  if (result.lowerBrightRatio > MAX_LAUNCHER_LOWER_BRIGHT_RATIO) {
    failed = true;
    console.error(
      `${path}: looks like a launcher or home screen; lowerBrightRatio ${lowerBrightRatio} > ${MAX_LAUNCHER_LOWER_BRIGHT_RATIO}`,
    );
  }

  if (result.iosOpenPromptRatio > MAX_IOS_OPEN_PROMPT_RATIO) {
    failed = true;
    console.error(
      `${path}: looks like an iOS open-app confirmation prompt; iosOpenPromptRatio ${iosOpenPromptRatio} > ${MAX_IOS_OPEN_PROMPT_RATIO}`,
    );
  }

  if (
    result.streamyfinConnectionChromeRatio >
    MAX_STREAMYFIN_CONNECTION_CHROME_RATIO
  ) {
    failed = true;
    console.error(
      `${path}: looks like the Streamyfin connection screen, not playback; streamyfinConnectionChromeRatio ${streamyfinConnectionChromeRatio} > ${MAX_STREAMYFIN_CONNECTION_CHROME_RATIO}`,
    );
  }

  if (
    result.detailScreenBottomNavPurpleRatio >
    MAX_DETAIL_SCREEN_BOTTOM_NAV_PURPLE_RATIO
  ) {
    failed = true;
    console.error(
      `${path}: looks like the Streamyfin detail screen, not playback; detailScreenBottomNavPurpleRatio ${detailScreenBottomNavPurpleRatio} > ${MAX_DETAIL_SCREEN_BOTTOM_NAV_PURPLE_RATIO}`,
    );
  }
}

if (failed) {
  process.exit(1);
}
