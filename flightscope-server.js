// FlightScope — Node server (Node 18+). Run:  node flightscope-server.js   then open http://localhost:8787
// Serves the page at / and relays the flight feeds at /api/*. Set CONTACT below (or FLIGHTSCOPE_CONTACT) before running.
// Environment:  PORT=8787                 listening port
//               HOST=127.0.0.1            set HOST=0.0.0.0 to open the map from a phone or laptop on the same network
//               FLIGHTSCOPE_CONTACT=...   email or URL sent to the upstream feeds in the User-Agent (overrides CONTACT)
//               OPENSKY_CLIENT_ID=...     OpenSky API client (OAuth2 client credentials) for the higher quota; both or neither
//               OPENSKY_CLIENT_SECRET=...
// The same variables can be put in a flightscope.env file next to this script (KEY=VALUE lines), which is handy when
// the relay is started by FlightScope.cmd. A variable set in the real environment wins over the file.
//
// node flightscope-server.js --build-worker   regenerates flightscope-worker.js (the Cloudflare Worker version) from
// the relay section below plus flightscope.html. Run it after changing either; never edit the worker file by hand.
// node flightscope-server.js --build-icon     writes FlightScope.ico (the /favicon.ico bytes) next to this file; the desktop
// shortcut that "FlightScope.cmd shortcut" creates uses it.

const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const ENV_FILE = path.join(__dirname, 'flightscope.env');
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const cfg = k => process.env[k]; // the relay section reads configuration only through this (the worker supplies its own)

/* ---- relay start: shared with flightscope-worker.js, regenerate it with --build-worker ----
   Everything down to the end marker must stay portable: no require/process/fs, config via cfg(), page via pageResponse().
   FlightScope relay — fetches open ADS-B feeds server-side (they don't allow direct
   browser calls) and returns one normalized JSON shape with CORS headers.
   Routes:  GET  /                      the FlightScope page (flightscope.html next to this file, read from disk)
            GET  /manifest.webmanifest   web app manifest; /icon-{64,180,192,512,1024}.png and /apple-touch-icon.png: the icon, drawn here
            GET  /favicon.ico            the same icon as a multi-size ICO on a rounded tile (what --build-icon writes to FlightScope.ico)
            GET  /privacy                privacy and data-source notice (an App Store listing needs a URL for it)
            GET  /api/feed?lat&lon&dist  aircraft near a point (dist in nautical miles, max 250)
            POST /api/route             {planes:[{callsign,lat,lng}]} → origin/destination (adsb.lol)
            GET  /api/track?icao=hex    recent trajectory from OpenSky (best effort; authenticated when credentials are set)
            GET  /api/photo?hex=hex     latest photo from planespotters.net                       */

const CONTACT = 'you@example.com'; // ← put a real email or URL here (or set FLIGHTSCOPE_CONTACT): the upstream feeds ask for a way to reach you
const contact = () => cfg('FLIGHTSCOPE_CONTACT') || CONTACT;
const ua = () => `FlightScope/1.0 (+${contact()})`;
const FEED_TTL_MS = 2500;   // coalesce bursts of identical requests
const UPSTREAM_TIMEOUT_MS = 7000;

/* OpenSky: anonymous callers get 400 credits/day at 10 s resolution and the tracks endpoint often refuses them.
   An API client created at https://opensky-network.org/my-opensky (OAuth2 client credentials) raises that to
   4000 credits at 5 s. The token lasts ~30 min and is fetched on demand; if the token request fails the relay
   goes on anonymously and tries again a minute later, so bad credentials never take the feed down. */
const openskyId = () => cfg('OPENSKY_CLIENT_ID') || '', openskySecret = () => cfg('OPENSKY_CLIENT_SECRET') || '';
const OPENSKY_TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const osk = { token: null, exp: 0, retryAt: 0, pending: null };
async function openskyHeaders() {
  if (!openskyId() || !openskySecret()) return {};
  const now = Date.now();
  if (osk.token && now < osk.exp) return { authorization: `Bearer ${osk.token}` };
  if (now < osk.retryAt) return {};
  if (!osk.pending) osk.pending = fetchOpenskyToken().finally(() => { osk.pending = null; });
  await osk.pending;
  return osk.token ? { authorization: `Bearer ${osk.token}` } : {};
}
async function fetchOpenskyToken() {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const r = await fetch(OPENSKY_TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': ua() },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: openskyId(), client_secret: openskySecret() }), signal: ctrl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || `HTTP ${r.status}`);
    osk.token = j.access_token; osk.exp = Date.now() + Math.max(60, (j.expires_in || 1800) - 60) * 1000;
  } catch (e) {
    osk.token = null; osk.retryAt = Date.now() + 60000;
    console.warn(`FlightScope: OpenSky token request failed (${e.message || e}); using anonymous OpenSky access for the next minute.`);
  } finally { clearTimeout(t); }
}

const OPENSKY_CAT = { 2:'A1', 3:'A2', 4:'A3', 5:'A4', 6:'A5', 7:'A6', 8:'A7', 9:'B1', 10:'B2', 11:'B3', 12:'B4', 14:'B6', 15:'B7', 16:'C1', 17:'C2', 18:'C3', 19:'C4', 20:'C5' };
const M_TO_FT = 3.28084, MS_TO_KT = 1.94384, MS_TO_FPM = 196.85;

const SOURCES = [
  { name: 'adsb.fi',        url: (la, lo, d) => `https://opendata.adsb.fi/api/v2/lat/${la}/lon/${lo}/dist/${d}`, list: j => j.aircraft, now: j => j.now * 1000 },
  { name: 'adsb.lol',       url: (la, lo, d) => `https://api.adsb.lol/v2/lat/${la}/lon/${lo}/dist/${d}`,         list: j => j.ac,       now: j => j.now },
  { name: 'airplanes.live', url: (la, lo, d) => `https://api.airplanes.live/v2/point/${la}/${lo}/${d}`,          list: j => j.ac,       now: j => j.now },
  { name: 'OpenSky',        url: (la, lo, d) => { const dLat = d / 60, dLon = d / (60 * Math.max(0.2, Math.cos(la * Math.PI / 180)));
      return `https://opensky-network.org/api/states/all?lamin=${(la - dLat).toFixed(3)}&lomin=${(lo - dLon).toFixed(3)}&lamax=${(la + dLat).toFixed(3)}&lomax=${(lo + dLon).toFixed(3)}&extended=1`; },
    list: j => (j.states || []).map(s => ({
      hex: s[0], flight: (s[1] || '').trim(), origin_country: s[2], lat: s[6], lon: s[5],
      alt_baro: s[8] ? 'ground' : (s[7] == null ? null : Math.round(s[7] * M_TO_FT)),
      alt_geom: s[13] == null ? null : Math.round(s[13] * M_TO_FT),
      gs: s[9] == null ? null : +(s[9] * MS_TO_KT).toFixed(1), track: s[10],
      baro_rate: s[11] == null ? null : Math.round(s[11] * MS_TO_FPM), squawk: s[14], spi: s[15] ? 1 : 0,
      type: ['adsb_icao', 'other', 'mlat', 'other'][s[16]] || 'other', category: OPENSKY_CAT[s[17]] || null,
      seen: Math.max(0, j.time - s[4]), seen_pos: s[3] == null ? null : Math.max(0, j.time - s[3]),
    })), now: j => j.time * 1000, auth: openskyHeaders },
];

const feedCache = new Map();
// A source that refused (403), failed or timed out is skipped for SOURCE_REST_MS. Seen from Cloudflare on 2026-10-31: adsb.fi
// answers 403, airplanes.live 403 and OpenSky never answers (the 7 s timeout), so without this every request paid for all
// three. A 429 does not rest the source: adsb.lol rate-limits Cloudflare's shared addresses in bursts but is the only one left.
const SOURCE_REST_MS = 120000;
const sourceRest = new Map(); // source name -> time it may be tried again
const trackCache = new Map(); // icao -> {t, status, body}: a page fetches a track once per selection; repeats hit this and spare the OpenSky quota
const TRACK_TTL_MS = 60000, TRACK_FAIL_TTL_MS = 20000;

function cors(extra) { return Object.assign({ 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'cache-control': 'no-store' }, extra || {}); }
function json(data, status, extra) { return new Response(JSON.stringify(data), { status: status || 200, headers: cors(Object.assign({ 'content-type': 'application/json; charset=utf-8' }, extra || {})) }); }
async function upstream(url, init) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    // init's own headers are merged on top of the defaults (the old order let a caller's headers replace the User-Agent)
    const r = await fetch(url, Object.assign({}, init || {}, { headers: Object.assign({ 'user-agent': ua(), accept: 'application/json' }, (init && init.headers) || {}), signal: ctrl.signal }));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function feed(url) {
  const lat = +url.searchParams.get('lat'), lon = +url.searchParams.get('lon');
  const dist = Math.min(250, Math.max(1, Math.round(+url.searchParams.get('dist') || 50)));
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json({ error: 'lat/lon required' }, 400);
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${dist}`;
  const hit = feedCache.get(key);
  if (hit && Date.now() - hit.t < FEED_TTL_MS) return json(hit.body, 200, { 'x-cache': 'hit' });
  const la = +lat.toFixed(4), lo = +lon.toFixed(4); // numbers, not strings: OpenSky's bounding box adds to them
  const errors = [], ready = SOURCES.filter(s => (sourceRest.get(s.name) || 0) <= Date.now());
  for (const s of ready.length ? ready : SOURCES) { // all resting: try them all rather than none
    try {
      const j = await upstream(s.url(la, lo, dist), s.auth ? { headers: await s.auth() } : undefined);
      const ac = (s.list(j) || []).filter(a => a && typeof a.lat === 'number' && typeof a.lon === 'number');
      const now = s.now(j); const body = { now: isFinite(now) ? now : Date.now(), source: s.name, total: ac.length, ac };
      sourceRest.delete(s.name);
      feedCache.set(key, { t: Date.now(), body });
      if (feedCache.size > 200) feedCache.delete(feedCache.keys().next().value);
      return json(body, 200, { 'x-source': s.name });
    } catch (e) {
      const msg = String((e && e.message) || e);
      errors.push(`${s.name}: ${msg}`);
      if (!/HTTP 429/.test(msg)) sourceRest.set(s.name, Date.now() + SOURCE_REST_MS);
    }
  }
  return json({ error: 'All upstream feeds failed', detail: errors }, 502);
}
async function route(request) {
  let body; try { body = await request.json(); } catch (e) { return json({ error: 'JSON body required' }, 400); }
  const planes = Array.isArray(body && body.planes) ? body.planes.slice(0, 20) : [];
  if (!planes.length) return json({ error: 'planes[] required' }, 400);
  const errors = [];
  for (const host of ['https://adsb.im/api/0/routeset', 'https://api.adsb.lol/api/0/routeset']) {
    try {
      const j = await upstream(host, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planes }) });
      if (Array.isArray(j)) return json(j);
      errors.push(`${host}: unexpected reply`);
    } catch (e) { errors.push(`${host}: ${e.message || e}`); }
  }
  return json({ error: 'route lookup failed', detail: errors }, 502);
}
async function track(url) {
  const icao = (url.searchParams.get('icao') || '').toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(icao)) return json({ error: 'icao (6 hex chars) required' }, 400);
  const hit = trackCache.get(icao);
  if (hit && Date.now() - hit.t < (hit.status === 200 ? TRACK_TTL_MS : TRACK_FAIL_TTL_MS)) return json(hit.body, hit.status, { 'x-cache': 'hit' });
  let status = 200, body;
  try { body = await upstream(`https://opensky-network.org/api/tracks/all?icao24=${icao}&time=0`, { headers: await openskyHeaders() }); }
  catch (e) { // OpenSky answers 404 when it has no track for the aircraft and 429 when the per-IP quota is used up
    const m = /HTTP (\d+)/.exec(String(e.message || e)); status = m && m[1] === '429' ? 429 : 502;
    body = { error: status === 429 ? 'OpenSky quota reached' : 'track unavailable', detail: String(e.message || e) };
  }
  trackCache.set(icao, { t: Date.now(), status, body });
  if (trackCache.size > 500) trackCache.delete(trackCache.keys().next().value);
  return json(body, status);
}
async function photo(url) {
  const hex = (url.searchParams.get('hex') || '').toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(hex)) return json({ error: 'hex required' }, 400);
  try { return json(await upstream(`https://api.planespotters.net/pub/photos/hex/${hex}`)); }
  catch (e) { return json({ photos: [], error: String(e.message || e) }, 200); }
}

/* ---- app icon, web manifest, privacy page ----
   The icon is a radar scope: the page's airliner silhouette turned 32° right on the map's dark colour, two faint
   range rings and a sweep fading out behind its heading line. It is rasterised here so neither host needs image
   files: polygon coverage by sub-scanlines for the aircraft, per-pixel maths for the rest, PNG chunks by hand, zlib
   through CompressionStream (Node 18+ and Workers), cached per size. The PNG routes are opaque squares (the App Store
   asset and the maskable manifest icon must be full-bleed): 1024 for the App Store, 180 the iOS home-screen icon,
   192/512 the manifest. /favicon.ico is a real ICO (16–64 as 32-bit bitmaps, 256 as PNG) on a rounded tile with
   transparent corners; --build-icon writes the same bytes to FlightScope.ico for the desktop shortcut. */
const ICON_SIZES = [64, 180, 192, 512, 1024], ICO_SIZES = [16, 24, 32, 48, 64, 256];
const ICON_BG = [12, 18, 24], ICON_GLOW = [26, 42, 60], ICON_FG = [244, 177, 63]; // the page's --bg, a lift towards the centre, --accent
const ICON_TURN = 32 * Math.PI / 180; // the aircraft's heading, clockwise from up
const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const iconCache = new Map();
let crcTable;
function crc32(bytes) {
  if (!crcTable) { crcTable = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
  let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i); out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length))); return out;
}
const cat = parts => { const out = new Uint8Array(parts.reduce((n, q) => n + q.length, 0)); let o = 0; for (const q of parts) { out.set(q, o); o += q.length; } return out; };
async function deflate(bytes) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); }
/* Anti-aliased coverage (0..1 per pixel) of polygons in pixel coordinates: non-zero winding, 4×4 sub-samples per pixel. */
function coverage(size, polys) {
  const ss = 4, cov = new Float32Array(size * size), w = 1 / (ss * ss), edges = [];
  for (const pts of polys) {
    let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const dir = area >= 0 ? 1 : -1; // one orientation for every polygon, so overlaps add up instead of cancelling
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if (a[1] !== b[1]) edges.push(a[1] < b[1] ? [a[0], a[1], b[0], b[1], dir] : [b[0], b[1], a[0], a[1], -dir]); }
  }
  for (let sy = 0; sy < size * ss; sy++) {
    const y = (sy + 0.5) / ss, row = Math.floor(sy / ss) * size, xs = [];
    for (const e of edges) if (y >= e[1] && y < e[3]) xs.push([e[0] + (y - e[1]) * (e[2] - e[0]) / (e[3] - e[1]), e[4]]);
    if (xs.length < 2) continue;
    xs.sort((a, b) => a[0] - b[0]);
    let wind = 0;
    for (let i = 0; i + 1 < xs.length; i++) {
      wind += xs[i][1]; if (!wind) continue;
      const xa = Math.max(0, xs[i][0] * ss), xb = Math.min(size * ss, xs[i + 1][0] * ss);
      for (let sx = Math.floor(xa); sx < xb; sx++) cov[row + (sx / ss | 0)] += (Math.min(xb, sx + 1) - Math.max(xa, sx)) * w;
    }
  }
  return cov;
}
function iconPolys(size) { // the page's airliner silhouette (ICONS.airliner: right half of a 24-unit box, mirrored) at 66% of the icon
  const half = [[12, 0.8], [13.1, 2.6], [13.3, 8.4], [22.6, 14.4], [22.6, 15.8], [13.4, 12.8], [13.3, 18.6], [16.9, 20.8], [16.9, 22], [12, 21.6]];
  const pts = half.concat(half.slice(1, -1).reverse().map(([x, y]) => [24 - x, y]));
  const k = size * 0.66 / 24, c = size / 2, cs = Math.cos(ICON_TURN), sn = Math.sin(ICON_TURN);
  return [pts.map(([x, y]) => { const dx = (x - 12) * k, dy = (y - 11.4) * k; return [c + dx * cs - dy * sn, c + dx * sn + dy * cs]; })];
}
/* Straight-alpha RGBA pixels of the icon. rounded: a tile with rounded transparent corners and a faint rim (the ICO);
   otherwise a full opaque square. */
function iconPixels(size, rounded) {
  const cov = coverage(size, iconPolys(size)), out = new Uint8Array(size * size * 4), c = (size - 1) / 2;
  const rr = size * 0.21, hw = size / 2 - 0.5; // tile corner radius and half-width
  const rings = [[0.27, 0.32], [0.43, 0.22]], rw = Math.max(1, size * 0.012); // ring radius (fraction of size) and alpha; ring width
  const sweepR = size * 0.45, sweepArc = 1.9; // sweep radius and angular length (rad), trailing the heading line counter-clockwise
  const px = [0, 0, 0];
  for (let y = 0, i = 0, p = 0; y < size; y++) for (let x = 0; x < size; x++, i++, p += 4) {
    const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
    let tile = 1, sd = -1e9;
    if (rounded) { // signed distance to the rounded square, 1 px anti-aliased edge
      const qx = Math.abs(dx) - (hw - rr), qy = Math.abs(dy) - (hw - rr);
      sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
      tile = Math.min(1, Math.max(0, 0.5 - sd)); if (!tile) continue; // transparent corner
    }
    const lift = Math.max(0, 1 - d / (size * 0.75)); // a little lighter towards the centre
    for (let ch = 0; ch < 3; ch++) px[ch] = ICON_BG[ch] + (ICON_GLOW[ch] - ICON_BG[ch]) * lift;
    let ang = Math.atan2(dx, -dy) - ICON_TURN; ang = ((ang % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI; // -π..π, 0 on the heading line
    const frac = -ang / sweepArc; // 0 at the heading line, 1 at the far edge of the sweep
    let a = frac > 0 && frac < 1 && d < sweepR ? 0.3 * (1 - frac) * Math.min(1, sweepR - d) : 0;
    for (const [rf, ra] of rings) a = Math.max(a, Math.max(0, 1 - Math.abs(d - size * rf) / rw) * ra); // thin rings
    a = Math.max(a, Math.min(1, cov[i])); // the aircraft on top, solid
    const rim = rounded ? Math.max(0, 1 - Math.abs(sd + 1.2)) * 0.16 : 0; // faint light rim so the tile reads on dark wallpaper
    for (let ch = 0; ch < 3; ch++) out[p + ch] = Math.round(px[ch] + (ICON_FG[ch] - px[ch]) * a + (255 - px[ch]) * rim * (1 - a));
    out[p + 3] = Math.round(255 * tile);
  }
  return out;
}
async function encodePNG(size, rgba, alpha) { // 8-bit RGBA (alpha) or RGB, filter byte 0 ahead of every row
  const bpp = alpha ? 4 : 3, raw = new Uint8Array((size * bpp + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * bpp + 1) + 1;
    if (alpha) raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), row);
    else for (let x = 0; x < size; x++) { const q = (y * size + x) * 4; raw[row + x * 3] = rgba[q]; raw[row + x * 3 + 1] = rgba[q + 1]; raw[row + x * 3 + 2] = rgba[q + 2]; }
  }
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer); dv.setUint32(0, size); dv.setUint32(4, size); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  return cat([PNG_SIG, pngChunk('IHDR', ihdr), pngChunk('IDAT', await deflate(raw)), pngChunk('IEND', new Uint8Array(0))]);
}
async function iconPNG(size) { // opaque square: the App Store wants no transparency, maskable manifest icons are cropped by the device
  if (!iconCache.has(size)) iconCache.set(size, await encodePNG(size, iconPixels(size, false), false));
  return iconCache.get(size);
}
async function iconICO() { // 16–64 as 32-bit bottom-up BGRA bitmaps with a 1-bit transparency mask, 256 as PNG; rounded tile
  if (iconCache.has('ico')) return iconCache.get('ico');
  const images = [];
  for (const s of ICO_SIZES) {
    const rgba = iconPixels(s, true);
    if (s >= 256) { images.push([s, await encodePNG(s, rgba, true)]); continue; }
    const stride = Math.ceil(s / 32) * 4, dib = new Uint8Array(40 + s * s * 4 + stride * s), dv = new DataView(dib.buffer);
    dv.setUint32(0, 40, true); dv.setInt32(4, s, true); dv.setInt32(8, s * 2, true); dv.setUint16(12, 1, true); dv.setUint16(14, 32, true); dv.setUint32(20, s * s * 4, true);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const q = (y * s + x) * 4, o = 40 + ((s - 1 - y) * s + x) * 4;
      dib[o] = rgba[q + 2]; dib[o + 1] = rgba[q + 1]; dib[o + 2] = rgba[q]; dib[o + 3] = rgba[q + 3];
      if (!rgba[q + 3]) dib[40 + s * s * 4 + (s - 1 - y) * stride + (x >> 3)] |= 0x80 >> (x & 7); // mask bit set = transparent
    }
    images.push([s, dib]);
  }
  const head = new Uint8Array(6 + 16 * images.length), hv = new DataView(head.buffer); hv.setUint16(2, 1, true); hv.setUint16(4, images.length, true);
  let off = head.length;
  images.forEach(([s, img], n) => { const e = 6 + 16 * n; head[e] = s & 255; head[e + 1] = s & 255; hv.setUint16(e + 4, 1, true); hv.setUint16(e + 6, 32, true); hv.setUint32(e + 8, img.length, true); hv.setUint32(e + 12, off, true); off += img.length; });
  const ico = cat([head, ...images.map(x => x[1])]); iconCache.set('ico', ico); return ico;
}
const MANIFEST = {
  name: 'FlightScope', short_name: 'FlightScope', description: 'Live aircraft radar with trails and full aircraft details, fed by open ADS-B networks.',
  start_url: '/', scope: '/', display: 'standalone', orientation: 'any', background_color: '#0c1218', theme_color: '#0c1218',
  icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
};
const PRIVACY_UPDATED = '2026-10-28';
const escHtml = v => String(v).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function privacyPage() { // the notice an app-store listing links to; the contact comes from FLIGHTSCOPE_CONTACT
  const c = contact(), who = c && c !== 'you@example.com'
    ? (/^https?:/.test(c) ? `<a href="${escHtml(c)}">${escHtml(c)}</a>` : /@/.test(c) ? `<a href="mailto:${escHtml(c)}">${escHtml(c)}</a>` : escHtml(c))
    : 'the operator of this relay (no contact address is configured yet: set FLIGHTSCOPE_CONTACT)';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>FlightScope privacy</title>
<style>:root{color-scheme:light dark}body{max-width:720px;margin:0 auto;padding:28px 20px 60px;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#0c1218;color:#e6edf3}
h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px}p,li{margin:6px 0}a{color:#f4b13f}small{opacity:.7}
@media (prefers-color-scheme:light){body{background:#edf0f3;color:#1b2430}a{color:#9a5f00}}</style></head>
<body>
<h1>FlightScope privacy</h1>
<p><small>Last updated ${PRIVACY_UPDATED}</small></p>
<p>FlightScope shows live aircraft positions from open ADS-B networks on a map. It has no accounts, no advertising, no analytics and no tracking. This page describes the little data that moves when you use it, in a browser or in the iOS app.</p>
<h2>Location</h2>
<p>Your device location is used only when you press <b>Locate</b>: the map and the optional range rings centre on you. The system asks for permission first, and everything works without it. The position stays in memory; it is not written to disk or sent anywhere by itself.</p>
<h2>What leaves your device</h2>
<ul>
<li><b>The map area.</b> To list the aircraft in view, the page sends the centre and radius of the map (latitude, longitude, distance) to this relay, which forwards them to the flight data providers below. After Locate that area is around you. The relay keeps no record of these requests.</li>
<li><b>Aircraft identifiers.</b> Selecting an aircraft sends its transponder code or callsign to the relay (route, photo and flight-history lookups) and to Wikipedia / Wikimedia Commons (fallback photos).</li>
<li><b>Map tiles.</b> Map images load directly from the tile providers below, which see your IP address and the tile coordinates, as with any web map.</li>
<li><b>Fallback relays.</b> If no FlightScope relay answers, the web page tries the public relays allorigins.win and codetabs.com for the feed request. The iOS app always uses its own relay.</li>
</ul>
<h2>Stored on your device</h2>
<p>Settings (map style, units, refresh rate, overlays), the last map position and a small cache of aircraft type photos are kept in the browser's or the app's local web storage. Nothing is stored on the relay.</p>
<h2>Third-party services</h2>
<ul>
<li>Flight data: <a href="https://adsb.fi">adsb.fi</a>, <a href="https://adsb.lol">adsb.lol</a>, <a href="https://airplanes.live">airplanes.live</a>, <a href="https://opensky-network.org">The OpenSky Network</a> (positions and flight history); <a href="https://adsb.im">adsb.im</a> / adsb.lol route lookups.</li>
<li>Photos: <a href="https://www.planespotters.net">Planespotters.net</a>, <a href="https://www.wikipedia.org">Wikipedia</a> and <a href="https://commons.wikimedia.org">Wikimedia Commons</a>.</li>
<li>Maps: <a href="https://www.esri.com">Esri</a> basemaps, <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://www.rainviewer.com">RainViewer</a> rain radar, <a href="https://fonts.google.com">Google Fonts</a>.</li>
</ul>
<p>Each service receives only what is needed to answer the request and applies its own privacy policy.</p>
<h2>Contact</h2>
<p>Questions about this notice: ${who}.</p>
</body></html>
`;
}

async function handle(request) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  const p = url.pathname.replace(/\/+$/, '') || '/';
  if (p === '/' || p === '/index.html') return pageResponse(); // defined by the host: file on disk here, embedded HTML in the worker
  if (p === '/manifest.webmanifest') return new Response(JSON.stringify(MANIFEST), { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=86400' } });
  if (p === '/privacy') return new Response(privacyPage(), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
  if (p === '/favicon.ico') return new Response(await iconICO(), { headers: { 'content-type': 'image/x-icon', 'cache-control': 'public, max-age=86400' } });
  const icon = /^\/icon-(\d+)\.png$/.exec(p), iconSize = icon ? +icon[1] : p === '/apple-touch-icon.png' ? 180 : 0;
  if (iconSize) return ICON_SIZES.includes(iconSize) ? new Response(await iconPNG(iconSize), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } }) : json({ error: 'icon sizes: ' + ICON_SIZES.join(', ') }, 404);
  if (p === '/api/feed') return feed(url);
  if (p === '/api/route' && request.method === 'POST') return route(request);
  if (p === '/api/track') return track(url);
  if (p === '/api/photo') return photo(url);
  if (p === '/api' || p === '/api/health') return json({ ok: true, service: 'FlightScope relay', sources: SOURCES.map(s => s.name), opensky: openskyId() && openskySecret() ? 'client credentials' : 'anonymous',
    resting: Object.fromEntries([...sourceRest].filter(([, t]) => t > Date.now()).map(([n, t]) => [n, Math.round((t - Date.now()) / 1000)])) }); // seconds until each is tried again
  return json({ error: 'not found' }, 404);
}
/* ---- relay end ---- */

const PORT = +(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1'; // loopback only by default; HOST=0.0.0.0 shares it on the local network
const PAGE_FILE = path.join(__dirname, 'flightscope.html'); // read on every request, so edits show on the next reload without a restart
const WORKER_FILE = path.join(__dirname, 'flightscope-worker.js');
const ICO_FILE = path.join(__dirname, 'FlightScope.ico');
const BUILD_ICON = process.argv.includes('--build-icon'); // write the icon and exit instead of serving
const BUILD_WORKER = process.argv.includes('--build-worker'); // write flightscope-worker.js and exit instead of serving
const BUILDING = BUILD_ICON || BUILD_WORKER; // both builds are asynchronous, so the server start below must skip itself

if (!fs.existsSync(PAGE_FILE)) {
  console.error(`FlightScope: cannot find ${PAGE_FILE}\nflightscope.html must sit next to flightscope-server.js; the relay has no built-in copy of the page.`);
  process.exit(1);
}

if (BUILD_WORKER) {
  // Splice the relay section of this very file and the page into a Cloudflare Worker module. The markers are
  // looked up as concatenated strings so that these lines do not match themselves.
  const src = fs.readFileSync(__filename, 'utf8');
  const a = src.indexOf('/* ---- relay ' + 'start'), b = src.indexOf('/* ---- relay ' + 'end');
  if (a < 0 || b < 0 || b < a) { console.error('FlightScope: relay markers not found in flightscope-server.js; nothing written.'); process.exit(1); }
  const relay = src.slice(a, b).trimEnd();
  const html = fs.readFileSync(PAGE_FILE, 'utf8');
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  // The icons are drawn here and shipped as base64. Drawing one takes 11-48 ms of CPU on a fresh isolate, and the Workers
  // free plan allows 10 ms per request (error 1102 past that), which would break Android's "Install app". The 1024 App
  // Store size is still drawn on demand: fetch that one from the local relay.
  (async () => {
    const icons = {};
    for (const s of ICON_SIZES.filter(s => s <= 512)) icons[s] = Buffer.from(await iconPNG(s)).toString('base64');
    icons.ico = Buffer.from(await iconICO()).toString('base64');
    const out = [
      `// FlightScope — Cloudflare Worker (module syntax). GENERATED ${stamp} by "node flightscope-server.js --build-worker".`,
      '// Do not edit: change flightscope.html or the relay section of flightscope-server.js, regenerate, and paste this whole',
      '// file into a Worker. Optional Worker variables/secrets: FLIGHTSCOPE_CONTACT, OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET.',
      '',
      'const ENV = {}; // copied from the Worker environment (vars + secrets) on each request',
      'const cfg = k => ENV[k];',
      '',
      relay,
      '',
      "function pageResponse() { return new Response(HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } }); }",
      '// Icons drawn at build time (ICON_BYTES below). A request for one decodes it into the relay section\'s iconCache first,',
      '// so iconPNG() and iconICO() find it there and never draw: drawing costs more CPU than the free plan allows.',
      "const ICON_PATH = { '/apple-touch-icon.png': 180, '/favicon.ico': 'ico' };",
      'function prebuiltIcon(url) {',
      "  const p = new URL(url).pathname, m = /^\\/icon-(\\d+)\\.png$/.exec(p), k = m ? +m[1] : ICON_PATH[p];",
      '  if (k !== undefined && !iconCache.has(k) && ICON_BYTES[k]) iconCache.set(k, Uint8Array.from(atob(ICON_BYTES[k]), c => c.charCodeAt(0)));',
      '}',
      'export default { fetch(request, env) { Object.assign(ENV, env || {}); prebuiltIcon(request.url); return handle(request); } };',
      '',
      `const ICON_BYTES = ${JSON.stringify(icons)};`,
      `const HTML = ${JSON.stringify(html)};`,
      '',
    ].join('\n');
    fs.writeFileSync(WORKER_FILE, out);
    console.log(`FlightScope: wrote ${WORKER_FILE} (${Math.round(out.length / 1024)} KB: relay ${relay.length} chars + page ${html.length} chars + icons ${Object.keys(icons).join('/')})`);
    process.exit(0);
  })().catch(e => { console.error(`FlightScope: could not build the worker: ${e.message}`); process.exit(1); });
}

if (BUILD_ICON) {
  iconICO().then(ico => { fs.writeFileSync(ICO_FILE, ico); console.log(`FlightScope: wrote ${ICO_FILE} (${ico.length} bytes: ${ICO_SIZES.join('/')} px)`); process.exit(0); })
    .catch(e => { console.error(`FlightScope: could not build the icon: ${e.message}`); process.exit(1); });
}
if (!BUILDING && contact() === 'you@example.com') console.warn('FlightScope: CONTACT is still the placeholder. Set FLIGHTSCOPE_CONTACT (flightscope.env or the environment) or edit CONTACT in flightscope-server.js so the feed operators can reach you.');
if (!BUILDING && !!openskyId() !== !!openskySecret()) console.warn('FlightScope: OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET must both be set; OpenSky stays anonymous.');

async function pageResponse() {
  try { return new Response(await fs.promises.readFile(PAGE_FILE), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } }); }
  catch (e) {
    console.error(`FlightScope: could not read ${PAGE_FILE}: ${e.message}`);
    return new Response(`FlightScope relay is running but cannot read flightscope.html (${e.code || e.message}). Put the file back next to flightscope-server.js and reload.`,
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
}

if (!BUILDING) http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : null;
    const request = new Request(`http://${req.headers.host || 'localhost'}${req.url}`, { method: req.method, headers: req.headers, body: (req.method === 'GET' || req.method === 'HEAD') ? undefined : body });
    const response = await handle(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e && e.message || e) }));
  }
})
.on('error', e => {
  console.error(e.code === 'EADDRINUSE'
    ? `FlightScope: port ${PORT} is already in use. Is the relay already running? Stop it first (FlightScope.cmd does) or run with PORT=<other port>.`
    : `FlightScope: ${e.message}`);
  process.exit(1);
})
.listen(PORT, HOST, () => {
  console.log(`FlightScope running at http://localhost:${PORT}  (page: ${PAGE_FILE})`);
  console.log(openskyId() && openskySecret() ? `OpenSky: API client ${openskyId()}` : 'OpenSky: anonymous (set OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET for the higher quota)');
  if (HOST === '0.0.0.0' || HOST === '::') {
    // Reachable from other devices: list the addresses a phone on the same Wi-Fi can open.
    const lan = [];
    for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) lan.push(`http://${i.address}:${PORT}`);
    console.log(lan.length ? `Also on your network: ${lan.join('  ')}` : `Listening on ${HOST}:${PORT} (no network address found)`);
  }
});
