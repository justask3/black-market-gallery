import { Router } from "express";

export const catalogRouter = Router();

/**
 * Static reference content, one entry per item type that exists in the
 * game so far. This is descriptive only -- it doesn't drive any game
 * logic, it just documents what each item does for players browsing
 * the Catalog tab.
 */
const CATALOG = [
  {
    itemType: "chest",
    name: "Mysterious Chest",
    description:
      "Won at auction. Can be opened to roll its contents (70% chance of 100-4000 gold, 20% chance of a Masterpiece Painting, 5% chance of a Sigil of the Iron Vault, 5% chance of a Poisoned Dagger), or relisted into a brand-new auction with your own starting price.",
  },
  {
    itemType: "dagger",
    name: "The Poisoned Dagger",
    description:
      "A one-time-use heist weapon with 2 charges. Targets any player (in or out of an auction room) and steals a random 5-10% of their current gold. Cannot target yourself. After both charges are used it remains in your inventory, inert, but can still be relisted as a bluff.",
  },
  {
    itemType: "sigil",
    name: "The Sigil of the Iron Vault",
    description:
      "A single-use passive countermeasure. If a Dagger is used against you while you hold one, the Sigil deflects the theft entirely, is consumed, and always reveals the attacker's identity to you -- even if they attacked anonymously.",
  },
  {
    itemType: "painting",
    name: "The Masterpiece Painting",
    description:
      "A passive income item. You may hold any number, but only 2 at a time can be displayed. A displayed Painting generates 500 gold every 24 hours; while stored (not displayed), it earns nothing.",
  },
  {
    itemType: "bleeding_coin",
    name: "The Bleeding Coin",
    description:
      "A cursed item. While it sits in your inventory it drains a small percentage of your gold every 10 minutes (roughly 7% per day). It cannot be deleted, and cannot be listed on a normal auction. Holding multiple compounds the drain.",
  },
];

catalogRouter.get("/catalog", (req, res) => {
  res.json({ items: CATALOG });
});
