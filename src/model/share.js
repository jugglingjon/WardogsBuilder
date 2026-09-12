/**
 * Share links. A build is packed into a compact form, deflated and base64url
 * encoded into the URL hash, so a design can be passed around with no account
 * and no server.
 *
 * The packed form replaces the document's field names and element ids with
 * positions and indices before compressing, which matters because the hash has
 * to survive being pasted into a chat window.
 */
const PREFIX_DEFLATED = 'z';
const PREFIX_PLAIN = 'u';

function pack(doc) {
  const types = [...new Set((doc.pieces ?? []).map((p) => p.type))];
  const index = new Map(types.map((type, i) => [type, i]));
  return {
    v: doc.schema ?? 1,
    n: doc.name ?? '',
    g: [doc.grid.width, doc.grid.depth, doc.grid.height],
    t: types,
    p: (doc.pieces ?? []).map((piece) => [
      index.get(piece.type), piece.x, piece.y, piece.z, (piece.rot ?? 0) / 90
    ])
  };
}

function unpack(packed) {
  return {
    schema: packed.v ?? 1,
    name: packed.n ?? '',
    grid: { width: packed.g[0], depth: packed.g[1], height: packed.g[2] },
    pieces: (packed.p ?? []).map((entry, i) => ({
      id: `p${i + 1}`,
      type: packed.t[entry[0]],
      x: entry[1], y: entry[2], z: entry[3],
      rot: (entry[4] ?? 0) * 90
    }))
  };
}

const toBase64Url = (bytes) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text) => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - padded.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

async function through(stream, bytes) {
  const response = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}

/** Compression is skipped rather than failed if the browser lacks it. */
export async function encodeShare(doc) {
  const json = new TextEncoder().encode(JSON.stringify(pack(doc)));
  if (typeof CompressionStream === 'undefined') {
    return PREFIX_PLAIN + toBase64Url(json);
  }
  return PREFIX_DEFLATED + toBase64Url(await through(new CompressionStream('deflate-raw'), json));
}

export async function decodeShare(payload) {
  const prefix = payload[0];
  const body = fromBase64Url(payload.slice(1));
  const json = prefix === PREFIX_DEFLATED
    ? await through(new DecompressionStream('deflate-raw'), body)
    : body;
  return unpack(JSON.parse(new TextDecoder().decode(json)));
}

export async function shareUrl(doc, base = globalThis.location?.href ?? '') {
  const url = new URL(base);
  url.hash = `b=${await encodeShare(doc)}`;
  return url.toString();
}

/** The build encoded in a URL hash, or null. Never throws on a mangled link. */
export async function readShare(hash = globalThis.location?.hash ?? '') {
  const match = /[#&]b=([A-Za-z0-9\-_]+)/.exec(hash);
  if (!match) return null;
  try {
    return await decodeShare(match[1]);
  } catch {
    return null;
  }
}
