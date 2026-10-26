import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/persistence/db";
import {
  getStoreDirections,
  updateStoreDirections,
  StoreDirectionsConflict,
} from "../src/persistence/store-directions";
import {
  resolveStores,
  renderDirections,
} from "../src/conversation/directions";
const dallas = {
  id: "dallas",
  name: "Dallas",
  address: "",
  landmarks: "Across from RedBird Mall, in the same complex as Hair Depot.",
};
test("store directions default to owner landmarks, persist edits, reject stale writes and preserve saved empty list", async () => {
  const prior = await db.query(
    "SELECT value FROM settings WHERE key='store-directions'",
  );
  try {
    await db.query("DELETE FROM settings WHERE key='store-directions'");
    const initial = await getStoreDirections();
    assert.equal(initial.revision, 0);
    assert.deepEqual(initial.locations, [dallas]);
    const saved = await updateStoreDirections(0, [
      { ...dallas, address: "123 Test Street, Suite 4, Dallas, TX 75201" },
    ]);
    assert.equal(saved.revision, 1);
    assert.equal(
      (await getStoreDirections()).locations[0].address,
      "123 Test Street, Suite 4, Dallas, TX 75201",
    );
    await assert.rejects(
      () => updateStoreDirections(0, [dallas]),
      StoreDirectionsConflict,
    );
    const empty = await updateStoreDirections(1, []);
    assert.equal(empty.revision, 2);
    assert.deepEqual((await getStoreDirections()).locations, []);
    await assert.rejects(
      () => updateStoreDirections(2, [dallas, { ...dallas, id: "duplicate" }]),
      /unique|duplicate/i,
    );
  } finally {
    if (prior.rows[0])
      await db.query(
        "INSERT INTO settings(key,value) VALUES('store-directions',$1) ON CONFLICT(key) DO UPDATE SET value=$1",
        [JSON.stringify(prior.rows[0].value)],
      );
    else await db.query("DELETE FROM settings WHERE key='store-directions'");
  }
});
test("directions render only saved facts and never invent an address or route", () => {
  const missing = renderDirections(dallas);
  assert.match(missing, /RedBird Mall/);
  assert.match(missing, /Hair Depot/);
  assert.match(missing, /don.t have a confirmed street address/i);
  assert.doesNotMatch(missing, /google\.com|minutes|turn left/i);
  const ready = renderDirections({
    ...dallas,
    address: "123 Test Street, Dallas, TX 75201",
  });
  assert.match(ready, /123 Test Street/);
  assert.match(ready, /https:\/\/www.google.com\/maps\/dir\//);
  const link = ready.match(/https:\/\/\S+/)![0];
  assert.equal(
    new URL(link).searchParams.get("destination"),
    "123 Test Street, Dallas, TX 75201",
  );
});
test("linked source address updates remain authoritative and manual landmarks survive", () => {
  const source = [
    {
      id: "live-dallas",
      name: "Dallas",
      address: "Current Dallas address",
      hours: "9–5",
      timeZone: "America/Chicago",
    },
  ];
  const linked = {
    ...dallas,
    address: "Old manual address",
    sourceLocationId: "live-dallas",
  };
  const stores = resolveStores(source, [linked], "connected");
  assert.equal(stores.length, 1);
  assert.equal(stores[0].id, "dallas");
  assert.equal(stores[0].address, "Current Dallas address");
  assert.match(stores[0].landmarks, /Hair Depot/);
  assert.equal(
    resolveStores(
      [{ ...source[0], address: "New source address" }],
      [linked],
      "connected",
    )[0].address,
    "New source address",
  );
  assert.deepEqual(resolveStores(source, [dallas], "fixture"), [dallas]);
  assert.deepEqual(resolveStores(source, [], "fixture"), []);
  assert.equal(resolveStores(source, [dallas], "connected").length, 1);
});

test("a cleared or unavailable linked source address never falls back to an old copied address", () => {
  const guide = {
    ...dallas,
    address: "Old copied street address",
    sourceLocationId: "source-dallas",
  };
  const source = [
    {
      id: "source-dallas",
      name: "Dallas",
      address: "",
      hours: "9-5",
      timeZone: "America/Chicago",
    },
  ];
  const cleared = resolveStores(source, [guide], "connected")[0];
  assert.equal(cleared.address, "");
  assert.doesNotMatch(renderDirections(cleared), /Old copied|google\.com/);
  const offline = resolveStores([], [guide], "connected")[0];
  assert.equal(offline.address, "");
  assert.match(renderDirections(offline), /Hair Depot/);
});
