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

// Now try printing what's in /tmp
Module.FS.writeFile("input.ps", ps);

// Check MEMFS /tmp dir
try {
  const tmpContents = Module.FS.readdir("/tmp");
  console.log("MEMFS /tmp contents:", tmpContents);
} catch(e) {
  console.log("Can't read /tmp:", e.message);
}

// Try pdfwrite with %stdout
try {
  // Capture stdout
  let stdoutData = [];
  Module.print = (t) => stdoutData.push(t);
  
  Module.callMain([
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-dEmbedAllFonts=false",
    "-sOutputFile=%stdout%",
    "input.ps"
  ]);
  
  // If we got here, GS succeeded and output went to stdout
  // But stdout is text-only, so binary data might be corrupted
  console.log("Stdout approach completed, captured", stdoutData.length, "lines");
  if (stdoutData.length > 0) {
    console.log("First line:", stdoutData[0].substring(0, 100));
  }
} catch(e) {
  console.log("FAILED:", e.name, "errno=" + (e.ha || e.message));
}

// Alternative: try pdfwrite without any temp dir usage
try {
  console.log("\nTrying: with -dUseCIEColor (may help on WASM)...");
  try { Module.FS.unlink("input.ps"); } catch {}
  Module.FS.writeFile("input.ps", ps);
  
  Module.callMain([
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dUseCIEColor",
    "-dPDFSETTINGS=/screen", 
    "-sOutputFile=out.pdf",
    "input.ps"
  ]);
  const out = Module.FS.readFile("out.pdf", { encoding: "binary" });
  console.log("SUCCESS:", out.byteLength, "bytes");
} catch(e) {
  console.log("FAILED:", e.name, "errno=" + (e.ha || e.message));
}

// Try with -dSAFER -dNOGC
try {
  console.log("\nTrying: SAFER + NOGC...");
  try { Module.FS.unlink("input.ps"); Module.FS.unlink("out.pdf"); } catch {}
  Module.FS.writeFile("input.ps", ps);
  
  Module.callMain([
    "-dSAFER", "-dNOGC",
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-sOutputFile=out.pdf",
    "input.ps"
  ]);
  const out = Module.FS.readFile("out.pdf", { encoding: "binary" });
  console.log("SUCCESS:", out.byteLength, "bytes");
} catch(e) {
  console.log("FAILED:", e.name, "errno=" + (e.ha || e.message));
}
