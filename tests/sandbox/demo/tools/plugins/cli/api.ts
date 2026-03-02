import type { CliCtx, CommandResult } from "./types";

export const createCliApi = (ctx: CliCtx) => ({
  /**
   * Register a custom command. Called by consumers to extend the CLI
   * with project-specific commands beyond the built-in `build` and
   * `version` commands.
   *
   * @param {string} name - The command name used for dispatch.
   * @param {string} description - Human-readable description for help text.
   * @param {(args: string[]) => string} handler - Function that executes the command and returns output.
   * @example
   * ```typescript
   * app.cli.register("deploy", "Deploy to production", (args) => {
   *   return `Deployed to ${args[0] ?? "staging"}`;
   * });
   * ```
   */
  register: (name: string, description: string, handler: (args: string[]) => string) => {
    ctx.state.commands.set(name, { name, description, handler });
  },

  /**
   * Dispatch a command by name. Emits `cli:run` before execution and
   * `cli:complete` after. Records the result in history. Returns the
   * command output string for immediate use.
   *
   * @param {string} name - The command name to dispatch.
   * @param {...string[]} args - Arguments passed to the command handler.
   * @returns {string} The output string from the command handler.
   * @example
   * ```typescript
   * const output = app.cli.run("build");
   * // "Built 2 articles, 2 bundles"
   * ```
   */
  run: (name: string, ...args: string[]): string => {
    const cmd = ctx.state.commands.get(name);
    if (!cmd) {
      const result: CommandResult = {
        command: name,
        args,
        output: `Unknown command: ${name}`,
        success: false
      };
      ctx.state.history.push(result);
      ctx.emit("cli:run", { command: name, args });
      ctx.emit("cli:complete", { command: name, success: false, elapsed: 0 });
      return result.output;
    }

    ctx.emit("cli:run", { command: name, args });

    let output: string;
    let success: boolean;
    try {
      output = cmd.handler(args);
      success = true;
    } catch (error) {
      output = `Error: ${(error as Error).message}`;
      success = false;
    }

    const result: CommandResult = { command: name, args, output, success };
    ctx.state.history.push(result);
    ctx.emit("cli:complete", { command: name, success, elapsed: 1 });
    return output;
  },

  /**
   * List all registered command names. Used by help display and
   * command completion.
   *
   * @returns {string[]} Array of registered command names.
   */
  getCommands: (): string[] => {
    return [...ctx.state.commands.keys()];
  },

  /**
   * Get the full execution history in chronological order. Used by
   * tests and diagnostics to verify command dispatch behavior.
   *
   * @returns {CommandResult[]} Array of command execution results.
   */
  getHistory: (): CommandResult[] => {
    return [...ctx.state.history];
  }
});
