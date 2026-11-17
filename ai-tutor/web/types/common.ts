// Shared types used across multiple contexts

/**
 * Generic log entry used by Solver, Question, Research contexts
 */
export interface LogEntry {
  type: string;
  content: string;
  timestamp?: number;
  level?: string;
}

/**
 * Generic agent status mapping
 */
export interface AgentStatus {
  [key: string]: "pending" | "running" | "done" | "error";
}

/**
 * Token usage statistics
 */
export interface TokenStats {
  model: string;
  calls: number;
  tokens: number;
  input_tokens: number;
  output_tokens: number;
  cost: number;
}

/**
 * UI theme type
 */
export type Theme = "light" | "dark";

import type { AppLanguage } from "@/i18n/init";

/**
 * Supported UI languages (kept in sync with i18n resources)
 */
export type Language = AppLanguage;

/**
 * UI Settings
 */
export interface UISettings {
  theme: Theme;
  language: Language;
}
