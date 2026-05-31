import loadWASM from "@okathira/ghostpdl-wasm";
import { readFileSync } from "fs";

const Module = await loadWASM();
const pdfBytes = readFileSync("/root/.hermes/cache/documents/doc_489277700315_תרגולים 15.pdf");

// Step 1: PDF -> PS
Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));
Module.callMain(["-dNOPAUSE", "-dBATCH", "-sDEVICE=ps2write", "-sOutputFile=temp.ps", "input.pdf"]);
const ps = Module.FS.readFile("temp.ps", { encoding: "binary" });
try { Module.FS.unlink("input.pdf"); Module.FS.unlink("temp.ps"); } catch {}

// Step 2: PS -> PDF via %stdout% - capture to memfs using a trick
// Write PS to input
Module.FS.writeFile("input.ps", ps);

// Override Module.FS.write to capture stdout binary data
let capturedOutput = null;
const origStdout = Module.FS.write;
Module.FS.write = function(fd, buf, ...rest) {
  if (fd === 1) { // stdout
    // Check if this is a buffer or string
    console.log("  stdout write, fd=1, len=", buf?.length || buf?.byteLength);
    capturedOutput = buf;
  }
  return origStdout ? origStdout.call(Module.FS, fd, buf, ...rest) : 0;
};

// Actually, simpler approach: use %pipe% or write to a known file
// Let me try using -sOutputFile=%pipe%pdfwrite or just output to a real file

// Clean approach: output to a file in Node's real FS using NODEFS
// Mount the real filesystem
try {
  Module.FS.mkdir("/mnt");
  Module.FS.mount(Module.NODEFS, { root: "/tmp" }, "/mnt");
  console.log("NODEFS mounted successfully!");
  
  Module.callMain([
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-dEmbedAllFonts=false",
    "-sOutputFile=/mnt/gs_output.pdf",
    "input.ps"
  ]);
  const out = readFileSync("/tmp/gs_output.pdf");
  console.log("SUCCESS:", out.length, "bytes");
} catch(e) {
  console.log("NODEFS approach:", e.name, e.ha || e.message);
}

// If NODEFS not available, use %stdout% and capture directly
if (!capturedOutput) {
  // Let me try through the native node process
  const { spawnSync } = await import("child_process");
  // Can use gs directly...
}
