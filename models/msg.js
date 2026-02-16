const mongoose = require("mongoose");

const msgSchema = new mongoose.Schema({
    username: String,
    message: String,
    fileUrl: String,
    fileType: String,

    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
})

module.exports = mongoose.model("Msg", msgSchema);