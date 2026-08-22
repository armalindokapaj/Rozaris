/**
 * Minimal, dependency-free, **streaming** ZIP writer — store-only (no
 * compression). Written for the Admin console's "download all of this
 * project's 3D models as one archive" action
 * (`/api/admin/3d-assets/bundle`).
 *
 * Why hand-rolled rather than a library: the only zip implementation
 * present in node_modules (`fflate`) is a *transitive* dependency of
 * three.js, not a declared one in package.json — importing it directly
 * would silently break the moment three.js changed its own deps. The
 * store-only subset of the ZIP spec (APPNOTE 6.3.x) needed here is small
 * and fully specified, so this is ~150 lines with no supply-chain surface
 * instead of a new direct dependency added for one admin button.
 *
 * Why store-only: every entry is a `.glb`. GLB payloads are already
 * binary meshes/textures (often Draco/KTX2-compressed internally), so
 * DEFLATE buys almost nothing while costing CPU on a serverless function
 * — and store-only is what makes the *streaming* property below possible
 * with no buffering at all.
 *
 * Why it streams: entries are opened lazily one at a time and their bytes
 * are forwarded straight through, so peak memory is one network chunk —
 * not the whole archive. That matters because these files come from
 * Vercel Blob over the network and a project can hold tens of megabytes
 * of GLBs; the repo's one existing server-side GLB fetch buffers the
 * whole file with `arrayBuffer()`, which is exactly what this avoids.
 * Streaming means the CRC-32 and sizes are only known *after* the bytes
 * have already been written, which is precisely what ZIP's "data
 * descriptor" mode (general-purpose bit 3) exists for.
 *
 * Deliberate limits, enforced rather than hoped for:
 * - No ZIP64. `assertNoZip64Overflow` throws before writing anything that
 *   would exceed the 4 GiB offset/size or 65 535 entry fields, instead of
 *   emitting a silently corrupt archive. Callers cap total bytes up front.
 * - No directories, no permissions, no comments. Flat archive.
 */

const ZIP_MAX_UINT32 = 0xffffffff;
const ZIP_MAX_UINT16 = 0xffff;

const LOCAL_HEADER_SIG = 0x04034b50;
const DATA_DESCRIPTOR_SIG = 0x08074b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

/** Bit 3 = sizes/CRC follow the data in a descriptor (what lets us
 *  stream); bit 11 = the file name is UTF-8, not CP437. */
const FLAG_DATA_DESCRIPTOR_AND_UTF8 = 0x0808;
const METHOD_STORE = 0;
const VERSION_NEEDED = 20; // 2.0 — the floor for a store-only archive.

export interface ZipEntry {
  /** Path inside the archive. Sanitize with `zipEntryName()` first. */
  name: string;
  /** Stamped into the entry's DOS date/time field. */
  lastModified: Date;
  /**
   * Opened lazily, immediately before this entry's bytes are written, so
   * only one upstream response is in flight at a time. Throwing here
   * SKIPS the entry cleanly (nothing has been written for it yet) — a
   * failure once bytes are already flowing correctly errors the whole
   * stream, since a half-written entry cannot be retracted.
   */
  open: () => Promise<ReadableStream<Uint8Array>>;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32Update(state: number, chunk: Uint8Array) {
  let c = state;
  for (let i = 0; i < chunk.length; i += 1) c = CRC32_TABLE[(c ^ chunk[i]) & 0xff] ^ (c >>> 8);
  return c >>> 0;
}

/** MS-DOS packed date/time (APPNOTE 4.4.6). Pre-1980 clamps to 1980-01-01
 *  because the format simply cannot represent anything earlier. */
function dosDateTime(date: Date) {
  const usable = Number.isFinite(date.getTime()) ? date : new Date(0);
  const year = usable.getFullYear();
  if (year < 1980) return { time: 0, date: (1 << 5) | 1 };
  return {
    time:
      ((usable.getHours() & 0x1f) << 11) |
      ((usable.getMinutes() & 0x3f) << 5) |
      ((usable.getSeconds() >> 1) & 0x1f),
    date:
      (((year - 1980) & 0x7f) << 9) |
      (((usable.getMonth() + 1) & 0x0f) << 5) |
      (usable.getDate() & 0x1f),
  };
}

/**
 * Makes an arbitrary string safe as a ZIP entry name: no absolute paths,
 * no `..` traversal, no separators, no control characters. Extraction
 * tools treat entry names as real filesystem paths, so this is the
 * boundary that stops a careless or malicious DB-stored `fileName` from
 * writing outside the extraction directory ("zip slip").
 */
export function zipEntryName(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/^[.\s]+/, "")
    .trim();
  return cleaned.slice(0, 180) || fallback;
}

function u16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value & ZIP_MAX_UINT16, true);
}
function u32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function assertNoZip64Overflow(bytesWritten: number, entryCount: number) {
  if (bytesWritten > ZIP_MAX_UINT32 || entryCount > ZIP_MAX_UINT16) {
    throw new Error("Archive exceeds the 4 GiB / 65535-entry limit of non-ZIP64 archives.");
  }
}

/**
 * Builds the archive as an async stream of chunks. Kept as a generator so
 * the sequencing reads top-to-bottom the way the file format is laid out.
 */
async function* zipChunks(entries: ZipEntry[]): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  const centralRecords: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    let body: ReadableStream<Uint8Array>;
    try {
      body = await entry.open();
    } catch {
      // Nothing has been written for this entry yet, so skipping keeps
      // the archive valid. The bundle's own manifest entry is what tells
      // the admin a file was unreachable; a corrupt archive would not.
      continue;
    }

    const nameBytes = encoder.encode(entry.name);
    const { time, date } = dosDateTime(entry.lastModified);
    const localOffset = offset;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lh = new DataView(localHeader.buffer);
    u32(lh, 0, LOCAL_HEADER_SIG);
    u16(lh, 4, VERSION_NEEDED);
    u16(lh, 6, FLAG_DATA_DESCRIPTOR_AND_UTF8);
    u16(lh, 8, METHOD_STORE);
    u16(lh, 10, time);
    u16(lh, 12, date);
    // CRC and both sizes stay zero here (offsets 14/18/22) and are
    // carried in the trailing data descriptor instead.
    u16(lh, 26, nameBytes.length);
    u16(lh, 28, 0);
    localHeader.set(nameBytes, 30);
    yield localHeader;
    offset += localHeader.length;

    let crc = ZIP_MAX_UINT32;
    let size = 0;
    const reader = body.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value?.length) continue;
        crc = crc32Update(crc, value);
        size += value.length;
        offset += value.length;
        assertNoZip64Overflow(offset, centralRecords.length);
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
    const finalCrc = (crc ^ ZIP_MAX_UINT32) >>> 0;

    const descriptor = new Uint8Array(16);
    const dd = new DataView(descriptor.buffer);
    u32(dd, 0, DATA_DESCRIPTOR_SIG);
    u32(dd, 4, finalCrc);
    u32(dd, 8, size);
    u32(dd, 12, size);
    yield descriptor;
    offset += descriptor.length;

    const central = new Uint8Array(46 + nameBytes.length);
    const ch = new DataView(central.buffer);
    u32(ch, 0, CENTRAL_HEADER_SIG);
    u16(ch, 4, VERSION_NEEDED);
    u16(ch, 6, VERSION_NEEDED);
    u16(ch, 8, FLAG_DATA_DESCRIPTOR_AND_UTF8);
    u16(ch, 10, METHOD_STORE);
    u16(ch, 12, time);
    u16(ch, 14, date);
    u32(ch, 16, finalCrc);
    u32(ch, 20, size);
    u32(ch, 24, size);
    u16(ch, 28, nameBytes.length);
    u16(ch, 30, 0);
    u16(ch, 32, 0);
    u16(ch, 34, 0);
    u16(ch, 36, 0);
    u32(ch, 38, 0);
    u32(ch, 42, localOffset);
    central.set(nameBytes, 46);
    centralRecords.push(central);
    assertNoZip64Overflow(offset, centralRecords.length);
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const record of centralRecords) {
    yield record;
    centralSize += record.length;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  u32(ev, 0, EOCD_SIG);
  u16(ev, 4, 0);
  u16(ev, 6, 0);
  u16(ev, 8, centralRecords.length);
  u16(ev, 10, centralRecords.length);
  u32(ev, 12, centralSize);
  u32(ev, 16, centralStart);
  u16(ev, 20, 0);
  yield eocd;
}

/**
 * Wraps `zipChunks` as a web `ReadableStream` suitable for returning
 * directly from a Next.js Route Handler (`new Response(stream, …)`).
 * Built by hand rather than via `ReadableStream.from()` so the
 * cancellation path — the admin closing the tab mid-download — is
 * explicit and releases the upstream Blob response.
 */
export function createZipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  const iterator = zipChunks(entries)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel(reason) {
      await iterator.return?.(reason);
    },
  });
}
