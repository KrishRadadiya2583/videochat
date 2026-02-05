const socket = io();

const params = new URLSearchParams(window.location.search);
const username = params.get("username");
const room = params.get("room");

const roomDisplay = room ? room.charAt(0).toUpperCase() + room.slice(1) : "General";
document.getElementById("roomName").innerText = roomDisplay;

socket.emit("joinRoom", { username, room });

const msgForm = document.getElementById("msgForm");
const msg = document.getElementById("msg");
const messages = document.getElementById("messages");
const typing = document.getElementById("typing");
const usersList = document.getElementById("users");

function addMessage(data) {
  if (!data.message || data.message.trim().length === 0) {
    return;
  }

  const isSelf = data.username === username;
  const msgClass = isSelf ? "message self" : "message other";

  const time = data.timestamp
    ? new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  typing.innerText = "";

  messages.innerHTML += `
    <div class="${msgClass}">
      <div class="message-header">
        <span class="username">${data.username}</span>
        <span class="time">${time}</span>
      </div>
      <div class="message-text">${data.message}</div>
    </div>
  `;

  messages.scrollTop = messages.scrollHeight;
}

msgForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (msg.value.trim()) {
    socket.emit("chatMessage", msg.value);
    msg.value = "";
  }
});

msg.addEventListener("input", () => {
  socket.emit("typing");
});

socket.on("loadMessages", function (msgs) {
  messages.innerHTML = ""; // Clear existing messages before loading to avoid duplicates if reconnected
  for (let i = 0; i < msgs.length; i++) {
    addMessage(msgs[i]);
  }
  messages.scrollTop = messages.scrollHeight;
});

socket.on("message", (data) => {
  addMessage(data);
});

socket.on("notification", (msg) => {
  messages.innerHTML += `<div class="system-notification">${msg}</div>`;
  messages.scrollTop = messages.scrollHeight;
});

socket.on("typing", (msg) => {
  typing.innerText = msg;
  setTimeout(() => {
    typing.innerText = "";
  }, 2000);
});

socket.on("userList", (users) => {
  usersList.innerHTML = "";
  users.forEach((u) => {
    const li = document.createElement("li");
    li.textContent = u.username;
    usersList.appendChild(li);
  });
});

// =========================
// WEBRTC & CALLING LOGIC
// =========================

const audioCallBtn = document.getElementById("audioCallBtn");
const videoCallBtn = document.getElementById("videoCallBtn");
const callContainer = document.getElementById("callContainer");
const videoGrid = document.getElementById("videoGrid");
const toggleMicBtn = document.getElementById("toggleMicBtn");
const toggleVideoBtn = document.getElementById("toggleVideoBtn");
const leaveCallBtn = document.getElementById("leaveCallBtn");
const leaveChatBtn = document.getElementById("leaveChatBtn");

const incomingCallModal = document.getElementById("incomingCallModal");
const callerNameSpan = document.getElementById("callerName");
const acceptCallBtn = document.getElementById("acceptCallBtn");
const rejectCallBtn = document.getElementById("rejectCallBtn");

let localStream;
let peers = {}; // socketId -> RTCPeerConnection
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const menuToggle = document.getElementById("menuToggle");
const sidebar = document.querySelector(".sidebar");

menuToggle?.addEventListener("click", () => {
  sidebar.classList.toggle("active");
});

// Close sidebar when clicking outside on mobile
document.addEventListener("click", (e) => {
  if (window.innerWidth <= 768 &&
    !sidebar.contains(e.target) &&
    !menuToggle.contains(e.target) &&
    sidebar.classList.contains("active")) {
    sidebar.classList.remove("active");
  }
});

// --- BUTTONS ---
audioCallBtn?.addEventListener("click", () => startCall({ audio: true, video: false }));
videoCallBtn?.addEventListener("click", () => startCall({ audio: true, video: true }));
leaveCallBtn?.addEventListener("click", endCall);
leaveChatBtn?.addEventListener("click", () => {
  window.location.href = "index.html";
});
toggleMicBtn?.addEventListener("click", () => toggleMedia("audio"));
toggleVideoBtn?.addEventListener("click", () => toggleMedia("video"));

acceptCallBtn?.addEventListener("click", () => {
  incomingCallModal.classList.add("hidden");
  startCall({ audio: true, video: true });
});

rejectCallBtn?.addEventListener("click", () => {
  incomingCallModal.classList.add("hidden");
});

// --- CORE FUNCTIONS ---

async function startCall(constraints) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    callContainer.classList.remove("hidden");
    addVideoStream(localStream, "You", true);
    socket.emit("join-call");
    updateControlStates();
  } catch (err) {
    console.error("Media Error:", err);
    alert("Failed to access camera/mic.");
  }
}

function toggleMedia(type) {
  if (!localStream) return;
  const track = type === "audio" ? localStream.getAudioTracks()[0] : localStream.getVideoTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    const btn = type === "audio" ? toggleMicBtn : toggleVideoBtn;
    btn.classList.toggle("active", !track.enabled);
  }
}

function updateControlStates() {
  if (!localStream) return;
  toggleMicBtn.classList.toggle("active", !localStream.getAudioTracks()[0]?.enabled);
  toggleVideoBtn.classList.toggle("active", !localStream.getVideoTracks()[0]?.enabled);
}

function endCall() {
  callContainer.classList.add("hidden");
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  Object.keys(peers).forEach(id => {
    peers[id].close();
    document.getElementById(`video-${id}`)?.parentElement.remove();
  });
  peers = {};
  socket.emit("leave-call");
}

function addVideoStream(stream, label, isLocal, socketId = null) {
  const videoId = isLocal ? "local" : `video-${socketId}`;
  if (document.getElementById(videoId)) return;

  const card = document.createElement("div");
  card.className = `video-card ${isLocal ? "local" : "remote"}`;

  card.innerHTML = `
        <video autoplay ${isLocal ? "muted" : ""} id="${videoId}"></video>
        <div class="user-label">${label}</div>
    `;

  const video = card.querySelector("video");
  video.srcObject = stream;
  videoGrid.appendChild(card);
  return card;
}

// --- SIGNALING ---

socket.on("ongoing-call", ({ participants }) => {
  const msg = `<div class="system-notification">Ongoing call in this room (${participants} participants). <button onclick="startCall({audio:true, video:true})" class="inline-link">Join Call</button></div>`;
  messages.innerHTML += msg;
  messages.scrollTop = messages.scrollHeight;
});

socket.on("call-ended", () => {
  messages.innerHTML += `<div class="system-notification">The call has ended.</div>`;
  messages.scrollTop = messages.scrollHeight;
});

socket.on("incoming-call", ({ caller }) => {
  if (callContainer.classList.contains("hidden")) {
    callerNameSpan.innerText = `${caller} is calling...`;
    incomingCallModal.classList.remove("hidden");
  }
});

socket.on("all-users-in-call", (users) => {
  users.forEach(id => createPeerConnection(id, true));
});

socket.on("user-connected-to-call", (id) => {
  createPeerConnection(id, false);
});

socket.on("user-left-call", (id) => {
  if (peers[id]) {
    peers[id].close();
    delete peers[id];
  }
  document.getElementById(`video-${id}`)?.parentElement.remove();
});

function createPeerConnection(socketId, isInitiator) {
  if (peers[socketId]) return peers[socketId];

  const pc = new RTCPeerConnection(rtcConfig);
  peers[socketId] = pc;

  localStream?.getTracks().forEach(t => pc.addTrack(t, localStream));

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit("ice-candidate", { target: socketId, candidate });
  };

  pc.ontrack = ({ streams }) => {
    addVideoStream(streams[0], "User", false, socketId);
  };

  if (isInitiator) {
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => socket.emit("offer", { target: socketId, sdp: pc.localDescription }))
      .catch(console.error);
  }

  return pc;
}

socket.on("offer", async ({ sender, sdp }) => {
  const pc = createPeerConnection(sender, false);
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("answer", { target: sender, sdp: pc.localDescription });
});

socket.on("answer", async ({ sender, sdp }) => {
  await peers[sender]?.setRemoteDescription(new RTCSessionDescription(sdp));
});

socket.on("ice-candidate", async ({ sender, candidate }) => {
  await peers[sender]?.addIceCandidate(new RTCIceCandidate(candidate));
});
