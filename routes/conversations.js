const express = require("express");
const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

async function populateConversation(conv, currentUserId) {
  await conv.populate("members", "username displayName avatarUrl status lastSeen");
  await conv.populate({
    path: "lastMessage",
    populate: { path: "sender", select: "username displayName avatarUrl" },
  });
  return serializeConversation(conv, currentUserId);
}

function serializeConversation(conv, currentUserId) {
  let name = conv.name;
  let avatarUrl = conv.avatarUrl;
  if (conv.type === "dm") {
    const other = conv.members.find(
      (m) => String(m._id) !== String(currentUserId)
    );
    if (other) {
      name = other.displayName || other.username;
      avatarUrl = other.avatarUrl;
    }
  }
  return {
    id: conv._id,
    type: conv.type,
    name,
    avatarUrl,
    members: conv.members.map((m) => ({
      id: m._id,
      username: m.username,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      status: m.status,
    })),
    admins: conv.admins,
    lastMessage: conv.lastMessage
      ? {
          id: conv.lastMessage._id,
          text: conv.lastMessage.text,
          fileUrl: conv.lastMessage.fileUrl,
          fileType: conv.lastMessage.fileType,
          sender: conv.lastMessage.sender && {
            id: conv.lastMessage.sender._id,
            displayName: conv.lastMessage.sender.displayName,
          },
          createdAt: conv.lastMessage.createdAt,
        }
      : null,
    lastMessageAt: conv.lastMessageAt,
    createdAt: conv.createdAt,
  };
}

router.get("/", requireAuth, async (req, res) => {
  const convs = await Conversation.find({ members: req.user._id })
    .sort({ lastMessageAt: -1 })
    .populate("members", "username displayName avatarUrl status lastSeen")
    .populate({
      path: "lastMessage",
      populate: { path: "sender", select: "username displayName avatarUrl" },
    });
  res.json({
    conversations: convs.map((c) => serializeConversation(c, req.user._id)),
  });
});

router.post("/dm", requireAuth, async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId required" });
  if (String(userId) === String(req.user._id))
    return res.status(400).json({ error: "Cannot DM yourself" });

  const other = await User.findById(userId);
  if (!other) return res.status(404).json({ error: "User not found" });

  let conv = await Conversation.findOne({
    type: "dm",
    members: { $all: [req.user._id, other._id], $size: 2 },
  });
  if (!conv) {
    conv = await Conversation.create({
      type: "dm",
      members: [req.user._id, other._id],
      createdBy: req.user._id,
    });
  }
  const payload = await populateConversation(conv, req.user._id);
  res.json({ conversation: payload });
});

router.post("/group", requireAuth, async (req, res) => {
  const { name, memberIds } = req.body || {};
  if (!name || !name.trim())
    return res.status(400).json({ error: "Group name required" });
  const ids = Array.isArray(memberIds) ? memberIds : [];
  const uniq = Array.from(new Set([String(req.user._id), ...ids.map(String)]));
  if (uniq.length < 2)
    return res.status(400).json({ error: "Need at least one other member" });

  const conv = await Conversation.create({
    type: "group",
    name: name.trim(),
    members: uniq.map((id) => new mongoose.Types.ObjectId(id)),
    admins: [req.user._id],
    createdBy: req.user._id,
  });

  const payload = await populateConversation(conv, req.user._id);
  res.json({ conversation: payload });
});

router.get("/:id/messages", requireAuth, async (req, res) => {
  const conv = await Conversation.findById(req.params.id);
  if (!conv) return res.status(404).json({ error: "Not found" });
  if (!conv.members.some((m) => String(m) === String(req.user._id)))
    return res.status(403).json({ error: "Not a member" });

  const before = req.query.before ? new Date(req.query.before) : null;
  const limit = Math.min(Number(req.query.limit) || 40, 100);
  const query = { conversation: conv._id };
  if (before) query.createdAt = { $lt: before };

  const msgs = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("sender", "username displayName avatarUrl")
    .populate({
      path: "replyTo",
      populate: { path: "sender", select: "username displayName" },
    });

  res.json({ messages: msgs.reverse() });
});

router.post("/:id/members", requireAuth, async (req, res) => {
  const { userIds } = req.body || {};
  const conv = await Conversation.findById(req.params.id);
  if (!conv || conv.type !== "group")
    return res.status(404).json({ error: "Group not found" });
  if (!conv.admins.some((a) => String(a) === String(req.user._id)))
    return res.status(403).json({ error: "Admins only" });

  const toAdd = (userIds || []).filter(
    (id) => !conv.members.some((m) => String(m) === String(id))
  );
  conv.members.push(...toAdd);
  await conv.save();
  const payload = await populateConversation(conv, req.user._id);
  res.json({ conversation: payload });
});

router.delete("/:id/members/:userId", requireAuth, async (req, res) => {
  const conv = await Conversation.findById(req.params.id);
  if (!conv || conv.type !== "group")
    return res.status(404).json({ error: "Group not found" });
  const isSelf = String(req.params.userId) === String(req.user._id);
  const isAdmin = conv.admins.some(
    (a) => String(a) === String(req.user._id)
  );
  if (!isSelf && !isAdmin)
    return res.status(403).json({ error: "Not allowed" });

  conv.members = conv.members.filter(
    (m) => String(m) !== String(req.params.userId)
  );
  conv.admins = conv.admins.filter(
    (a) => String(a) !== String(req.params.userId)
  );
  await conv.save();
  res.json({ ok: true });
});

module.exports = router;
