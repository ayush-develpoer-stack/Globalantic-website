/**
 * Money helpers. Every amount is an integer number of paise (Rs 1 = 100 paise);
 * totals are always computed here, on the server, never taken from a client.
 */

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 123456 -> "₹1,234.56" (Indian digit grouping). */
export function formatPaise(paise: number, currency = 'INR'): string {
  if (currency !== 'INR') return `${currency} ${(paise / 100).toFixed(2)}`;
  return inr.format(paise / 100);
}

export interface LineInput {
  description: string;
  /** Up to 2 decimals (e.g. 1.5 hours). */
  quantity: number;
  unitPaise: number;
  discountPaise?: number;
  /** GST rate in basis points (1800 = 18%). Ignored unless GST applies to the document. */
  taxRateBp?: number;
  /** Optional HSN/SAC code printed on tax invoices */
  sac?: string;
}

export interface ComputedLine {
  description: string;
  quantity: number;
  unitPaise: number;
  sac?: string;
  grossPaise: number;
  discountPaise: number;
  taxablePaise: number;
  taxRateBp: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

export interface Totals {
  lines: ComputedLine[];
  subtotalPaise: number;
  discountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  totalPaise: number;
  /** null when GST does not apply */
  gst: null | { intraState: boolean };
}

export class MoneyError extends Error {}

/**
 * Line and document totals.
 * GST is applied only when `gst` is given (company GST-registered + document opted in):
 * intra-state supply -> CGST + SGST (half each; an odd paisa goes to SGST), otherwise IGST.
 */
export function computeTotals(items: LineInput[], gst: null | { intraState: boolean }): Totals {
  const lines = items.map((it, i): ComputedLine => {
    if (!Number.isFinite(it.quantity) || it.quantity <= 0 || Math.round(it.quantity * 100) !== it.quantity * 100) throw new MoneyError(`Line ${i + 1}: quantity must be positive with at most 2 decimals`);
    if (!Number.isInteger(it.unitPaise) || it.unitPaise < 0) throw new MoneyError(`Line ${i + 1}: rate must be a non-negative amount`);
    const grossPaise = Math.round(it.quantity * it.unitPaise);
    const discountPaise = it.discountPaise ?? 0;
    if (!Number.isInteger(discountPaise) || discountPaise < 0 || discountPaise > grossPaise) throw new MoneyError(`Line ${i + 1}: discount must be between 0 and the line amount`);
    const taxablePaise = grossPaise - discountPaise;
    const taxRateBp = gst ? (it.taxRateBp ?? 0) : 0;
    if (!Number.isInteger(taxRateBp) || taxRateBp < 0 || taxRateBp > 2800) throw new MoneyError(`Line ${i + 1}: GST rate must be between 0% and 28%`);
    const tax = Math.round((taxablePaise * taxRateBp) / 10_000);
    const intra = Boolean(gst?.intraState);
    const cgstPaise = intra ? Math.floor(tax / 2) : 0;
    const sgstPaise = intra ? tax - cgstPaise : 0;
    const igstPaise = intra ? 0 : tax;
    return { description: it.description, quantity: it.quantity, unitPaise: it.unitPaise, sac: it.sac, grossPaise, discountPaise, taxablePaise, taxRateBp, cgstPaise, sgstPaise, igstPaise, totalPaise: taxablePaise + tax };
  });
  const sum = (k: keyof ComputedLine) => lines.reduce((s, l) => s + (l[k] as number), 0);
  const cgstPaise = sum('cgstPaise');
  const sgstPaise = sum('sgstPaise');
  const igstPaise = sum('igstPaise');
  const taxPaise = cgstPaise + sgstPaise + igstPaise;
  const taxablePaise = sum('taxablePaise');
  return {
    lines,
    subtotalPaise: sum('grossPaise'),
    discountPaise: sum('discountPaise'),
    taxablePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    taxPaise,
    totalPaise: taxablePaise + taxPaise,
    gst,
  };
}

/** "18%" / "12.5%" from basis points. */
export const formatRate = (bp: number) => `${(bp / 100).toFixed(bp % 100 ? 2 : 0).replace(/\.?0+$/, '')}%`;

/** Amount in words for receipts/invoices, Indian system (lakh / crore). */
export function rupeesInWords(paise: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`);
  const three = (n: number) => [n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred` : '', two(n % 100)].filter(Boolean).join(' ');
  const words = (n: number): string => {
    if (n === 0) return 'Zero';
    const parts: string[] = [];
    const crore = Math.floor(n / 10_000_000);
    const lakh = Math.floor((n % 10_000_000) / 100_000);
    const thousand = Math.floor((n % 100_000) / 1000);
    const rest = n % 1000;
    if (crore) parts.push(`${words(crore)} Crore`);
    if (lakh) parts.push(`${two(lakh)} Lakh`);
    if (thousand) parts.push(`${two(thousand)} Thousand`);
    if (rest) parts.push(three(rest));
    return parts.join(' ');
  };
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  return `Rupees ${words(rupees)}${p ? ` and ${two(p)} Paise` : ''} Only`;
}
