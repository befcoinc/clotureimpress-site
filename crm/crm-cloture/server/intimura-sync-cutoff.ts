/** Aucune soumission Intimura antérieure à cette date ne doit être synchronisée. */
export const INTIMURA_SYNC_CUTOFF = "2026-05-01";

export function parseIntimuraDate(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const d = new Date(raw < 1e12 ? raw * 1000 : raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (!s) return null;
  const iso = s.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dmy = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${mm}-${dd}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

/** Date de référence d'une ligne liste ou objet quote Intimura. */
export function intimuraQuoteReferenceDate(row: any): string | null {
  if (!row || typeof row !== "object") return null;
  const fields = [
    row.created_at,
    row.createdAt,
    row.issued_at,
    row.issuedAt,
    row.target_date,
    row.targetDate,
    row.date,
    row.valid_until,
  ];
  for (const f of fields) {
    const d = parseIntimuraDate(f);
    if (d) return d;
  }
  return null;
}

export function isIntimuraQuoteOnOrAfterCutoff(row: any, cutoff = INTIMURA_SYNC_CUTOFF): boolean {
  const d = intimuraQuoteReferenceDate(row);
  if (!d) return false;
  return d >= cutoff;
}

/** Pour applyIntimuraDetails (payload décodé). */
export function isDecodedIntimuraQuoteOnOrAfterCutoff(decoded: any, cutoff = INTIMURA_SYNC_CUTOFF): boolean {
  const q = decoded?.quote || decoded;
  return isIntimuraQuoteOnOrAfterCutoff(q, cutoff);
}
