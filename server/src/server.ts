import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { authRouter } from "./routes/auth.js";
import { buildInventoryRouter } from "./routes/inventory.js";
import { buildAuctionRouter } from "./routes/auction.js";
import { attackLogRouter } from "./routes/attackLog.js";
import { AuctionManager } from "./auction/AuctionManager.js";
import { registerSocketHandlers } from "./sockets/socketHandlers.js";

const PORT = 3001;
const CLIENT_ORIGIN = "http://localhost:5173"; // Vite's default dev server port

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

const auctionManager = new AuctionManager(io);

app.use(authRouter);
app.use(buildInventoryRouter(auctionManager));
app.use(buildAuctionRouter(auctionManager));
app.use(attackLogRouter);

registerSocketHandlers(io, auctionManager);

// One-time bootstrap: since starting a round normally requires owning a
// Chest to relist, and no player begins the game with one, the server
// seeds the very first auction itself on boot (Option A, confirmed).
// After this, every subsequent round is started by a player relisting
// a Chest they won -- this seed only ever runs once, at startup.
const SEED_STARTING_PRICE = 500;
auctionManager.startNewChestAuction(SEED_STARTING_PRICE);

httpServer.listen(PORT, () => {
  console.log(`Black Market Gallery server listening on http://localhost:${PORT}`);
});
