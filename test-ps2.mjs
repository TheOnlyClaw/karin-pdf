import loadWASM from "@okathira/ghostpdl-wasm";
import { readFileSync } from "fs";

const Module = await loadWASM();
const pdfBytes = readFileSync("/root/.hermes/cache/documents/doc_489277700315_תרגולים 15.pdf");
console.log("Input:", pdfBytes.length, "bytes");

// Step 1: PDF -> PS
console.log("Step 1: PDF -> PS...");
Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));
Module.callMain(["-dNOPAUSE", "-dBATCH", "-sDEVICE=ps2write", "-sOutputFile=temp.ps", "input.pdf"]);
const ps = Module.FS.readFile("temp.ps", { encoding: "binary" });
console.log("  PS:", ps.byteLength, "bytes");

// Delete everything to free MEMFS space
try { Module.FS.unlink("input.pdf"); } catch {}
try { Module.FS.unlink("temp.ps"); } catch {}

// Step 2: PS -> PDF with super aggressive settings
console.log("Step 2: PS -> PDF...");
Module.FS.writeFile("input.ps", ps);
// Free the ps reference so GC can collect
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
