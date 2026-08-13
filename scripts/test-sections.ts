/**
 * Standalone assertion script for the Sections module's pure math
 * (src/lib/render-engine/sections.ts) — no THREE scene, no browser, no DB;
 * just checks the plane/geometry math is actually correct (which fragments
 * a real `material.clippingPlanes` array would keep vs. discard). Same
 * "real, checkable-without-a-browser math gets a standalone script" role
 * Phase 2's undo/redo reducer test played.
 *
 * Run with: npx tsx scripts/test-sections.ts
 */
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { buildSectionPlanes, sectionFromDragPoints } from "../src/lib/render-engine/sections";
import type { Section } from "../src/lib/types";

let checks = 0;
function check(label: string, fn: () => void) {
  fn();
  checks++;
  console.log(`  ok — ${label}`);
}

/** `THREE.Plane.distanceToPoint(p) >= 0` means "kept" under the same
 * clippingPlanes semantics the renderer uses. */
function kept(plane: THREE.Plane, p: THREE.Vector3) {
  return plane.distanceToPoint(p) >= 0;
}
function keptByAll(planes: THREE.Plane[], p: THREE.Vector3) {
  return planes.every((pl) => kept(pl, p));
}

const baseSection: Section = {
  id: "sec_test",
  name: "Test",
  scope: "project",
  centerX: 0,
  centerZ: 0,
  widthM: 10,
  depthM: 6,
  rotationDeg: 0,
  heightM: 3,
  bottomEnabled: false,
  fillGapsEnabled: false,
  fillColor: "#f2f2f2",
};

console.log("sectionFromDragPoints");
check("computes center/width/depth from two diagonal corners, rotation 0", () => {
  const s = sectionFromDragPoints(new THREE.Vector3(-5, 0, -3), new THREE.Vector3(5, 0, 3), {
    id: "a",
    name: "Draw",
    heightM: 3,
    scope: "project",
  });
  assert.equal(s.centerX, 0);
  assert.equal(s.centerZ, 0);
  assert.equal(s.widthM, 10);
  assert.equal(s.depthM, 6);
  assert.equal(s.rotationDeg, 0);
});
check("clamps a degenerate (near-zero) drag to the minimum footprint", () => {
  const s = sectionFromDragPoints(new THREE.Vector3(2, 0, 2), new THREE.Vector3(2.0001, 0, 2.0001), {
    id: "b",
    name: "Draw",
    heightM: 3,
    scope: "project",
  });
  assert.ok(s.widthM >= 1, "widthM should clamp to >= 1m");
  assert.ok(s.depthM >= 1, "depthM should clamp to >= 1m");
});

console.log("buildSectionPlanes — axis-aligned (rotationDeg: 0)");
{
  const planes = buildSectionPlanes(baseSection);
  check("returns 5 planes when bottomEnabled is false", () => {
    assert.equal(planes.length, 5);
  });
  check("keeps the center point (below cut height)", () => {
    assert.ok(keptByAll(planes, new THREE.Vector3(0, 0, 0)));
  });
  check("keeps a point just inside every edge", () => {
    assert.ok(keptByAll(planes, new THREE.Vector3(4.9, 2, 2.9)));
  });
  check("clips a point just outside the right edge (+X)", () => {
    assert.ok(!keptByAll(planes, new THREE.Vector3(5.1, 0, 0)));
  });
  check("clips a point just outside the left edge (-X)", () => {
    assert.ok(!keptByAll(planes, new THREE.Vector3(-5.1, 0, 0)));
  });
  check("clips a point just outside the front edge (+Z)", () => {
    assert.ok(!keptByAll(planes, new THREE.Vector3(0, 0, 3.1)));
  });
  check("clips a point just outside the back edge (-Z)", () => {
    assert.ok(!keptByAll(planes, new THREE.Vector3(0, 0, -3.1)));
  });
  check("clips a point above the cut height", () => {
    assert.ok(!keptByAll(planes, new THREE.Vector3(0, 3.1, 0)));
  });
  check("keeps a point just below the cut height", () => {
    assert.ok(keptByAll(planes, new THREE.Vector3(0, 2.9, 0)));
  });
  check("does NOT clip a deep-underground point when bottomEnabled is false", () => {
    assert.ok(keptByAll(planes, new THREE.Vector3(0, -50, 0)));
  });
}

console.log("buildSectionPlanes — bottomEnabled: true");
{
  const planes = buildSectionPlanes({ ...baseSection, bottomEnabled: true });
  check("returns 6 planes", () => {
    assert.equal(planes.length, 6);
  });
  check("clips a point below ground (y < 0)", () => {
    assert.ok(!keptByAll(planes, new THREE.Vector3(0, -1, 0)));
  });
  check("keeps a point at ground level (y = 0)", () => {
    assert.ok(keptByAll(planes, new THREE.Vector3(0, 0.01, 0)));
  });
}

console.log("buildSectionPlanes — rotated 90deg");
{
  // A 90deg rotation swaps which world axis is "width" vs "depth" —
  // width (10m) now runs along world Z, depth (6m) along world X.
  const planes = buildSectionPlanes({ ...baseSection, rotationDeg: 90 });
  check("keeps the center point", () => {
    assert.ok(keptByAll(planes, new THREE.Vector3(0, 0, 0)));
  });
  check("clips a point 4m along world X (now the short/depth side)", () => {
    assert.ok(!keptByAll(planes, new THREE.Vector3(4, 0, 0)));
  });
  check("keeps a point 4m along world Z (now the long/width side)", () => {
    assert.ok(keptByAll(planes, new THREE.Vector3(0, 0, 4)));
  });
  check("clips a point 6m along world Z (beyond the rotated width bound)", () => {
    assert.ok(!keptByAll(planes, new THREE.Vector3(0, 0, 6)));
  });
}

console.log(`\n${checks} assertions passed.`);
