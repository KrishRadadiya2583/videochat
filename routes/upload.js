const express = require("express");
const upload = require("../multer/multer");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.json({
    fileUrl: req.file.path,
    fileType: req.file.mimetype,
    fileName: req.file.originalname,
  });
});

module.exports = router;
