const ZIP_MAX_UINT32 = 0xffffffff;
const ZIP_MAX_UINT16 = 0xffff;

const LOCAL_HEADER_SIG = 0x04034b50;
const DATA_DESCRIPTOR_SIG = 0x08074b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

const FLAG_DATA_DESCRIPTOR_AND_UTF8 = 0x0808;
const METHOD_STORE = 0;
const VERSION_NEEDED = 20;

export interface ZipEntry {
  name: string;
  lastModified: Date;
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

async function* zipChunks(entries: ZipEntry[]): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  const centralRecords: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    let body: ReadableStream<Uint8Array>;
    try {
      body = await entry.open();
    } catch {
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
