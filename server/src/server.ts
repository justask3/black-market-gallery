import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { authRouter } from "./routes/auth.js";
import { buildInventoryRouter } from "./routes/inventory.js";
import { buildAuctionRouter } from "./routes/auction.js";
import { attackLogRouter } from "./routes/attackLog.js";
import { catalogRouter } from "./routes/catalog.js";
import { buildPresenceRouter } from "./routes/presence.js";
import { messagesRouter } from "./routes/messages.js";
import { AuctionManager } from "./auction/AuctionManager.js";
import { PresenceManager } from "./presence/PresenceManager.js";
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
const presenceManager = new PresenceManager(io);

app.use(authRouter);
app.use(buildInventoryRouter(auctionManager));
app.use(buildAuctionRouter(auctionManager));
app.use(attackLogRouter);
app.use(catalogRouter);
app.use(buildPresenceRouter(presenceManager));
app.use(messagesRouter);

registerSocketHandlers(io, auctionManager, presenceManager);

// Starts every tier's automated spawn scheduler (Common Block, Rare Vault,
// Exotic Showcase) -- the server itself is now the primary driver of
// auction supply. Players can additionally feed the Common Block tier via
// POST /items/:id/relist, but no round depends on that anymore.
auctionManager.bootstrap();

httpServer.listen(PORT, () => {
  console.log(`Black Market Gallery server listening on http://localhost:${PORT}`);
});
