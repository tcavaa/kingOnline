# King Card Game

A real-time, three-player [King](https://en.wikipedia.org/wiki/King_%28card_game%29) implementation with a Western saloon theme. ReactJS + Phaser on the front, Node.js + Socket.IO + MySQL on the back.

## Features

- **3-player real-time multiplayer** over Socket.IO, with optimistic plays + server-authoritative state.
- **Profiles with PIN protection** — each profile is locked to a 4-digit PIN that's hashed on the server.
- **Persistent live games** — rooms are snapshot to MySQL, so a server restart doesn't kill an in-progress match.
- **Silent reconnect** — a player whose socket drops auto-rejoins their seat without refreshing; rooms are kept in memory for a 90-second grace window after the last player goes offline.
- **Phaser canvas** for the table felt, animated tricks, hands, and avatars.
- **Mobile-friendly** — `100dvh` viewport, on-screen PIN keypad, vibration on your turn, screen wake-lock during a game.
- **Chat + voice clips** ("yeehaw", "gunshot", "whistle") between players at the table.
- **Tally sheet, last-trick replay, leaderboard** stored in MySQL.

## Repo layout

```
.
├── client/   # Vite + React + Tailwind + Phaser
└── server/   # Node 18+ / Express / Socket.IO / MySQL
```

## Prerequisites

- Node.js **18+**
- MySQL **8+** (any recent MariaDB also works)
- npm

## 1) Database setup

Create a database and a user, then provision the schema:

```bash
mysql -u root -p <<'SQL'
CREATE DATABASE IF NOT EXISTS king_card_game CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'king'@'localhost' IDENTIFIED BY 'changeme';
GRANT ALL PRIVILEGES ON king_card_game.* TO 'king'@'localhost';
FLUSH PRIVILEGES;
SQL

mysql -u king -p king_card_game < server/db/schema.sql
```

`schema.sql` is idempotent — re-run it any time, it will only add columns that don't yet exist.

## 2) Server

```bash
cd server
cp .env.example .env
# edit .env with your real DB credentials + CORS origins
npm install
npm run dev    # nodemon, port 3001
# or:
npm start
```

### Server env vars

| Var            | Required | Purpose                                            |
| -------------- | -------- | -------------------------------------------------- |
| `DB_HOST`      | yes      | MySQL host                                         |
| `DB_USER`      | yes      | MySQL user                                         |
| `DB_PASSWORD`  | yes      | MySQL password                                     |
| `DB_NAME`      | yes      | MySQL database name                                |
| `PORT`         | no       | HTTP/WebSocket port (default `3001`)               |
| `CORS_ORIGIN`  | no       | Comma-separated allowed origins, or `*` for dev    |

## 3) Client

```bash
cd client
cp .env.example .env       # leave VITE_API_URL blank for local dev
npm install
npm run dev                # Vite, port 5173
```

For a production build:

```bash
cd client
# set VITE_API_URL=https://your-api-host in .env.production
npm run build              # outputs to client/dist
```

### Client env vars

| Var             | Required | Purpose                                                    |
| --------------- | -------- | ---------------------------------------------------------- |
| `VITE_API_URL`  | no       | Public URL of the API server. Blank → falls back to the page's host on port 3001. Use `https://...` in production so Socket.IO upgrades to WSS. |

## How to play

1. Visit the site → create a profile with a 4-digit PIN.
2. Either **create a room** (you're the leader) or **join a room** with a 4-character code.
3. Once 3 players are seated, the leader starts the game.
4. The leader picks a game type (or trump suit, depending on the round). Play 8 tricks per round, and the round score is tallied per the King ruleset.
5. Each player gets to lead a fixed number of rounds — the running totals live on the **Tally** drawer.

## Architecture notes

- **State authority** is the server. The client plays optimistically (e.g. removes a card from the hand on click) but immediately reconciles to whatever the server's next `game-state` snapshot says.
- **Reconnect path:** on `socket.disconnect`, the client shows a "Reconnecting…" banner; on the next `connect`, it silently re-emits `join-room`. The server's `joinRoom` detects an existing seat by name and rebinds the new socket id, then pushes a fresh `game-state`. The Phaser scene replays the cached state on its `scene-ready` signal so the table renders instantly.
- **Empty-room grace:** when every seat goes offline at once (server hot-reload, all phones losing wifi briefly), the room is kept in memory for 90 seconds before being garbage-collected. The MySQL `live_games` row is the long-term backup if the process actually dies.
- **PIN security:** PINs are hashed with `sha256(profileId + ":" + pin)` and never returned to clients. The hash is checked with `timingSafeEqual`.

## License

MIT.
