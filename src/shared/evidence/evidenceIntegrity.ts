/**
 * Tamper-evident evidence chain for UAV captures.
 *
 * ---------------------------------------------------------------------------
 * HONEST SCOPE NOTE — read before treating this as a security system.
 *
 * This is a CLIENT-SIDE INTEGRITY DEMONSTRATION, not a production
 * cryptographic evidence system. What it does: compute real SHA-256 digests
 * (via the browser's SubtleCrypto API) over each evidence item's mock file
 * bytes plus its custody metadata, and chain each item's hash to the previous
 * item's hash so that altering any earlier item invalidates every later link.
 * That makes tampering VISIBLE in this demo.
 *
 * What it is NOT: legally admissible chain of custody. A real system would
 * need server-side capture signing (the UAV or an ingestion service signs
 * each item with a private key at capture time), hashes anchored in
 * append-only server storage, authenticated access, and audit logging —
 * none of which exist here. Everything in this module runs in the user's
 * browser against mock media bytes, so a determined attacker with console
 * access could recompute the chain. Treat the green "verified" indicator as
 * "the bytes in this demo session still match what was sealed in this demo
 * session" — nothing more.
 * ---------------------------------------------------------------------------
 */

/** Marker hashed as the previous-hash of the first item in an incident's chain. */
export const EVIDENCE_GENESIS = 'AASHA-EVIDENCE-GENESIS'

/** Demo-only byte-level tamper simulation applied on top of the mock bytes. */
export interface ByteMutation {
  index: number
  value: number
}

const textEncoder = new TextEncoder()

/** Deterministic PRNG (mulberry32) seeded from a string. */
function rng(seedStr: string): () => number {
  let t = 0
  for (let i = 0; i < seedStr.length; i++) t = (t * 31 + seedStr.charCodeAt(i)) >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let z = t
    z = Math.imul(z ^ (z >>> 15), z | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The mock "file content" of an evidence item. Placeholder media has no real
 * bytes, so we generate a deterministic 4 KiB buffer seeded by the item id —
 * the same item always yields the same bytes, which is what makes hashing
 * and tamper detection meaningful in this demo.
 */
export function mockEvidenceBytes(itemId: string, length = 4096): Uint8Array {
  const r = rng(`aasha-evidence-bytes:${itemId}`)
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(r() * 256)
  return bytes
}

/** Current content = deterministic mock bytes with any demo tamper mutations applied. */
export function currentEvidenceBytes(itemId: string, mutations?: ByteMutation[]): Uint8Array {
  const bytes = mockEvidenceBytes(itemId)
  if (mutations) {
    for (const m of mutations) {
      if (m.index >= 0 && m.index < bytes.length) bytes[m.index] = m.value & 0xff
    }
  }
  return bytes
}

/** SHA-256 of arbitrary bytes, hex-encoded, via the browser's SubtleCrypto API. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  // Copy into a fresh Uint8Array so .buffer is a concrete ArrayBuffer, which
  // is what SubtleCrypto's BufferSource parameter requires.
  const view = new Uint8Array(data.byteLength)
  view.set(data)
  const digest = await crypto.subtle.digest('SHA-256', view.buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export interface EvidenceLinkInput {
  id: string
  kind: 'photo' | 'video'
  capturedAt: number
  uavId: string
  lat: number
  lng: number
  label: string
  /** Hash of the previous item in this incident's chain (or EVIDENCE_GENESIS). */
  prevHash: string
}

/** Canonical custody metadata bound into the hash — metadata tampering breaks the seal too. */
function canonicalMetadata(input: EvidenceLinkInput): string {
  return [
    input.id,
    input.kind,
    String(input.capturedAt),
    input.uavId,
    input.lat.toFixed(6),
    input.lng.toFixed(6),
    input.label,
  ].join('|')
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

/**
 * Seal one evidence item: H = SHA256(prevHash || custody metadata || file bytes).
 * Binding prevHash in is what makes this a chain rather than a bag of hashes.
 */
export async function sealEvidenceLink(
  input: EvidenceLinkInput,
  contentBytes?: Uint8Array,
): Promise<string> {
  const bytes = contentBytes ?? mockEvidenceBytes(input.id)
  return sha256Hex(
    concat(textEncoder.encode(input.prevHash), textEncoder.encode(canonicalMetadata(input)), bytes),
  )
}

export interface EvidenceLike extends EvidenceLinkInput {
  integrity: string
  byteMutations?: ByteMutation[]
}

/** Re-hash the item's CURRENT bytes and compare with the sealed hash. */
export async function verifyEvidenceItem(
  item: EvidenceLike,
): Promise<{ ok: boolean; expected: string; actual: string }> {
  const actual = await sealEvidenceLink(item, currentEvidenceBytes(item.id, item.byteMutations))
  return { ok: actual === item.integrity, expected: item.integrity, actual }
}

export interface ChainVerification {
  ok: boolean
  checked: number
  /** First item whose link fails; every item after it is implicitly invalid. */
  breakAtId: string | null
  breakIndex: number
  detail: string
}

/**
 * Verify a whole incident chain, oldest first. Each link is recomputed from the
 * RUNNING previous hash and the item's CURRENT bytes, then compared with the
 * stored hash. Because every later link commits to the earlier hashes, corrupting
 * item k invalidates item k AND every link after it — that is the visible
 * tamper evidence the chain provides.
 */
export async function verifyEvidenceChain(items: EvidenceLike[]): Promise<ChainVerification> {
  let prev = EVIDENCE_GENESIS
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.prevHash !== prev) {
      return {
        ok: false,
        checked: i,
        breakAtId: item.id,
        breakIndex: i,
        detail: `Link ${i + 1} (${item.id}) does not follow the previous item's hash.`,
      }
    }
    const recomputed = await sealEvidenceLink(item, currentEvidenceBytes(item.id, item.byteMutations))
    if (recomputed !== item.integrity) {
      const remaining = items.length - i - 1
      return {
        ok: false,
        checked: i,
        breakAtId: item.id,
        breakIndex: i,
        detail:
          `Link ${i + 1} (${item.id}) content no longer matches its sealed hash.` +
          (remaining > 0
            ? ` ${remaining} later link${remaining === 1 ? '' : 's'} invalidated by the break.`
            : ''),
      }
    }
    prev = item.integrity
  }
  return { ok: true, checked: items.length, breakAtId: null, breakIndex: -1, detail: '' }
}

/**
 * Demo helper: produce byte mutations that visibly corrupt an item's content.
 * Clearly a demonstration affordance — a real adversary would not announce
 * which bytes they flipped.
 */
export function demoCorruptBytes(itemId: string, count = 24): ByteMutation[] {
  const r = rng(`aasha-tamper:${itemId}`)
  const mutations: ByteMutation[] = []
  const used = new Set<number>()
  while (mutations.length < count) {
    const index = Math.floor(r() * 4096)
    if (used.has(index)) continue
    used.add(index)
    mutations.push({ index, value: Math.floor(r() * 256) })
  }
  return mutations
}
