/**
 * Shared Draco decoder path for every GLTFLoader instance in the app.
 * Admin-uploaded GLBs commonly come out of Blender/other export pipelines
 * with Draco mesh compression on by default — without a decoder wired in,
 * GLTFLoader throws on those (a hard load failure, not a cosmetic issue).
 * Google's hosted decoder is the path Three.js's own examples/docs use — no
 * local decoder files to vendor into `public/`. Hoisted here once both
 * ProjectModelLayer.ts (outdoor map GLB) and DetailModelLayer.ts/
 * glbUnitNodes.ts (indoor detailed GLB) needed the exact same constant.
 */
export const DRACO_DECODER_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.6/";
