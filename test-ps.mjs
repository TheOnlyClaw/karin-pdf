import loadWASM from "@okathira/ghostpdl-wasm";
import { readFileSync } from "fs";

const Module = await loadWASM();
const pdfBytes = readFileSync("/root/.hermes/cache/documents/doc_489277700315_תרגולים 15.pdf");
console.log("Input:", pdfBytes.length, "bytes");

// PS pass (NO -dQUIET)
console.log("Step 1: PDF -> PS (ps2write)...");
const start1 = Date.now();
Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));
try {
  Module.callMain([
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=ps2write",
    "-dCompressFonts=true",
    "-sOutputFile=temp.ps",
    "input.pdf"
  ]);
  const ps = Module.FS.readFile("temp.ps", { encoding: "binary" });
  console.log("  Done in", (Date.now()-start1)/1000, "s");
  console.log("  PS size:", ps.byteLength, "bytes");
  
  // PDF pass
  console.log("Step 2: PS -> PDF (pdfwrite)...");
  const start2 = Date.now();
  try { Module.FS.unlink("input.pdf"); } catch {}
  Module.FS.writeFile("temp.ps", ps);
  Module.callMain([
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-dCompressFonts=true",
    "-dOptimize=true",
    "-dEmbedAllFonts=false",
    "-dSubsetFonts=false",
    "-sOutputFile=output.pdf",
    "temp.ps"
  ]);
  const final = Module.FS.readFile("output.pdf", { encoding: "binary" });
  console.log("  Done in", (Date.now()-start2)/1000, "s");
  console.log("  Final size:", final.byteLength, "bytes");
  console.log("  Ratio:", (final.byteLength/pdfBytes.length*100).toFixed(1) + "%");
} catch(e) {
  console.error("ERROR:", e.message || e);
  console.log("MEMFS:", Module.FS.readdir("/").filter(f => !['.','..','tmp','home','dev','proc'].includes(f)));
}
