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
    itemType: "common_chest",
    name: "Common Chest",
    description:
      "Won at auction from the Common Block. Can be opened to roll its contents (70% chance of 100-4,000 gold, 20% chance of a Masterpiece Painting, 5% chance of a Sigil of the Iron Vault, 5% chance of a Poisoned Dagger), or relisted into a brand-new auction with your own starting price.",
  },
  {
    itemType: "rare_chest",
    name: "Rare Chest",
    description:
      "Won at auction from the Rare Vault. Better odds than a Common Chest on open (50% chance of 500-8,000 gold, 30% chance of a Masterpiece Painting, 10% chance of a Sigil of the Iron Vault, 10% chance of a Poisoned Dagger), or can be relisted like any other item.",
  },
  {
    itemType: "exotic_chest",
    name: "Exotic Chest",
    description:
      "Won at auction from the Exotic Showcase -- the rarest chest in the game. Best odds on open (30% chance of 2,000-20,000 gold, 35% chance of a Masterpiece Painting, 15% chance of a Sigil of the Iron Vault, 20% chance of a Poisoned Dagger), or can be relisted like any other item.",
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
  {
    itemType: "forged_seal",
    name: "The Forged Seal",
    description:
      "A single-use ward against theft -- or so it claims. 70% of the time it blocks a Dagger-family attack and reveals the attacker, exactly like a real Sigil. The other 30% of the time it's a counterfeit: it's still consumed, but the attack goes through as if you held nothing at all, and you'll have no way of knowing which happened until it's too late.",
  },
  {
    itemType: "vault_ledger_lock",
    name: "The Vault Ledger Lock",
    description:
      "A passive defense: while held, any percent-based theft against you is reduced by 3 percentage points (floored at 1%). Isn't free -- it charges a small upkeep of 1% of your current gold every 24 hours just to sit in your inventory.",
  },
  {
    itemType: "auction_insurance_token",
    name: "Auction Insurance Token",
    description:
      "Pay a 50% premium on top of the entry fee when joining a room publicly. If you're leading the bidding and get outbid within the final 30 seconds before the room ends -- and don't end up winning -- you get half your entry fee refunded.",
  },
  {
    itemType: "whispering_coin",
    name: "The Whispering Coin",
    description:
      "Single-use. Arm it while inside a live auction room, and the next player to join that same room anonymously has their real identity quietly revealed to you alone. A trap for anyone paying extra to stay hidden.",
  },
  {
    itemType: "tarnished_locket",
    name: "The Tarnished Locket",
    description:
      "A minor passive-income curio: generates 50 gold every 24 hours, far less than a Masterpiece Painting's 500g -- but it never needs a display slot, and there's no cap on how many you can hold. A low-stakes entry point into passive income.",
  },
  {
    itemType: "chalk_marker",
    name: "Chalk Marker",
    description:
      "Single-use. Mark another item in your inventory to start tracking its ownership history -- from that point on, its detail view shows every player who's held it, surviving resale at auction. Pure information, no combat use.",
  },
  {
    itemType: "twin_faced_coin",
    name: "The Twin-Faced Coin",
    description:
      "A gamble. Flip it for a fixed 200g stake: 50% chance to double it, 50% chance to lose it outright. Consumed either way.",
  },
  {
    itemType: "wardens_whistle",
    name: "The Warden's Whistle",
    description:
      "Passive. Doesn't block a Dagger-family attack against you, but guarantees you'll always learn the attacker's identity when one lands -- even if they struck anonymously from inside a shared auction room.",
  },
  {
    itemType: "phantom_bidder",
    name: "Phantom Bidder",
    description:
      "Single-use. Join an auction room under a randomly generated fake persona instead of your real name or a plain \"Anonymous\" -- functionally identical to anonymous entry, just with a story.",
  },
  {
    itemType: "street_rumor",
    name: "Street Rumor",
    description:
      "Single-use. Use it on a specific unopened Chest to immediately roll and lock in its contents, revealing only the broad category -- Weapon, Defense, Passive Income, Gamble, Utility, Legendary, or Gold -- without spoiling the exact item. Opening the Chest afterward always yields exactly what was locked in.",
  },
  {
    itemType: "dull_blade",
    name: "The Dull Blade",
    description:
      "A cut-rate Poisoned Dagger: 1 charge, steals a random 2-4% of the target's gold instead of 5-10%. Cheaper to come by, much less dangerous.",
  },
  {
    itemType: "empty_frame",
    name: "The Empty Frame",
    description:
      "Occupies a display slot exactly like a Masterpiece Painting, but generates zero income. A bluff -- useful only to pad out your public Gallery and make your collection look richer than it is.",
  },
  {
    itemType: "bent_sigil",
    name: "The Bent Sigil",
    description:
      "A damaged Sigil of the Iron Vault: still blocks a Dagger-family attack outright and is consumed the same way, but never reveals the attacker's identity, win or lose.",
  },
  {
    itemType: "weighted_dice",
    name: "The Weighted Dice",
    description:
      "Passive. While held, the Twin-Faced Coin's odds shift in your favor -- 60% to double instead of the usual 50%.",
  },
  {
    itemType: "gallery_deed",
    name: "The Gallery Deed",
    description:
      "Legendary, single-use. Permanently raises your Masterpiece Painting display cap from 2 to 3. Has no effect if your cap is already at 3.",
  },
  {
    itemType: "watchers_token",
    name: "The Watcher's Token",
    description:
      "Passive. While held, silently logs the identity and time of every player who looks up your public profile -- visible from the token's own detail view in your Inventory.",
  },
  {
    itemType: "brokers_monopoly",
    name: "Broker's Monopoly",
    description:
      "Legendary, single-use. Use it while inside a live auction room to name one other current participant, who is immediately barred from placing any further bids in that specific room.",
  },
  {
    itemType: "pickpockets_glove",
    name: "The Pickpocket's Glove",
    description:
      "1 charge. Steals a small flat amount of gold (40-60g) from the target instead of a percentage -- weak against the wealthy, reliable against everyone else.",
  },
  {
    itemType: "grudge_ledger",
    name: "The Grudge Ledger",
    description:
      "Passive. When you use a Dagger-family weapon against someone who has successfully stolen from you before, your steal percentage gets a +5 percentage point bonus against them specifically.",
  },
  {
    itemType: "oathbreakers_dagger",
    name: "The Oathbreaker's Dagger",
    description:
      "An upgraded Poisoned Dagger: 4 charges and a steeper 6-12% steal -- but roughly 1 in 7 uses backfires, stealing from you and handing the target that same amount instead.",
  },
];

catalogRouter.get("/catalog", (req, res) => {
  res.json({ items: CATALOG });
});
