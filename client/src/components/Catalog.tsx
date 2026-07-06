import { useEffect, useState } from "react";
import { fetchCatalog } from "../api";
import { CatalogItem } from "../types";

export default function Catalog() {
  const [items, setItems] = useState<CatalogItem[]>([]);

  useEffect(() => {
    fetchCatalog().then((data) => setItems(data.items));
  }, []);

  return (
    <div className="max-w-lg mx-auto mt-10 space-y-4">
      <h2 className="text-xl font-bold">Catalog</h2>
      <p className="text-sm text-gray-500">Every item that exists in the game so far.</p>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.itemType} className="border rounded p-4 bg-white">
            <p className="font-semibold">{item.name}</p>
            <p className="text-sm text-gray-600 mt-1">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
