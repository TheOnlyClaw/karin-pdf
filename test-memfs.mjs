import loadWASM from "@okathira/ghostpdl-wasm";

const Module = await loadWASM();

// Test: can MEMFS handle large files in a single callMain?
// The PS round-trip needs: 16MB input → ps2write → 5MB PS → pdfwrite → 389KB output
// That works in 2 calls, but the 2nd fails with ENOSPC

// Let's test: what's the max file size we can write in a single callMain?

// Test 1: parse the original PDF with pdfwrite and output to MEMFS
const fs = await import("fs");
const pdfBytes = fs.readFileSync("/root/.hermes/cache/documents/doc_489277700315_תרגולים 15.pdf");

Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));

// Test single callMain with pdfwrite - does it work?
try {
  Module.callMain([
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-dEmbedAllFonts=false",
    "-dSubsetFonts=false",
    "-sOutputFile=out_pass1.pdf",
    "input.pdf"
  ]);
  const pass1 = Module.FS.readFile("out_pass1.pdf", { encoding: "binary" });
  console.log("Pass 1 (pdfwrite original):", pass1.byteLength, "bytes");
  
  // Now test: can I do ps2write on the pass1 output?
  try { Module.FS.unlink("input.pdf"); } catch {}
  Module.FS.writeFile("input.pdf", pass1);
  
  Module.callMain([
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=ps2write",
    "-sOutputFile=pass1.ps",
    "input.pdf"
  ]);
  const pass1ps = Module.FS.readFile("pass1.ps", { encoding: "binary" });
  console.log("Pass 2 (ps2write on pass1):", pass1ps.byteLength, "bytes");
  
  // Now pdfwrite on PS
  try { Module.FS.unlink("input.pdf"); Module.FS.unlink("pass1.ps"); Module.FS.unlink("out_pass1.pdf"); } catch {}
  Module.FS.writeFile("input.ps", pass1ps);
  
  Module.callMain([
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-dEmbedAllFonts=false",
    "-sOutputFile=final.pdf",
    "input.ps"
  ]);
  const final = Module.FS.readFile("final.pdf", { encoding: "binary" });
  console.log("Pass 3 (pdfwrite on PS):", final.byteLength, "bytes");
  
} catch(e) {
  console.log("FAILED at:", e.message || e.name);
  console.log("Errno:", e.ha);
  try {
    const files = Module.FS.readdir("/").filter(f => !['.','..','tmp','home','dev','proc'].includes(f));
    console.log("MEMFS files:", files);
    files.forEach(f => {
      try {
        const stat = Module.FS.stat(f);
        console.log(`  ${f}: ${stat.size} bytes`);
      } catch {}
    });
  } catch {}
}
