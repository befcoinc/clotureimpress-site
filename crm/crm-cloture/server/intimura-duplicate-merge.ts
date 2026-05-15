/**
 * Regroupe plusieurs soumissions Intimura (même client) sur une seule fiche CRM.
 */

export type LinkedIntimuraQuote = {
  intimuraId: string;
  title?: string;
  status?: string;
  subtotal?: number;
  url: string;
  syncedAt?: string;
  intimuraData?: unknown;
};

export function normName(s: string) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normPhone(s: string) {
  return String(s || "").replace(/\D+/g, "").slice(-10);
}

export function normEmail(s: string) {
  return String(s || "").trim().toLowerCase();
}

export function normAddress(s: string) {
  return normName(s).replace(/\s+/g, " ");
}

export function nameKey(s: string) {
  return normName(s).split(" ").slice(0, 2).join(" ");
}

export function personKey(s: string) {
  const cleaned = normName(s).split(/\bx\b/)[0].trim();
  const tokens = cleaned.split(" ").filter(Boolean);
  if (!tokens.length) return "";
  if (tokens.length === 1) return tokens[0];
  return `${tokens[0]} ${tokens[tokens.length - 1]}`;
}

export function parseLinkedIntimuraQuotes(raw: string | null | undefined): LinkedIntimuraQuote[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => x?.intimuraId) : [];
  } catch {
    return [];
  }
}

export function allIntimuraIdsOnQuote(quote: { intimuraId?: string | null; linkedIntimuraQuotes?: string | null }) {
  const ids = new Set<string>();
  if (quote.intimuraId) ids.add(quote.intimuraId);
  for (const l of parseLinkedIntimuraQuotes(quote.linkedIntimuraQuotes)) {
    if (l.intimuraId) ids.add(l.intimuraId);
  }
  return ids;
}

export function intimuraRowKeys(iq: {
  customer_name?: string;
  title?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  address?: string;
}) {
  const name = iq.customer_name || iq.title || "";
  const phone = normPhone(iq.customer_phone || "");
  const email = normEmail(iq.customer_email || "");
  const address = normAddress(iq.customer_address || iq.address || "");
  return {
    name,
    phoneKey: phone.length >= 10 ? phone : "",
    emailKey: email,
    nameKey: nameKey(name),
    personKey: personKey(name),
    addressKey: address.length >= 8 ? address : "",
  };
}

export function intimuraRowsMatch(
  a: ReturnType<typeof intimuraRowKeys>,
  b: ReturnType<typeof intimuraRowKeys>,
) {
  if (a.phoneKey && b.phoneKey && a.phoneKey === b.phoneKey) return true;
  if (a.emailKey && b.emailKey && a.emailKey === b.emailKey) return true;
  if (a.addressKey && b.addressKey && a.addressKey === b.addressKey) return true;
  if (a.personKey && b.personKey && a.personKey === b.personKey) return true;
  if (a.nameKey && b.nameKey && a.nameKey === b.nameKey && a.nameKey.length >= 4) return true;
  return false;
}

export function buildLinkedEntry(iq: { id: string; title?: string; status?: string; subtotal?: number }, url: string): LinkedIntimuraQuote {
  return {
    intimuraId: iq.id,
    title: iq.title,
    status: iq.status,
    subtotal: Number(iq.subtotal || 0) || undefined,
    url,
  };
}

export function multiIntimuraNotice(count: number, isEn = false) {
  if (count <= 1) return "";
  return isEn
    ? `${count} Intimura quotes are linked to this record.`
    : `${count} soumissions Intimura sont liées à cette fiche.`;
}

export function planLinkIntimuraToPrimary(
  primary: { intimuraId?: string | null; linkedIntimuraQuotes?: string | null; salesNotes?: string | null },
  iq: { id: string; title?: string; status?: string; subtotal?: number },
  urlFn: (id: string) => string,
) {
  if (allIntimuraIdsOnQuote(primary).has(iq.id)) return null;
  const linked = parseLinkedIntimuraQuotes(primary.linkedIntimuraQuotes);
  const next = [...linked, buildLinkedEntry(iq, urlFn(iq.id))];
  const primaryId = primary.intimuraId || iq.id;
  return {
    linkedIntimuraQuotes: JSON.stringify(next),
    salesNotes: appendMultiIntimuraSalesNote(primary.salesNotes, next, primaryId),
    intimuraCount: next.length + (primary.intimuraId ? 1 : 0),
  };
}

export function appendMultiIntimuraSalesNote(existing: string | null | undefined, linked: LinkedIntimuraQuote[], primaryId: string) {
  const lines = linked.map((l) => `• ${l.title || l.intimuraId} — ${l.url}`);
  const block = [
    `⚠ ${linked.length + 1} soumissions Intimura sur cette fiche (IDs: ${[primaryId, ...linked.map((l) => l.intimuraId)].join(", ")}).`,
    ...lines,
  ].join("\n");
  const base = String(existing || "").trim();
  if (base.includes("soumissions Intimura sur cette fiche")) return base;
  return base ? `${base}\n\n${block}` : block;
}

/** Groupe les lignes Intimura du même lot (même personne) avant import. */
export function groupIntimuraBatchDuplicates(rows: { id: string }[]) {
  const keysById = new Map<string, ReturnType<typeof intimuraRowKeys>>();
  for (const row of rows) {
    keysById.set(row.id, intimuraRowKeys(row as any));
  }
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id);
    if (!p || p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  for (const row of rows) {
    parent.set(row.id, row.id);
  }
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const ka = keysById.get(ids[i])!;
      const kb = keysById.get(ids[j])!;
      if (intimuraRowsMatch(ka, kb)) union(ids[i], ids[j]);
    }
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const arr = groups.get(root) || [];
    arr.push(id);
    groups.set(root, arr);
  }
  return { groups, keysById };
}
