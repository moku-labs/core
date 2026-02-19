import { expectTypeOf, test } from "vitest";

test("type infrastructure works", () => {
  expectTypeOf<string>().toBeString();
  expectTypeOf<number>().not.toBeString();
});
