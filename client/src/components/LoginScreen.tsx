import { useState } from "react";
import { useSession } from "../SessionContext";
import { login } from "../api";

export default function LoginScreen() {
  const { setPlayer } = useSession();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    setLoading(true);
    try {
      const result = await login(name.trim());
      setPlayer({ id: result.playerId, name: result.name, gold: result.gold, isAdmin: result.isAdmin });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded shadow w-80 space-y-4">
        <h1 className="text-xl font-bold text-center">The Black Market Gallery</h1>
        <p className="text-sm text-gray-500 text-center">
          Enter a name to start testing (temporary, no password).
        </p>
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gray-800 text-white rounded py-2 disabled:opacity-50"
        >
          {loading ? "Entering..." : "Enter the Gallery"}
        </button>
      </form>
    </div>
  );
}
