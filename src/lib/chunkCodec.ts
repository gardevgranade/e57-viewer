/**
 * Binary chunk format for streaming point cloud data.
 *
 * Header (10 bytes):
 *   [0]     version:    u8   (= 1)
 *   [1..4]  chunkIndex: u32 LE
 *   [5..8]  pointCount: u32 LE
 *   [9]     flags:      u8   bit0=hasColor, bit1=hasIntensity
 *
 * Body (pointCount × stride bytes, Float32 LE):
 *   xyz always present (3 floats = 12 bytes per point)
 *   if hasColor:     rgb as 3 floats [0..1] (12 bytes)
 *   if hasIntensity: 1 float [0..1]          (4 bytes)
 *
 * Transmitted over SSE as a base64-encoded string.
 */

export const CHUNK_VERSION = 1
export const FLAG_HAS_COLOR = 0b01
export const FLAG_HAS_INTENSITY = 0b10

export interface PointChunk {
  version: number
  chunkIndex: number
  pointCount: number
  hasColor: boolean
  hasIntensity: boolean
  /** interleaved Float32: x y z [r g b] [intensity] per point */
  data: Float32Array
}

// ---------- Encoder (server-side) ----------

export function encodeChunk(chunk: Omit<PointChunk, 'version'>): Buffer {
  const flags =
    (chunk.hasColor ? FLAG_HAS_COLOR : 0) |
    (chunk.hasIntensity ? FLAG_HAS_INTENSITY : 0)

  const stride = 3 + (chunk.hasColor ? 3 : 0) + (chunk.hasIntensity ? 1 : 0)
  const headerBytes = 10
  const bodyBytes = chunk.pointCount * stride * 4

  const buf = Buffer.allocUnsafe(headerBytes + bodyBytes)
  buf.writeUInt8(CHUNK_VERSION, 0)
  buf.writeUInt32LE(chunk.chunkIndex, 1)
  buf.writeUInt32LE(chunk.pointCount, 5)
  buf.writeUInt8(flags, 9)

  const view = new DataView(buf.buffer, buf.byteOffset + headerBytes)
  const src = chunk.data
  for (let i = 0; i < chunk.pointCount * stride; i++) {
    view.setFloat32(i * 4, src[i] ?? 0, true)
  }

  return buf
}

export function encodeChunkBase64(chunk: Omit<PointChunk, 'version'>): string {
  return encodeChunk(chunk).toString('base64')
}

// ---------- Decoder (client-side) ----------

export function decodeChunk(base64: string): PointChunk {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const view = new DataView(bytes.buffer)
  const version = view.getUint8(0)
  const chunkIndex = view.getUint32(1, true)
  const pointCount = view.getUint32(5, true)
  const flags = view.getUint8(9)

  const hasColor = (flags & FLAG_HAS_COLOR) !== 0
  const hasIntensity = (flags & FLAG_HAS_INTENSITY) !== 0
  const stride = 3 + (hasColor ? 3 : 0) + (hasIntensity ? 1 : 0)

  // The header is 10 bytes — NOT 4-byte aligned, so we can't create a Float32Array
  // view directly at offset 10 (browsers throw RangeError). Copy the body bytes
  // into a fresh Float32Array instead.
  const data = new Float32Array(pointCount * stride)
  new Uint8Array(data.buffer).set(bytes.subarray(10, 10 + pointCount * stride * 4))

  return { version, chunkIndex, pointCount, hasColor, hasIntensity, data }
}
