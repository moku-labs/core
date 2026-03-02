import type { CliState } from "./types";

/**
 * Create the initial CLI state. Commands map starts empty — built-in
 * commands (`build`, `version`) are registered during `onInit`. History
 * starts empty and grows with each `run()` call.
 *
 * @returns {CliState} A fresh CLI state object.
 */
export const createCliState = (): CliState => ({
  commands: new Map(),
  history: []
});
