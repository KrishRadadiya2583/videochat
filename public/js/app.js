(function () {
  const token = API.getToken();
  if (!token) {
    window.location.href = "/login";
    return;
  }

  // ---- State ----
  const state = {
    me: API.getUser() || null,
    conversations: [],
    activeId: null,
    messages: [], // for active conv
    replyTo: null,
    typingUsers: {}, // convId -> {userId: username}
    typingTimeouts: {},
    pendingAttachment: null,
    typingSelfTimer: null,
    hasMoreOlder: true,
  };

  // ---- DOM refs ----
  const el = {
    sidebar: document.getElementById("sidebar"),
    convList: document.getElementById("convList"),
    convFilter: document.getElementById("convFilter"),
    me: document.getElementById("me"),
    logoutBtn: document.getElementById("logoutBtn"),
    newDmBtn: document.getElementById("newDmBtn"),
    newGroupBtn: document.getElementById("newGroupBtn"),
    chatEmpty: document.getElementById("chatEmpty"),
    chatActive: document.getElementById("chatActive"),
    chatAvatar: document.getElementById("chatAvatar"),
    chatTitle: document.getElementById("chatTitle"),
    chatSub: document.getElementById("chatSub"),
    chatScroll: document.getElementById("chatScroll"),
    messages: document.getElementById("messages"),
    typing: document.getElementById("typing"),
    loadMoreBtn: document.getElementById("loadMoreBtn"),
    replyingTo: document.getElementById("replyingTo"),
    msgInput: document.getElementById("msgInput"),
    sendBtn: document.getElementById("sendBtn"),
    attachBtn: document.getElementById("attachBtn"),
    fileInput: document.getElementById("fileInput"),
    attachPreview: document.getElementById("attachPreview"),
    emojiBtn: document.getElementById("emojiBtn"),
    emojiPicker: document.getElementById("emojiPicker"),
    reactionPicker: document.getElementById("reactionPicker"),
    msgMenu: document.getElementById("msgMenu"),
    infoBtn: document.getElementById("infoBtn"),
    details: document.getElementById("details"),
    detailsBody: document.getElementById("detailsBody"),
    closeDetailsBtn: document.getElementById("closeDetailsBtn"),
    chat: document.getElementById("chat"),
    menuToggle: document.getElementById("menuToggle"),

    newDmModal: document.getElementById("newDmModal"),
    dmSearch: document.getElementById("dmSearch"),
    dmResults: document.getElementById("dmResults"),
    newGroupModal: document.getElementById("newGroupModal"),
    groupName: document.getElementById("groupName"),
    groupSearch: document.getElementById("groupSearch"),
    groupResults: document.getElementById("groupResults"),
    groupSelected: document.getElementById("groupSelected"),
    createGroupBtn: document.getElementById("createGroupBtn"),

    toasts: document.getElementById("toasts"),
  };

  // ---- Helpers ----
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }
  function initials(name) {
    return (name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  }
  function timeShort(ts) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const days = Math.round((now - d) / 86400000);
    if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  function fullTime(ts) {
    const d = new Date(ts);
    return d.toLocaleString([], {
      hour: "2-digit", minute: "2-digit", month: "short", day: "numeric",
    });
  }
  function toast(msg, kind) {
    const t = document.createElement("div");
    t.className = `toast ${kind || ""}`;
    t.textContent = msg;
    el.toasts.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }
  function avatarHTML(user, size = "sm") {
    const cls = size === "lg" ? "avatar lg" : size === "md" ? "avatar" : "avatar sm";
    if (user && user.avatarUrl) {
      return `<div class="${cls}"><img src="${esc(user.avatarUrl)}" alt=""></div>`;
    }
    const name = (user && (user.displayName || user.username)) || "?";
    return `<div class="${cls}">${esc(initials(name))}</div>`;
  }
  function convAvatarHTML(conv, size = "sm") {
    if (conv.type === "dm") {
      const other = conv.members.find((m) => m.id !== state.me.id) || conv.members[0];
      const html = avatarHTML(other, size);
      const online = other && other.status === "online";
      return html.replace("</div>", `${online ? '<span class="presence-dot online"></span>' : ""}</div>`);
    }
    const cls = size === "lg" ? "avatar lg" : size === "md" ? "avatar" : "avatar sm";
    return `<div class="${cls}">${esc(initials(conv.name))}</div>`;
  }

  // ---- Socket ----
  const socket = io({ auth: { token }, transports: ["websocket", "polling"] });

  socket.on("connect_error", (err) => {
    if (err.message === "Authentication failed" || err.message === "No token") {
      API.clearSession();
      window.location.href = "/login";
    } else {
      toast("Connection error: " + err.message, "error");
    }
  });

  // ---- Load current user + conversations ----
  async function boot() {
    try {
      const { user } = await API.me();
      state.me = user;
      API.setSession(token, user);
      renderMe();
      await loadConversations();
    } catch (e) {
      toast("Failed to load session", "error");
    }
  }

  function renderMe() {
    if (!state.me) return;
    el.me.innerHTML = `
      ${avatarHTML(state.me, "sm")}
      <div class="me-info">
        <div class="me-name">${esc(state.me.displayName)}</div>
        <div class="me-status">@${esc(state.me.username)}</div>
      </div>
    `;
  }

  async function loadConversations() {
    const { conversations } = await API.listConversations();
    state.conversations = conversations;
    renderConvList();
  }

  function renderConvList() {
    const filter = (el.convFilter.value || "").toLowerCase();
    const items = state.conversations.filter((c) =>
      !filter || (c.name || "").toLowerCase().includes(filter)
    );
    if (!items.length) {
      el.convList.innerHTML = `<div class="side-empty">No conversations yet.<br>Start a new one.</div>`;
      return;
    }
    el.convList.innerHTML = items
      .map((c) => {
        const lm = c.lastMessage;
        const preview = lm
          ? (lm.callInfo
              ? (lm.callInfo.missed
                  ? `📵 ${lm.callInfo.callType === "video" ? "Missed video call" : "Missed voice call"}`
                  : `${lm.callInfo.callType === "video" ? "📹" : "📞"} ${lm.callInfo.callType === "video" ? "Video call" : "Voice call"}`)
              : lm.text
              ? esc(lm.text)
              : lm.fileUrl
              ? "📎 Attachment"
              : "")
          : "No messages yet";
        const sender = lm && !lm.callInfo && lm.sender && lm.sender.id === state.me.id ? "You: " : "";
        return `
          <div class="conv-item ${c.id === state.activeId ? "active" : ""}" data-id="${c.id}">
            ${convAvatarHTML(c, "md").replace("avatar sm", "avatar")}
            <div class="conv-meta">
              <div class="conv-row">
                <div class="conv-name">${esc(c.name)}</div>
                <div class="conv-time">${lm ? timeShort(lm.createdAt) : ""}</div>
              </div>
              <div class="conv-preview">${sender}${preview}</div>
            </div>
          </div>
        `;
      })
      .join("");
    el.convList.querySelectorAll(".conv-item").forEach((node) => {
      node.addEventListener("click", () => openConversation(node.dataset.id));
    });
  }

  async function openConversation(id) {
    state.activeId = id;
    state.messages = [];
    state.hasMoreOlder = true;
    renderConvList();
    const conv = state.conversations.find((c) => c.id === id);
    if (!conv) return;

    el.chatEmpty.classList.add("hidden");
    el.chatActive.classList.remove("hidden");
    el.chatAvatar.innerHTML = convAvatarHTML(conv, "md").replace(/^<div class="avatar[^"]*">/, "").replace(/<\/div>$/, "");
    el.chatAvatar.className = "avatar";
    el.chatAvatar.innerHTML = conv.type === "dm"
      ? (() => {
          const other = conv.members.find((m) => m.id !== state.me.id);
          return other && other.avatarUrl ? `<img src="${esc(other.avatarUrl)}" alt="">` : esc(initials(conv.name));
        })()
      : esc(initials(conv.name));

    el.chatTitle.textContent = conv.name;
    el.chatSub.textContent = conv.type === "dm"
      ? subForDM(conv)
      : `${conv.members.length} members`;

    el.details.classList.add("hidden");
    el.chat.classList.remove("with-details");

    socket.emit("conversation:join", { conversationId: id });

    try {
      const { messages } = await API.getMessages(id, { limit: 40 });
      state.messages = messages;
      state.hasMoreOlder = messages.length === 40;
      renderMessages();
      scrollToBottom();
    } catch (e) {
      toast("Failed to load messages", "error");
    }

    // Close sidebar on mobile
    if (window.innerWidth <= 900) el.sidebar.classList.remove("open");
  }

  function subForDM(conv) {
    const other = conv.members.find((m) => m.id !== state.me.id);
    if (!other) return "";
    if (other.status === "online") return "Active now";
    return "@" + other.username;
  }

  function renderMessages() {
    if (!state.messages.length) {
      el.messages.innerHTML = `<div class="system-msg">No messages yet — say hi!</div>`;
      el.loadMoreBtn.classList.add("hidden");
      return;
    }
    el.loadMoreBtn.classList.toggle("hidden", !state.hasMoreOlder);

    const conv = state.conversations.find((c) => c.id === state.activeId);
    const isGroup = conv && conv.type === "group";

    let prevSender = null;
    let prevDay = null;
    const parts = [];
    state.messages.forEach((m) => {
      const day = new Date(m.createdAt).toDateString();
      if (day !== prevDay) {
        parts.push(`<div class="system-msg">${esc(new Date(m.createdAt).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }))}</div>`);
        prevDay = day;
        prevSender = null;
      }
      if (m.system) {
        parts.push(renderSystemMsg(m));
        prevSender = null;
        return;
      }
      const isSelf = String(m.sender._id || m.sender.id) === String(state.me.id);
      const showAvatar = !isSelf && (prevSender !== String(m.sender._id || m.sender.id));
      parts.push(renderMsgRow(m, isSelf, showAvatar, isGroup));
      prevSender = String(m.sender._id || m.sender.id);
    });
    el.messages.innerHTML = parts.join("");
    bindMessageEvents();
  }

  function renderMsgRow(m, isSelf, showAvatar, isGroup) {
    const senderId = String(m.sender._id || m.sender.id);
    const senderName = m.sender.displayName || m.sender.username;
    const deleted = !!m.deletedAt;
    const edited = !!m.editedAt;

    let attach = "";
    if (m.fileUrl && !deleted) {
      if ((m.fileType || "").startsWith("image/")) {
        attach = `<div class="msg-attachment"><img src="${esc(m.fileUrl)}" alt=""></div>`;
      } else if ((m.fileType || "").startsWith("video/")) {
        attach = `<div class="msg-attachment"><video src="${esc(m.fileUrl)}" controls></video></div>`;
      } else {
        attach = `<a class="msg-file" href="${esc(m.fileUrl)}" target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          ${esc(m.fileName || "Attachment")}
        </a>`;
      }
    }

    let reply = "";
    if (m.replyTo) {
      const rSender = m.replyTo.sender ? m.replyTo.sender.displayName || m.replyTo.sender.username : "";
      const rText = m.replyTo.text || (m.replyTo.fileUrl ? "📎 Attachment" : "");
      reply = `<div class="msg-reply"><div class="reply-sender">${esc(rSender)}</div><div>${esc(rText)}</div></div>`;
    }

    let reactions = "";
    if (m.reactions && m.reactions.length) {
      const grouped = {};
      m.reactions.forEach((r) => {
        grouped[r.emoji] = grouped[r.emoji] || { count: 0, mine: false };
        grouped[r.emoji].count++;
        if (String(r.user) === String(state.me.id)) grouped[r.emoji].mine = true;
      });
      reactions = `<div class="msg-reactions">${Object.entries(grouped).map(([em, g]) => `<span class="reaction-chip ${g.mine ? "mine" : ""}" data-emoji="${esc(em)}" data-mid="${m._id}">${em} ${g.count}</span>`).join("")}</div>`;
    }

    const readByOthers = (m.readBy || []).filter((u) => String(u) !== String(state.me.id));
    const readCheck = isSelf && !deleted
      ? readByOthers.length
        ? `<span class="read-check" title="Read"><svg viewBox="0 0 24 24" fill="none" width="14" height="14" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 12l-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`
        : `<span class="read-check" title="Sent"><svg viewBox="0 0 24 24" fill="none" width="14" height="14" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`
      : "";

    const text = deleted
      ? `<div class="msg-text" style="opacity:0.6;font-style:italic">Message deleted</div>`
      : m.text
      ? `<div class="msg-text">${linkify(esc(m.text))}</div>`
      : "";

    const actions = deleted
      ? ""
      : `<div class="msg-actions">
          <button class="icon-btn" data-act="react" title="React"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22a10 10 0 100-20 10 10 0 000 20zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
          <button class="icon-btn" data-act="reply" title="Reply"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 17l-5-5 5-5M20 18v-2a4 4 0 00-4-4H4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          ${isSelf ? `<button class="icon-btn" data-act="edit" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : ""}
          ${isSelf ? `<button class="icon-btn" data-act="delete" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : ""}
        </div>`;

    return `
      <div class="msg-row ${isSelf ? "self" : "other"}" data-id="${m._id}" data-sender="${senderId}">
        ${!isSelf ? (showAvatar ? avatarHTML(m.sender, "sm") : '<div style="width:28px;flex-shrink:0"></div>') : ""}
        <div class="msg-bubble">
          ${!isSelf && isGroup && showAvatar ? `<div class="msg-sender">${esc(senderName)}</div>` : ""}
          ${reply}
          ${attach}
          ${text}
          <div class="msg-meta">
            <span>${timeShort(m.createdAt)}${edited ? ' <span class="edited">(edited)</span>' : ""}</span>
            ${readCheck}
          </div>
          ${reactions}
          ${actions}
        </div>
      </div>
    `;
  }

  function renderSystemMsg(m) {
    const ci = m.callInfo;
    if (!ci) {
      return `<div class="system-msg">${esc(m.text)}</div>`;
    }
    const missed = !!ci.missed;
    const isVideo = ci.callType === "video";
    const iconSvg = isVideo
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const senderName = m.sender ? (m.sender.displayName || m.sender.username) : "";
    const label = missed
      ? `Missed ${isVideo ? "video" : "voice"} call`
      : `${isVideo ? "Video" : "Voice"} call`;
    const detail = missed
      ? `from ${esc(senderName)} · ${timeShort(m.createdAt)}`
      : `${formatDuration(ci.durationSeconds)} · ${timeShort(m.createdAt)}`;
    return `
      <div class="call-msg ${missed ? "missed" : "done"}">
        <span class="call-icon">${iconSvg}</span>
        <span>
          <div>${esc(label)}</div>
          <div class="call-detail">${detail}</div>
        </span>
      </div>
    `;
  }

  function formatDuration(s) {
    s = Math.max(0, Math.floor(s || 0));
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function linkify(html) {
    return html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      el.chatScroll.scrollTop = el.chatScroll.scrollHeight;
    });
  }

  // ---- Message events ----
  function bindMessageEvents() {
    el.messages.querySelectorAll(".msg-actions .icon-btn").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const row = b.closest(".msg-row");
        const id = row.dataset.id;
        const act = b.dataset.act;
        const msg = state.messages.find((m) => m._id === id);
        if (!msg) return;
        if (act === "reply") setReplyTo(msg);
        if (act === "delete") deleteMessage(id);
        if (act === "edit") editMessage(msg);
        if (act === "react") openReactionPicker(b, id);
      });
    });
    el.messages.querySelectorAll(".reaction-chip").forEach((c) => {
      c.addEventListener("click", () => {
        socket.emit("message:react", {
          messageId: c.dataset.mid,
          emoji: c.dataset.emoji,
        });
      });
    });
  }

  function setReplyTo(msg) {
    state.replyTo = msg;
    el.replyingTo.classList.remove("hidden");
    const senderName = msg.sender.displayName || msg.sender.username;
    el.replyingTo.innerHTML = `
      <div>Replying to <strong>${esc(senderName)}</strong>: ${esc((msg.text || "📎 Attachment").slice(0, 80))}</div>
      <span class="cancel" id="cancelReply">✖</span>
    `;
    document.getElementById("cancelReply").addEventListener("click", () => {
      state.replyTo = null;
      el.replyingTo.classList.add("hidden");
    });
    el.msgInput.focus();
  }

  function deleteMessage(id) {
    if (!confirm("Delete this message?")) return;
    socket.emit("message:delete", { messageId: id }, (res) => {
      if (res && res.error) toast(res.error, "error");
    });
  }

  function editMessage(msg) {
    const next = prompt("Edit message:", msg.text || "");
    if (next === null) return;
    socket.emit("message:edit", { messageId: msg._id, text: next }, (res) => {
      if (res && res.error) toast(res.error, "error");
    });
  }

  function openReactionPicker(btn, msgId) {
    const rect = btn.getBoundingClientRect();
    el.reactionPicker.style.top = rect.top - 44 + "px";
    el.reactionPicker.style.left = rect.left + "px";
    el.reactionPicker.classList.remove("hidden");
    el.reactionPicker.dataset.mid = msgId;
  }
  el.reactionPicker.querySelectorAll("span").forEach((s) => {
    s.addEventListener("click", () => {
      const mid = el.reactionPicker.dataset.mid;
      socket.emit("message:react", { messageId: mid, emoji: s.textContent });
      el.reactionPicker.classList.add("hidden");
    });
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".reaction-picker") && !e.target.closest('[data-act="react"]')) {
      el.reactionPicker.classList.add("hidden");
    }
    if (!e.target.closest(".emoji-picker") && !e.target.closest("#emojiBtn")) {
      el.emojiPicker.classList.add("hidden");
    }
  });

  // ---- Composer ----
  el.msgInput.addEventListener("input", () => {
    el.msgInput.style.height = "auto";
    el.msgInput.style.height = Math.min(el.msgInput.scrollHeight, 160) + "px";
    if (!state.activeId) return;
    socket.emit("typing:start", { conversationId: state.activeId });
    clearTimeout(state.typingSelfTimer);
    state.typingSelfTimer = setTimeout(() => {
      socket.emit("typing:stop", { conversationId: state.activeId });
    }, 1500);
  });
  el.msgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  el.sendBtn.addEventListener("click", sendMessage);
  el.attachBtn.addEventListener("click", () => el.fileInput.click());
  el.fileInput.addEventListener("change", async () => {
    const file = el.fileInput.files[0];
    if (!file) return;
    state.pendingAttachment = { file };
    el.attachPreview.classList.remove("hidden");
    el.attachPreview.innerHTML = file.type.startsWith("image/")
      ? `<img src="${URL.createObjectURL(file)}" alt=""><span>${esc(file.name)}</span><span class="remove">✖</span>`
      : `<span>📎</span><span>${esc(file.name)}</span><span class="remove">✖</span>`;
    el.attachPreview.querySelector(".remove").addEventListener("click", clearAttachment);
  });
  function clearAttachment() {
    state.pendingAttachment = null;
    el.fileInput.value = "";
    el.attachPreview.classList.add("hidden");
    el.attachPreview.innerHTML = "";
  }

  async function sendMessage() {
    const text = el.msgInput.value.trim();
    const attach = state.pendingAttachment;
    if (!text && !attach) return;
    if (!state.activeId) return;

    let fileUrl = null, fileType = null, fileName = null;
    if (attach) {
      try {
        const r = await API.upload(attach.file);
        fileUrl = r.fileUrl; fileType = r.fileType; fileName = r.fileName;
      } catch (e) {
        toast("Upload failed", "error");
        return;
      }
    }
    socket.emit(
      "message:send",
      {
        conversationId: state.activeId,
        text,
        fileUrl,
        fileType,
        fileName,
        replyTo: state.replyTo ? state.replyTo._id : null,
      },
      (res) => {
        if (res && res.error) toast(res.error, "error");
      }
    );
    el.msgInput.value = "";
    el.msgInput.style.height = "auto";
    clearAttachment();
    state.replyTo = null;
    el.replyingTo.classList.add("hidden");
    socket.emit("typing:stop", { conversationId: state.activeId });
  }

  // ---- Emoji picker ----
  const EMOJI_CATEGORIES = [
    { icon: "😀", name: "Smileys", items: "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 ☺️ 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 👾 🤖".split(" ") },
    { icon: "❤️", name: "Hearts", items: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 💌 💋 👄 🫶 🩷 🩵 🩶".split(" ") },
    { icon: "👋", name: "Hands", items: "👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 💪 🦵 🦶 👂 🦻 👃 🧠 🦷 🦴 👀 👁️ 👅 👶 👦 👧 🧒 👨 👩 🧑 👴 👵 🧓".split(" ") },
    { icon: "🐶", name: "Animals", items: "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐢 🐍 🦎 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🦧 🦣 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🦬 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🦮 🐈 🐓 🦃 🕊️".split(" ") },
    { icon: "🍕", name: "Food", items: "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🥙 🧆 🌮 🌯 🫔 🥗 🥘 🫕 🥫 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍥 🥠 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 ☕ 🍵 🧃 🥤 🧋 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾".split(" ") },
    { icon: "⚽", name: "Activities", items: "⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🪃 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🪂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🏵️ 🎗️ 🎫 🎟️ 🎪 🤹 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🪘 🎷 🎺 🪗 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🎰 🧩".split(" ") },
    { icon: "🚗", name: "Travel", items: "🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🦯 🦽 🦼 🛴 🚲 🛵 🏍️ 🛺 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🛰️ 🚀 🛸 🚁 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ ⛽ 🚧 🚦 🚥 🚏 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🏠 🏡 🏘️ 🏚️ 🏗️ 🏭 🏢 🏬 🏣 🏤 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛️ ⛪ 🕌 🕍 🛕 🕋 ⛩️".split(" ") },
    { icon: "💡", name: "Objects", items: "⌚ 📱 📲 💻 ⌨️ 🖥️ 🖨️ 🖱️ 🖲️ 🕹️ 🗜️ 💽 💾 💿 📀 📼 📷 📸 📹 🎥 📽️ 🎞️ 📞 ☎️ 📟 📠 📺 📻 🎙️ 🎚️ 🎛️ 🧭 ⏱️ ⏲️ ⏰ 🕰️ ⌛ ⏳ 📡 🔋 🔌 💡 🔦 🕯️ 🪔 🧯 🛢️ 💸 💵 💴 💶 💷 🪙 💰 💳 💎 ⚖️ 🪜 🧰 🪛 🔧 🔨 ⚒️ 🛠️ ⛏️ 🪚 🔩 ⚙️ 🪤 🧱 ⛓️ 🧲 🔫 💣 🧨 🪓 🔪 🗡️ ⚔️ 🛡️ 🚬 ⚰️ 🪦 ⚱️ 🏺 🔮 📿 🧿 💈 ⚗️ 🔭 🔬 🕳️ 🩹 🩺 💊 💉 🩸 🧬 🦠 🧫 🧪 🌡️ 🧹 🪠 🧺 🧻 🚽 🚰 🚿 🛁 🛀 🧼 🪥 🪒 🧽 🪣 🧴 🛎️ 🔑 🗝️ 🚪 🪑 🛋️ 🛏️ 🛌 🧸 🪆 🖼️ 🪞 🪟 🛍️ 🛒 🎁 🎀 🎊 🎉 🎏 🎐 🎑 🧧 ✉️ 📩 📨 📧 💌 📥 📤 📦 🏷️ 📪 📫 📬 📭 📮 📯 📜 📃 📄 📑 🧾 📊 📈 📉 🗒️ 🗓️ 📆 📅 🗑️ 📇 🗃️ 🗳️ 🗄️ 📋 📁 📂 🗂️ 🗞️ 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🧷 🔗 📎 🖇️ 📐 📏 🧮 📌 📍 ✂️ 🖊️ 🖋️ ✒️ 🖌️ 🖍️ 📝 ✏️ 🔍 🔎 🔏 🔐 🔒 🔓".split(" ") },
    { icon: "🎉", name: "Symbols", items: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💯 💢 💥 💫 💦 💨 🕳️ 💣 💬 👁️‍🗨️ 🗨️ 🗯️ 💭 💤 🌟 ⭐ 🌠 ☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 🌬️ 💧 💦 ☔ ☂️ 🌊 🌫️ 🔥 ✨ 🎉 🎊 🎈 🎁 🎗️ 🎟️ 🎫 🎖️ 🏆 🥇 🥈 🥉 🏵️ 🌹 🥀 🌷 🌸 💮 🪷 🌻 🌼 🌺 🍀 🌱 🌲 🌳 🌴 🌵 🌾 🌿 ☘️ 🍁 🍂 🍃 ♻️ 🌍 🌎 🌏 🌐 ✅ ❌ ⭕ 🚫 ⛔ 📛 ⚠️ 🚸 🔞 ☢️ ☣️ ⬆️ ↗️ ➡️ ↘️ ⬇️ ↙️ ⬅️ ↖️ ↕️ ↔️ ↩️ ↪️ ⤴️ ⤵️ 🔃 🔄 🔙 🔚 🔛 🔜 🔝 🛐 ⚛️ 🕉️ ✡️ ☸️ ☯️ ✝️ ☦️ ☪️ ☮️ 🕎 🔯 ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ ⛎ 🔀 🔁 🔂 ▶️ ⏩ ⏭️ ⏯️ ◀️ ⏪ ⏮️ 🔼 ⏫ 🔽 ⏬ ⏸️ ⏹️ ⏺️ ⏏️".split(" ") },
  ];

  let currentEmojiCat = 0;

  function buildEmojiTabs() {
    el.emojiTabs = document.getElementById("emojiTabs");
    el.emojiBody = document.getElementById("emojiBody");
    el.emojiSearch = document.getElementById("emojiSearch");

    el.emojiTabs.innerHTML = EMOJI_CATEGORIES.map(
      (c, i) =>
        `<button class="emoji-tab ${i === 0 ? "active" : ""}" data-idx="${i}" title="${c.name}">${c.icon}</button>`
    ).join("");
    el.emojiTabs.querySelectorAll(".emoji-tab").forEach((t) => {
      t.addEventListener("click", () => {
        currentEmojiCat = Number(t.dataset.idx);
        el.emojiTabs.querySelectorAll(".emoji-tab").forEach((x) =>
          x.classList.toggle("active", x === t)
        );
        el.emojiSearch.value = "";
        renderEmojiBody("");
      });
    });
    el.emojiSearch.addEventListener("input", () => {
      renderEmojiBody(el.emojiSearch.value.trim());
    });
    renderEmojiBody("");
  }

  function renderEmojiBody(query) {
    if (query) {
      const q = query.toLowerCase();
      const matches = [];
      EMOJI_CATEGORIES.forEach((c) => {
        if (c.name.toLowerCase().includes(q)) matches.push(...c.items);
      });
      if (!matches.length) {
        el.emojiBody.innerHTML = `<div class="emoji-empty">No emoji found</div>`;
        return;
      }
      el.emojiBody.innerHTML = `<div class="emoji-grid">${matches.map((e) => `<span>${e}</span>`).join("")}</div>`;
    } else {
      const cat = EMOJI_CATEGORIES[currentEmojiCat];
      el.emojiBody.innerHTML = `
        <div class="emoji-category-label">${esc(cat.name)}</div>
        <div class="emoji-grid">${cat.items.map((e) => `<span>${e}</span>`).join("")}</div>
      `;
    }
    el.emojiBody.querySelectorAll(".emoji-grid span").forEach((s) => {
      s.addEventListener("click", () => {
        insertAtCaret(el.msgInput, s.textContent);
        el.msgInput.focus();
      });
    });
  }

  function insertAtCaret(textarea, text) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    textarea.value =
      textarea.value.slice(0, start) + text + textarea.value.slice(end);
    const pos = start + text.length;
    textarea.setSelectionRange(pos, pos);
    textarea.dispatchEvent(new Event("input"));
  }

  el.emojiBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const rect = el.emojiBtn.getBoundingClientRect();
    el.emojiPicker.style.bottom = window.innerHeight - rect.top + 8 + "px";
    el.emojiPicker.style.right = window.innerWidth - rect.right + "px";
    el.emojiPicker.classList.toggle("hidden");
    if (!el.emojiPicker.classList.contains("hidden")) {
      document.getElementById("emojiSearch").focus();
    }
  });
  buildEmojiTabs();

  // ---- Load older ----
  el.loadMoreBtn.addEventListener("click", async () => {
    if (!state.messages.length) return;
    const oldest = state.messages[0].createdAt;
    try {
      const prevHeight = el.chatScroll.scrollHeight;
      const { messages } = await API.getMessages(state.activeId, {
        before: oldest,
        limit: 40,
      });
      if (!messages.length) {
        state.hasMoreOlder = false;
        el.loadMoreBtn.classList.add("hidden");
        return;
      }
      state.hasMoreOlder = messages.length === 40;
      state.messages = messages.concat(state.messages);
      renderMessages();
      requestAnimationFrame(() => {
        el.chatScroll.scrollTop = el.chatScroll.scrollHeight - prevHeight;
      });
    } catch (e) {
      toast("Failed to load more", "error");
    }
  });

  // ---- Socket handlers ----
  socket.on("message:new", (msg) => {
    const convId = String(msg.conversation);
    // Update conversation list (last message)
    const conv = state.conversations.find((c) => c.id === convId);
    if (conv) {
      conv.lastMessage = {
        id: msg._id, text: msg.text, fileUrl: msg.fileUrl, fileType: msg.fileType,
        system: msg.system, callInfo: msg.callInfo,
        sender: { id: msg.sender._id || msg.sender.id, displayName: msg.sender.displayName },
        createdAt: msg.createdAt,
      };
      conv.lastMessageAt = msg.createdAt;
      state.conversations.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
      renderConvList();
    }
    if (convId === state.activeId) {
      state.messages.push(msg);
      renderMessages();
      const nearBottom = el.chatScroll.scrollHeight - el.chatScroll.scrollTop - el.chatScroll.clientHeight < 200;
      if (nearBottom || String(msg.sender._id || msg.sender.id) === String(state.me.id)) {
        scrollToBottom();
      }
      // Mark as read
      socket.emit("message:read", {
        conversationId: convId,
        messageId: msg._id,
      });
    } else {
      // Notify if not focused
      if (document.hidden || !document.hasFocus()) {
        toast(`${msg.sender.displayName}: ${msg.text || "sent an attachment"}`);
      }
    }
  });

  socket.on("message:updated", (msg) => {
    const idx = state.messages.findIndex((m) => m._id === msg._id);
    if (idx >= 0) {
      state.messages[idx] = { ...state.messages[idx], ...msg };
      renderMessages();
    }
  });

  socket.on("message:deleted", ({ id }) => {
    const idx = state.messages.findIndex((m) => m._id === id);
    if (idx >= 0) {
      state.messages[idx].deletedAt = new Date().toISOString();
      state.messages[idx].text = "";
      state.messages[idx].fileUrl = null;
      renderMessages();
    }
  });

  socket.on("message:reaction", ({ messageId, reactions }) => {
    const m = state.messages.find((x) => x._id === messageId);
    if (m) {
      m.reactions = reactions;
      renderMessages();
    }
  });

  socket.on("message:read", ({ conversationId, messageId, userId }) => {
    if (conversationId !== state.activeId) return;
    const m = state.messages.find((x) => x._id === messageId);
    if (m && !m.readBy.map(String).includes(String(userId))) {
      m.readBy.push(userId);
      renderMessages();
    }
  });

  socket.on("typing:start", ({ conversationId, userId, username }) => {
    if (!state.typingUsers[conversationId]) state.typingUsers[conversationId] = {};
    state.typingUsers[conversationId][userId] = username;
    if (state.typingTimeouts[userId]) clearTimeout(state.typingTimeouts[userId]);
    state.typingTimeouts[userId] = setTimeout(() => {
      if (state.typingUsers[conversationId]) delete state.typingUsers[conversationId][userId];
      renderTyping();
    }, 3000);
    renderTyping();
  });

  socket.on("typing:stop", ({ conversationId, userId }) => {
    if (state.typingUsers[conversationId]) delete state.typingUsers[conversationId][userId];
    renderTyping();
  });

  function renderTyping() {
    if (!state.activeId) return;
    const users = state.typingUsers[state.activeId];
    if (!users || !Object.keys(users).length) {
      el.typing.textContent = "";
      return;
    }
    const names = Object.values(users);
    if (names.length === 1) el.typing.textContent = `${names[0]} is typing…`;
    else if (names.length === 2) el.typing.textContent = `${names[0]} and ${names[1]} are typing…`;
    else el.typing.textContent = `${names.length} people are typing…`;
  }

  socket.on("presence", ({ userId, status }) => {
    let touched = false;
    state.conversations.forEach((c) => {
      c.members.forEach((m) => {
        if (String(m.id) === String(userId)) {
          m.status = status;
          touched = true;
        }
      });
    });
    if (touched) {
      renderConvList();
      // Update chat subtitle if DM
      const active = state.conversations.find((c) => c.id === state.activeId);
      if (active && active.type === "dm") {
        el.chatSub.textContent = subForDM(active);
      }
    }
  });

  // ---- New DM ----
  el.newDmBtn.addEventListener("click", () => openModal(el.newDmModal, () => el.dmSearch.focus()));
  el.dmSearch.addEventListener("input", debounce(async () => {
    const q = el.dmSearch.value.trim();
    if (!q) { el.dmResults.innerHTML = ""; return; }
    try {
      const { users } = await API.searchUsers(q);
      el.dmResults.innerHTML = users
        .map((u) => `
          <div class="user-result" data-id="${u.id}">
            ${avatarHTML(u, "md").replace("avatar sm", "avatar")}
            <div>
              <div class="name">${esc(u.displayName)}</div>
              <div class="u">@${esc(u.username)}</div>
            </div>
          </div>
        `).join("");
      el.dmResults.querySelectorAll(".user-result").forEach((r) => {
        r.addEventListener("click", async () => {
          try {
            const { conversation } = await API.createDM(r.dataset.id);
            closeModal(el.newDmModal);
            if (!state.conversations.find((c) => c.id === conversation.id)) {
              state.conversations.unshift(conversation);
            }
            renderConvList();
            openConversation(conversation.id);
          } catch (e) {
            toast(e.message, "error");
          }
        });
      });
    } catch (e) { console.error(e); }
  }, 300));

  // ---- New Group ----
  const groupSelectedUsers = new Map(); // id -> user
  el.newGroupBtn.addEventListener("click", () => {
    groupSelectedUsers.clear();
    el.groupName.value = "";
    el.groupSearch.value = "";
    el.groupResults.innerHTML = "";
    renderGroupChips();
    openModal(el.newGroupModal, () => el.groupName.focus());
  });
  function renderGroupChips() {
    el.groupSelected.innerHTML = Array.from(groupSelectedUsers.values())
      .map((u) => `<span class="chip">${esc(u.displayName)} <span class="x" data-id="${u.id}">✖</span></span>`)
      .join("");
    el.groupSelected.querySelectorAll(".x").forEach((x) => {
      x.addEventListener("click", () => {
        groupSelectedUsers.delete(x.dataset.id);
        renderGroupChips();
      });
    });
  }
  el.groupSearch.addEventListener("input", debounce(async () => {
    const q = el.groupSearch.value.trim();
    if (!q) { el.groupResults.innerHTML = ""; return; }
    const { users } = await API.searchUsers(q);
    el.groupResults.innerHTML = users
      .map((u) => `
        <div class="user-result ${groupSelectedUsers.has(u.id) ? "selected" : ""}" data-id="${u.id}">
          ${avatarHTML(u, "md").replace("avatar sm", "avatar")}
          <div>
            <div class="name">${esc(u.displayName)}</div>
            <div class="u">@${esc(u.username)}</div>
          </div>
        </div>`).join("");
    el.groupResults.querySelectorAll(".user-result").forEach((r) => {
      r.addEventListener("click", () => {
        const u = users.find((x) => x.id === r.dataset.id);
        if (!u) return;
        if (groupSelectedUsers.has(u.id)) groupSelectedUsers.delete(u.id);
        else groupSelectedUsers.set(u.id, u);
        renderGroupChips();
        r.classList.toggle("selected");
      });
    });
  }, 300));
  el.createGroupBtn.addEventListener("click", async () => {
    const name = el.groupName.value.trim();
    if (!name) return toast("Group name required", "error");
    if (!groupSelectedUsers.size) return toast("Add at least one member", "error");
    try {
      const { conversation } = await API.createGroup(
        name,
        Array.from(groupSelectedUsers.keys())
      );
      closeModal(el.newGroupModal);
      state.conversations.unshift(conversation);
      renderConvList();
      openConversation(conversation.id);
    } catch (e) {
      toast(e.message, "error");
    }
  });

  // Modal helpers
  function openModal(m, cb) { m.classList.remove("hidden"); if (cb) setTimeout(cb, 40); }
  function closeModal(m) { m.classList.add("hidden"); }
  document.querySelectorAll("[data-close]").forEach((b) => {
    b.addEventListener("click", () => b.closest(".modal").classList.add("hidden"));
  });
  document.querySelectorAll(".modal").forEach((m) => {
    m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); });
  });

  // ---- Details panel ----
  el.infoBtn.addEventListener("click", () => {
    const conv = state.conversations.find((c) => c.id === state.activeId);
    if (!conv) return;
    renderDetails(conv);
    el.details.classList.remove("hidden");
    el.chat.classList.add("with-details");
  });
  el.closeDetailsBtn.addEventListener("click", () => {
    el.details.classList.add("hidden");
    el.chat.classList.remove("with-details");
  });
  function renderDetails(conv) {
    const isGroup = conv.type === "group";
    const other = !isGroup ? conv.members.find((m) => m.id !== state.me.id) : null;
    el.detailsBody.innerHTML = `
      <div class="detail-avatar-block">
        ${convAvatarHTML(conv, "lg").replace("avatar sm", "avatar lg")}
        <h3 style="margin:12px 0 4px">${esc(conv.name)}</h3>
        <div style="color:var(--muted);font-size:13px">${isGroup ? `${conv.members.length} members` : "@" + esc(other?.username || "")}</div>
      </div>
      ${!isGroup && other?.bio ? `<div class="detail-section"><h4>About</h4><div>${esc(other.bio)}</div></div>` : ""}
      ${isGroup ? `
        <div class="detail-section">
          <h4>Members</h4>
          ${conv.members.map((m) => `
            <div class="member-item">
              ${avatarHTML(m, "md").replace("avatar sm", "avatar")}
              <div>
                <div class="name">${esc(m.displayName)}</div>
                <div style="color:var(--muted);font-size:12px">@${esc(m.username)}</div>
              </div>
              ${m.status === "online" ? '<span class="badge">online</span>' : ""}
            </div>
          `).join("")}
        </div>
      ` : ""}
    `;
  }

  // ---- Logout ----
  el.logoutBtn.addEventListener("click", () => {
    if (!confirm("Log out?")) return;
    API.clearSession();
    window.location.href = "/login";
  });

  // ---- Sidebar toggle (mobile) ----
  el.menuToggle.addEventListener("click", () => el.sidebar.classList.toggle("open"));
  el.convFilter.addEventListener("input", renderConvList);

  // ---- Utility ----
  function debounce(fn, ms) {
    let t;
    return function (...a) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, a), ms);
    };
  }

  // Expose bits to the call module
  window.ChatApp = {
    getSocket: () => socket,
    getActiveConversationId: () => state.activeId,
    getActiveConversation: () => state.conversations.find((c) => c.id === state.activeId),
    getMe: () => state.me,
    toast,
    esc,
    initials,
  };

  boot();
})();
