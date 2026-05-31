import loadWASM from "@okathira/ghostpdl-wasm";
import { readFileSync } from "fs";

const Module = await loadWASM();
const pdfBytes = readFileSync("/root/.hermes/cache/documents/doc_489277700315_תרגולים 15.pdf");

// Step 1: PDF -> PS
Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));
Module.callMain(["-dNOPAUSE", "-dBATCH", "-sDEVICE=ps2write", "-sOutputFile=temp.ps", "input.pdf"]);
const ps = Module.FS.readFile("temp.ps", { encoding: "binary" });
try { Module.FS.unlink("input.pdf"); Module.FS.unlink("temp.ps"); } catch {}

// Step 2: PS -> PDF via %stdout% with fs write hook
// In Emscripten, the TTY device handles fd 1 writes
// We can override the FS.tty device's put_char method

const captured = [];

// Override the print function for binary capture
// Actually, in Emscripten, we can override the underlying device ops
// Let me check if there's a TTY device we can patch

if (Module.FS.tty && Module.FS.tty.ops) {
  console.log("TTY ops available:", Object.keys(Module.FS.tty.ops));
}

// Try patching FS.write for fd 1
const originalWrite = Module.FS.write;
Module.FS.write = function(fd, buf, offset, length, position) {
  if (fd === 1) {
    // stdout - capture the data
    if (buf && buf.length) {
      captured.push(Buffer.from(buf));
    }
  }
  return originalWrite.call(Module.FS, fd, buf, offset, length, position);
};

Module.FS.writeFile("input.ps", ps);

try {
  Module.callMain([
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-dEmbedAllFonts=false",
    "-sOutputFile=%stdout%",
    "input.ps"
  ]);
  console.log("CallMain completed!");
  
  if (captured.length > 0) {
    const totalBytes = captured.reduce((a, b) => a + b.length, 0);
    console.log("Captured", captured.length, "chunks, total:", totalBytes, "bytes");
    if (totalBytes > 0) {
      const result = Buffer.concat(captured);
      console.log("Result:", result.length, "bytes");
      if (result.length > 100) {
        console.log("First bytes:", result.slice(0, 8).toString("hex"));
        console.log("Looks like PDF:", result.slice(0, 5).toString() === "%PDF-");
      }
    }
  } else {
    console.log("No data captured");
    // Check MEMFS for any new files
    console.log("MEMFS files:", Module.FS.readdir("/").filter(f => !['.','..','tmp','home','dev','proc'].includes(f)));
  }
} catch(e) {
  console.log("FAILED:", e.name, "errno=" + (e.ha || e.message));
}
