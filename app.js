const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const chatSocket = require("./socket/chatsocket");
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const mongoose = require("mongoose");
const upload = require("./multer/multer");


function main() {
    return mongoose.connect("mongodb+srv://krishradadiya19_db_user:mils%402109@cluster0.xbvmrom.mongodb.net/chatroom");
}

main().then(() => {
    console.log("Connected to MongoDB");
}).catch((err) => {
    console.log(err);
})


app.use(express.static(path.join(__dirname, "public")));

app.post("/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
    }
    res.json({
        filePath: req.file.path,
        fileType: req.file.mimetype
    });
});

chatSocket(io);


server.listen(3000, () => {
    console.log("Server running on port", 3000);
});
