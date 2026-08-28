import {
  DeclineCategory,
  HARD_SOFT_MAP,
} from "../config/modelingConfig";

export type HardSoft = "hard" | "soft" | "unknown";

export function classifyDecline(
  declineCategory: DeclineCategory
): HardSoft {
  return HARD_SOFT_MAP[declineCategory];
}