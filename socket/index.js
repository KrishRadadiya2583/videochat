const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");
const socketAuth = require("../middleware/socketAuth");

// user id -> Set<socket.id>
const userSockets = new Map();
// conversation id -> Set<socket.id> of active call participants
const activeCalls = new Map();
// conversation id -> socket.id currently screen-sharing
const screenSharers = new Map();

function addUserSocket(userId, socketId) {
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId).add(socketId);
}
function removeUserSocket(userId, socketId) {
  const set = userSockets.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) userSockets.delete(userId);
}
function isUserOnline(userId) {
  return userSockets.has(String(userId));
}

async function emitToUser(io, userId, event, payload) {
  const set = userSockets.get(String(userId));
  if (!set) return;
  for (const sid of set) io.to(sid).emit(event, payload);
}

async function isMember(conversationId, userId) {
  const conv = await Conversation.findById(conversationId).select("members");
  if (!conv) return false;
  return conv.members.some((m) => String(m) === String(userId));
}

module.exports = (io) => {
  io.use(socketAuth);

  io.on("connection", async (socket) => {
    const { id: userId, username } = socket.user;
    addUserSocket(userId, socket.id);

    // Mark online
    await User.findByIdAndUpdate(userId, {
      status: "online",
      lastSeen: new Date(),
    });

    // Join a personal room for direct notifications
    socket.join(`user:${userId}`);

    // Join all of user's conversation rooms
    const convs = await Conversation.find({ members: userId }).select("_id members");
    for (const c of convs) {
      socket.join(`conv:${c._id}`);
      // Notify other members that this user is online
      for (const m of c.members) {
        if (String(m) !== userId) {
          io.to(`user:${m}`).emit("presence", { userId, status: "online" });
        }
      }
    }

    socket.emit("connected", { userId });

    // ---- Messaging ----

    socket.on("message:send", async (data, ack) => {
      try {
        const { conversationId, text, fileUrl, fileType, fileName, replyTo } =
          data || {};
        if (!conversationId) return ack?.({ error: "conversationId required" });
        if ((!text || !text.trim()) && !fileUrl)
          return ack?.({ error: "Empty message" });

        if (!(await isMember(conversationId, userId)))
          return ack?.({ error: "Not a member" });

        const msg = await Message.create({
          conversation: conversationId,
          sender: userId,
          text: (text || "").trim(),
          fileUrl: fileUrl || null,
          fileType: fileType || null,
          fileName: fileName || null,
          replyTo: replyTo || null,
          readBy: [userId],
        });

        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: msg._id,
          lastMessageAt: msg.createdAt,
        });

        const populated = await Message.findById(msg._id)
          .populate("sender", "username displayName avatarUrl")
          .populate({
            path: "replyTo",
            populate: { path: "sender", select: "username displayName" },
          });

        io.to(`conv:${conversationId}`).emit("message:new", populated);
        ack?.({ ok: true, message: populated });
      } catch (e) {
        console.error(e);
        ack?.({ error: "Send failed" });
      }
    });

    socket.on("message:edit", async ({ messageId, text }, ack) => {
      try {
        const msg = await Message.findById(messageId);
        if (!msg) return ack?.({ error: "Not found" });
        if (String(msg.sender) !== userId)
          return ack?.({ error: "Not your message" });
        msg.text = (text || "").trim();
        msg.editedAt = new Date();
        await msg.save();
        const populated = await Message.findById(msg._id).populate(
          "sender",
          "username displayName avatarUrl"
        );
        io.to(`conv:${msg.conversation}`).emit("message:updated", populated);
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ error: "Edit failed" });
      }
    });

    socket.on("message:delete", async ({ messageId }, ack) => {
      try {
        const msg = await Message.findById(messageId);
        if (!msg) return ack?.({ error: "Not found" });
        if (String(msg.sender) !== userId)
          return ack?.({ error: "Not your message" });
        msg.text = "";
        msg.fileUrl = null;
        msg.deletedAt = new Date();
        await msg.save();
        io.to(`conv:${msg.conversation}`).emit("message:deleted", {
          id: msg._id,
          conversation: msg.conversation,
        });
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ error: "Delete failed" });
      }
    });

    socket.on("message:react", async ({ messageId, emoji }, ack) => {
      try {
        const msg = await Message.findById(messageId);
        if (!msg) return ack?.({ error: "Not found" });
        if (!(await isMember(msg.conversation, userId)))
          return ack?.({ error: "Not a member" });

        const existing = msg.reactions.findIndex(
          (r) => String(r.user) === userId && r.emoji === emoji
        );
        if (existing >= 0) {
          msg.reactions.splice(existing, 1);
        } else {
          msg.reactions.push({ emoji, user: userId });
        }
        await msg.save();

        io.to(`conv:${msg.conversation}`).emit("message:reaction", {
          messageId: String(msg._id),
          reactions: msg.reactions,
        });
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ error: "React failed" });
      }
    });

    socket.on("message:read", async ({ conversationId, messageId }) => {
      try {
        if (!(await isMember(conversationId, userId))) return;
        await Message.updateOne(
          { _id: messageId, readBy: { $ne: userId } },
          { $addToSet: { readBy: userId } }
        );
        io.to(`conv:${conversationId}`).emit("message:read", {
          conversationId,
          messageId,
          userId,
        });
      } catch (e) {
        console.error(e);
      }
    });

    socket.on("typing:start", ({ conversationId }) => {
      if (!conversationId) return;
      socket.to(`conv:${conversationId}`).emit("typing:start", {
        conversationId,
        userId,
        username,
      });
    });

    socket.on("typing:stop", ({ conversationId }) => {
      if (!conversationId) return;
      socket.to(`conv:${conversationId}`).emit("typing:stop", {
        conversationId,
        userId,
      });
    });

    socket.on("conversation:join", async ({ conversationId }) => {
      if (await isMember(conversationId, userId)) {
        socket.join(`conv:${conversationId}`);
      }
    });

    // ---- WebRTC signaling ----

    socket.on("call:join", async ({ conversationId }, ack) => {
      if (!(await isMember(conversationId, userId)))
        return ack?.({ error: "Not a member" });

      if (!activeCalls.has(conversationId))
        activeCalls.set(conversationId, new Map());
      const call = activeCalls.get(conversationId);

      const wasEmpty = call.size === 0;

      const peers = Array.from(call.entries()).map(([sid, info]) => ({
        socketId: sid,
        userId: info.userId,
        username: info.username,
      }));

      call.set(socket.id, { userId, username });
      socket.join(`call:${conversationId}`);

      // Tell everyone else that a user joined the call
      socket.to(`call:${conversationId}`).emit("call:peer-joined", {
        socketId: socket.id,
        userId,
        username,
      });

      // If this is the first joiner, ring other conversation members
      if (wasEmpty) {
        socket.to(`conv:${conversationId}`).emit("call:incoming", {
          conversationId,
          caller: { userId, username },
        });
      }

      // Also notify the room that a call is active
      io.to(`conv:${conversationId}`).emit("call:active", {
        conversationId,
        participants: call.size,
      });

      ack?.({ ok: true, peers });

      if (screenSharers.has(conversationId)) {
        socket.emit("call:screen-share-started", {
          socketId: screenSharers.get(conversationId),
        });
      }
    });

    socket.on("call:leave", ({ conversationId }) => {
      leaveCall(io, socket, conversationId);
    });

    socket.on("call:signal", ({ target, sdp, candidate, kind }) => {
      io.to(target).emit("call:signal", {
        sender: socket.id,
        sdp,
        candidate,
        kind,
      });
    });

    socket.on("call:screen-share-started", ({ conversationId }) => {
      screenSharers.set(conversationId, socket.id);
      socket
        .to(`call:${conversationId}`)
        .emit("call:screen-share-started", { socketId: socket.id });
    });

    socket.on("call:screen-share-stopped", ({ conversationId }) => {
      if (screenSharers.get(conversationId) === socket.id) {
        screenSharers.delete(conversationId);
      }
      socket
        .to(`call:${conversationId}`)
        .emit("call:screen-share-stopped", { socketId: socket.id });
    });

    // ---- Disconnect ----

    socket.on("disconnect", async () => {
      removeUserSocket(userId, socket.id);

      // Clean up any calls this socket is in
      for (const [convId, call] of activeCalls) {
        if (call.has(socket.id)) leaveCall(io, socket, convId);
      }

      if (!isUserOnline(userId)) {
        await User.findByIdAndUpdate(userId, {
          status: "offline",
          lastSeen: new Date(),
        });
        // Notify user's conversation members
        const convs = await Conversation.find({ members: userId }).select(
          "members"
        );
        const notified = new Set();
        for (const c of convs) {
          for (const m of c.members) {
            const mid = String(m);
            if (mid !== userId && !notified.has(mid)) {
              notified.add(mid);
              io.to(`user:${mid}`).emit("presence", {
                userId,
                status: "offline",
              });
            }
          }
        }
      }
    });
  });
};

function leaveCall(io, socket, conversationId) {
  const call = activeCalls.get(conversationId);
  if (!call || !call.has(socket.id)) return;
  call.delete(socket.id);
  socket.leave(`call:${conversationId}`);

  socket.to(`call:${conversationId}`).emit("call:peer-left", {
    socketId: socket.id,
  });

  if (screenSharers.get(conversationId) === socket.id) {
    screenSharers.delete(conversationId);
    socket
      .to(`call:${conversationId}`)
      .emit("call:screen-share-stopped", { socketId: socket.id });
  }

  if (call.size === 0) {
    activeCalls.delete(conversationId);
    io.to(`conv:${conversationId}`).emit("call:ended", { conversationId });
  } else {
    io.to(`conv:${conversationId}`).emit("call:active", {
      conversationId,
      participants: call.size,
    });
  }
}
