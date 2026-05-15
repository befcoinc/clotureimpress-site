/**
 * Win probability (%) by sales status.
 * Helps sales directors identify where to focus effort.
 */
export const WIN_PROBABILITIES: Record<string, number> = {
  nouveau: 5,              // New lead, not yet contacted
  contacte: 15,            // Contacted but no measurement yet
  rdv_mesure: 30,          // Measurement appointment scheduled/done
  envoyee: 50,             // Quote sent, awaiting response
  suivi: 65,               // Follow-up initiated, showing engagement
  rendez_vous: 85,         // Follow-up meeting or signature meeting scheduled
  signee: 100,             // Contract signed, won
  perdue: 0,               // Lost opportunity
};

export function getWinProbability(salesStatus: string | null | undefined): number {
  if (!salesStatus) return 0;
  return WIN_PROBABILITIES[salesStatus] ?? 0;
}

export function getProbabilityBadgeColor(probability: number): "bg-slate-100 text-slate-700" | "bg-blue-100 text-blue-700" | "bg-amber-100 text-amber-700" | "bg-green-100 text-green-700" | "bg-emerald-100 text-emerald-700" {
  if (probability === 0) return "bg-slate-100 text-slate-700";
  if (probability <= 30) return "bg-blue-100 text-blue-700";
  if (probability <= 65) return "bg-amber-100 text-amber-700";
  if (probability < 100) return "bg-green-100 text-green-700";
  return "bg-emerald-100 text-emerald-700";
}

/**
 * Compute weighted pipeline: sum of estimated prices × (probability / 100)
 */
export function computeWeightedPipeline(quotes: Array<{ estimatedPrice?: number; salesStatus?: string }>): number {
  return quotes.reduce((sum, q) => {
    if (!q.estimatedPrice || q.estimatedPrice <= 0) return sum;
    const prob = getWinProbability(q.salesStatus);
    return sum + q.estimatedPrice * (prob / 100);
  }, 0);
}
