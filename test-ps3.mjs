import loadWASM from "@okathira/ghostpdl-wasm";
import { readFileSync } from "fs";

const Module = await loadWASM();
const pdfBytes = readFileSync("/root/.hermes/cache/documents/doc_489277700315_תרגולים 15.pdf");
console.log("Input:", pdfBytes.length, "bytes");

// Pre-grow MEMFS by allocating a large file then deleting it
console.log("Pre-growing MEMFS...");
const growData = new Uint8Array(100 * 1024 * 1024); // 100MB
Module.FS.writeFile("_grow.bin", growData);
Module.FS.unlink("_grow.bin");
console.log("  MEMFS pre-grown");

// Step 1: PDF -> PS (NO -dQUIET, NO -dCompressFonts)
console.log("Step 1: PDF -> PS...");
Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));
Module.callMain([
  "-dNOPAUSE", "-dBATCH",
  "-sDEVICE=ps2write",
  "-sOutputFile=temp.ps",
  "input.pdf"
]);
const ps = Module.FS.readFile("temp.ps", { encoding: "binary" });
console.log("  PS:", ps.byteLength, "bytes");

// Free space
try { Module.FS.unlink("input.pdf"); } catch {}
try { Module.FS.unlink("temp.ps"); } catch {}

// Step 2: PS -> PDF  
console.log("Step 2: PS -> PDF...");
Module.FS.writeFile("input.ps", ps);
Module.callMain([
  "-dNOPAUSE", "-dBATCH",
  "-sDEVICE=pdfwrite",
  "-dPDFSETTINGS=/screen",
  "-dEmbedAllFonts=false",
  "-dSubsetFonts=false",
  "-dCompressFonts=true",
  "-dOptimize=true",
  "-sOutputFile=output.pdf",
  "input.ps"
]);
const final = Module.FS.readFile("output.pdf", { encoding: "binary" });
console.log("  Final:", final.byteLength, "bytes (" + (final.byteLength/pdfBytes.length*100).toFixed(1) + "%)");
