import loadWASM from "@okathira/ghostpdl-wasm";
import { readFileSync } from "fs";

const Module = await loadWASM();
const pdfBytes = readFileSync("/root/.hermes/cache/documents/doc_489277700315_תרגולים 15.pdf");

// Write input
Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));

// Try: first pass pdfwrite to strip some metadata / recompress
// Then on the result, try the PS round trip (now smaller)
try {
  Module.callMain([
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.4",
    "-dPDFSETTINGS=/screen",
    "-dEmbedAllFonts=false",
    "-dSubsetFonts=false",
    "-dOptimize=true",
    "-sOutputFile=pass1.pdf",
    "input.pdf"
  ]);
  const pass1 = Module.FS.readFile("pass1.pdf", { encoding: "binary" });
  console.log("Pass1 pdfwrite:", pass1.byteLength, "bytes");
  
  // Now try PS round-trip on the smaller file
  try { Module.FS.unlink("input.pdf"); } catch {}
  Module.FS.writeFile("input.pdf", pass1);
  
  // PS
  Module.callMain([
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=ps2write",
    "-sOutputFile=temp.ps",
    "input.pdf"
  ]);
  const ps = Module.FS.readFile("temp.ps", { encoding: "binary" });
  console.log("PS of pass1:", ps.byteLength, "bytes");
  
  // Clean up and try pdfwrite on PS
  try { Module.FS.unlink("input.pdf"); Module.FS.unlink("temp.ps"); } catch {}
  Module.FS.writeFile("input.ps", ps);
  
  try {
    Module.callMain([
      "-dNOPAUSE", "-dBATCH",
      "-sDEVICE=pdfwrite",
      "-dPDFSETTINGS=/screen",
      "-dEmbedAllFonts=false",
      "-dOptimize=true",
      "-sOutputFile=final.pdf",
      "input.ps"
    ]);
    const final = Module.FS.readFile("final.pdf", { encoding: "binary" });
    console.log("FINAL:", final.byteLength, "bytes");
  } catch(e) {
    console.log("pdfwrite on PS FAILED:", e.name, "errno=" + (e.ha || e.message));
  }
} catch(e) {
  console.log("Pass1 FAILED:", e.name, "errno=" + (e.ha || e.message));
}
