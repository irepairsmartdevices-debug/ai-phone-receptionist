import test from "node:test";
import assert from "node:assert/strict";
import { BusinessSchema } from "../src/contracts/repair";
import { fixtureBusiness } from "../src/repair/fixture";

test("repair catalog accepts legacy offerings and preserves explicit hierarchy metadata", () => {
  assert.equal(
    BusinessSchema.parse(fixtureBusiness).offerings[0].device,
    "Demo Phone",
  );
  const identity = {
    categoryId: "phones",
    category: "Phones",
    brandId: "apple",
    brand: "Apple",
    modelId: "iphone-14-pro",
    model: "iPhone 14 Pro",
    serviceId: "screen",
  };
  const catalog = BusinessSchema.parse({
    ...fixtureBusiness,
    offerings: [{ ...fixtureBusiness.offerings[0], ...identity }],
  });
  for (const [key, value] of Object.entries(identity))
    assert.equal((catalog.offerings[0] as Record<string, unknown>)[key], value);
  assert.equal(catalog.offerings[0].price, 99);
});
