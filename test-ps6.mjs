import loadWASM from "@okathira/ghostpdl-wasm";
import { readFileSync, writeFileSync } from "fs";

const Module = await loadWASM();
const pdfBytes = readFileSync("/root/.hermes/cache/documents/doc_489277700315_תרגולים 15.pdf");

// Step 1: PDF -> PS
Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));
Module.callMain(["-dNOPAUSE", "-dBATCH", "-sDEVICE=ps2write", "-sOutputFile=temp.ps", "input.pdf"]);
const ps = Module.FS.readFile("temp.ps", { encoding: "binary" });
writeFileSync("/tmp/saved.ps", Buffer.from(ps));
try { Module.FS.unlink("input.pdf"); Module.FS.unlink("temp.ps"); } catch {}

// Check memory growth capability
try {
  const heapSize = Module.HEAP8.length;
  console.log("Initial WASM heap:", heapSize, "bytes");
  
  // Try growing by allocating 200MB directly
  try {
    Module.FS.writeFile("_big.bin", new Uint8Array(200 * 1024 * 1024));
    const heapAfter = Module.HEAP8.length;
    console.log("After 200MB write, heap:", heapAfter, "bytes");
    Module.FS.unlink("_big.bin");
  } catch(e) {
    console.log("Can't write 200MB:", e.name, e.ha);
    // Try 100MB
    try {
      Module.FS.writeFile("_big.bin", new Uint8Array(100 * 1024 * 1024));
      Module.FS.unlink("_big.bin");
      console.log("100MB write succeeded");
    } catch(e2) {
      console.log("Can't write 100MB either:", e2.name, e2.ha);
    }
  }
} catch(e) {
  console.log("Error checking heap:", e);
}

// Now try pdfwrite on the PS with GS_TEMP_A setting
console.log("\nTrying pdfwrite with NO temp files...");
try { Module.FS.unlink("input.ps"); } catch {}
Module.FS.writeFile("input.ps", ps);

try {
  // Use -dSAFER to reduce temp file creation
  Module.callMain([
    "-dSAFER",
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-dEmbedAllFonts=false",
    "-sOutputFile=out.pdf",
    "input.ps"
  ]);
  const out = Module.FS.readFile("out.pdf", { encoding: "binary" });
  console.log("SUCCESS:", out.byteLength, "bytes");
} catch(e) {
  console.log("FAILED:", e.name, "errno=" + (e.ha || e.message));
}
