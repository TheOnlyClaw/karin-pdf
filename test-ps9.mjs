import loadWASM from "@okathira/ghostpdl-wasm";
import { readFileSync, writeFileSync } from "fs";

const Module = await loadWASM();
const pdfBytes = readFileSync("/root/.hermes/cache/documents/doc_489277700315_תרגולים 15.pdf");

// Step 1: PDF -> PS
Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));
Module.callMain(["-dNOPAUSE", "-dBATCH", "-sDEVICE=ps2write", "-sOutputFile=temp.ps", "input.pdf"]);
const ps = Module.FS.readFile("temp.ps", { encoding: "binary" });
try { Module.FS.unlink("input.pdf"); Module.FS.unlink("temp.ps"); } catch {}

// Step 2: Override the TTY output to capture binary stdout
// In Emscripten, stdout goes through the TTY device
// We need to intercept the write to file descriptor 1

// Let's check what FS devices are available
console.log("FS methods:", Object.getOwnPropertyNames(Module.FS).filter(k => typeof Module.FS[k] === 'function').slice(0, 15));

// Try overriding the close and write methods for fd 1
const chunks = [];
const origWrite = Module.FS.write;

// Hook into the MEMFS filesystem to capture output
// Better approach: write to a file in memory but with a different technique
// Let me try to use -sOutputFile=output.pdf but specify a short output path

console.log("\n--- Trying with short output path and pre-clearing temp dirs ---");
try { Module.FS.unlink("input.ps"); } catch {}
Module.FS.writeFile("input.ps", ps);

// Create a deep directory structure to test
try {
  Module.callMain([
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-dEmbedAllFonts=false",
    "-sOutputFile=a.pdf",
    "input.ps"
  ]);
  const out = Module.FS.readFile("a.pdf", { encoding: "binary" });
  console.log("SUCCESS with short name:", out.byteLength, "bytes");
} catch(e) {
  console.log("FAILED:", e.name, "errno=" + (e.ha || e.message));
}

// Check if error is because of a PDF/A requirement
console.log("\n--- Checking what files exist in /tmp within MEMFS ---");
try { Module.FS.unlink("a.pdf"); } catch {}
try {
  const createFiles = Module.FS.readdir("/tmp");
  console.log("/tmp contains:", createFiles);
} catch(e) {
  console.log("Error reading /tmp:", e.message);
}

// Final attempt: pipe PS through pdfwrite to a file in /tmp (MEMFS)
console.log("\n--- Trying with output to MEMFS /tmp ---");
Module.FS.writeFile("input.ps", ps);
try {
  Module.callMain([
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-sOutputFile=/tmp/x.pdf",
    "input.ps"
  ]);
  const out = Module.FS.readFile("/tmp/x.pdf", { encoding: "binary" });
  console.log("SUCCESS:", out.byteLength, "bytes");
} catch(e) {
  console.log("FAILED:", e.name, "errno=" + (e.ha || e.message));
}
