/** 生成流水线状态机（见方案 §8.5）。前端展示与数据库 status 共用这一份定义。 */

export const STAGES = [
  "planning",
  "building",
  "validating",
  "repairing",
] as const;

export type Stage = (typeof STAGES)[number];

export const PROJECT_STATUSES = [
  "intake",
  "planning",
  "awaiting_approval",
  "building",
  "validating",
  "repairing",
  "ready",
  "failed",
  "refining",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface PublicLogEntry {
  at: string; // ISO 时间
  stage: Stage;
  message: string;
  level: "info" | "warn" | "error";
}
