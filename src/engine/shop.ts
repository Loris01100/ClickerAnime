import type { ShopOffer } from "./types";

/** No `requiresAnimeId` means the offer is unlocked from the start. */
export function shopOfferUnlocked(offer: ShopOffer, clearedAnimeIds: string[]): boolean {
  return !offer.requiresAnimeId || clearedAnimeIds.includes(offer.requiresAnimeId);
}

/** Cost of an offer after a fractional discount, floored to an integer like every other price. */
export function discountedShopCost(offer: ShopOffer, discount: number): number {
  return Math.max(0, Math.ceil(offer.cost * (1 - discount)));
}

/**
 * Unlocked, affordable, and — for a character offer — not already owned. Item offers stay buyable
 * indefinitely since items stack. The optional `discount` comes from the "Destin" prestige tree.
 */
export function canBuyShopOffer(
  offer: ShopOffer,
  currency: number,
  clearedAnimeIds: string[],
  ownedCharacterIds: string[],
  discount = 0
): boolean {
  if (offer.kind === "character" && ownedCharacterIds.includes(offer.targetId)) return false;
  return shopOfferUnlocked(offer, clearedAnimeIds) && currency >= discountedShopCost(offer, discount);
}
