import { useEffect, useState } from "react";
import { fetchCatalog } from "../api";
import { CatalogItem, ItemType } from "../types";
import { ITEM_RARITY, RARITY_LABELS, RARITY_ORDER, RARITY_COLORS } from "../itemNames";

export default function Catalog() {
  const [items, setItems] = useState<CatalogItem[]>([]);

  useEffect(() => {
    fetchCatalog().then((data) => setItems(data.items));
  }, []);

  return (
    <div className="max-w-lg mx-auto mt-10 space-y-6">
      <h2 className="text-xl font-bold">Catalog</h2>
      <p className="text-sm text-gray-500">Every item that exists in the game so far.</p>

      {RARITY_ORDER.map((rarity) => {
        const group = items.filter((item) => ITEM_RARITY[item.itemType as ItemType] === rarity);
        if (group.length === 0) return null;
        return (
          <div key={rarity} className="space-y-3">
            <h3 className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${RARITY_COLORS[rarity]}`}>
              {RARITY_LABELS[rarity]}
            </h3>
            {group.map((item) => (
              <div key={item.itemType} className="border rounded p-4 bg-white">
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm text-gray-600 mt-1">{item.description}</p>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
