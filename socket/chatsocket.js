
const Msg = require("../models/msg");
const users = {};
const activeCalls = {}; // room -> Set(socket.id)

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

      io.to(room).emit("userList", roomUsers);

      // Send active call status to the joining user
      if (activeCalls[room] && activeCalls[room].size > 0) {
        socket.emit("ongoing-call", { participants: activeCalls[room].size });
      }
    });

    socket.on("chatMessage", async (msg) => {
      const user = users[socket.id];
      if (!user) return;

      const timestamp = new Date();

      io.to(user.room).emit("message", {
        username: user.username,
        message: msg,
        timestamp: timestamp
      });

      const message = new Msg({
        username: user.username,
        message: msg,
        timestamp: timestamp
      });

      await message.save();
      console.log("Message saved to database");

    });

    socket.on("typing", () => {
      const user = users[socket.id];
      if (!user) return;

      socket.broadcast.to(user.room).emit("typing", `${user.username} is typing...`);
    });

    // --- WebRTC Signaling ---

    // User initiates or joins a call
    socket.on("join-call", () => {
      const user = users[socket.id];
      if (!user) return;
      const room = user.room;

      if (!activeCalls[room]) {
        activeCalls[room] = new Set();
      }

      // Notify others in the room that a call is active/started if it was empty
      if (activeCalls[room].size === 0) {
        socket.broadcast.to(room).emit("incoming-call", { caller: user.username });
      }

      // Return list of EXISTING users IN THE CALL to the new joiner
      const peersInCall = Array.from(activeCalls[room]).filter(id => id !== socket.id);
      socket.emit("all-users-in-call", peersInCall);

      activeCalls[room].add(socket.id);

      // Notify existing participants that a new user joined the call
      peersInCall.forEach(peerId => {
        io.to(peerId).emit("user-connected-to-call", socket.id);
      });
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
        // Notify others in the call
        const peersInCall = Array.from(activeCalls[user.room]);
        peersInCall.forEach(peerId => {
          io.to(peerId).emit("user-left-call", socket.id);
        });

        if (activeCalls[user.room].size === 0) {
          delete activeCalls[user.room];
          // Notify room call ended? Optional
          io.to(user.room).emit("call-ended");
        }
      }
    });

    // ------------------------

    async function loadMessages() {
      const messages = await Msg.find().sort({ timestamp: -1 }).limit(15).sort({ timestamp: 1 });
      socket.emit("loadMessages", messages);
    }
    loadMessages();

    socket.on("disconnect", () => {
      const user = users[socket.id];
      if (user) {
        socket.broadcast.to(user.room).emit("notification", `${user.username} left the chat`);

        // Handle Call Disconnect
        if (activeCalls[user.room]) {
          activeCalls[user.room].delete(socket.id);
          const peersInCall = Array.from(activeCalls[user.room]);
          peersInCall.forEach(peerId => {
            io.to(peerId).emit("user-left-call", socket.id);
          });
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
