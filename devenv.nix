{
  pkgs,
  lib,
  config,
  ...
}:
let
  # We need to use XCode's compile tools on Darwin
  # pkgs.stdenv includes clang from Nix and overrides clang from Xcode
  thisEnv = if pkgs.stdenv.isDarwin then pkgs.stdenvNoCC else pkgs.stdenv;
in
{
  devenv.warnOnNewVersion = false;

  name = "streamyfin";

  scripts = {

    build-android-phone = {
      description = "🚀 Build Android APK for phone / tablet";

      exec = # bash
        ''
          bun install --frozen-lockfile
          bun run submodule-reload
          bun run prebuild
          export EXPO_TV=0
          bun run build:android:local
        '';
    };

    build-android-tv = {
      description = "🚀 Build Android APK for TV";

      exec = # bash
        ''
          bun install --frozen-lockfile
          bun run submodule-reload
          bun run prebuild:tv
          export EXPO_TV=1
          bun run build:android:local
        '';
    };

    build-ios-phone-unsigned = {
      description = "🚀 Build Apple IPA for iOS / iPadOS";

      exec = # bash
        ''
          bun install --frozen-lockfile
          bun run submodule-reload
          bun run prebuild
          export EXPO_TV=0
          bun run ios:unsigned-build
        '';
    };

    build-ios-tv-unsigned = {
      description = "🚀 Build Apple IPA for tvOS";

      exec = # bash
        ''
          bun install --frozen-lockfile
          bun run submodule-reload
          bun run prebuild:tv
          export EXPO_TV=1
          bun run ios:unsigned-build
        '';
    };
  };

  # https://devenv.sh/packages/
  packages = [
    pkgs.cocoapods
    pkgs.biome
  ];

  android = {
    enable = true;
    buildTools.version = [ "35.0.0" ];
    ndk.enable = true;
    ndk.version = [ "27.1.12297006" ];
  };

  # https://devenv.sh/languages/
  languages = {
    java = {
      enable = true;
      jdk.package = pkgs.jdk17_headless;
      gradle.enable = true;
      lsp.enable = false;
    };

    javascript = {
      enable = true;
      bun.enable = true;
      bun.install.enable = true; # auto run `bun i` when entering the environment
      npm.enable = true;
      lsp.enable = false;
    };

    kotlin.enable = true;
    kotlin.lsp.enable = false;
  };

  stdenv = thisEnv;
  # See full reference at https://devenv.sh/reference/options/
}
