import type { PluginCtx } from "../../../../../../src";

/**
 * Registered command definition.
 *
 * @example
 * ```typescript
 * { name: "build", description: "Run full build pipeline",
 *   handler: (args) => "Build complete" }
 * ```
 */
export type CommandDef = {
  /** Command name used for dispatch. */
  name: string;
  /** Human-readable description for help text. */
  description: string;
  /** Handler function that receives args and returns output. */
  handler: (args: string[]) => string;
};

/**
 * Result of a command execution.
 *
 * @example
 * ```typescript
 * { command: "build", args: [], output: "Build complete", success: true }
 * ```
 */
export type CommandResult = {
  /** Command name that was executed. */
  command: string;
  /** Arguments passed to the command. */
  args: string[];
  /** Output string from the handler. */
  output: string;
  /** Whether execution succeeded. */
  success: boolean;
};

/**
 * Events emitted by the CLI plugin.
 *
 * @example
 * ```typescript
 * hooks: ctx => ({
 *   "cli:run": ({ command, args }) => console.log(`Running ${command}`),
 *   "cli:complete": ({ command, success }) => console.log(`${command}: ${success}`),
 * })
 * ```
 */
export type CliEvents = {
  /** Emitted when a command is dispatched. */
  "cli:run": { command: string; args: string[] };
  /** Emitted when a command finishes execution. */
  "cli:complete": { command: string; success: boolean; elapsed: number };
};

/**
 * Internal mutable state for the CLI plugin.
 *
 * @example
 * ```typescript
 * { commands: Map { "build" => { ... } }, history: [{ command: "build", ... }] }
 * ```
 */
export type CliState = {
  /** Registered commands keyed by name. */
  commands: Map<string, CommandDef>;
  /** Execution history in chronological order. */
  history: CommandResult[];
};

export type CliCtx = PluginCtx<{ name: string }, CliState, CliEvents>;
