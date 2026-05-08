// Pure-JS AWS Signature V4 signer.
//
// We can't depend on Node's crypto in React Native and we don't want to add a
// big SDK just for signing, so this is a self-contained SHA-256 + HMAC-SHA256
// implementation followed by the canonical SigV4 dance from
// https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html.
//
// Tested cross-checked against `aws s3api list-buckets` and `aws sts get-caller-identity`.

// ── SHA-256 ──────────────────────────────────────────────────────────────
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number) { return (x >>> n) | (x << (32 - n)); }

export function sha256(bytes: Uint8Array): Uint8Array {
  const l = bytes.length;
  const withOne = new Uint8Array(((l + 9 + 63) >> 6) << 6);
  withOne.set(bytes);
  withOne[l] = 0x80;
  const bitLen = l * 8;
  const view = new DataView(withOne.buffer);
  view.setUint32(withOne.length - 4, bitLen >>> 0);
  view.setUint32(withOne.length - 8, Math.floor(bitLen / 0x100000000));

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  for (let i = 0; i < withOne.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]];
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]);
  return out;
}

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  let k = key;
  if (k.length > 64) k = sha256(k);
  if (k.length < 64) { const p = new Uint8Array(64); p.set(k); k = p; }
  const oKey = new Uint8Array(64), iKey = new Uint8Array(64);
  for (let i = 0; i < 64; i++) { oKey[i] = k[i] ^ 0x5c; iKey[i] = k[i] ^ 0x36; }
  const inner = new Uint8Array(iKey.length + data.length);
  inner.set(iKey); inner.set(data, iKey.length);
  const innerHash = sha256(inner);
  const outer = new Uint8Array(oKey.length + innerHash.length);
  outer.set(oKey); outer.set(innerHash, oKey.length);
  return sha256(outer);
}

const HEX = "0123456789abcdef";
function toHex(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += HEX[b[i] >> 4] + HEX[b[i] & 0xf];
  return s;
}

const enc = new TextEncoder();

export type SigV4Input = {
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
};

export type SigV4Output = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

export function signV4(input: SigV4Input): SigV4Output {
  const u = new URL(input.url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const bodyBytes = enc.encode(input.body ?? "");
  const payloadHash = toHex(sha256(bodyBytes));

  const headers: Record<string, string> = { ...(input.headers ?? {}) };
  headers["host"] = u.host;
  headers["x-amz-date"] = amzDate;
  headers["x-amz-content-sha256"] = payloadHash;
  if (input.sessionToken) headers["x-amz-security-token"] = input.sessionToken;

  const sortedHeaderKeys = Object.keys(headers).map((k) => k.toLowerCase()).sort();
  const lowerHeaders: Record<string, string> = {};
  for (const k of Object.keys(headers)) lowerHeaders[k.toLowerCase()] = String(headers[k]).trim().replace(/\s+/g, " ");
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${lowerHeaders[k]}`).join("\n") + "\n";
  const signedHeaders = sortedHeaderKeys.join(";");

  const canonicalQueryString = Array.from(u.searchParams.entries())
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalRequest = [
    input.method.toUpperCase(),
    u.pathname || "/",
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    toHex(sha256(enc.encode(canonicalRequest))),
  ].join("\n");

  const kDate = hmacSha256(enc.encode("AWS4" + input.secretAccessKey), enc.encode(dateStamp));
  const kRegion = hmacSha256(kDate, enc.encode(input.region));
  const kService = hmacSha256(kRegion, enc.encode(input.service));
  const kSigning = hmacSha256(kService, enc.encode("aws4_request"));
  const signature = toHex(hmacSha256(kSigning, enc.encode(stringToSign)));

  headers["Authorization"] =
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url: input.url, method: input.method, headers, body: input.body };
}
