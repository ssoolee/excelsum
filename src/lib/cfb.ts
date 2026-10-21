/**
 * 최소 CFB(OLE2) 리더 — 컨테이너 안의 스트림을 이름으로 꺼내기만 한다.
 *
 * 열기 암호가 걸린 xlsx(EncryptionInfo/EncryptedPackage)와 구형 .xls(Workbook) 모두
 * 이 컨테이너 형식을 쓰므로, 두 기능이 같은 리더를 공유한다. 쓰기·구조 검증은 하지 않는다.
 */

const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** CFB(OLE2) 컨테이너인지 매직 넘버로 판별한다. 암호가 걸린 xlsx와 구형 .xls가 여기에 해당한다. */
export function isCfbFile(data: ArrayBuffer | Uint8Array): boolean {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < CFB_SIGNATURE.length) return false;
  return CFB_SIGNATURE.every((b, i) => bytes[i] === b);
}

const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;

interface DirEntry {
  name: string;
  type: number; // 2: 스트림, 5: 루트
  start: number;
  size: number;
}

/** 컨테이너에서 원하는 이름의 스트림만 골라 읽는다(쓰기·검증 없는 읽기 전용 구현). */
export function readCfbStreams(
  data: ArrayBuffer | Uint8Array,
  wanted: Iterable<string>
): Map<string, Uint8Array> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const wantedNames = new Set(wanted);
  if (bytes.length < 512) throw new Error("파일이 손상되었습니다.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const sectorSize = 1 << view.getUint16(30, true);
  const miniSectorSize = 1 << view.getUint16(32, true);
  const fatSectorCount = view.getUint32(44, true);
  const firstDirSector = view.getUint32(48, true);
  const miniCutoff = view.getUint32(56, true);
  const firstMiniFatSector = view.getUint32(60, true);
  const firstDifatSector = view.getUint32(68, true);
  const difatSectorCount = view.getUint32(72, true);
  const fatEntriesPerSector = sectorSize / 4;

  // 섹터 번호 → 파일 안 위치. 헤더가 한 섹터를 차지하므로 +1 한다.
  const sectorOffset = (sector: number) => (sector + 1) * sectorSize;
  const requireRange = (offset: number, length: number) => {
    if (offset < 0 || offset + length > bytes.length) {
      throw new Error("파일이 손상되었거나 중간에 잘렸습니다.");
    }
  };

  // FAT 섹터 목록: 헤더에 109개까지 들어가고, 넘치면 DIFAT 섹터를 따라간다.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109 && fatSectors.length < fatSectorCount; i++) {
    const sector = view.getUint32(76 + i * 4, true);
    if (sector === FREESECT || sector === ENDOFCHAIN) break;
    fatSectors.push(sector);
  }
  let difatSector = firstDifatSector;
  for (
    let n = 0;
    n < difatSectorCount && difatSector !== ENDOFCHAIN && difatSector !== FREESECT;
    n++
  ) {
    const base = sectorOffset(difatSector);
    requireRange(base, sectorSize);
    for (let i = 0; i < fatEntriesPerSector - 1 && fatSectors.length < fatSectorCount; i++) {
      const sector = view.getUint32(base + i * 4, true);
      if (sector === FREESECT || sector === ENDOFCHAIN) break;
      fatSectors.push(sector);
    }
    difatSector = view.getUint32(base + (fatEntriesPerSector - 1) * 4, true);
  }

  const fat = new Uint32Array(fatSectors.length * fatEntriesPerSector);
  fatSectors.forEach((sector, index) => {
    const base = sectorOffset(sector);
    requireRange(base, sectorSize);
    for (let i = 0; i < fatEntriesPerSector; i++) {
      fat[index * fatEntriesPerSector + i] = view.getUint32(base + i * 4, true);
    }
  });

  const chainSectors = (start: number): number[] => {
    const list: number[] = [];
    let sector = start;
    while (sector !== ENDOFCHAIN && sector !== FREESECT && list.length <= fat.length) {
      list.push(sector);
      sector = fat[sector] ?? ENDOFCHAIN;
    }
    return list;
  };

  const readChain = (start: number, size: number): Uint8Array => {
    const out = new Uint8Array(size);
    let written = 0;
    for (const sector of chainSectors(start)) {
      if (written >= size) break;
      const base = sectorOffset(sector);
      const take = Math.min(sectorSize, size - written);
      requireRange(base, take);
      out.set(bytes.subarray(base, base + take), written);
      written += take;
    }
    return out;
  };

  // 디렉터리 엔트리(각 128바이트)에서 스트림 이름/위치/크기를 읽는다.
  const dirSectors = chainSectors(firstDirSector);
  const dirBytes = new Uint8Array(dirSectors.length * sectorSize);
  dirSectors.forEach((sector, index) => {
    const base = sectorOffset(sector);
    requireRange(base, sectorSize);
    dirBytes.set(bytes.subarray(base, base + sectorSize), index * sectorSize);
  });
  const dirView = new DataView(dirBytes.buffer);

  const entries: DirEntry[] = [];
  for (let off = 0; off + 128 <= dirBytes.length; off += 128) {
    const type = dirView.getUint8(off + 66);
    if (type !== 2 && type !== 5) continue;
    const nameBytes = dirView.getUint16(off + 64, true);
    let name = "";
    for (let i = 0; i + 1 < Math.max(nameBytes - 2, 0); i += 2) {
      name += String.fromCharCode(dirView.getUint16(off + i, true));
    }
    // 512바이트 섹터(구형 버전)에서는 크기 상위 4바이트가 의미 없을 수 있어 하위 4바이트만 쓴다.
    const size =
      sectorSize === 512
        ? dirView.getUint32(off + 120, true)
        : Number(dirView.getBigUint64(off + 120, true));
    entries.push({ name, type, start: dirView.getUint32(off + 116, true), size });
  }

  // 4096바이트보다 작은 스트림은 루트 스트림 안의 "미니 섹터"에 들어 있다.
  let miniStream: Uint8Array | null = null;
  let miniFat: Uint32Array | null = null;
  const loadMiniStream = () => {
    if (miniStream && miniFat) return;
    const root = entries.find((entry) => entry.type === 5);
    if (!root) throw new Error("파일이 손상되었습니다.");
    miniStream = readChain(root.start, root.size);
    const miniFatSectors = chainSectors(firstMiniFatSector);
    const loaded = new Uint32Array(miniFatSectors.length * fatEntriesPerSector);
    miniFatSectors.forEach((sector, index) => {
      const base = sectorOffset(sector);
      requireRange(base, sectorSize);
      for (let i = 0; i < fatEntriesPerSector; i++) {
        loaded[index * fatEntriesPerSector + i] = view.getUint32(base + i * 4, true);
      }
    });
    miniFat = loaded;
  };

  const readMiniChain = (start: number, size: number): Uint8Array => {
    loadMiniStream();
    const stream = miniStream as Uint8Array;
    const table = miniFat as Uint32Array;
    const out = new Uint8Array(size);
    let written = 0;
    let sector = start;
    let guard = 0;
    while (
      sector !== ENDOFCHAIN &&
      sector !== FREESECT &&
      written < size &&
      guard++ <= table.length
    ) {
      const base = sector * miniSectorSize;
      const take = Math.min(miniSectorSize, size - written);
      out.set(stream.subarray(base, base + take), written);
      written += take;
      sector = table[sector] ?? ENDOFCHAIN;
    }
    return out;
  };

  const streams = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (entry.type !== 2 || !wantedNames.has(entry.name)) continue;
    streams.set(
      entry.name,
      entry.size < miniCutoff
        ? readMiniChain(entry.start, entry.size)
        : readChain(entry.start, entry.size)
    );
  }
  return streams;
}
