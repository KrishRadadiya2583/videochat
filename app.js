require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const chatSocket = require("./socket");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const conversationRoutes = require("./routes/conversations");
const uploadRoutes = require("./routes/upload");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
  maxHttpBufferSize: 5e6,
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// API
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/upload", uploadRoutes);

// Static
app.use(express.static(path.join(__dirname, "public")));

// SPA fallback for known client routes so refresh works
app.get(/^\/(login|register|app)$/, (req, res) => {
  const page = req.path.replace(/^\//, "");
  res.sendFile(path.join(__dirname, "public", `${page}.html`));
});

// Root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Errors
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

chatSocket(io);

const PORT = process.env.PORT || 3000;
connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Connect chat platform listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start", err);
    process.exit(1);
  });
