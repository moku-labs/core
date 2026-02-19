/** Shared mock config factories */
export function createMockConfig(overrides?: Record<string, unknown>) {
  return { name: "test-framework", ...overrides };
}
