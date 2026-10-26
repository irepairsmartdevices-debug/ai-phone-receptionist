import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { HttpRepairService } from "../src/repair/http";
import { ConversationEngine } from "../src/conversation/engine";

test("connected receptionist sees changed prices, new model offerings and removals without restarting", async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(
    ["localhost", "127.0.0.1"].includes(url.hostname),
    "Dedicated local database required",
  );
  assert.notEqual(process.env.NODE_ENV, "production");
  url.pathname = "/repair_integration";
  const source = new Pool({ connectionString: url.href, max: 1 });
  const run = randomUUID();
  const category = "fresh-category-" + run,
    brand = "fresh-brand-" + run,
    model = "fresh-model-" + run,
    second = "fresh-second-" + run,
    repair = "fresh-repair-" + run,
    offering = "fresh-offering-" + run,
    newOffering = "fresh-new-offering-" + run;
  const brandName = "Fresh Brand " + run;
  const firstName = "FreshPhone Alpha " + run;
  const secondName = "FreshPhone Beta " + run;
  const service = new HttpRepairService(
    "http://localhost:3001",
    process.env.REPAIR_SERVICE_TOKEN!,
  );
  const engine = new ConversationEngine(service, "connected");
  const ask = (name: string) =>
    engine.turn(
      { step: "start" },
      `How much is screen repair for ${brandName} ${name}?`,
      { role: "customer" },
      run,
    );
  try {
    await source.query('INSERT INTO "Category"(id,name) VALUES($1,$2)', [
      category,
      "Fresh Phones " + run,
    ]);
    await source.query(
      'INSERT INTO "Brand"(id,name,"categoryId") VALUES($1,$2,$3)',
      [brand, brandName, category],
    );
    await source.query(
      'INSERT INTO "DeviceModel"(id,name,"brandId") VALUES($1,$2,$3)',
      [model, firstName, brand],
    );
    await source.query('INSERT INTO "RepairService"(id,name) VALUES($1,$2)', [
      repair,
      "Screen repair " + run,
    ]);
    await source.query(
      'INSERT INTO "Offering"(id,"modelId","serviceId",price,duration) VALUES($1,$2,$3,$4,60)',
      [offering, model, repair, 11100],
    );
    assert.match((await ask(firstName)).text, /\$111\.00/);

    await source.query('UPDATE "Offering" SET price=$2 WHERE id=$1', [
      offering,
      14375,
    ]);
    const changed = await ask(firstName);
    assert.match(changed.text, /\$143\.75/);
    assert.doesNotMatch(changed.text, /\$111\.00/);

    await source.query(
      'INSERT INTO "DeviceModel"(id,name,"brandId") VALUES($1,$2,$3)',
      [second, secondName, brand],
    );
    // A model without a configured repair price cannot produce an estimate.
    const beforePrice = await service.business();
    assert.ok(beforePrice.ok);
    assert.equal(
      beforePrice.value.offerings.some((o) => o.modelId === second),
      false,
    );
    await source.query(
      'INSERT INTO "Offering"(id,"modelId","serviceId",price,duration) VALUES($1,$2,$3,$4,60)',
      [newOffering, second, repair, 20700],
    );
    assert.match((await ask(secondName)).text, /\$207\.00/);

    await source.query('DELETE FROM "Offering" WHERE id=$1', [newOffering]);
    const removed = await ask(secondName);
    assert.doesNotMatch(removed.text, /\$207\.00/);
    assert.match(removed.text, /callback|not have|unavailable/i);
  } finally {
    await source.query('DELETE FROM "Offering" WHERE id=ANY($1::text[])', [
      [offering, newOffering],
    ]);
    await source.query('DELETE FROM "DeviceModel" WHERE id=ANY($1::text[])', [
      [model, second],
    ]);
    await source.query('DELETE FROM "RepairService" WHERE id=$1', [repair]);
    await source.query('DELETE FROM "Brand" WHERE id=$1', [brand]);
    await source.query('DELETE FROM "Category" WHERE id=$1', [category]);
    await source.end();
  }
});
