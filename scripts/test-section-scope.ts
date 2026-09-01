import { isSlotCutBySections, type SectionScopeSlot } from "@/lib/render-engine/sectionScope";

let pass = 0,
  fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  if (got === want) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}\n       got  ${got}\n       want ${want}`);
  }
}
const slot = (p: SectionScopeSlot) => isSlotCutBySections(p);

console.log("\n1. building fabric is still cut — the point of the feature");
eq("Building (role building)", slot({ slotRole: "building", slotName: "Building" }), true);
eq("Floors (custom)", slot({ slotRole: "custom", slotName: "Floors" }), true);
eq("Units (role units)", slot({ slotRole: "units", slotName: "Units" }), true);
eq("an unnamed/legacy entry", slot({}), true);
eq("some other custom slot", slot({ slotRole: "custom", slotName: "Balconies" }), true);

console.log("\n2. tower-vlora's real site slots are exempt");
for (const name of ["Site 1", "Site 2", "Site 3", "Site 4", "Site 5", "site 6"]) {
  eq(`${name} (role custom)`, slot({ slotRole: "custom", slotName: name }), false);
}
eq("bare 'Site'", slot({ slotRole: "custom", slotName: "Site" }), false);
eq("leading whitespace", slot({ slotRole: "custom", slotName: "  Site 7" }), false);

console.log("\n3. the schema roles that already mean this");
eq("role surroundings, unrelated name", slot({ slotRole: "surroundings", slotName: "Block B" }), false);
eq("role context, unrelated name", slot({ slotRole: "context", slotName: "Block B" }), false);

console.log("\n4. other site-context wordings");
for (const name of ["Terrain", "terrain mesh", "Landscape", "Surroundings", "Surrounding blocks", "Context"]) {
  eq(name, slot({ slotRole: "custom", slotName: name }), false);
}

console.log("\n5. the word boundary — a name that merely starts with the letters is NOT site");
eq("Sitework Tower", slot({ slotRole: "custom", slotName: "Sitework Tower" }), true);
eq("Contextual Facade", slot({ slotRole: "custom", slotName: "Contextual Facade" }), true);
eq("Landscaper", slot({ slotRole: "custom", slotName: "Landscaper" }), true);
eq("Tower on Site 1 (site not leading)", slot({ slotRole: "custom", slotName: "Tower on Site 1" }), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
