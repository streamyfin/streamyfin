import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";

const repoRoot = join(import.meta.dir, "..", "..");
const verifierPath = join(
  repoRoot,
  "tests",
  "maestro",
  "verify-ios-playback-artifacts.mjs",
);
const iosOpenPromptFixturePath = join(
  repoRoot,
  "tests",
  "maestro",
  "testdata",
  "ios-open-in-streamyfin-prompt.png",
);

function writePlaybackPng(
  path: string,
  kind:
    | "black"
    | "video"
    | "iosLauncher"
    | "androidLauncher"
    | "connectionScreen"
    | "detailScreen",
) {
  const width = 120;
  const height = 260;
  const image = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      image.data[offset] = 0;
      image.data[offset + 1] = 0;
      image.data[offset + 2] = 0;
      image.data[offset + 3] = 255;
    }
  }

  if (kind === "video") {
    for (let y = 70; y < 180; y += 1) {
      for (let x = 10; x < 110; x += 1) {
        const offset = (y * width + x) * 4;
        const value = 55 + ((x + y) % 80);
        image.data[offset] = value;
        image.data[offset + 1] = value;
        image.data[offset + 2] = value;
      }
    }
  } else if (kind === "iosLauncher") {
    for (let y = 110; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        image.data[offset] = 35;
        image.data[offset + 1] = 70;
        image.data[offset + 2] = 145;
      }
    }

    for (const [cx, cy, red, green, blue] of [
      [28, 178, 245, 55, 55],
      [60, 178, 35, 180, 85],
      [92, 178, 245, 190, 30],
      [28, 220, 65, 120, 245],
      [60, 220, 245, 70, 170],
      [92, 220, 35, 185, 245],
    ]) {
      for (let y = cy - 8; y <= cy + 8; y += 1) {
        for (let x = cx - 8; x <= cx + 8; x += 1) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > 64) continue;
          const offset = (y * width + x) * 4;
          image.data[offset] = red;
          image.data[offset + 1] = green;
          image.data[offset + 2] = blue;
        }
      }
    }

    for (let y = 238; y < 250; y += 1) {
      for (let x = 12; x < 108; x += 1) {
        const offset = (y * width + x) * 4;
        image.data[offset] = 245;
        image.data[offset + 1] = 245;
        image.data[offset + 2] = 245;
      }
    }
  } else if (kind === "androidLauncher") {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const shade = 28 + Math.floor((y / height) * 90);
        image.data[offset] = shade;
        image.data[offset + 1] = shade + 18;
        image.data[offset + 2] = shade + 38;
      }
    }

    for (const [cx, cy] of [
      [28, 178],
      [60, 178],
      [92, 178],
      [28, 218],
      [60, 218],
      [92, 218],
    ]) {
      for (let y = cy - 10; y <= cy + 10; y += 1) {
        for (let x = cx - 10; x <= cx + 10; x += 1) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > 100) continue;
          const offset = (y * width + x) * 4;
          image.data[offset] = 245;
          image.data[offset + 1] = 245;
          image.data[offset + 2] = 245;
        }
      }
    }

    for (let y = 238; y < 254; y += 1) {
      for (let x = 8; x < 112; x += 1) {
        const offset = (y * width + x) * 4;
        image.data[offset] = 245;
        image.data[offset + 1] = 245;
        image.data[offset + 2] = 245;
      }
    }
  } else if (kind === "connectionScreen") {
    for (let y = 52; y < 170; y += 1) {
      for (let x = 20; x < 100; x += 1) {
        const offset = (y * width + x) * 4;
        const shade = 42 + ((x + y) % 48);
        image.data[offset] = shade;
        image.data[offset + 1] = shade;
        image.data[offset + 2] = shade;
      }
    }

    for (const [xStart, yStart, xEnd, yEnd] of [
      [18, 66, 102, 90],
      [18, 102, 102, 126],
    ]) {
      for (let y = yStart; y < yEnd; y += 1) {
        for (let x = xStart; x < xEnd; x += 1) {
          const offset = (y * width + x) * 4;
          image.data[offset] = 104;
          image.data[offset + 1] = 47;
          image.data[offset + 2] = 171;
        }
      }
    }
  } else if (kind === "detailScreen") {
    for (let y = 64; y < 185; y += 1) {
      for (let x = 6; x < 114; x += 1) {
        const offset = (y * width + x) * 4;
        const shade = 70 + Math.floor(((y - 64) / 121) * 60);
        image.data[offset] = shade;
        image.data[offset + 1] = shade;
        image.data[offset + 2] = shade;
      }
    }

    for (let y = 176; y < 190; y += 1) {
      for (let x = 12; x < 108; x += 1) {
        const offset = (y * width + x) * 4;
        image.data[offset] = 145;
        image.data[offset + 1] = 145;
        image.data[offset + 2] = 145;
      }
    }

    for (let y = 226; y < 248; y += 1) {
      for (const x of [24, 96]) {
        const offset = (y * width + x) * 4;
        image.data[offset] = 160;
        image.data[offset + 1] = 50;
        image.data[offset + 2] = 235;
      }
    }
  } else {
    for (let y = 120; y < 126; y += 1) {
      for (let x = 45; x < 75; x += 1) {
        const offset = (y * width + x) * 4;
        image.data[offset] = 255;
        image.data[offset + 1] = 255;
        image.data[offset + 2] = 255;
      }
    }
  }

  writeFileSync(path, PNG.sync.write(image));
}

describe("iOS playback screenshot verifier", () => {
  test("rejects black or spinner-like screenshots", () => {
    const dir = mkdtempSync(join(tmpdir(), "streamyfin-ios-verifier-"));
    const blackPath = join(dir, "black.png");
    writePlaybackPng(blackPath, "black");

    const result = spawnSync(process.execPath, [verifierPath, blackPath], {
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
  });

  test("accepts screenshots with visible video content", () => {
    const dir = mkdtempSync(join(tmpdir(), "streamyfin-ios-verifier-"));
    const videoPath = join(dir, "video.png");
    writePlaybackPng(videoPath, "video");

    const result = spawnSync(process.execPath, [verifierPath, videoPath], {
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
  });

  test("rejects launcher screenshots even when they are not black", () => {
    const dir = mkdtempSync(join(tmpdir(), "streamyfin-ios-verifier-"));
    const launcherPath = join(dir, "launcher.png");
    writePlaybackPng(launcherPath, "iosLauncher");

    const result = spawnSync(process.execPath, [verifierPath, launcherPath], {
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
  });

  test("rejects Android launcher screenshots with bright home chrome", () => {
    const dir = mkdtempSync(join(tmpdir(), "streamyfin-ios-verifier-"));
    const launcherPath = join(dir, "android-launcher.png");
    writePlaybackPng(launcherPath, "androidLauncher");

    const result = spawnSync(process.execPath, [verifierPath, launcherPath], {
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
  });

  test("rejects Streamyfin connection screen screenshots", () => {
    const dir = mkdtempSync(join(tmpdir(), "streamyfin-ios-verifier-"));
    const connectionPath = join(dir, "connection-screen.png");
    writePlaybackPng(connectionPath, "connectionScreen");

    const result = spawnSync(process.execPath, [verifierPath, connectionPath], {
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
  });

  test("rejects movie detail screenshots with bottom navigation", () => {
    const dir = mkdtempSync(join(tmpdir(), "streamyfin-ios-verifier-"));
    const detailPath = join(dir, "detail-screen.png");
    writePlaybackPng(detailPath, "detailScreen");

    const result = spawnSync("node", [verifierPath, detailPath], {
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
  });

  test("rejects iOS open-app confirmation prompt screenshots", () => {
    const result = spawnSync(
      process.execPath,
      [verifierPath, iosOpenPromptFixturePath],
      {
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
  });
});
