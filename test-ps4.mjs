import loadWASM from "@okathira/ghostpdl-wasm";
import { readFileSync, writeFileSync } from "fs";

const Module = await loadWASM();
const pdfBytes = readFileSync("/root/.hermes/cache/documents/doc_489277700315_תרגולים 15.pdf");
console.log("Input:", pdfBytes.length, "bytes");

// Step 1: PDF -> PS  
Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));
Module.callMain(["-dNOPAUSE", "-dBATCH", "-sDEVICE=ps2write", "-sOutputFile=temp.ps", "input.pdf"]);
const ps = Module.FS.readFile("temp.ps", { encoding: "binary" });
console.log("PS:", ps.byteLength, "bytes");

// Save PS to real filesystem
writeFileSync("/tmp/saved.ps", Buffer.from(ps));
try { Module.FS.unlink("input.pdf"); } catch {}
try { Module.FS.unlink("temp.ps"); } catch {}

// Check MEMFS state
console.log("MEMFS after cleanup:", Module.FS.readdir("/").filter(f => !['.','..','tmp','home','dev','proc'].includes(f)));

// Read PS from real FS
const psFromDisk = readFileSync("/tmp/saved.ps");
Module.FS.writeFile("input.ps", new Uint8Array(psFromDisk));
console.log("Written input.ps:", (await import("fs")).statSync("/tmp/saved.ps").size, "bytes");

// Check MEMFS now
console.log("MEMFS before pdfwrite:", Module.FS.readdir("/"));
const stat = Module.FS.stat("input.ps");
console.log("input.ps stat:", stat);

// Step 2: PS -> PDF - try writing to real FS via NODEFS
// Actually, just try with a smaller output name
console.log("\nStep 2: PS -> PDF...");
try {
  Module.callMain([
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-dEmbedAllFonts=false",
    "-dSubsetFonts=false",
    "-sOutputFile=out.pdf",
    "input.ps"
  ]);
  const final = Module.FS.readFile("out.pdf", { encoding: "binary" });
  console.log("SUCCESS! Final:", final.byteLength, "bytes");
} catch(e) {
  console.log("FAILED:", e.name, "errno:", e.ha || e.message);
  // Try to create a bigger file first
  console.log("Trying approach B: pre-allocate and retry...");
  try {
    const big = new Uint8Array(50 * 1024 * 1024);
    Module.FS.writeFile("_tmp.bin", big);
    Module.FS.unlink("_tmp.bin");
    
    Module.callMain([
      "-dNOPAUSE", "-dBATCH",
      "-sDEVICE=pdfwrite",
      "-dPDFSETTINGS=/screen",
      "-dEmbedAllFonts=false",
      "-dSubsetFonts=false",
      "-sOutputFile=out.pdf",
      "input.ps"
    ]);
    const final = Module.FS.readFile("out.pdf", { encoding: "binary" });
    console.log("SUCCESS! Final:", final.byteLength, "bytes");
  } catch(e2) {
    console.log("Still FAILED:", e2.name, "errno:", e2.ha || e2.message);
  }
}
