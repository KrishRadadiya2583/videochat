const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async function socketAuth(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/, "");
    if (!token) return next(new Error("No token"));

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return next(new Error("User not found"));

    socket.user = {
      id: String(user._id),
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    };
    next();
  } catch (e) {
    next(new Error("Authentication failed"));
  }
};
