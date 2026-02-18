
const Msg = require("../models/msg");
const users = {};
const activeCalls = {};
const screenSharingUsers = {};

module.exports = (io) => {
  io.on("connection", async (socket) => {
    console.log("User connected:", socket.id);

    socket.on("joinRoom", async ({ username, room }) => {
      socket.join(room);

      users[socket.id] = { username, room };

      socket.broadcast.to(room).emit("notification", `${username} joined ${room}`);

      const roomUsers = Object.values(users).filter(
        (u) => u.room === room
      );

      async function loadMessages() {
        const messages = await Msg.find().sort({ timestamp: -1 }).limit(20);
        socket.emit("loadMessages", messages.reverse());
      }

      loadMessages();


      io.to(room).emit("userList", roomUsers);

      if (activeCalls[room] && activeCalls[room].size > 0) {
        socket.emit("ongoing-call", { participants: activeCalls[room].size });
      }
    });

    socket.on("chatMessage", async (data) => {
      const user = users[socket.id];
      if (!user) return;

      const timestamp = new Date();
      let messageContent = "";
      let fileUrl = null;
      let fileType = null;

      if (typeof data === "object") {
        messageContent = data.message || "";
        fileUrl = data.fileUrl;
        fileType = data.fileType;
      } else {
        messageContent = data;
      }

      const msgPayload = {
        username: user.username,
        message: messageContent,
        fileUrl: fileUrl,
        fileType: fileType,
        timestamp: timestamp
      };

      const message = new Msg(msgPayload);
      await message.save();
      console.log("Message saved to database");

      io.to(user.room).emit("message", message);
    });

    socket.on("sendMessageReaction", ({ messageId, reaction }) => {
      const user = users[socket.id];
      if (!user) return;
      io.to(user.room).emit("messageReaction", { messageId, reaction });
    });

    socket.on("typing", () => {
      const user = users[socket.id];
      if (!user) return;

      socket.broadcast.to(user.room).emit("typing", `${user.username} is typing...`);
    });

    // --- WebRTC Signaling ---

    socket.on("join-call", () => {
      const user = users[socket.id];
      if (!user) return;
      const room = user.room;

      if (!activeCalls[room]) {
        activeCalls[room] = new Set();
      }


      if (activeCalls[room].size === 0) {
        socket.broadcast.to(room).emit("incoming-call", { caller: user.username });
      }

      const peersInCall = Array.from(activeCalls[room])
        .filter(id => id !== socket.id)
        .map(id => ({ socketId: id, username: users[id]?.username || "User" }));

      socket.emit("all-users-in-call", peersInCall);

      activeCalls[room].add(socket.id);

      Array.from(activeCalls[room]).forEach(peerId => {
        if (peerId !== socket.id) {
          io.to(peerId).emit("user-connected-to-call", { socketId: socket.id, username: user.username });
        }
      });

      if (screenSharingUsers[room]) {
        socket.emit("screen-share-started", screenSharingUsers[room]);
      }
    });

    socket.on("offer", (payload) => {
      io.to(payload.target).emit("offer", { ...payload, sender: socket.id });
    });

    socket.on("answer", (payload) => {
      io.to(payload.target).emit("answer", { ...payload, sender: socket.id });
    });

    socket.on("ice-candidate", (payload) => {
      io.to(payload.target).emit("ice-candidate", { ...payload, sender: socket.id });
    });

    socket.on("leave-call", () => {
      const user = users[socket.id];
      if (user && activeCalls[user.room]) {
        activeCalls[user.room].delete(socket.id);

        const peersInCall = Array.from(activeCalls[user.room]);
        peersInCall.forEach(peerId => {
          io.to(peerId).emit("user-left-call", socket.id);
        });

        if (screenSharingUsers[user.room] === socket.id) {
          delete screenSharingUsers[user.room];
          socket.broadcast.to(user.room).emit("screen-share-stopped", socket.id);
        }

        if (activeCalls[user.room].size === 0) {
          delete activeCalls[user.room];

          io.to(user.room).emit("call-ended");
        }
      }
    });


    socket.on("screen-share-started", () => {
      const user = users[socket.id];
      if (user) {
        screenSharingUsers[user.room] = socket.id;
        socket.broadcast.to(user.room).emit("screen-share-started", socket.id);
      }
    });

    socket.on("screen-share-stopped", () => {
      const user = users[socket.id];
      if (user) {
        if (screenSharingUsers[user.room] === socket.id) {
          delete screenSharingUsers[user.room];
        }
        socket.broadcast.to(user.room).emit("screen-share-stopped", socket.id);
      }
    });




    socket.on("disconnect", () => {
      const user = users[socket.id];
      if (user) {
        socket.broadcast.to(user.room).emit("notification", `${user.username} left the chat`);


        if (activeCalls[user.room]) {
          activeCalls[user.room].delete(socket.id);
          const peersInCall = Array.from(activeCalls[user.room]);
          peersInCall.forEach(peerId => {
            io.to(peerId).emit("user-left-call", socket.id);
          });
          if (screenSharingUsers[user.room] === socket.id) {
            delete screenSharingUsers[user.room];
            socket.broadcast.to(user.room).emit("screen-share-stopped", socket.id);
          }

          if (activeCalls[user.room].size === 0) {
            delete activeCalls[user.room];
            io.to(user.room).emit("call-ended");
          }
        }

        delete users[socket.id];

        const roomUsers = Object.values(users).filter(
          (u) => u.room === user.room
        );

        io.to(user.room).emit("userList", roomUsers);
      }
      console.log("User disconnected:", socket.id);
    });
  });
};
