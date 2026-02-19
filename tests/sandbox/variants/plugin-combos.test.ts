import { describe, expect, test } from "vitest";

import { pluginVariants } from "../matrix";

describe("plugin combinations", () => {
  test.for(pluginVariants)("$label", combo => {
    // Placeholder: will test createCore/createApp with different plugin arrangements
    expect(combo.label).toBeTruthy();
  });
});
