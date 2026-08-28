import assert from "node:assert/strict";
import test from "node:test";
import { distanceKm, parseDistanceKm } from "../src/lib/distance.ts";

test("distanceKm returns zero for the same school", () => {
  assert.equal(distanceKm({ lat: 37.5665, lng: 126.978 }, { lat: 37.5665, lng: 126.978 }), 0);
});

test("distanceKm calculates a realistic Seoul distance", () => {
  const distance = distanceKm(
    { lat: 37.5665, lng: 126.978 },
    { lat: 37.5512, lng: 126.9882 },
  );
  assert.ok(distance > 1.8 && distance < 2.1);
});

test("parseDistanceKm only accepts supported radii", () => {
  assert.equal(parseDistanceKm("20"), 20);
  assert.equal(parseDistanceKm("999"), 10);
  assert.equal(parseDistanceKm(undefined), 10);
});
