import { beforeAll, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const build = resolve(root, "../../.expo/native-remux/media-tests");
const cmake =
  process.env.CMAKE ??
  Bun.which("cmake") ??
  `${process.env.HOME}/Library/Android/sdk/cmake/3.22.1/bin/cmake`;
const inputs = [0, 1, 2].map((index) => join(build, `source-${index}.mp4`));
const executable = join(build, "apple-remux");
const common = join(build, "packet_muxer_test");

function run(command: string[], success = true) {
  const result = Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe" });
  if (success && result.exitCode !== 0) {
    throw new Error(
      `${command.join(" ")}\n${result.stderr.toString()}\n${result.stdout.toString()}`,
    );
  }
  return result;
}

type Packet = {
  stream_index: number;
  pos: string;
  size: string;
  pts_time: string;
  duration_time: string;
  flags: string;
  data_hash: string;
};
type Stream = {
  index: number;
  codec_name: string;
  codec_type: string;
  sample_rate: string;
  channels: number;
  width: number;
  height: number;
  extradata: string;
  disposition: { default: number };
  tags: { title: string; language: string };
};
type Probe = {
  packets: Packet[];
  streams: Stream[];
  format: { duration: string };
};

function probe(path: string): Probe {
  return JSON.parse(
    run([
      "ffprobe",
      "-v",
      "error",
      "-show_streams",
      "-show_packets",
      "-show_format",
      "-show_data_hash",
      "sha256",
      "-show_data",
      "-of",
      "json",
      path,
    ]).stdout.toString(),
  );
}

function extradata(hexDump: string) {
  return hexDump
    .trim()
    .split("\n")
    .map((line) => line.split(":")[1].trim().split("  ")[0].replaceAll(" ", ""))
    .join("");
}

let sources: Probe[];

const buildFixtures = () => {
  mkdirSync(build, { recursive: true });
  run([
    cmake,
    "-S",
    join(root, "remux"),
    "-B",
    build,
    "-DSTREAMYFIN_REMUX_TESTS=ON",
  ]);
  run([cmake, "--build", build, "-j", "6"]);
  inputs.forEach((path, index) => {
    run([
      "ffmpeg",
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc2=size=${index === 0 ? "320x180" : "32x32"}:rate=25`,
      ...(index === 1 ? ["-itsoffset", "0.25"] : []),
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${440 + index * 330}:sample_rate=${index === 2 ? 44100 : 48000}`,
      "-t",
      "4",
      "-c:v",
      "libx264",
      "-profile:v",
      "baseline",
      "-bf",
      "0",
      "-g",
      "25",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-profile:a",
      "aac_low",
      "-ac",
      index === 2 ? "1" : "2",
      "-movflags",
      "+faststart",
      path,
    ]);
  });
  sources = inputs.map(probe);
  if (process.platform === "darwin") {
    const bridge = join(build, "bridge.o");
    run([
      "xcrun",
      "clang++",
      "-std=c++17",
      "-fobjc-arc",
      "-fmodules",
      "-Wno-deprecated-declarations",
      "-c",
      join(root, "ios/DownloadRemuxerBridge.mm"),
      "-o",
      bridge,
    ]);
    run([
      "xcrun",
      "swiftc",
      "-parse-as-library",
      "-import-objc-header",
      join(root, "ios/DownloadRemuxerBridge.h"),
      join(root, "ios/DownloadRemuxer.swift"),
      join(import.meta.dir, "remux-main.swift"),
      bridge,
      join(build, "libstreamyfin_packet_muxer.a"),
      join(build, "libstreamyfin_webm.a"),
      "-Xlinker",
      "-lc++",
      "-framework",
      "AVFoundation",
      "-framework",
      "AudioToolbox",
      "-framework",
      "CoreMedia",
      "-o",
      executable,
    ]);
  }
};

function verifyOutput(output: string, titles: string[]) {
  const result = probe(output);
  expect(result.streams.map((stream) => stream.codec_name)).toEqual([
    "h264",
    "aac",
    "aac",
    "aac",
  ]);
  expect(result.streams.slice(1).map((stream) => stream.tags.title)).toEqual(
    titles,
  );
  expect(result.streams.slice(1).map((stream) => stream.tags.language)).toEqual(
    ["eng", "fra", "jpn"],
  );
  expect(
    result.streams.slice(1).map((stream) => stream.disposition.default),
  ).toEqual([1, 0, 0]);
  expect(result.streams.slice(1).map((stream) => stream.channels)).toEqual(
    sources.map((source) => source.streams[1].channels),
  );
  expect(Number(result.format.duration)).toBeGreaterThanOrEqual(4);
  expect(Number(result.format.duration)).toBeLessThan(4.1);
  let sharedShift: number | undefined;
  for (let track = 0; track < 4; track++) {
    const input = sources[track < 2 ? 0 : track - 1];
    const sourcePackets = input.packets.filter(
      (packet) => packet.stream_index === (track === 0 ? 0 : 1),
    );
    const outputPackets = result.packets.filter(
      (packet) => packet.stream_index === track,
    );
    expect(outputPackets.map((packet) => packet.data_hash)).toEqual(
      sourcePackets.map((packet) => packet.data_hash),
    );
    const shift =
      Number(outputPackets[0].pts_time) - Number(sourcePackets[0].pts_time);
    sharedShift ??= shift;
    expect(Math.abs(shift - sharedShift)).toBeLessThan(0.000003);
    for (let index = 0; index < sourcePackets.length; index++) {
      expect(
        Math.abs(
          Number(outputPackets[index].pts_time) -
            Number(sourcePackets[index].pts_time) -
            shift,
        ),
      ).toBeLessThan(0.000003);
    }
  }
  const bytes = readFileSync(output);
  expect(bytes.includes(Buffer.from("matroska"))).toBe(true);
  expect(bytes.includes(Buffer.from([0x1c, 0x53, 0xbb, 0x6b]))).toBe(true);
  const seek = run([
    "ffprobe",
    "-v",
    "error",
    "-read_intervals",
    "2%+0.5",
    "-select_streams",
    "v:0",
    "-show_packets",
    "-of",
    "json",
    output,
  ]);
  const packets: Packet[] = JSON.parse(seek.stdout.toString()).packets;
  expect(packets.length).toBeGreaterThan(0);
  expect(Number(packets[0].pts_time)).toBeGreaterThan(0.9);
  run(["ffmpeg", "-v", "error", "-i", output, "-map", "0", "-f", "null", "-"]);
}

describe.skipIf(process.env.STREAMYFIN_NATIVE_MEDIA_TESTS !== "1")(
  "packet-copy Matroska media",
  () => {
    beforeAll(buildFixtures, 180_000);
    test("shared muxer preserves exact packets, metadata, sync and seekability", () => {
      const video = sources[0].streams[0];
      const lines = [
        `${extradata(video.extradata)} ${video.width} ${video.height} 3`,
      ];
      sources.forEach((source, index) => {
        const audio = source.streams[1];
        lines.push(
          `${inputs[index]} ${extradata(audio.extradata)} ${audio.sample_rate} ${audio.channels} ${["eng", "fra", "jpn"][index]}`,
        );
      });
      const packets = sources
        .flatMap((source, file) =>
          source.packets
            .filter((packet) => file === 0 || packet.stream_index === 1)
            .map((packet) => ({
              packet,
              file,
              track: packet.stream_index === 0 ? 0 : file + 1,
            })),
        )
        .sort((a, b) => Number(a.packet.pts_time) - Number(b.packet.pts_time));
      const origin = Math.min(
        0,
        ...packets.map(({ packet }) => Number(packet.pts_time)),
      );
      for (const { packet, file, track } of packets) {
        lines.push(
          `${track} ${file} ${packet.pos} ${packet.size} ${Math.round((Number(packet.pts_time) - origin) * 1e9)} ${Math.round(Number(packet.duration_time) * 1e9)} ${packet.flags.includes("K") ? 1 : 0}`,
        );
      }
      const manifest = join(build, "packets.txt");
      writeFileSync(manifest, `${lines.join("\n")}\n`);
      const output = join(build, "shared.mkv");
      rmSync(output, { force: true });
      run([common, manifest, output]);
      verifyOutput(output, ["Audio 0", "Audio 1", "Audio 2"]);
      for (const [name, badAsc] of [
        ["channel-mismatch", "1188"],
        ["he-aac", "119056e580"],
      ]) {
        const invalid = [...lines];
        const fields = invalid[1].split(" ");
        fields[1] = badAsc;
        invalid[1] = fields.join(" ");
        const path = join(build, `invalid-${name}.txt`);
        const destination = join(build, `invalid-${name}.mkv`);
        rmSync(destination, { force: true });
        writeFileSync(path, `${invalid.join("\n")}\n`);
        expect(run([common, path, destination], false).exitCode).not.toBe(0);
        expect(existsSync(destination)).toBe(false);
      }
      const invalid = [...lines];
      const packet = invalid[4].split(" ");
      packet[4] = "-1";
      invalid[4] = packet.join(" ");
      const badTiming = join(build, "invalid-timing.txt");
      const badOutput = join(build, "invalid-timing.mkv");
      rmSync(badOutput, { force: true });
      writeFileSync(badTiming, `${invalid.join("\n")}\n`);
      expect(run([common, badTiming, badOutput], false).exitCode).not.toBe(0);
      expect(existsSync(badOutput)).toBe(false);
      const existing = join(build, "shared-existing.mkv");
      writeFileSync(existing, "untouched");
      expect(run([common, manifest, existing], false).exitCode).not.toBe(0);
      expect(readFileSync(existing, "utf8")).toBe("untouched");
    });

    test.skipIf(process.platform !== "darwin")(
      "Apple compressed reader uses the shared writer without decoding",
      () => {
        const output = join(build, "apple.mkv");
        rmSync(output, { force: true });
        run([executable, "normal", output, ...inputs]);
        verifyOutput(output, ["Primary 🎧", "French", "Japanese"]);
      },
    );

    test.skipIf(process.platform !== "darwin")(
      "single-source remux preserves mono or stereo primary audio",
      () => {
        for (const index of [0, 2]) {
          const output = join(build, `primary-only-${index}.mkv`);
          rmSync(output, { force: true });
          run([executable, "normal", output, inputs[index]]);
          const result = probe(output);
          expect(result.streams.map((stream) => stream.codec_name)).toEqual([
            "h264",
            "aac",
          ]);
          expect(result.streams[1].disposition.default).toBe(1);
          expect(result.streams[1].channels).toBe(
            sources[index].streams[1].channels,
          );
          expect(
            result.packets.map((packet) => packet.data_hash).sort(),
          ).toEqual(
            sources[index].packets.map((packet) => packet.data_hash).sort(),
          );
        }
      },
    );

    test.skipIf(process.platform !== "darwin")(
      "cancellation deletes partial output; metadata mismatch rejects inputs",
      () => {
        for (const mode of ["cancel", "metadata"]) {
          const output = join(build, `${mode}.mkv`);
          rmSync(output, { force: true });
          const result = run([executable, mode, output, ...inputs], false);
          expect(result.exitCode).not.toBe(0);
          expect(result.stderr.toString()).toContain(
            mode === "cancel" ? "Code=2" : "Invalid remux audio metadata",
          );
          expect(existsSync(output)).toBe(false);
        }
      },
    );

    test.skipIf(process.platform !== "darwin")(
      "rejects unsupported codecs, ambiguous tracks and truncated media",
      () => {
        const cases: { name: string; args: string[]; error: string }[] = [
          {
            name: "high-profile",
            args: [
              "-c:v",
              "libx264",
              "-profile:v",
              "high",
              "-bf",
              "2",
              "-c:a",
              "copy",
            ],
            error: "Baseline",
          },
          {
            name: "surround-aac",
            args: ["-c:v", "copy", "-c:a", "aac", "-ac", "6"],
            error: "mono/stereo",
          },
          {
            name: "two-audio",
            args: ["-map", "0:v", "-map", "0:a", "-map", "0:a", "-c", "copy"],
            error: "one video and one audio",
          },
          {
            name: "missing-audio",
            args: ["-map", "0:v", "-c", "copy"],
            error: "one video and one audio",
          },
        ];
        for (const fixture of cases) {
          const input = join(build, `${fixture.name}.mp4`);
          run([
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            inputs[0],
            ...fixture.args,
            input,
          ]);
          const output = join(build, `${fixture.name}.mkv`);
          rmSync(output, { force: true });
          const result = run([executable, "normal", output, input], false);
          expect(result.exitCode).not.toBe(0);
          expect(result.stderr.toString()).toContain(fixture.error);
          expect(existsSync(output)).toBe(false);
        }
        const truncated = join(build, "truncated.mp4");
        const bytes = readFileSync(inputs[0]);
        writeFileSync(truncated, bytes.subarray(0, bytes.length / 2));
        const output = join(build, "truncated.mkv");
        rmSync(output, { force: true });
        expect(
          run([executable, "normal", output, truncated], false).exitCode,
        ).not.toBe(0);
        expect(existsSync(output)).toBe(false);
      },
    );

    test.skipIf(process.platform !== "darwin")(
      "never clobbers inputs or preexisting output",
      () => {
        const output = join(build, "existing.mkv");
        writeFileSync(output, "previous download");
        expect(
          run([executable, "normal", output, ...inputs], false).exitCode,
        ).not.toBe(0);
        expect(readFileSync(output, "utf8")).toBe("previous download");
        const original = readFileSync(inputs[0]);
        expect(
          run([executable, "normal", inputs[0], ...inputs], false).exitCode,
        ).not.toBe(0);
        expect(readFileSync(inputs[0])).toEqual(original);
      },
    );
  },
);
