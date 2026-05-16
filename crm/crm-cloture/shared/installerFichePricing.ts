/** Labels for installer subcontractor fiche — keep in sync with `fiche-installateur.html`. */
export const INSTALLER_FICHE_PRICING_LABELS = [
  "Maille de chaîne",
  "Ornementale",
  "Bois",
  "Vinyle",
  "Commerciale",
  "Industrielle",
  "Portails",
  "Composite fibre/aluminium",
  "Clôture de verre",
  "Autres",
] as const;

/**
 * Returns human-readable gap messages (French) for incomplete linear-foot pricing rows.
 * Rows with `pricing{i}_offerState` === "yes" require a non-empty rate.
 * Rows must explicitly choose Oui/Non when `pricing{i}_offerState` is present (new forms),
 * or satisfy legacy rules when only `pricing{i}_offered` booleans exist.
 */
export function getInstallerFichePricingGaps(data: Record<string, unknown> | null | undefined): string[] {
  const d = data ?? {};
  const gaps: string[] = [];

  for (let i = 0; i < INSTALLER_FICHE_PRICING_LABELS.length; i++) {
    const label = INSTALLER_FICHE_PRICING_LABELS[i];
    const offerState = d[`pricing${i}_offerState`];
    const offered = d[`pricing${i}_offered`] === true;
    const rate = String(d[`pricing${i}_rate`] ?? "").trim();
    const notes = String(d[`pricing${i}_notes`] ?? "").trim();

    if (offerState === "yes" || (offerState === undefined && offered)) {
      if (!rate) {
        gaps.push(`${label} : indiquez un tarif au pied linéaire (service offert).`);
      }
      continue;
    }

    if (offerState === "no") continue;

    if (offerState === "") {
      gaps.push(`${label} : précisez si ce service est offert (Oui ou Non).`);
      continue;
    }

    if (offered && !rate) {
      gaps.push(`${label} : indiquez un tarif au pied linéaire (service offert).`);
      continue;
    }

    if (!offered && !rate && !notes) {
      gaps.push(`${label} : précisez si ce service est offert et le tarif le cas échéant (tableau tarification).`);
    }
  }

  return gaps;
}
