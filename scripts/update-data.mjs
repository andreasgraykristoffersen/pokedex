// Dex robot: runs once a day (GitHub Action) and can be run by hand:
//   node scripts/update-data.mjs
// Does the checks the browser can't do itself (tcgcsv.com sends no CORS
// headers) and writes:
//   data/box-prices.json  current TCGplayer market price of every sealed box
//   data/status.json      what the robot checked and anything that looks wrong
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// tcgcsv.com answers 401 to requests without a User-Agent
const HEADERS = { 'User-Agent': 'pokedex-data-robot (+https://github.com/andreasgraykristoffersen/pokedex)' };

async function getJson(url, tries = 6) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: HEADERS });
      if (r.ok) return await r.json();
      last = new Error(`${r.status} ${url}`);
    } catch (e) { last = e; }
    await sleep(2000 * (i + 1)); // pokemontcg.io often answers 502 at first
  }
  throw last;
}
async function getText(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return (await r.text()).trim();
}

const problems = [];
const status = { checkedAt: new Date().toISOString() };

/* ---- 1. sealed box prices ---- */
const html = await readFile(new URL('index.html', ROOT), 'utf8');
const start = html.indexOf('const REAL_BOXES = [');
const block = html.slice(start, html.indexOf('\n];', start));
const boxes = [...block.matchAll(/\{ name: '([^']+)', setId: '[^']+', img: (\d+)/g)]
  .map(m => ({ name: m[1], id: Number(m[2]) }));

const STOP = new Set(['booster', 'box', 'elite', 'trainer', 'bundle', 'collection', 'ultra', 'premium',
  'super', 'the', 'of', 'and', 'pokemon', 'set']);
const words = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w));

const boxPrices = {};
try {
  const tcgcsvUpdated = await getText('https://tcgcsv.com/last-updated.txt');
  const groups = (await getJson('https://tcgcsv.com/tcgplayer/3/groups')).results;
  // only fetch the price lists of sets the boxes belong to
  const wanted = new Set(boxes.flatMap(b => words(b.name)));
  const candidates = groups.filter(g => {
    const base = g.name.replace(/^[A-Z0-9 ]+:\s*/, '');
    return words(base).some(w => wanted.has(w));
  });
  const ids = new Set(boxes.map(b => b.id));
  for (const g of candidates) {
    const rows = (await getJson(`https://tcgcsv.com/tcgplayer/3/${g.groupId}/prices`)).results;
    for (const r of rows) {
      if (ids.has(r.productId) && (r.marketPrice != null || r.lowPrice != null)) {
        boxPrices[r.productId] = { market: r.marketPrice, low: r.lowPrice };
      }
    }
    await sleep(150);
  }
  for (const b of boxes) if (!boxPrices[b.id]) problems.push(`No TCGplayer price found for box "${b.name}"`);
  await mkdir(new URL('data/', ROOT), { recursive: true });
  await writeFile(new URL('data/box-prices.json', ROOT), JSON.stringify({
    updated: tcgcsvUpdated,
    source: 'TCGplayer market price, via tcgcsv.com',
    prices: boxPrices
  }, null, 1) + '\n');
  status.boxPrices = { updated: tcgcsvUpdated, found: Object.keys(boxPrices).length, of: boxes.length };
} catch (e) {
  problems.push('Box prices: ' + e.message);
}

/* ---- 2. card databases: is anything missing? ---- */
const normSet = s => String(s || '').toLowerCase().replace(/&/g, 'and')
  .replace(/pokémon|pokemon/g, '').replace(/[^a-z0-9]/g, '');
// keep in sync with the same lists in index.html
const SET_ALIAS = { fut20: 'fut2020', me55c: '30th-c' };
const isPocket = id => /^(A\d|B\d|P-A)/.test(id); // TCG Pocket = phone game, not real cards
const SKIP_BACKUP = new Set(['rc']); // already inside Legendary Treasures in the main database
try {
  const main = (await getJson('https://api.pokemontcg.io/v2/sets?pageSize=250&orderBy=-releaseDate&select=id,name,releaseDate,total')).data;
  const dexList = await getJson('https://api.tcgdex.net/v2/en/sets');
  const matched = new Set();
  const shortSets = [];
  for (const m of main) {
    const d = dexList.find(x => x.id === SET_ALIAS[m.id]) || dexList.find(x => normSet(x.name) === normSet(m.name))
      || dexList.find(x => x.id === m.id);
    if (!d) continue;
    matched.add(d.id);
    if (d.cardCount.total > m.total) {
      shortSets.push({ id: d.id, name: d.name, cards: d.cardCount.total, official: d.cardCount.official,
                       mainId: m.id, mainTotal: m.total });
    }
  }
  const extraSets = dexList
    .filter(d => !matched.has(d.id) && !isPocket(d.id) && !SKIP_BACKUP.has(d.id))
    .map(d => ({ id: d.id, name: d.name, cards: d.cardCount.total, official: d.cardCount.official }));
  const newestDex = dexList.filter(d => !isPocket(d.id)).at(-1);
  const nd = await getJson(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(newestDex.id)}`);
  // same shape as getCoverage() in index.html, which uses it when it can't check live
  status.coverage = {
    mainNewest: { name: main[0].name, date: main[0].releaseDate },
    newest: { id: nd.id, name: nd.name, releaseDate: nd.releaseDate, cards: nd.cardCount?.total || 0,
              withImages: (nd.cards || []).filter(c => c.image).length },
    extraSets, shortSets
  };
} catch (e) {
  problems.push('Card databases: ' + e.message);
}

/* ---- 3. card prices fresh? ---- */
try {
  const c = await getJson('https://api.tcgdex.net/v2/en/cards/sv03.5-199');
  status.cardPricesUpdated = c.pricing?.cardmarket?.updated || c.pricing?.tcgplayer?.updated || null;
  const days = (Date.now() - Date.parse(status.cardPricesUpdated)) / 864e5;
  if (!(days < 3)) problems.push(`Card prices are ${Math.round(days)} days old`);
} catch (e) {
  problems.push('Card prices: ' + e.message);
}

/* ---- 4. pokemon count ---- */
try {
  status.pokemonCount = (await getJson('https://pokeapi.co/api/v2/pokemon-species?limit=1')).count;
} catch (e) {
  problems.push('Pokémon database: ' + e.message);
}

status.problems = problems;
await mkdir(new URL('data/', ROOT), { recursive: true });
await writeFile(new URL('data/status.json', ROOT), JSON.stringify(status, null, 1) + '\n');
console.log(JSON.stringify(status, null, 1));
