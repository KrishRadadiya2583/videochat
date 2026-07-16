# Connect — Real-time Chat Platform

A professional, real-time chat platform with direct messages, group chats, rich
messaging, file sharing, video/audio calls and screen sharing — all in the
browser.

## Features

**Accounts & Presence**
- Email / username signup, login, JWT-based sessions
- Display name, avatar URL, bio, online / away / offline presence
- Search users to start conversations

**Conversations**
- 1-on-1 direct messages
- Group chats with admins, add / remove members
- Auto-sorted conversation list with last-message preview

**Messaging**
- Real-time delivery via Socket.IO
- Reply / thread to any message
- Emoji reactions (togglable, aggregated)
- Edit and delete your messages
- Read receipts
- Typing indicators
- File / image / video attachments (Cloudinary)
- URL auto-linking
- Infinite scroll history

**Calls**
- WebRTC audio and video calls per conversation
- Multi-party calls (mesh)
- Screen sharing
- Incoming-call ring, accept / decline

**UI**
- Modern dark theme (glassmorphism, gradients)
- Responsive: works on desktop, tablet and mobile
- Sidebar collapses on small screens

## Tech Stack

- **Node.js + Express 5** — HTTP API
- **Socket.IO** — realtime messaging & WebRTC signaling
- **MongoDB + Mongoose** — persistence
- **JWT + bcryptjs** — auth
- **Multer + Cloudinary** — uploads
- **Vanilla JS + CSS** — no build step required

## Setup

### 1. Install

```bash
npm install
```

### 2. Configure `.env`

Copy `.env.example` to `.env` and fill in:

```
PORT=3000
MONGO_URI=mongodb+srv://<user>:<pw>@<cluster>/<db>
JWT_SECRET=some-long-random-string
JWT_EXPIRES_IN=7d
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_CLOUD_NAME=...
```

> **Important:** the previous MongoDB password (`mils@2109`) leaked to git
> history. Rotate it in Atlas before shipping.

### 3. Run

```bash
npm run dev    # nodemon, auto-reload
# or
npm start
```

Then open `http://localhost:3000` — you'll land on the login page. Create an
account, then invite a second user by searching for them to start a chat.

## Structure

```
app.js                     Entry / Express bootstrap
config/
  db.js                    Mongo connection
  cloudinary.js            Cloudinary client
middleware/
  auth.js                  HTTP JWT auth
  socketAuth.js            Socket.IO JWT auth
models/
  User.js
  Conversation.js
  Message.js
multer/multer.js           Cloudinary upload storage
routes/
  auth.js                  /api/auth
  users.js                 /api/users
  conversations.js         /api/conversations
  upload.js                /api/upload
socket/index.js            All Socket.IO handlers (msg + WebRTC)
public/
  login.html, register.html, app.html
  css/                     auth.css, app.css
  js/                      auth.js, api.js, app.js, call.js
```

## Endpoints

All API endpoints require `Authorization: Bearer <token>` except register/login.

- `POST   /api/auth/register`  — create account
- `POST   /api/auth/login`     — get JWT
- `GET    /api/auth/me`        — current user
- `PATCH  /api/auth/me`        — update profile
- `GET    /api/users/search?q=` — search users
- `GET    /api/conversations`  — list your conversations
- `POST   /api/conversations/dm`     — start / find DM
- `POST   /api/conversations/group`  — create group
- `GET    /api/conversations/:id/messages` — paged history
- `POST   /api/conversations/:id/members` — add (admin)
- `DELETE /api/conversations/:id/members/:userId` — remove / leave
- `POST   /api/upload`         — file upload → Cloudinary

## Socket events (client ⇄ server)

**Messaging:** `message:send`, `message:new`, `message:edit`, `message:updated`,
`message:delete`, `message:deleted`, `message:react`, `message:reaction`,
`message:read`

**Presence & typing:** `presence`, `typing:start`, `typing:stop`,
`conversation:join`

**Calls (WebRTC):** `call:join`, `call:leave`, `call:incoming`, `call:active`,
`call:ended`, `call:peer-joined`, `call:peer-left`, `call:signal`,
`call:screen-share-started`, `call:screen-share-stopped`

## Notes

- STUN only (Google's public server). For production behind strict NATs, add
  a TURN server.
- Calls use a full mesh — fine up to ~6 participants. For larger rooms, add
  an SFU (mediasoup / LiveKit).
- Message search, notifications, e2e encryption and mobile apps are not
  included but the API surface is ready to add them.
