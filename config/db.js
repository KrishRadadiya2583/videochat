const mongoose = require("mongoose");
const dns = require("dns");

// Some Windows / ISP / VPN setups refuse SRV DNS queries, which breaks
// mongodb+srv:// URIs. Force Node's DNS resolver to use public servers
// so the SRV lookup goes through Google / Cloudflare instead.
if (process.env.DNS_SERVERS !== "system") {
  const servers = (process.env.DNS_SERVERS || "8.8.8.8,1.1.1.1")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    dns.setServers(servers);
  } catch (e) {
    console.warn("Failed to set custom DNS servers:", e.message);
  }
}

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set");
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
  });
  console.log("MongoDB connected");
}

module.exports = connectDB;
