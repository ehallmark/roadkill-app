import { SightingStatus } from "../config/firebase";

const DEAD_KEYWORDS = [
  "dead", "roadkill", "road kill", "killed", "hit", "deceased",
  "carcass", "flattened", "squished", "ran over", "run over",
];

const LIVE_KEYWORDS = [
  "live", "alive", "living", "flying", "spotted", "running",
  "walking", "swimming", "sitting", "perched",
];

/**
 * Parses a voice transcript or text input to detect live/dead status.
 * Returns the detected status and the cleaned animal name (keywords stripped).
 */
export function parseStatus(input: string): {
  status: SightingStatus;
  cleanedAnimal: string;
} {
  const lower = input.toLowerCase().trim();

  let detectedStatus: SightingStatus = "live";
  let matchedKeyword = "";

  // Check dead keywords first (higher priority — "dead deer" should be dead)
  for (const kw of DEAD_KEYWORDS) {
    if (lower.includes(kw)) {
      detectedStatus = "dead";
      matchedKeyword = kw;
      break;
    }
  }

  // Only check live keywords if no dead keyword was found
  if (!matchedKeyword) {
    for (const kw of LIVE_KEYWORDS) {
      if (lower.includes(kw)) {
        detectedStatus = "live";
        matchedKeyword = kw;
        break;
      }
    }
  }

  // Strip the matched keyword from the animal name
  let cleaned = input.trim();
  if (matchedKeyword) {
    const regex = new RegExp(`\\b${matchedKeyword}\\b`, "gi");
    cleaned = cleaned.replace(regex, "").replace(/\s+/g, " ").trim();
  }

  return { status: detectedStatus, cleanedAnimal: cleaned };
}
