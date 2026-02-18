const socket = io(); // socket connection

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

const chatViewport = document.querySelector(".chat-viewport");


function scrollToBottom() {
  chatViewport.scrollTop = chatViewport.scrollHeight;
}


// message add function

function addMessage(data) {

  const msgText = data.message || "";
  const fileUrl = data.fileUrl;

  if ((!msgText || !msgText.trim().length) && !fileUrl) {
    return;
  }

  const isSelf = data.username === username;
  const msgClass = isSelf ? "message self" : "message other";


  const time = data.timestamp
    ? new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  typing.innerText = "";

  let contentHtml = "";
  if (fileUrl) {
    if (data.fileType && data.fileType.startsWith("image/")) {
      contentHtml += `<img src="${fileUrl}" class="chat-image" alt="User Image" style="max-width: 200px; border-radius: 8px; margin-bottom: 5px;">`;
    } else {
      contentHtml += `<a href="${fileUrl}" target="_blank" class="file-link" style="color: inherit; text-decoration: underline;">📁 ${data.fileUrl}</a>`;
    }
  }
  if (msgText) {
    contentHtml += `<div class="message-text">${msgText}</div>`;
  }

  messages.innerHTML += `
<div class="${msgClass}">
  <div class="message-header">
    <span class="username">${data.username}</span>
    <span class="time">${time}</span>
  </div>

  ${contentHtml}

  <div class="reaction-container mt-2">
    <button class="btn btn-sm reaction-btn">
    <i class="fa-solid fa-face-smile"></i>
    </button>

    <div class="reaction-box">
     <span class="reaction">👍</span>
    <span class="reaction">❤️</span>
    <span class="reaction">😂</span>
    <span class="reaction">😮</span>
    <span class="reaction">😢</span>
    <span class="reaction">😡</span>
    </div>
  </div>

</div>
`;


  scrollToBottom();
}


document.addEventListener("click", function (e) {

  if (e.target.classList.contains("reaction-btn")) {
    const container = e.target.closest(".reaction-container");
    const box = container.querySelector(".reaction-box");


    document.querySelectorAll(".reaction-box").forEach(b => {
      if (b !== box) b.style.display = "none";
    });

    box.style.display = box.style.display === "block" ? "none" : "block";
  }

  if (e.target.classList.contains("reaction")) {
    const reaction = e.target.textContent;
    const container = e.target.closest(".reaction-container");
    const button = container.querySelector(".reaction-btn");
    const box = container.querySelector(".reaction-box");

    button.innerHTML = reaction;
    box.style.display = "none";
  }

  if (!e.target.closest(".reaction-container")) {
    document.querySelectorAll(".reaction-box").forEach(b => {
      b.style.display = "none";
    });
  }
});



// preview
const fileInput = document.getElementById("file");
const previewContainer = document.getElementById("previewContainer");

fileInput.addEventListener("change", function () {
  const file = this.files[0];

  previewContainer.innerHTML = "";

  if (!file) return;

  // file show card 
  const previewCard = document.createElement("div");
  previewCard.style.display = "flex";
  previewCard.style.alignItems = "center";
  previewCard.style.gap = "8px";


  if (file.type.startsWith("image/")) {
    const img = document.createElement("img");
    img.className = "preview-image";


    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.readAsDataURL(file);

    previewCard.appendChild(img);
  } else {

    const icon = document.createElement("span");
    icon.className = "preview-file-icon";
    icon.innerHTML = "📄";
    previewCard.appendChild(icon);
  }

  const fileName = document.createElement("span");
  fileName.className = "preview-text";
  fileName.textContent = file.name;
  previewCard.appendChild(fileName);


  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-preview";
  removeBtn.innerHTML = "✖";
  removeBtn.title = "Remove file";
  removeBtn.onclick = (e) => {
    e.preventDefault();
    clearFileSelection();
  };
  previewCard.appendChild(removeBtn);

  previewContainer.appendChild(previewCard);


  msg.focus();
  scrollToBottom();
});

function clearFileSelection() {
  fileInput.value = "";
  previewContainer.innerHTML = "";
}




msgForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const file = fileInput.files[0];
  const messageText = msg.value.trim();

  if (!messageText && !file) return;

  let fileUrl = null;
  let fileType = null;

  if (file) {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/upload", {
        method: "POST",
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        fileUrl = result.filePath;
        fileType = result.fileType;
      } else {
        console.error("File upload failed");
        alert("Failed to upload file. Please try again.");
        return;
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Error uploading file.");
      return;
    }
  }

  const payload = {
    message: messageText,
    fileUrl: fileUrl,
    fileType: fileType
  };

  socket.emit("chatMessage", payload);

  msg.value = "";
  clearFileSelection();

  msg.focus();
});

msg.addEventListener("input", () => {
  socket.emit("typing");
});

socket.on("loadMessages", function (msgs) {
  messages.innerHTML = "";
  for (let i = 0; i < msgs.length; i++) {
    addMessage(msgs[i]);
  }
  scrollToBottom();
});

socket.on("message", (data) => {
  addMessage(data);
  scrollToBottom();
});

socket.on("notification", (msg) => {
  messages.innerHTML += `<div class="system-notification">${msg}</div>`;
  scrollToBottom();
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
const screenShareBtn = document.getElementById("screenShareBtn");


let localStream;
let peers = {}; // socketId -> RTCPeerConnection
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const menuToggle = document.getElementById("menuToggle");
const sidebar = document.querySelector(".sidebar");

menuToggle?.addEventListener("click", () => {
  sidebar.classList.toggle("active");
});


document.addEventListener("click", (e) => {

  // responsive sidebar
  if (window.innerWidth <= 768 &&
    !sidebar.contains(e.target) &&
    !menuToggle.contains(e.target) &&
    sidebar.classList.contains("active")) {
    sidebar.classList.remove("active");
  }
});



if (audioCallBtn) {
  audioCallBtn.addEventListener("click", function () {

    startCall({ audio: true, video: false });
  });
}


if (videoCallBtn) {
  videoCallBtn.addEventListener("click", function () {

    startCall({ audio: true, video: true });
  });
}


if (leaveCallBtn) {
  leaveCallBtn.addEventListener("click", function () {

    endCall();
  });
}


if (screenShareBtn) {
  screenShareBtn.addEventListener("click", toggleScreenShare);
}

if (leaveChatBtn) {
  leaveChatBtn.addEventListener("click", function () {

    window.location.href = "index.html";
  });
}


if (toggleMicBtn) {
  toggleMicBtn.addEventListener("click", function () {

    toggleMedia("audio");
  });
}


if (toggleVideoBtn) {
  toggleVideoBtn.addEventListener("click", function () {

    toggleMedia("video");
  });
}


if (acceptCallBtn) {
  acceptCallBtn.addEventListener("click", function () {

    incomingCallModal.classList.add("hidden");

    startCall({ audio: true, video: true });
  });
}

if (rejectCallBtn) {
  rejectCallBtn.addEventListener("click", function () {

    incomingCallModal.classList.add("hidden");
  });
}



async function startCall(constraints) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    callContainer.classList.remove("hidden");
    addVideoStream(localStream, username || "You", true);
    socket.emit("join-call");
    updateControlStates();
  } catch (err) {
    console.error("Media Error:", err);
    alert("Failed to access camera/mic.");
  }
}

let isScreenSharing = false;
let screenStream;
let currentScreenSharer = null;
let sharingScreenInProgress = false;

async function toggleScreenShare() {
  if (!localStream) {
    alert("You must be in a call to share your screen.");
    return;
  }
  if (sharingScreenInProgress) return;
  sharingScreenInProgress = true;

  if (!isScreenSharing) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      screenTrack.onended = () => {
        if (isScreenSharing) toggleScreenShare();
      };

      if (localStream.getVideoTracks()[0]) {
        localStream.removeTrack(localStream.getVideoTracks()[0]);
      }
      localStream.addTrack(screenTrack);

      const localVideo = document.getElementById("local");
      if (localVideo) {
        localVideo.srcObject = localStream;
      }

      for (let id in peers) {
        const sender = peers[id].getSenders().find(s => s.track.kind === "video");
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
      }

      screenShareBtn.classList.add("active");
      isScreenSharing = true;
      socket.emit("screen-share-started");
      updateScreenShareUI(socket.id, true);

    } catch (err) {
      console.error("Error sharing screen:", err);
    } finally {
      sharingScreenInProgress = false;
    }
  } else {

    try {
      const screenTrack = localStream.getVideoTracks()[0];
      if (screenTrack) screenTrack.stop();

      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const cameraTrack = cameraStream.getVideoTracks()[0];

      if (localStream.getVideoTracks()[0]) {
        localStream.removeTrack(localStream.getVideoTracks()[0]);
      }
      localStream.addTrack(cameraTrack);

      const localVideo = document.getElementById("local");
      if (localVideo) {
        localVideo.srcObject = localStream;
      }

      for (let id in peers) {
        const sender = peers[id].getSenders().find(s => s.track.kind === "video");
        if (sender) {
          sender.replaceTrack(cameraTrack);
        }
      }

      screenShareBtn.classList.remove("active");
      isScreenSharing = false;
      screenStream = null;
      socket.emit("screen-share-stopped");
      updateScreenShareUI(null, false);

    } catch (err) {
      console.error("Error reverting to camera:", err);
      alert("Failed to revert to camera.");
    } finally {
      sharingScreenInProgress = false;
    }
  }
}

function updateScreenShareUI(sharingSocketId, isStarting) {

  const allCards = document.querySelectorAll(".video-card");
  allCards.forEach(card => card.classList.remove("sharing-card"));

  if (isStarting && sharingSocketId) {
    currentScreenSharer = sharingSocketId;
    const videoId = (sharingSocketId === socket.id) ? "local" : `video-${sharingSocketId}`;
    const videoElem = document.getElementById(videoId);

    if (videoElem && videoElem.parentElement) {

      videoElem.parentElement.classList.add("sharing-card");
      videoGrid.classList.add("screen-sharing-active");
    } else {

      videoGrid.classList.remove("screen-sharing-active");
    }
  } else {

    currentScreenSharer = null;
    videoGrid.classList.remove("screen-sharing-active");
  }
}

function toggleMedia(type) {

  if (!localStream) {
    return;
  }

  let track;


  if (type === "audio") {
    track = localStream.getAudioTracks()[0];
  } else {
    track = localStream.getVideoTracks()[0];
  }

  if (track) {
    if (track.enabled) {
      track.enabled = false;
    } else {
      track.enabled = true;
    }


    if (type === "audio") {
      toggleMicBtn.classList.toggle("active", !track.enabled);
    } else {
      toggleVideoBtn.classList.toggle("active", !track.enabled);
    }
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

  if (currentScreenSharer && (socketId === currentScreenSharer || (isLocal && currentScreenSharer === socket.id))) {
    updateScreenShareUI(currentScreenSharer, true);
  }

  return card;
}



socket.on("ongoing-call", ({ participants }) => {
  const msg = `<div class="system-notification">Ongoing call in this room (${participants} participants). <button onclick="startCall({audio:true, video:true})" class="inline-link">Join Call</button></div>`;
  messages.innerHTML += msg;
  scrollToBottom();
});

socket.on("call-ended", () => {
  messages.innerHTML += `<div class="system-notification">The call has ended.</div>`;
  scrollToBottom();
});

socket.on("incoming-call", ({ caller }) => {
  if (callContainer.classList.contains("hidden")) {
    callerNameSpan.innerText = `${caller} is calling...`;
    incomingCallModal.classList.remove("hidden");
  }
});

socket.on("all-users-in-call", (users) => {
  users.forEach(u => createPeerConnection(u.socketId, true, u.username));
});

socket.on("user-connected-to-call", ({ socketId, username }) => {
  createPeerConnection(socketId, false, username);
});

socket.on("user-left-call", (id) => {
  if (peers[id]) {
    peers[id].close();
    delete peers[id];
  }
  document.getElementById(`video-${id}`)?.parentElement.remove();
});

function createPeerConnection(socketId, isInitiator, userName = "User") {
  if (peers[socketId]) return peers[socketId];

  const pc = new RTCPeerConnection(rtcConfig);
  peers[socketId] = pc;

  localStream?.getTracks().forEach(t => pc.addTrack(t, localStream));

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit("ice-candidate", { target: socketId, candidate });
  };

  pc.ontrack = ({ streams }) => {
    addVideoStream(streams[0], userName, false, socketId);
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

socket.on("screen-share-started", (id) => {
  updateScreenShareUI(id, true);
});

socket.on("screen-share-stopped", () => {
  updateScreenShareUI(null, false);
});
