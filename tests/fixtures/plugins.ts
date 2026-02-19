/** Shared mock plugin factories for integration and sandbox tests */
export function createMockPlugin(
  name: string,
  options?: {
    hasConfig?: boolean;
    hasApi?: boolean;
    asyncLifecycle?: boolean;
  }
) {
  return {
    name,
    hasConfig: options?.hasConfig ?? false,
    hasApi: options?.hasApi ?? false,
    asyncLifecycle: options?.asyncLifecycle ?? false
  };
}
