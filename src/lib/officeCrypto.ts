/**
 * 열기 암호가 걸린 Office 파일(.xlsx)을 브라우저 안에서 직접 복호화한다.
 *
 * 암호가 걸린 xlsx는 zip이 아니라 OLE/CFB 컨테이너(cfb.ts로 읽는다)이고, 그 안에 EncryptionInfo(암호화
 * 방식 설명)와 EncryptedPackage(암호화된 원본 zip) 두 스트림이 들어 있다. 그래서 ExcelJS가 바로 읽지 못한다.
 * 여기서 복호화해 나온 바이트는 평범한 xlsx(zip)이므로 그대로 ExcelJS에 넘기면 된다.
 *
 * 구현은 MS-OFFCRYPTO 규격의 두 가지 암호 방식만 다룬다.
 *  - Agile(Excel 2010 이후 기본): AES-CBC + SHA-2 계열, XML 디스크립터
 *  - Standard(Excel 2007): AES-ECB + SHA-1
 * 해시/AES는 무의존 라이브러리(@noble)를 쓰고 Node 전용 API를 쓰지 않아, 정적 빌드와 오프라인 exe에
 * 그대로 들어가고 Node에서도 같은 코드로 검증할 수 있다.
 */
import { cbc, ecb } from "@noble/ciphers/aes.js";
import { sha1 } from "@noble/hashes/legacy.js";
import { sha256, sha384, sha512 } from "@noble/hashes/sha2.js";
import { isCfbFile, readCfbStreams } from "./cfb";

/** 암호가 틀렸을 때. (본문 복호화 전, 검증용 해시 비교 단계에서 판정한다) */
export class WrongPasswordError extends Error {
  constructor(message = "암호가 맞지 않습니다.") {
    super(message);
    this.name = "WrongPasswordError";
  }
}

/** 암호 방식 자체를 지원하지 않을 때(인증서 암호화, 구형 RC4 등). */
export class UnsupportedEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedEncryptionError";
  }
}


/** 암호화 정보가 담기는 스트림 이름. */
export const ENCRYPTION_STREAMS = ["EncryptionInfo", "EncryptedPackage"];

/** 암호가 걸린 xlsx인지 판별한다(구형 .xls도 같은 CFB 컨테이너라서 스트림 유무까지 본다). */
export function isEncryptedOfficeFile(data: ArrayBuffer | Uint8Array): boolean {
  if (!isCfbFile(data)) return false;
  try {
    return readCfbStreams(data, ENCRYPTION_STREAMS).has("EncryptionInfo");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 공통 유틸
// ---------------------------------------------------------------------------

type HashFn = (msg: Uint8Array) => Uint8Array;

const HASH_FUNCS: Record<string, HashFn> = {
  SHA512: (msg) => sha512(msg),
  SHA384: (msg) => sha384(msg),
  SHA256: (msg) => sha256(msg),
  SHA1: (msg) => sha1(msg),
};

function getHashFn(name: string): HashFn {
  const key = name.replace(/[-_\s]/g, "").toUpperCase();
  const fn = HASH_FUNCS[key];
  if (!fn) throw new UnsupportedEncryptionError(`지원하지 않는 해시 방식입니다(${name}).`);
  return fn;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** 4바이트 리틀엔디언 정수. 해시 반복과 세그먼트 IV 계산에 쓴다. */
function uint32le(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

/** 암호는 UTF-16LE 바이트로 바꿔 해시에 넣는다(규격). */
function passwordToUtf16le(password: string): Uint8Array {
  const out = new Uint8Array(password.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < password.length; i++) {
    view.setUint16(i * 2, password.charCodeAt(i), true);
  }
  return out;
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value.trim());
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** 해시 결과를 키 길이에 맞춘다. 짧으면 규격대로 0x36으로 채운다. */
function fitKey(hash: Uint8Array, keyLength: number): Uint8Array {
  if (hash.length >= keyLength) return hash.slice(0, keyLength);
  const out = new Uint8Array(keyLength).fill(0x36);
  out.set(hash, 0);
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const decryptCbc = (key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array =>
  cbc(key, iv, { disablePadding: true }).decrypt(data);

const decryptEcb = (key: Uint8Array, data: Uint8Array): Uint8Array =>
  ecb(key, { disablePadding: true }).decrypt(data);

/** AES 블록 크기(16바이트)의 배수만 복호화할 수 있어 뒤쪽 잉여 바이트는 버린다. */
function trimToBlocks(data: Uint8Array, blockSize = 16): Uint8Array {
  const usable = Math.floor(data.length / blockSize) * blockSize;
  return usable === data.length ? data : data.subarray(0, usable);
}

/** EncryptedPackage 선두 8바이트는 원본 크기(uint64 LE)다. */
function packageOriginalSize(stream: Uint8Array): number {
  return Number(new DataView(stream.buffer, stream.byteOffset, 8).getBigUint64(0, true));
}

// ---------------------------------------------------------------------------
// Agile 암호화 (Excel 2010 이후 기본)
// ---------------------------------------------------------------------------

const BLOCK_KEY_VERIFIER_INPUT = new Uint8Array([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79]);
const BLOCK_KEY_VERIFIER_VALUE = new Uint8Array([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e]);
const BLOCK_KEY_SECRET_KEY = new Uint8Array([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6]);
const PACKAGE_SEGMENT_SIZE = 4096;

interface AgileKeyData {
  saltValue: Uint8Array;
  blockSize: number;
  keyBits: number;
  hashAlgorithm: string;
}

interface AgilePasswordKey extends AgileKeyData {
  spinCount: number;
  encryptedVerifierHashInput: Uint8Array;
  encryptedVerifierHashValue: Uint8Array;
  encryptedKeyValue: Uint8Array;
}

/**
 * Agile 디스크립터는 고정된 모양의 작은 XML이라 속성만 뽑아 쓴다.
 * (XML 라이브러리나 DOMParser를 쓰지 않아 브라우저·Node 어디서나 같은 코드가 돈다)
 */
function readAttributes(xml: string, elementName: string): Record<string, string> {
  // 네임스페이스 접두사(p: 등)가 붙을 수 있어 접두사는 느슨하게 받는다.
  const match = new RegExp(`<(?:\\w+:)?${elementName}\\b([^>]*)>`).exec(xml);
  if (!match) throw new UnsupportedEncryptionError(`암호 정보를 읽을 수 없습니다(${elementName}).`);
  const attributes: Record<string, string> = {};
  const pattern = /([\w:]+)\s*=\s*"([^"]*)"/g;
  let attribute: RegExpExecArray | null;
  while ((attribute = pattern.exec(match[1])) !== null) {
    attributes[attribute[1]] = attribute[2];
  }
  return attributes;
}

function parseAgileDescriptor(info: Uint8Array): {
  keyData: AgileKeyData;
  passwordKey: AgilePasswordKey;
} {
  const xml = new TextDecoder().decode(info.subarray(8));
  if (!/keyEncryptor\/password/.test(xml)) {
    throw new UnsupportedEncryptionError(
      "암호가 아니라 인증서 등 다른 방식으로 보호된 파일입니다. 엑셀에서 보호를 해제한 뒤 올려 주세요."
    );
  }

  const keyDataAttributes = readAttributes(xml, "keyData");
  const passwordAttributes = readAttributes(xml, "encryptedKey");
  for (const attributes of [keyDataAttributes, passwordAttributes]) {
    if ((attributes.cipherAlgorithm ?? "AES") !== "AES") {
      throw new UnsupportedEncryptionError(
        `지원하지 않는 암호화 방식입니다(${attributes.cipherAlgorithm}).`
      );
    }
  }

  return {
    keyData: {
      saltValue: fromBase64(keyDataAttributes.saltValue),
      blockSize: Number(keyDataAttributes.blockSize),
      keyBits: Number(keyDataAttributes.keyBits),
      hashAlgorithm: keyDataAttributes.hashAlgorithm,
    },
    passwordKey: {
      saltValue: fromBase64(passwordAttributes.saltValue),
      blockSize: Number(passwordAttributes.blockSize),
      keyBits: Number(passwordAttributes.keyBits),
      hashAlgorithm: passwordAttributes.hashAlgorithm,
      spinCount: Number(passwordAttributes.spinCount),
      encryptedVerifierHashInput: fromBase64(passwordAttributes.encryptedVerifierHashInput),
      encryptedVerifierHashValue: fromBase64(passwordAttributes.encryptedVerifierHashValue),
      encryptedKeyValue: fromBase64(passwordAttributes.encryptedKeyValue),
    },
  };
}

/**
 * 암호 → 해시 반복(spinCount회). 결과 해시 하나로 검증용 키 2개와 비밀키용 키를 모두 만들 수 있어,
 * 무거운 반복은 파일당 한 번만 돌린다.
 */
function agilePasswordHash(password: string, key: AgilePasswordKey, hash: HashFn): Uint8Array {
  let current = hash(concatBytes(key.saltValue, passwordToUtf16le(password)));
  for (let i = 0; i < key.spinCount; i++) {
    current = hash(concatBytes(uint32le(i), current));
  }
  return current;
}

function decryptAgile(
  info: Uint8Array,
  encryptedPackage: Uint8Array,
  password: string
): Uint8Array {
  const { keyData, passwordKey } = parseAgileDescriptor(info);
  const hash = getHashFn(passwordKey.hashAlgorithm);
  const keyLength = passwordKey.keyBits / 8;
  const passwordHash = agilePasswordHash(password, passwordKey, hash);
  const blockKeyTo = (blockKey: Uint8Array) =>
    fitKey(hash(concatBytes(passwordHash, blockKey)), keyLength);

  // 본문을 풀기 전에 검증용 해시로 암호가 맞는지 먼저 확인한다.
  const verifierInput = decryptCbc(
    blockKeyTo(BLOCK_KEY_VERIFIER_INPUT),
    passwordKey.saltValue,
    passwordKey.encryptedVerifierHashInput
  );
  const expectedHash = decryptCbc(
    blockKeyTo(BLOCK_KEY_VERIFIER_VALUE),
    passwordKey.saltValue,
    passwordKey.encryptedVerifierHashValue
  );
  const actualHash = hash(verifierInput);
  if (!bytesEqual(actualHash, expectedHash.subarray(0, actualHash.length))) {
    throw new WrongPasswordError();
  }

  // 실제 패키지를 푸는 비밀키.
  const secretKey = fitKey(
    decryptCbc(
      blockKeyTo(BLOCK_KEY_SECRET_KEY),
      passwordKey.saltValue,
      passwordKey.encryptedKeyValue
    ),
    keyData.keyBits / 8
  );

  // 패키지는 4096바이트 세그먼트 단위로 암호화돼 있고, IV는 세그먼트 번호로 만든다.
  const originalSize = packageOriginalSize(encryptedPackage);
  const payload = encryptedPackage.subarray(8);
  const packageHash = getHashFn(keyData.hashAlgorithm);
  const out = new Uint8Array(originalSize);
  let written = 0;
  for (let segment = 0; written < originalSize; segment++) {
    const start = segment * PACKAGE_SEGMENT_SIZE;
    if (start >= payload.length) break;
    const chunk = trimToBlocks(payload.subarray(start, start + PACKAGE_SEGMENT_SIZE));
    if (chunk.length === 0) break;
    const iv = packageHash(concatBytes(keyData.saltValue, uint32le(segment))).subarray(
      0,
      keyData.blockSize
    );
    const decrypted = decryptCbc(secretKey, iv, chunk);
    const take = Math.min(decrypted.length, originalSize - written);
    out.set(decrypted.subarray(0, take), written);
    written += take;
  }
  if (written < originalSize) {
    throw new Error("암호를 풀었지만 파일 내용이 중간에 잘려 있습니다.");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Standard 암호화 (Excel 2007)
// ---------------------------------------------------------------------------

const STANDARD_SPIN_COUNT = 50000;
const AES_ALG_IDS = new Set([0x660e, 0x660f, 0x6610]); // AES-128 / 192 / 256

function decryptStandard(
  info: Uint8Array,
  encryptedPackage: Uint8Array,
  password: string
): Uint8Array {
  const view = new DataView(info.buffer, info.byteOffset, info.byteLength);
  const headerSize = view.getUint32(8, true);
  const headerStart = 12;
  const algId = view.getUint32(headerStart + 8, true);
  const keyBits = view.getUint32(headerStart + 16, true);
  if (!AES_ALG_IDS.has(algId)) {
    throw new UnsupportedEncryptionError(
      "구형 RC4 방식으로 암호화된 파일입니다. 엑셀에서 다시 저장한 뒤 올려 주세요."
    );
  }

  // 헤더 뒤에 검증 정보(소금값, 검증값, 검증 해시)가 이어진다.
  const verifierStart = headerStart + headerSize;
  const saltSize = view.getUint32(verifierStart, true);
  const salt = info.subarray(verifierStart + 4, verifierStart + 4 + saltSize);
  const encryptedVerifier = info.subarray(
    verifierStart + 4 + saltSize,
    verifierStart + 4 + saltSize + 16
  );
  const verifierHashSize = view.getUint32(verifierStart + 4 + saltSize + 16, true);
  const encryptedVerifierHash = info.subarray(verifierStart + 4 + saltSize + 20);

  // SHA-1 반복 + 0x36/0x5C 패딩 해시로 키를 만든다(규격 2.3.4.7).
  let current = sha1(concatBytes(salt, passwordToUtf16le(password)));
  for (let i = 0; i < STANDARD_SPIN_COUNT; i++) {
    current = sha1(concatBytes(uint32le(i), current));
  }
  const finalHash = sha1(concatBytes(current, uint32le(0)));
  const makeBuffer = (padByte: number) => {
    const buffer = new Uint8Array(64).fill(padByte);
    for (let i = 0; i < finalHash.length; i++) buffer[i] = finalHash[i] ^ padByte;
    return buffer;
  };
  const key = concatBytes(sha1(makeBuffer(0x36)), sha1(makeBuffer(0x5c))).subarray(0, keyBits / 8);

  const verifier = decryptEcb(key, trimToBlocks(encryptedVerifier));
  const expectedHash = decryptEcb(key, trimToBlocks(encryptedVerifierHash)).subarray(
    0,
    verifierHashSize
  );
  if (!bytesEqual(sha1(verifier), expectedHash.subarray(0, 20))) {
    throw new WrongPasswordError();
  }

  const originalSize = packageOriginalSize(encryptedPackage);
  const decrypted = decryptEcb(key, trimToBlocks(encryptedPackage.subarray(8)));
  if (decrypted.length < originalSize) {
    throw new Error("암호를 풀었지만 파일 내용이 중간에 잘려 있습니다.");
  }
  return decrypted.subarray(0, originalSize);
}

// ---------------------------------------------------------------------------

/**
 * 암호가 걸린 Office 파일을 복호화해 원본 바이트(xlsx zip)를 돌려준다.
 * 암호가 틀리면 WrongPasswordError, 지원하지 않는 방식이면 UnsupportedEncryptionError를 던진다.
 */
export function decryptOfficeFile(data: ArrayBuffer | Uint8Array, password: string): Uint8Array {
  return decryptOfficeStreams(readCfbStreams(data, ENCRYPTION_STREAMS), password);
}

/** 이미 꺼내 둔 CFB 스트림으로 복호화한다(excel.ts는 컨테이너를 한 번만 읽으려고 이쪽을 쓴다). */
export function decryptOfficeStreams(
  streams: Map<string, Uint8Array>,
  password: string
): Uint8Array {
  const info = streams.get("EncryptionInfo");
  const encryptedPackage = streams.get("EncryptedPackage");
  if (!info || !encryptedPackage) {
    throw new UnsupportedEncryptionError(
      "암호를 풀 수 있는 형식이 아닙니다. 엑셀에서 열어 다시 저장한 뒤 올려 주세요."
    );
  }

  const view = new DataView(info.buffer, info.byteOffset, info.byteLength);
  const versionMajor = view.getUint16(0, true);
  const versionMinor = view.getUint16(2, true);

  if (versionMajor === 4 && versionMinor === 4) {
    return decryptAgile(info, encryptedPackage, password);
  }
  if (versionMinor === 2 && versionMajor >= 2 && versionMajor <= 4) {
    return decryptStandard(info, encryptedPackage, password);
  }
  if (versionMajor === 3 && versionMinor === 3) {
    throw new UnsupportedEncryptionError(
      "확장(인증서) 암호화가 적용된 파일입니다. 엑셀에서 보호를 해제한 뒤 올려 주세요."
    );
  }
  throw new UnsupportedEncryptionError(
    `지원하지 않는 암호화 버전입니다(${versionMajor}.${versionMinor}).`
  );
}

