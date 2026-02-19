import { describe, expect, test } from "vitest";

import { configVariants } from "../matrix";

describe("config combinations", () => {
  test.for(configVariants)("$label", combo => {
    // Placeholder: will test createCore/createApp with different config shapes
    expect(combo.label).toBeTruthy();
  });
});
