import loadWASM from "@okathira/ghostpdl-wasm";
import { readFileSync, writeFileSync } from "fs";

const Module = await loadWASM();
const pdfBytes = readFileSync("/root/.hermes/cache/documents/doc_489277700315_תרגולים 15.pdf");
console.log("Original:", pdfBytes.length, "bytes");

// Step 1: pdfwrite (font dedup) - fixed
Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));
Module.callMain([
  "-dNOPAUSE", "-dBATCH",
  "-sDEVICE=pdfwrite",
  "-sOutputFile=pass1.pdf",
  "input.pdf"
]);
const p1 = Module.FS.readFile("pass1.pdf", { encoding: "binary" });
console.log("Pass1 pdfwrite:", p1.byteLength, "bytes");

// Try different tiers for pass 3
const tiers = ["/screen", "/ebook", "/printer", "/prepress"];
for (const tier of tiers) {
  // Step 2: ps2write
  try { Module.FS.unlink("pass1.pdf"); Module.FS.unlink("input.pdf"); Module.FS.unlink("temp.ps"); Module.FS.unlink("output.pdf"); } catch {}
  Module.FS.writeFile("pass1.pdf", p1);
  Module.callMain(["-dNOPAUSE", "-dBATCH", "-sDEVICE=ps2write", "-sOutputFile=temp.ps", "pass1.pdf"]);
  const ps = Module.FS.readFile("temp.ps", { encoding: "binary" });
  
  // Step 3: pdfwrite with this tier, embed fonts for readability
  try { Module.FS.unlink("pass1.pdf"); Module.FS.unlink("temp.ps"); } catch {}
  Module.FS.writeFile("temp.ps", ps);
  Module.callMain([
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    `-dPDFSETTINGS=${tier}`,
    "-sOutputFile=output.pdf",
    "temp.ps"
  ]);
  const out = Module.FS.readFile("output.pdf", { encoding: "binary" });
  console.log(`  ${tier}: ${out.byteLength} bytes (${(out.byteLength/pdfBytes.length*100).toFixed(1)}%)`);
}
