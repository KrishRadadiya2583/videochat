const socket = io();

const params = new URLSearchParams(window.location.search);
const username = params.get("username");
const room = params.get("room");

document.getElementById("roomName").innerText = "Room: " + room;

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
  const msgClass = isSelf ? "message self" : "message";

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
  messages.innerHTML += `<p class="notify">${msg}</p>`;
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
    usersList.innerHTML += `<li>${u.username}</li>`;
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

const incomingCallModal = document.getElementById("incomingCallModal");
const callerNameSpan = document.getElementById("callerName");
const acceptCallBtn = document.getElementById("acceptCallBtn");
const rejectCallBtn = document.getElementById("rejectCallBtn");

let localStream;
let peers = {}; // socketId -> RTCPeerConnection
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

let isAudioOnly = false;
let incomingCallData = null; // Store caller info

// --- BUTTONS ---
audioCallBtn.addEventListener("click", () => startCall(true));
videoCallBtn.addEventListener("click", () => startCall(false));

leaveCallBtn.addEventListener("click", endCall);
toggleMicBtn.addEventListener("click", toggleMic);
toggleVideoBtn.addEventListener("click", toggleVideo);

acceptCallBtn.addEventListener("click", () => {
  incomingCallModal.classList.add("hidden");
  // When accepting, we join the call. 
  // Usually we default to Video for now unless we know it's audio only?
  // Let's assume video for simplicity or we could pass that info.
  startCall(false);
});

rejectCallBtn.addEventListener("click", () => {
  incomingCallModal.classList.add("hidden");
  incomingCallData = null;
});


// --- FUNCTIONS ---

async function startCall(audioOnly) {
  isAudioOnly = audioOnly;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: !audioOnly
    });

    // Show UI
    callContainer.classList.remove("hidden");

    // Add Local Video
    addVideoStream(localStream, "You", true);

    // Signal Join
    socket.emit("join-call");

    // Initial button states
    updateControlStates();

  } catch (err) {
    console.error("Error accessing media devices:", err);
    alert("Could not access camera/microphone. Please check permissions.");
  }
}

function updateControlStates() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    const videoTrack = localStream.getVideoTracks()[0];

    if (audioTrack) {
      toggleMicBtn.classList.toggle("active", !audioTrack.enabled);
    }
    if (videoTrack) {
      toggleVideoBtn.classList.toggle("active", !videoTrack.enabled);
    }
  }
}

function toggleMic() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      toggleMicBtn.classList.toggle("active", !audioTrack.enabled);
    }
  }
}

function toggleVideo() {
  if (localStream) {
    if (isAudioOnly) {
      alert("Video disabled in Audio Call mode.");
      return;
    }
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      toggleVideoBtn.classList.toggle("active", !videoTrack.enabled);
    }
  }
}

function endCall() {
  callContainer.classList.add("hidden");

  // Stop tracks
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  // Close peers
  Object.values(peers).forEach(pc => pc.close());
  peers = {};

  // Clear Grid
  videoGrid.innerHTML = "";

  socket.emit("leave-call");
}

function addVideoStream(stream, label, isLocal) {
  const videoCard = document.createElement("div");
  videoCard.className = "video-card";

  const video = document.createElement("video");
  video.srcObject = stream;
  video.autoplay = true;
  if (isLocal) video.muted = true; // Mute self

  const labelDiv = document.createElement("div");
  labelDiv.className = "user-label";
  labelDiv.innerText = label || "User";

  videoCard.appendChild(video);
  videoCard.appendChild(labelDiv);
  videoGrid.appendChild(videoCard);

  return videoCard;
}


// --- SIGNALING EVENTS ---

socket.on("ongoing-call", ({ participants }) => {
  console.log(`Ongoing call with ${participants} users.`);
  // Could subtly animate call buttons to indicate active call
});

socket.on("incoming-call", ({ caller }) => {
  // Only show if NOT already in a call
  if (callContainer.classList.contains("hidden")) {
    callerNameSpan.innerText = `${caller} is calling...`;
    incomingCallModal.classList.remove("hidden");
    incomingCallData = { caller };
  }
});

socket.on("all-users-in-call", (usersInCall) => {
  // Joined call -> Initiate connections to existing
  console.log("Existing users in call:", usersInCall);
  usersInCall.forEach(socketId => {
    createPeerConnection(socketId, true); // initiator = true
  });
});

socket.on("user-connected-to-call", (socketId) => {
  // Existing user -> New user joined -> Wait for offer (initiator = false)
  console.log("User connected to call:", socketId);
  createPeerConnection(socketId, false);
});

socket.on("user-left-call", (socketId) => {
  if (peers[socketId]) {
    peers[socketId].close();
    delete peers[socketId];
  }
  const videoElement = document.getElementById(`video-${socketId}`);
  if (videoElement) {
    videoElement.parentElement.remove(); // Remove the card
  }
});

socket.on("call-ended", () => {
  // Optional
});


// --- WEBRTC CORE ---

function createPeerConnection(socketId, isInitiator) {
  if (peers[socketId]) return peers[socketId];

  const pc = new RTCPeerConnection(rtcConfig);
  peers[socketId] = pc;

  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", {
        target: socketId,
        candidate: event.candidate
      });
    }
  };

  pc.ontrack = (event) => {
    console.log("Received remote track from", socketId);
    let videoCardId = `video-${socketId}`;
    let videoCard = document.getElementById(videoCardId);
    if (!videoCard) {
      // Fetch username via users list logic or temp tag?
      // For now just "User"
      videoCard = addVideoStream(event.streams[0], "User", false);
      videoCard.querySelector("video").id = videoCardId; // Mark video or card?
      videoCard.id = videoCardId;
    }
  };

  if (isInitiator) {
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        socket.emit("offer", {
          target: socketId,
          sdp: pc.localDescription
        });
      })
      .catch(err => console.error("Error creating offer:", err));
  }

  return pc;
}

socket.on("offer", async ({ sender, sdp }) => {
  // 'sender' is the ID of who sent the offer.
  const pc = createPeerConnection(sender, false);
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit("answer", {
    target: sender,
    sdp: pc.localDescription
  });
});

socket.on("answer", async ({ sender, sdp }) => {
  const pc = peers[sender];
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }
});

socket.on("ice-candidate", async ({ sender, candidate }) => {
  const pc = peers[sender];
  if (pc) {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }
});
