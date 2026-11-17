/**
 * Whether casts go through the native remote player. Until every entry opens it (plan PR 9, which removes
 * this file), only a development build does, for the bench to try it on the real entries: with the gate
 * closed, JS gives native no server, so no remote engine is ever made and a release build keeps the one
 * sender it has today.
 */
export const remotePlayerRouted = (): boolean => __DEV__;
