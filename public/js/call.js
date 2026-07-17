(function () {
  const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  const state = {
    conversationId: null,
    localStream: null,
    peers: new Map(), // socketId -> { pc, name }
    isScreenSharing: false,
    savedCameraTrack: null,
  };

  const el = {
    callSurface: document.getElementById("callSurface"),
    videoGrid: document.getElementById("videoGrid"),
    callTitle: document.getElementById("callTitle"),
    callParticipants: document.getElementById("callParticipants"),
    toggleMicBtn: document.getElementById("toggleMicBtn"),
    toggleVideoBtn: document.getElementById("toggleVideoBtn"),
    screenShareBtn: document.getElementById("screenShareBtn"),
    hangUpBtn: document.getElementById("hangUpBtn"),
    audioCallBtn: document.getElementById("audioCallBtn"),
    videoCallBtn: document.getElementById("videoCallBtn"),
    incomingCallModal: document.getElementById("incomingCallModal"),
    callerLabel: document.getElementById("callerLabel"),
    acceptCallBtn: document.getElementById("acceptCallBtn"),
    rejectCallBtn: document.getElementById("rejectCallBtn"),
  };

  function socket() {
    return window.ChatApp.getSocket();
  }

  el.audioCallBtn.addEventListener("click", () => startCall({ audio: true, video: false }));
  el.videoCallBtn.addEventListener("click", () => startCall({ audio: true, video: true }));
  el.hangUpBtn.addEventListener("click", endCall);
  el.toggleMicBtn.addEventListener("click", () => toggleTrack("audio"));
  el.toggleVideoBtn.addEventListener("click", () => toggleTrack("video"));
  el.screenShareBtn.addEventListener("click", toggleScreenShare);

  let pendingCall = null;
  el.acceptCallBtn.addEventListener("click", () => {
    el.incomingCallModal.classList.add("hidden");
    if (pendingCall) {
      state.conversationId = pendingCall.conversationId;
      const wantVideo = pendingCall.callType !== "audio";
      startCall({ audio: true, video: wantVideo }, true);
      pendingCall = null;
    }
  });
  el.rejectCallBtn.addEventListener("click", () => {
    el.incomingCallModal.classList.add("hidden");
    pendingCall = null;
  });

  async function startCall(constraints, isAcceptingIncoming) {
    const convId = state.conversationId || window.ChatApp.getActiveConversationId();
    if (!convId) {
      window.ChatApp.toast("Open a conversation first", "error");
      return;
    }
    state.conversationId = convId;
    const conv = window.ChatApp.getActiveConversation();
    el.callTitle.textContent = conv ? conv.name : "Call";

    try {
      state.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      window.ChatApp.toast("Failed to access mic/camera", "error");
      return;
    }
    el.callSurface.classList.remove("hidden");
    addTile("local", state.localStream, "You", true);

    const callType = constraints && constraints.video ? "video" : "audio";
    socket().emit("call:join", { conversationId: convId, callType }, (res) => {
      if (res && res.error) {
        window.ChatApp.toast(res.error, "error");
        endCall();
        return;
      }
      // For each existing peer, we (as new joiner) create an offer.
      (res.peers || []).forEach((p) => createPeer(p.socketId, true, p.username));
      updateParticipantsCount();
    });
    updateControlUI();
  }

  function endCall() {
    if (state.conversationId) {
      socket().emit("call:leave", { conversationId: state.conversationId });
    }
    if (state.localStream) {
      state.localStream.getTracks().forEach((t) => t.stop());
      state.localStream = null;
    }
    state.peers.forEach(({ pc }) => pc.close());
    state.peers.clear();
    state.isScreenSharing = false;
    state.savedCameraTrack = null;
    el.videoGrid.innerHTML = "";
    el.callSurface.classList.add("hidden");
    el.screenShareBtn.classList.remove("active");
    state.conversationId = null;
  }

  function createPeer(peerSocketId, isInitiator, name) {
    if (state.peers.has(peerSocketId)) return state.peers.get(peerSocketId).pc;
    const pc = new RTCPeerConnection(rtcConfig);
    state.peers.set(peerSocketId, { pc, name });

    if (state.localStream) {
      state.localStream.getTracks().forEach((t) => pc.addTrack(t, state.localStream));
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket().emit("call:signal", {
          target: peerSocketId,
          candidate,
          kind: "candidate",
        });
      }
    };

    pc.ontrack = ({ streams }) => {
      addTile(peerSocketId, streams[0], name || "User", false);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        removePeer(peerSocketId);
      }
    };

    if (isInitiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() =>
          socket().emit("call:signal", {
            target: peerSocketId,
            sdp: pc.localDescription,
            kind: "offer",
          })
        )
        .catch(console.error);
    }

    updateParticipantsCount();
    return pc;
  }

  function removePeer(id) {
    const p = state.peers.get(id);
    if (p) p.pc.close();
    state.peers.delete(id);
    const tile = document.getElementById(`tile-${id}`);
    if (tile) tile.remove();
    updateParticipantsCount();
  }

  function addTile(id, stream, label, isLocal) {
    if (document.getElementById(`tile-${id}`)) return;
    const tile = document.createElement("div");
    tile.id = `tile-${id}`;
    tile.className = "video-tile";
    tile.innerHTML = `
      <video autoplay playsinline ${isLocal ? "muted" : ""}></video>
      <div class="label">${window.ChatApp.esc(label)}</div>
    `;
    const video = tile.querySelector("video");
    video.srcObject = stream;
    el.videoGrid.appendChild(tile);
  }

  function updateParticipantsCount() {
    const n = state.peers.size + (state.localStream ? 1 : 0);
    el.callParticipants.textContent = `${n} participant${n === 1 ? "" : "s"}`;
  }

  function toggleTrack(kind) {
    if (!state.localStream) return;
    const track = kind === "audio"
      ? state.localStream.getAudioTracks()[0]
      : state.localStream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    (kind === "audio" ? el.toggleMicBtn : el.toggleVideoBtn).classList.toggle("active", !track.enabled);
  }

  function updateControlUI() {
    if (!state.localStream) return;
    const a = state.localStream.getAudioTracks()[0];
    const v = state.localStream.getVideoTracks()[0];
    el.toggleMicBtn.classList.toggle("active", a && !a.enabled);
    el.toggleVideoBtn.classList.toggle("active", v && !v.enabled);
  }

  async function toggleScreenShare() {
    if (!state.localStream) {
      window.ChatApp.toast("Not in a call", "error");
      return;
    }
    if (!state.isScreenSharing) {
      let screen;
      try {
        screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      } catch (e) {
        return;
      }
      const screenTrack = screen.getVideoTracks()[0];
      const camTrack = state.localStream.getVideoTracks()[0];
      state.savedCameraTrack = camTrack;
      if (camTrack) state.localStream.removeTrack(camTrack);
      state.localStream.addTrack(screenTrack);
      const localVideo = document.querySelector("#tile-local video");
      if (localVideo) localVideo.srcObject = state.localStream;
      state.peers.forEach(({ pc }) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) sender.replaceTrack(screenTrack);
      });
      screenTrack.onended = () => {
        if (state.isScreenSharing) toggleScreenShare();
      };
      state.isScreenSharing = true;
      el.screenShareBtn.classList.add("active");
      const tile = document.getElementById("tile-local");
      if (tile) tile.classList.add("sharing");
      socket().emit("call:screen-share-started", { conversationId: state.conversationId });
    } else {
      const screenTrack = state.localStream.getVideoTracks()[0];
      if (screenTrack) {
        screenTrack.stop();
        state.localStream.removeTrack(screenTrack);
      }
      let camTrack = state.savedCameraTrack;
      if (!camTrack || camTrack.readyState === "ended") {
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
          camTrack = camStream.getVideoTracks()[0];
        } catch {
          camTrack = null;
        }
      }
      if (camTrack) {
        state.localStream.addTrack(camTrack);
        const localVideo = document.querySelector("#tile-local video");
        if (localVideo) localVideo.srcObject = state.localStream;
        state.peers.forEach(({ pc }) => {
          const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
          if (sender) sender.replaceTrack(camTrack);
        });
      }
      state.savedCameraTrack = null;
      state.isScreenSharing = false;
      el.screenShareBtn.classList.remove("active");
      const tile = document.getElementById("tile-local");
      if (tile) tile.classList.remove("sharing");
      socket().emit("call:screen-share-stopped", { conversationId: state.conversationId });
    }
  }

  // Wait for socket to be ready then bind handlers.
  const bindWhenReady = setInterval(() => {
    const s = window.ChatApp && window.ChatApp.getSocket();
    if (!s) return;
    clearInterval(bindWhenReady);

    s.on("call:signal", async ({ sender, sdp, candidate, kind }) => {
      let entry = state.peers.get(sender);
      if (!entry) {
        entry = { pc: createPeer(sender, false), name: "User" };
      }
      const pc = entry.pc;
      try {
        if (kind === "offer" && sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          s.emit("call:signal", { target: sender, sdp: pc.localDescription, kind: "answer" });
        } else if (kind === "answer" && sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } else if (kind === "candidate" && candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (e) {
        console.error("signal error", e);
      }
    });

    s.on("call:peer-joined", ({ socketId, username }) => {
      const entry = state.peers.get(socketId);
      if (entry) entry.name = username;
      // Existing peer will just wait for the incoming offer from the new joiner.
    });

    s.on("call:peer-left", ({ socketId }) => {
      removePeer(socketId);
    });

    s.on("call:incoming", ({ conversationId, caller, callType }) => {
      if (state.conversationId) return; // Already in a call
      pendingCall = { conversationId, callType: callType || "video" };
      const kind = callType === "audio" ? "voice call" : "video call";
      el.callerLabel.textContent = `${caller.username} — incoming ${kind}…`;
      el.incomingCallModal.classList.remove("hidden");
    });

    s.on("call:active", ({ conversationId, participants }) => {
      if (state.conversationId === conversationId) {
        updateParticipantsCount();
      }
    });

    s.on("call:ended", ({ conversationId }) => {
      if (state.conversationId === conversationId) {
        window.ChatApp.toast("Call ended");
        endCall();
      }
    });

    s.on("call:screen-share-started", ({ socketId }) => {
      const tile = document.getElementById(`tile-${socketId}`);
      if (tile) tile.classList.add("sharing");
    });

    s.on("call:screen-share-stopped", ({ socketId }) => {
      const tile = document.getElementById(`tile-${socketId}`);
      if (tile) tile.classList.remove("sharing");
    });
  }, 50);
})();
