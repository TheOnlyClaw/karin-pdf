import loadWASM from "@okathira/ghostpdl-wasm";
import { readFileSync, writeFileSync } from "fs";

const Module = await loadWASM();
const pdfBytes = readFileSync("/root/.hermes/cache/documents/doc_489277700315_תרגולים 15.pdf");

// Step 1: PDF -> PS (no fancy flags)
Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));
Module.callMain(["-dNOPAUSE", "-dBATCH", "-sDEVICE=ps2write", "-sOutputFile=temp.ps", "input.pdf"]);
const ps = Module.FS.readFile("temp.ps", { encoding: "binary" });
writeFileSync("/tmp/saved.ps", Buffer.from(ps));
try { Module.FS.unlink("input.pdf"); Module.FS.unlink("temp.ps"); } catch {}

// Test different pdfwrite approaches
const approaches = [
  { name: "plain pdfwrite", args: ["-dNOPAUSE", "-dBATCH", "-sDEVICE=pdfwrite", "-sOutputFile=out.pdf", "input.ps"] },
  { name: "minimal compression", args: ["-dNOPAUSE", "-dBATCH", "-sDEVICE=pdfwrite", "-dCompressPages=true", "-sOutputFile=out.pdf", "input.ps"] },
];

for (const approach of approaches) {
  console.log(`\nTesting: ${approach.name}`);
  try { Module.FS.unlink("out.pdf"); } catch {}
  try { Module.FS.unlink("input.ps"); } catch {}
  
  Module.FS.writeFile("input.ps", ps);
  try {
    Module.callMain(approach.args);
    const out = Module.FS.readFile("out.pdf", { encoding: "binary" });
    console.log(`  SUCCESS: ${out.byteLength} bytes`);
  } catch(e) {
    console.log(`  FAILED: ${e.name} errno=${e.ha || e.message}`);
  }
}
