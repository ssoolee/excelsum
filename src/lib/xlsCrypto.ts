/**
 * 열기 암호가 걸린 구형 엑셀(.xls, BIFF8)의 복호화.
 *
 * xlsx와 달리 .xls는 파일 전체가 아니라 Workbook 스트림의 레코드 본문만 RC4로 암호화돼 있다.
 * 규격(MS-XLS 2.4.117 FilePass, MS-OFFCRYPTO 2.3.6)에 따라:
 *  - 레코드 머리말(종류 2바이트 + 길이 2바이트)은 암호화하지 않는다.
 *  - BOF·FilePass·UsrExcl·FileLock·InterfaceHdr·RRDInfo·RRDHead 레코드 본문도 그대로 둔다.
 *  - BoundSheet8 레코드의 앞 4바이트(시트 위치)도 그대로 둔다.
 *  - 그래도 암호화하지 않은 바이트만큼 키 스트림은 흘려보내며, 1024바이트마다 키를 새로 만든다.
 *
 * 지원하는 방식은 RC4 두 가지(Office 97/2000의 기본 RC4, Office XP 이후의 RC4 CryptoAPI)이고,
 * 그보다 오래된 XOR 난독화는 열지 않고 이유를 알린다. 해시는 @noble/hashes만 쓴다.
 */
import { md5, sha1 } from "@noble/hashes/legacy.js";
import { UnsupportedEncryptionError, WrongPasswordError } from "./officeCrypto";

const SID_BOF = 0x0809;
const SID_FILEPASS = 0x002f;
const SID_BOUNDSHEET = 0x0085;
// 암호화하지 않는 레코드들(규격에 명시돼 있다).
const PLAIN_RECORDS = new Set([
  SID_BOF,
  SID_FILEPASS,
  0x0194, // UsrExcl
  0x0195, // FileLock
  0x00e1, // InterfaceHdr
  0x0196, // RRDInfo
  0x0138, // RRDHead
]);

const BLOCK_SIZE = 1024;

interface FilePassInfo {
  /** 1.1은 Office 97/2000의 기본 RC4, 2.2~4.2는 RC4 CryptoAPI. */
  cryptoApi: boolean;
  salt: Uint8Array;
  encryptedVerifier: Uint8Array;
  encryptedVerifierHash: Uint8Array;
  /** CryptoAPI에서만 쓰는 키 길이(비트). */
  keyBits: number;
}

/** Workbook 스트림 앞부분에서 FilePass 레코드를 찾는다(없으면 암호가 걸려 있지 않은 파일). */
function findFilePass(stream: Uint8Array): Uint8Array | null {
  let pos = 0;
  // FilePass는 BOF 바로 뒤에 오므로 앞쪽 몇 개만 봐도 충분하다.
  for (let n = 0; n < 8 && pos + 4 <= stream.length; n++) {
    const sid = stream[pos] | (stream[pos + 1] << 8);
    const size = stream[pos + 2] | (stream[pos + 3] << 8);
    if (sid === SID_FILEPASS) {
      return stream.subarray(pos + 4, Math.min(pos + 4 + size, stream.length));
    }
    pos += 4 + size;
  }
  return null;
}

/** 열기 암호가 걸린 .xls인지. */
export function isEncryptedXlsStream(stream: Uint8Array): boolean {
  return findFilePass(stream) !== null;
}

/**
 * 암호를 받기 전에, 애초에 풀 수 있는 보호 방식인지 확인한다.
 * 다룰 수 없는 방식(XOR 난독화 등)이면 암호를 물어보지 않고 바로 이유를 알린다.
 */
export function assertSupportedXlsEncryption(stream: Uint8Array): void {
  const filePass = findFilePass(stream);
  if (filePass) parseFilePass(filePass);
}

function parseFilePass(data: Uint8Array): FilePassInfo {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const encryptionType = view.getUint16(0, true);
  if (encryptionType === 0) {
    throw new UnsupportedEncryptionError(
      "옛 XOR 방식으로 보호된 .xls 파일입니다. 엑셀에서 암호를 푼 뒤 올리거나 .xlsx로 저장해 주세요."
    );
  }
  if (encryptionType !== 1) {
    throw new UnsupportedEncryptionError(
      `지원하지 않는 .xls 보호 방식입니다(종류 ${encryptionType}).`
    );
  }

  const major = view.getUint16(2, true);
  const minor = view.getUint16(4, true);

  if (major === 1 && minor === 1) {
    return {
      cryptoApi: false,
      salt: data.subarray(6, 22),
      encryptedVerifier: data.subarray(22, 38),
      encryptedVerifierHash: data.subarray(38, 54),
      keyBits: 128,
    };
  }

  if (minor === 2 && major >= 2 && major <= 4) {
    const headerSize = view.getUint32(10, true);
    const headerStart = 14;
    const keyBits = view.getUint32(headerStart + 16, true);
    let at = headerStart + headerSize;
    const saltSize = view.getUint32(at, true);
    at += 4;
    const salt = data.subarray(at, at + saltSize);
    at += saltSize;
    const encryptedVerifier = data.subarray(at, at + 16);
    at += 16;
    const verifierHashSize = view.getUint32(at, true);
    at += 4;
    return {
      cryptoApi: true,
      salt,
      encryptedVerifier,
      encryptedVerifierHash: data.subarray(at, at + Math.min(verifierHashSize, 20)),
      keyBits,
    };
  }

  throw new UnsupportedEncryptionError(
    `지원하지 않는 .xls 암호화 버전입니다(${major}.${minor}).`
  );
}

function passwordToUtf16le(password: string): Uint8Array {
  const out = new Uint8Array(password.length * 2);
  for (let i = 0; i < password.length; i++) {
    const code = password.charCodeAt(i);
    out[i * 2] = code & 0xff;
    out[i * 2 + 1] = code >> 8;
  }
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function uint32le(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

/** 블록 번호마다 다른 RC4 키를 만든다. */
function makeKeyFactory(info: FilePassInfo, password: string): (block: number) => Uint8Array {
  const pw = passwordToUtf16le(password);

  if (info.cryptoApi) {
    const h0 = sha1(concat(info.salt, pw));
    const keyBytes = info.keyBits === 40 ? 5 : Math.floor(info.keyBits / 8);
    return (block) => {
      const hfinal = sha1(concat(h0, uint32le(block)));
      // 40비트 키는 뒤를 0으로 채워 128비트로 만들어 쓴다(규격).
      const key = new Uint8Array(info.keyBits === 40 ? 16 : keyBytes);
      key.set(hfinal.subarray(0, keyBytes));
      return key;
    };
  }

  const truncated = md5(pw).subarray(0, 5);
  const buffer = new Uint8Array((5 + info.salt.length) * 16);
  for (let i = 0; i < 16; i++) {
    buffer.set(truncated, i * (5 + info.salt.length));
    buffer.set(info.salt, i * (5 + info.salt.length) + 5);
  }
  const base = md5(buffer).subarray(0, 5);
  return (block) => md5(concat(base, uint32le(block))).subarray(0, 16);
}

/** RC4 스트림 암호(복호화도 같은 연산). */
class Rc4 {
  private s = new Uint8Array(256);
  private i = 0;
  private j = 0;

  constructor(key: Uint8Array) {
    for (let i = 0; i < 256; i++) this.s[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + this.s[i] + key[i % key.length]) & 0xff;
      const t = this.s[i];
      this.s[i] = this.s[j];
      this.s[j] = t;
    }
  }

  /** 키 스트림 1바이트. */
  next(): number {
    this.i = (this.i + 1) & 0xff;
    this.j = (this.j + this.s[this.i]) & 0xff;
    const t = this.s[this.i];
    this.s[this.i] = this.s[this.j];
    this.s[this.j] = t;
    return this.s[(this.s[this.i] + this.s[this.j]) & 0xff];
  }
}

/** 스트림에서 실제로 암호화된 바이트 위치를 표시한다. */
function markEncryptedBytes(stream: Uint8Array): Uint8Array {
  const encrypted = new Uint8Array(stream.length); // 0: 평문, 1: 암호화됨
  let pos = 0;
  while (pos + 4 <= stream.length) {
    const sid = stream[pos] | (stream[pos + 1] << 8);
    const size = stream[pos + 2] | (stream[pos + 3] << 8);
    const bodyStart = pos + 4;
    const bodyEnd = Math.min(bodyStart + size, stream.length);

    if (!PLAIN_RECORDS.has(sid)) {
      // BoundSheet8은 시트 위치(앞 4바이트)만 평문이다.
      const from = sid === SID_BOUNDSHEET ? Math.min(bodyStart + 4, bodyEnd) : bodyStart;
      encrypted.fill(1, from, bodyEnd);
    }
    pos = bodyStart + size;
  }
  return encrypted;
}

/** FilePass 레코드 내용만으로 암호가 맞는지 확인한다(검증 스크립트에서도 쓴다). */
export function verifyXlsPassword(filePassData: Uint8Array, password: string): boolean {
  const info = parseFilePass(filePassData);
  try {
    verifyPassword(info, makeKeyFactory(info, password));
    return true;
  } catch (err) {
    if (err instanceof WrongPasswordError) return false;
    throw err;
  }
}

function verifyPassword(info: FilePassInfo, makeKey: (block: number) => Uint8Array): void {
  const rc4 = new Rc4(makeKey(0));
  const decrypt = (data: Uint8Array) => data.map((b) => b ^ rc4.next());
  const verifier = decrypt(info.encryptedVerifier);
  const storedHash = decrypt(info.encryptedVerifierHash);
  const computed = info.cryptoApi ? sha1(verifier) : md5(verifier);
  for (let i = 0; i < storedHash.length; i++) {
    if (computed[i] !== storedHash[i]) throw new WrongPasswordError();
  }
}

/**
 * 암호가 걸린 Workbook 스트림을 복호화해 평문 스트림을 돌려준다(길이·레코드 구조는 그대로).
 * 암호가 틀리면 WrongPasswordError, 다룰 수 없는 방식이면 UnsupportedEncryptionError를 던진다.
 */
export function decryptXlsStream(stream: Uint8Array, password: string): Uint8Array {
  const filePass = findFilePass(stream);
  if (!filePass) return stream;

  const info = parseFilePass(filePass);
  const makeKey = makeKeyFactory(info, password);
  verifyPassword(info, makeKey);

  const encrypted = markEncryptedBytes(stream);
  const out = new Uint8Array(stream);
  for (let start = 0; start < stream.length; start += BLOCK_SIZE) {
    const rc4 = new Rc4(makeKey(start / BLOCK_SIZE));
    const end = Math.min(start + BLOCK_SIZE, stream.length);
    for (let i = start; i < end; i++) {
      // 평문 구간도 키 스트림은 똑같이 흘려보내야 뒤쪽 바이트가 맞는다.
      const keyByte = rc4.next();
      if (encrypted[i]) out[i] = stream[i] ^ keyByte;
    }
  }
  return out;
}
