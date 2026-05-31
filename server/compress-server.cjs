const express = require("express");
const multer = require("multer");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Dispatcher that uses either ESM or CJS approach
// This script is dual-mode to avoid ESM headaches

const app = express();
const PORT = process.env.PORT || 3003;
const HOST = process.env.HOST || "0.0.0.0";

// CORS — allow GitHub Pages and local origins
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = [
    "https://theonlyclaw.github.io",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:3002",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
  ];
  if (origin && (allowed.includes(origin) || origin.endsWith(".github.io"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", gs: execSync("gs --version", { encoding: "utf8" }).trim() });
});

// Multer for file upload (in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files accepted"));
    }
  },
});

// Compress endpoint
app.post("/compress", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file provided" });
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-"));
  const inputPath = path.join(workDir, "input.pdf");
  const psPath = path.join(workDir, "temp.ps");
  const outputPath = path.join(workDir, "output.pdf");

  try {
    // Write input file
    fs.writeFileSync(inputPath, req.file.buffer);

    // Step 1: PDF → PostScript
    execSync(
      `gs -dNOPAUSE -dBATCH -q -sDEVICE=ps2write -sOutputFile="${psPath}" "${inputPath}"`,
      { timeout: 120000, stdio: "pipe" }
    );

    // Step 2: PostScript → PDF
    execSync(
      `gs -dNOPAUSE -dBATCH -q -sDEVICE=pdfwrite -dPDFSETTINGS=/screen -dEmbedAllFonts=false -dSubsetFonts=false -dCompressFonts=true -dOptimize=true -sOutputFile="${outputPath}" "${psPath}"`,
      { timeout: 120000, stdio: "pipe" }
    );

    // Read output
    const output = fs.readFileSync(outputPath);
    const originalSize = req.file.buffer.length;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("X-Original-Size", originalSize);
    res.setHeader("X-Compressed-Size", output.length);
    res.setHeader("X-Compression-Ratio", ((output.length / originalSize) * 100).toFixed(1) + "%");
    res.send(output);
  } catch (err) {
    console.error("Compression failed:", err.message);
    res.status(500).json({
      error: "Compression failed",
      detail: err.message,
    });
  } finally {
    // Cleanup
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {}
  }
});

app.listen(PORT, HOST, () => {
  console.log(`GS Compression Server running on http://${HOST}:${PORT}`);
  console.log(`Native GS version: ${execSync("gs --version", { encoding: "utf8" }).trim()}`);
});
