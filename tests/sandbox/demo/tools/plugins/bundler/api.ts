import type { BuildPhase, BundleOutput, BundlerCtx } from "./types";

export const createBundlerApi = (ctx: BundlerCtx) => ({
  /**
   * Run the asset bundling pipeline. Transitions phase from `"idle"` to
   * `"building"` to `"done"`, processes each configured entrypoint into a
   * hashed output path, and emits `bundle:start` then `bundle:complete`.
   * Called by the CLI build command or directly by consumers.
   *
   * @example
   * ```typescript
   * app.bundler.build();
   * app.bundler.getPhase(); // "done"
   * app.bundler.getOutputs(); // [{ name: "index.css", path: "assets/index-a1b2c3.css", size: 4200 }]
   * ```
   */
  build: () => {
    const entrypoints = ctx.config.entrypoints;
    ctx.state.phase = "building";
    ctx.emit("bundle:start", { entrypoints });

    const outputNames: string[] = [];
    for (const entry of entrypoints) {
      const ext = entry.split(".").pop() ?? "js";
      const name = entry.split(".")[0] ?? entry;
      const hash = crypto.randomUUID().slice(0, 8);
      const output: BundleOutput = {
        name: entry,
        path: `assets/${name}-${hash}.${ext}`,
        size: Math.floor(crypto.getRandomValues(new Uint16Array(1))[0]! % 50_000) + 1000
      };
      ctx.state.outputs.set(entry, output);
      outputNames.push(output.path);
    }

    ctx.state.phase = "done";
    ctx.state.buildCount += 1;
    ctx.emit("bundle:complete", { outputs: outputNames, elapsed: 42 });
  },

  /**
   * Look up a single bundle output by entrypoint name. Used to retrieve
   * hashed paths for HTML injection or manifest generation.
   *
   * @param {string} name - The original entrypoint name (e.g. `"index.css"`).
   * @returns {BundleOutput | undefined} The bundle output, or undefined if not yet built.
   */
  getOutput: (name: string): BundleOutput | undefined => {
    return ctx.state.outputs.get(name);
  },

  /**
   * Get all bundle outputs from the most recent build. Used by manifest
   * generation and deployment scripts.
   *
   * @returns {BundleOutput[]} Array of all bundle outputs.
   */
  getOutputs: (): BundleOutput[] => {
    return [...ctx.state.outputs.values()];
  },

  /**
   * Get the current build phase. Used to check whether a build is in
   * progress, completed, or has errored.
   *
   * @returns {BuildPhase} The current phase: `"idle"`, `"building"`, `"done"`, or `"error"`.
   */
  getPhase: (): BuildPhase => ctx.state.phase
});
