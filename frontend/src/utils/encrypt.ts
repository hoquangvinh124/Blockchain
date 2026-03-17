import nacl from "tweetnacl";
import { encodeBase64, decodeBase64, decodeUTF8, encodeUTF8 } from "tweetnacl-util";
import { keccak256 } from "viem";

/**
 * Tin nhắn cố định dùng để derive NaCl keypair deterministic.
 * Cùng ví + cùng message → cùng keypair → luôn decrypt được dữ liệu cũ.
 */
export const SIGN_MESSAGE =
  "TrustMarket: Sign to generate your shipping encryption key.\nThis does not grant any permissions or transfer funds.";

/**
 * Tạo NaCl X25519 keypair từ chữ ký wallet (deterministic).
 * Seed = keccak256(signature) — đảm bảo cùng ví → cùng keypair.
 */
function deriveNaClKeypair(signature: string) {
  const seed = keccak256(signature as `0x${string}`);
  const seedBytes = new Uint8Array(
    seed.slice(2).match(/.{2}/g)!.map((b) => parseInt(b, 16)),
  );
  return nacl.box.keyPair.fromSecretKey(seedBytes);
}

/**
 * Lấy public key base64 từ chữ ký wallet.
 * Dùng khi seller publish pubkey lên contract một lần duy nhất.
 */
export function getPublicKeyBase64(signature: string): string {
  return encodeBase64(deriveNaClKeypair(signature).publicKey);
}

/**
 * Mã hoá `plaintext` bằng NaCl box (X25519 + XSalsa20-Poly1305) cho public key của người nhận.
 */
export function encryptForPublicKey(recipientPubkeyBase64: string, plaintext: string): string {
  const recipientPubkey = decodeBase64(recipientPubkeyBase64);
  const ephemeralKeypair = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const messageBytes = decodeUTF8(plaintext);

  const ciphertext = nacl.box(messageBytes, nonce, recipientPubkey, ephemeralKeypair.secretKey);
  if (!ciphertext) throw new Error("Mã hoá thất bại.");

  return JSON.stringify({
    version: "x25519-xsalsa20-poly1305",
    nonce: encodeBase64(nonce),
    ephemPublicKey: encodeBase64(ephemeralKeypair.publicKey),
    ciphertext: encodeBase64(ciphertext),
  });
}

/**
 * Giải mã NaCl box JSON bằng secret key được derive từ chữ ký wallet.
 * Chạy hoàn toàn local — không cần gọi ví lần thứ hai.
 */
export function decryptWithSignature(signature: string, encryptedJson: string): string {
  const secretKey = deriveNaClKeypair(signature).secretKey;

  const parsed = JSON.parse(encryptedJson) as {
    version: string;
    nonce: string;
    ephemPublicKey: string;
    ciphertext: string;
  };

  const decrypted = nacl.box.open(
    decodeBase64(parsed.ciphertext),
    decodeBase64(parsed.nonce),
    decodeBase64(parsed.ephemPublicKey),
    secretKey,
  );
  if (!decrypted) throw new Error("Giải mã thất bại — sai ví hoặc dữ liệu bị hỏng.");
  return encodeUTF8(decrypted);
}
