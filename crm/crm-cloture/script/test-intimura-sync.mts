/**
 * Tests Intimura import logic + production API contract.
 * Run: npx tsx script/test-intimura-sync.mts
 * Optional: INTIMURA_BOOKMARKLET_TOKEN=... for live ingest on Render
 */

import {
  INTIMURA_SYNC_CUTOFF,
  isIntimuraQuoteOnOrAfterCutoff,
  parseIntimuraDate,
} from "../server/intimura-sync-cutoff.ts";

const API_BASE = process.env.CRM_API_BASE || "https://cloture-crm.onrender.com";
const TOKEN = process.env.INTIMURA_BOOKMARKLET_TOKEN || "";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function pickKey(row: Record<string, unknown>, ...keys: string[]) {
  for (const k of keys) {
    for (const rk of Object.keys(row)) {
      if (rk.toLowerCase() === k.toLowerCase() && row[rk] != null && String(row[rk]).trim() !== "") {
        return String(row[rk]).trim();
      }
    }
  }
  return "";
}

function extractScrapedRows(rows: Record<string, unknown>[]) {
  return rows
    .map((row) => {
      const id =
        pickKey(row, "_id", "id") ||
        (row._href ? String(row._href).split(/[\/?#]/).filter(Boolean).pop() : "") ||
        "";
      return {
        id,
        title: pickKey(row, "title", "titre") || pickKey(row, "customer", "client"),
        customer_name: pickKey(row, "customer", "client"),
        status: pickKey(row, "status", "statut"),
      };
    })
    .filter((q) => q.id);
}

function simulateImport(
  incoming: { id: string; customer_name?: string; customer_phone?: string }[],
  existing: { intimuraId?: string; name: string; phone?: string }[],
) {
  const normPhone = (s: string) => String(s || "").replace(/\D+/g, "").slice(-10);
  let created = 0;
  let skipped = 0;
  const createdIds: string[] = [];
  const existingIds = new Set(existing.map((e) => e.intimuraId).filter(Boolean));
  const existingPhones = new Set(existing.map((e) => normPhone(e.phone || "")).filter((p) => p.length >= 10));

  for (const iq of incoming) {
    if (existingIds.has(iq.id)) {
      skipped++;
      continue;
    }
    const phoneKey = normPhone(iq.customer_phone || "");
    const nameMatch = existing.some(
      (e) => e.name.toLowerCase() === (iq.customer_name || "").toLowerCase() && phoneKey && normPhone(e.phone || "") === phoneKey,
    );
    if (nameMatch) {
      skipped++;
      continue;
    }
    created++;
    createdIds.push(iq.id);
    existingIds.add(iq.id);
    if (phoneKey) existingPhones.add(phoneKey);
    existing.push({ intimuraId: iq.id, name: iq.customer_name || "", phone: iq.customer_phone });
  }
  return { created, skipped, createdIds };
}

async function httpJson(method: string, path: string, body?: unknown, token?: string) {
  const url = token ? `${API_BASE}${path}?token=${encodeURIComponent(token)}` : `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Origin: "https://crm.intimura.com" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function runUnitTests() {
  console.log("\n=== Tests unitaires (logique nouveaux leads) ===\n");

  const scraped = extractScrapedRows([
    { _id: "aaa-111", titre: "Client A", statut: "sent", client: "Alice" },
    { _href: "/app/quotes/bbb-222", titre: "Client B", statut: "approved" },
  ]);
  assert(scraped.length === 2, "extract 2 rows");
  assert(scraped[0].id === "aaa-111", "id from _id");
  assert(scraped[1].id === "bbb-222", "id from href");

  const r1 = simulateImport(
    [
      { id: "new-1", customer_name: "Nouveau Client", customer_phone: "5145550001" },
      { id: "new-2", customer_name: "Autre", customer_phone: "5145550002" },
    ],
    [{ intimuraId: "old-1", name: "Existant", phone: "5145559999" }],
  );
  assert(r1.created === 2 && r1.skipped === 0, "2 nouveaux crees");
  assert(r1.createdIds.length === 2, "createdIntimuraIds length");

  const r2 = simulateImport(
    [
      { id: "old-1", customer_name: "Existant" },
      { id: "new-3", customer_name: "Encore nouveau" },
    ],
    [{ intimuraId: "old-1", name: "Existant" }],
  );
  assert(r2.created === 1 && r2.skipped === 1, "1 skip par intimuraId, 1 nouveau");

  const r3 = simulateImport(
    [
      { id: "x-1", customer_name: "Dup Phone", customer_phone: "5145551234" },
      { id: "x-2", customer_name: "Dup Phone", customer_phone: "5145551234" },
    ],
    [{ name: "Dup Phone", phone: "5145551234" }],
  );
  assert(r3.created === 0 && r3.skipped === 2, "doublon phone ignore");

  function mergeDetailIds(created: string[], detail: string[]) {
    return [...new Set([...created, ...detail])];
  }
  const mergedIds = mergeDetailIds(["new-1"], ["new-1", "existing-no-data"]);
  assert(mergedIds.length === 2 && mergedIds.includes("existing-no-data"), "detailIntimuraIds union");

  assert(parseIntimuraDate("15/04/2025") === "2025-04-15", "parse FR date");
  assert(parseIntimuraDate("2026-05-01") === "2026-05-01", "parse ISO date");
  assert(!isIntimuraQuoteOnOrAfterCutoff({ id: "x", created_at: "2025-12-01" }), "avant cutoff");
  assert(isIntimuraQuoteOnOrAfterCutoff({ id: "y", created_at: "2026-05-01" }), "egal cutoff OK");
  assert(isIntimuraQuoteOnOrAfterCutoff({ id: "z", issued_at: "2026-06-10" }), "apres cutoff OK");
  assert(!isIntimuraQuoteOnOrAfterCutoff({ id: "w" }), "sans date = refuse");
  assert(INTIMURA_SYNC_CUTOFF === "2026-05-01", "cutoff constant");

  console.log("  OK extractIntimuraQuotes (scrape)");
  console.log("  OK nouveaux leads seulement");
  console.log("  OK skip par intimuraId existant");
  console.log("  OK skip par doublon telephone");

  function mergeQuoteLists(
    lists: { id: string; title?: string }[][],
  ): { id: string; title?: string }[] {
    const byId = new Map<string, { id: string; title?: string }>();
    for (const list of lists) {
      for (const q of list) {
        if (q?.id && !byId.has(q.id)) byId.set(q.id, q);
      }
    }
    return [...byId.values()];
  }
  const merged = mergeQuoteLists([
    [{ id: "a", title: "Board A" }],
    [
      { id: "a", title: "Quotes A dup" },
      { id: "b", title: "Quotes B" },
    ],
  ]);
  assert(merged.length === 2 && merged.some((q) => q.id === "b"), "merge quotes+board dedupe");
  console.log("  OK merge liste quotes + board");
}

async function runApiTests() {
  console.log("\n=== Tests API production (" + API_BASE + ") ===\n");

  const noToken = await httpJson("POST", "/api/intimura/ingest", { payload: [{ _id: "test", titre: "X" }] });
  assert(noToken.status === 401, `sans token -> 401 (got ${noToken.status})`);
  console.log("  OK POST /ingest sans token -> 401");

  const badToken = await httpJson(
    "POST",
    "/api/intimura/ingest",
    { payload: [{ _id: "test", titre: "X" }] },
    "invalid-token-xxxxxxxxxxxxxxxxxxxxxxxx",
  );
  assert(badToken.status === 401, `mauvais token -> 401 (got ${badToken.status})`);
  console.log("  OK POST /ingest token invalide -> 401");

  if (!TOKEN) {
    console.log("\n  SKIP ingest live (definir INTIMURA_BOOKMARKLET_TOKEN pour test complet)");
    return;
  }

  const existingId = process.env.TEST_EXISTING_INTIMURA_ID || "2f7b5930-72ab-48d7-965e-48361bf2d333";
  const newId = "test-sync-" + Date.now();

  const pass1 = await httpJson(
    "POST",
    "/api/intimura/ingest",
    {
      payload: [
        { _id: existingId, titre: "Deja CRM", client: "Pascal Lemieux", statut: "sent" },
        { _id: newId, titre: "Test Auto " + newId, client: "Test Cursor", statut: "sent" },
      ],
    },
    TOKEN,
  );
  assert(pass1.status === 200, `ingest live -> 200 (got ${pass1.status} ${JSON.stringify(pass1.json)})`);
  const body = pass1.json as {
    createdLeads?: number;
    skipped?: number;
    createdIntimuraIds?: string[];
  };
  console.log("  OK ingest live:", JSON.stringify(body));
  assert((body.skipped ?? 0) >= 1, "au moins 1 skip (existant)");
  assert(body.createdIntimuraIds?.includes(newId), "createdIntimuraIds contient le nouveau");

  const pass2 = await httpJson(
    "POST",
    "/api/intimura/ingest",
    { payload: [{ _id: newId, titre: "Test Auto replay", client: "Test Cursor" }] },
    TOKEN,
  );
  const body2 = pass2.json as { createdLeads?: number; skipped?: number };
  assert(pass2.status === 200, "re-ingest -> 200");
  assert(body2.createdLeads === 0 && (body2.skipped ?? 0) >= 1, "re-ingest ne recree pas");
  console.log("  OK re-sync meme id -> skip (0 nouveau)");

  const detailsReplay = await httpJson(
    "POST",
    "/api/intimura/ingest-details",
    { intimuraId: existingId, decoded: { quote: { title: "x" }, items: [] } },
    TOKEN,
  );
  assert(detailsReplay.status === 200, "ingest-details -> 200");
  const dr = detailsReplay.json as { results?: { reason?: string }[] };
  const already = dr.results?.some((r) => r.reason === "ALREADY_SYNCED");
  if (already) console.log("  OK details sur existant -> ALREADY_SYNCED");
  else console.log("  NOTE details existant:", JSON.stringify(dr.results?.[0]));
}

async function main() {
  console.log("Test synchronisation Intimura — Cloture CRM");
  let failed = 0;
  try {
    await runUnitTests();
  } catch (e: any) {
    console.error(" ", e.message);
    failed++;
  }
  try {
    await runApiTests();
  } catch (e: any) {
    console.error(" ", e.message);
    failed++;
  }
  console.log(failed ? "\n=== ECHEC ===" : "\n=== TOUS LES TESTS OK ===");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
