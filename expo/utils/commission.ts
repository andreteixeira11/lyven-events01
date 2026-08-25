/**
 * Commission calculation for LYVEN.
 *
 * Service fee is charged PER TICKET (not on the cart subtotal), using the
 * ticket's unit price to pick the tier:
 *   - Ate EUR 20.00      -> 5%   + EUR 0.50
 *   - EUR 20.01 - 50.00  -> 4.5% + EUR 0.60
 *   - Acima de EUR 50.00 -> 3.5% + EUR 1.00
 */

export interface CommissionTier {
  min: number;
  max: number;
  percent: number;
  fixed: number;
}

export const COMMISSION_TIERS: CommissionTier[] = [
  { min: 0, max: 20, percent: 0.05, fixed: 0.5 },
  { min: 20.01, max: 50, percent: 0.045, fixed: 0.6 },
  { min: 50.01, max: Infinity, percent: 0.035, fixed: 1.0 },
];

/** Human-readable tier description used in cart/checkout explanations. */
export const COMMISSION_TIERS_DESCRIPTION =
  'A taxa de serviço é cobrada por bilhete e varia conforme o preço unitário:\n' +
  '• Até €20: 5% + €0,50\n' +
  '• €20,01 a €50: 4,5% + €0,60\n' +
  '• Acima de €50: 3,5% + €1,00';

/** Returns the tier that applies to a given unit price. */
export function getCommissionTier(unitPrice: number): CommissionTier {
  for (const tier of COMMISSION_TIERS) {
    if (unitPrice <= tier.max) return tier;
  }
  return COMMISSION_TIERS[COMMISSION_TIERS.length - 1];
}

/** Commission for a single ticket of the given unit price. */
export function calculateTicketCommission(unitPrice: number): number {
  const tier = getCommissionTier(unitPrice);
  return unitPrice * tier.percent + tier.fixed;
}

/** Commission for a line of tickets (unit price x quantity). */
export function calculateLineCommission(unitPrice: number, quantity: number): number {
  return calculateTicketCommission(unitPrice) * quantity;
}

/** Commission for a whole cart of items ({ price, quantity }). */
export function calculateCartCommission(items: Array<{ price: number; quantity: number }>): number {
  return items.reduce((sum, item) => sum + calculateLineCommission(item.price, item.quantity), 0);
}

/** Rounds to 2 decimals to avoid floating point noise in displays. */
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
