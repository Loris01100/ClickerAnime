import type { ShopOffer } from "./types";

/** No `requiresAnimeId` means the offer is unlocked from the start. */
export function shopOfferUnlocked(offer: ShopOffer, clearedAnimeIds: string[]): boolean {
  return !offer.requiresAnimeId || clearedAnimeIds.includes(offer.requiresAnimeId);
}

/**
 * Unlocked, affordable, and — for a character offer — not already owned. Item offers stay buyable
 * indefinitely since items stack.
 */
export function canBuyShopOffer(
  offer: ShopOffer,
  currency: number,
  clearedAnimeIds: string[],
  ownedCharacterIds: string[]
): boolean {
  if (offer.kind === "character" && ownedCharacterIds.includes(offer.targetId)) return false;
  return shopOfferUnlocked(offer, clearedAnimeIds) && currency >= offer.cost;
}
