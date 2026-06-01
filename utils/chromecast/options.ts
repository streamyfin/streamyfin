/**
 * Chromecast player configuration and types
 */

export interface ChromecastSegmentData {
  intro: { start: number; end: number } | null;
  credits: { start: number; end: number } | null;
  recap: { start: number; end: number } | null;
  commercial: { start: number; end: number }[];
  preview: { start: number; end: number }[];
}
