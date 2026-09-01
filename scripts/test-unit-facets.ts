import { unitFacets, DEFAULT_UNIT_FILTERS, type UnitFilterState } from "@/components/project/units-workspace/unitFilters";
import type { Unit } from "@/lib/types";

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
}
const u = (p: Partial<Unit>): Unit => ({
  id: "x", code: "x", type: "residential", buildingName: "A", floor: 1, area: 50,
  bedrooms: 2, bathrooms: 1, price: 1, currency: "EUR", transaction: "sale",
  status: "available", images: [], floorPlanImage: "", ...p,
} as Unit);
const F = (p: Partial<UnitFilterState> = {}): UnitFilterState => ({ ...DEFAULT_UNIT_FILTERS, ...p });

console.log("\n1. only values present in units are offered");
eq("bedrooms 1,2,4 -> [1,2,4] (no 0/3)",
   unitFacets([u({bedrooms:1}), u({bedrooms:2}), u({bedrooms:4}), u({bedrooms:2})], F()).bedrooms, [1,2,4]);
eq("studio counts as a real option",
   unitFacets([u({bedrooms:0}), u({bedrooms:3})], F()).bedrooms, [0,3]);

console.log("\n2. a single option filters nothing -> empty list, control hidden");
eq("all units 2+1 -> []", unitFacets([u({bedrooms:2}), u({bedrooms:2})], F()).bedrooms, []);
eq("one building -> []", unitFacets([u({buildingName:"A"}), u({buildingName:"A"})], F()).buildings, []);
eq("two buildings -> both", unitFacets([u({buildingName:"B"}), u({buildingName:"A"})], F()).buildings, ["A","B"]);
eq("no units at all -> []", unitFacets([], F()).bedrooms, []);

console.log("\n3. statuses, in STATUS_RANK order, never including 'all'");
eq("available+sold -> both, ranked",
   unitFacets([u({status:"sold"}), u({status:"available"})], F()).statuses, ["available","sold"]);
eq("all sold -> [] (nothing to narrow)",
   unitFacets([u({status:"sold"}), u({status:"sold"})], F()).statuses, []);
eq("three statuses ordered available,reserved,sold",
   unitFacets([u({status:"sold"}), u({status:"reserved"}), u({status:"available"})], F()).statuses,
   ["available","reserved","sold"]);

console.log("\n4. the applied filter always stays visible, so it can be cleared");
eq("bedrooms=4 selected but no 4-bed units -> kept alongside the real one",
   unitFacets([u({bedrooms:2}), u({bedrooms:2})], F({bedrooms:4})).bedrooms, [2,4]);
eq("bedrooms=2 selected in a single-option project -> kept",
   unitFacets([u({bedrooms:2})], F({bedrooms:2})).bedrooms, [2]);
eq("status=reserved selected but none reserved -> kept alongside real ones",
   unitFacets([u({status:"available"}), u({status:"sold"})], F({status:"reserved"})).statuses,
   ["available","reserved","sold"]);
eq("status 'all' is not treated as an applied value",
   unitFacets([u({status:"sold"}), u({status:"sold"})], F({status:"all"})).statuses, []);
eq("building selected but gone -> kept",
   unitFacets([u({buildingName:"A"})], F({building:"Ghost"})).buildings, ["A","Ghost"]);

console.log("\n5. facets come from all units, not the filtered subset");
eq("picking 1+1 does not remove 2+1",
   unitFacets([u({bedrooms:1}), u({bedrooms:2})], F({bedrooms:1})).bedrooms, [1,2]);
eq("a status filter does not narrow the bedroom facet",
   unitFacets([u({bedrooms:1,status:"sold"}), u({bedrooms:2,status:"available"})], F({status:"available"})).bedrooms, [1,2]);

console.log("\n6. blank building names never become unlabelled rows");
eq("empty/whitespace names dropped",
   unitFacets([u({buildingName:""}), u({buildingName:"  "}), u({buildingName:"A"}), u({buildingName:"B"})], F()).buildings, ["A","B"]);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
