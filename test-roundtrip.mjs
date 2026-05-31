import loadWASM from "@okathira/ghostpdl-wasm";
import { readFileSync, writeFileSync } from "fs";

async function test() {
  console.log("Loading GS WASM...");
  const Module = await loadWASM();

  const pdfBytes = readFileSync("/root/.hermes/cache/documents/doc_489277700315_תרגולים 15.pdf");
  console.log("Input:", pdfBytes.length, "bytes");

  // ----- Test 1: pdfwrite pass on the original PDF -----
  console.log("\n--- Test 1: Simple pdfwrite /screen ---");
  Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));
  try {
    Module.callMain([
      "-dNOPAUSE", "-dBATCH", "-dQUIET",
      "-sDEVICE=pdfwrite",
      "-dPDFSETTINGS=/screen",
      "-dCompressFonts=true",
      "-sOutputFile=output.pdf",
      "input.pdf"
    ]);
    const out = Module.FS.readFile("output.pdf", { encoding: "binary" });
    console.log("  Output:", out.byteLength, "bytes");
    try { Module.FS.unlink("output.pdf"); } catch {}
  } catch (e) {
    console.log("  pdfwrite FAILED:", e.message || e);
  }
  try { Module.FS.unlink("input.pdf"); } catch {}
  
  // ----- Test 2: ps2write pass -----
  console.log("\n--- Test 2: ps2write ---");
  Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));
  try {
    Module.callMain([
      "-dNOPAUSE", "-dBATCH",
      "-sDEVICE=ps2write",
      "-sOutputFile=temp.ps",
      "input.pdf"
    ]);
    const ps = Module.FS.readFile("temp.ps", { encoding: "binary" });
    console.log("  PS output:", ps.byteLength, "bytes");
    
    // Test 3: now pdfwrite from PS
    console.log("\n--- Test 3: pdfwrite from PS ---");
    try { Module.FS.unlink("input.pdf"); } catch {}
    Module.FS.writeFile("temp.ps", ps);
    try {
      Module.callMain([
        "-dNOPAUSE", "-dBATCH",
        "-sDEVICE=pdfwrite",
        "-dPDFSETTINGS=/screen",
        "-sOutputFile=final.pdf",
        "temp.ps"
      ]);
      const final = Module.FS.readFile("final.pdf", { encoding: "binary" });
      console.log("  Final PDF:", final.byteLength, "bytes");
    } catch (e) {
      console.log("  Stage 3 FAILED:", e.message || e);
    }
  } catch (e) {
    console.log("  ps2write FAILED:", e.message || e);
  }

  // List MEMFS
  try {
    console.log("\nMEMFS contents:", Module.FS.readdir("/").filter(f => !['.', '..', 'tmp', 'home', 'dev', 'proc'].includes(f)));
  } catch {}
}

test().catch(console.error);
