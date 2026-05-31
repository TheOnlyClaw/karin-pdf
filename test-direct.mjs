import loadWASM from "@okathira/ghostpdl-wasm";
import { readFileSync } from "fs";

const Module = await loadWASM();
const pdfBytes = readFileSync("/root/.hermes/cache/documents/doc_489277700315_תרגולים 15.pdf");

// Try with PostScript commands injected via -c to strip fonts
// This uses a single pass: read PDF, apply filter via PostScript, output via pdfwrite
Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));

try {
  Module.callMain([
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-dCompressPages=true",
    "-dOptimize=true",
    "-dColorConversionStrategy=/sRGB",
    "-dDownsampleColorImages=true",
    "-dColorImageResolution=72",
    "-dDownsampleGrayImages=true", 
    "-dGrayImageResolution=72",
    "-dAutoFilterColorImages=false",
    "-dAutoFilterGrayImages=false",
    "-dColorImageFilter=/FlateEncode",
    "-dGrayImageFilter=/FlateEncode",
    "-sOutputFile=out.pdf",
    "-c",
    "<< /NeverEmbed [ /Courier /Courier-Bold /Courier-Oblique /Helvetica /Helvetica-Bold /Helvetica-Oblique /Times-Roman /Times-Bold /Times-Italic /Symbol /ZapfDingbats ] /PreserveOverprintSettings false /PreserveEPSInfo false /PreserveOPIComments false >> setdistillerparams",
    "-f",
    "input.pdf"
  ]);
  const out = Module.FS.readFile("out.pdf", { encoding: "binary" });
  console.log("SUCCESS:", out.byteLength, "bytes");
} catch(e) {
  console.log("FAILED:", e.name, "errno=" + (e.ha || e.message));
}

// Also try: simplest possible pdfwrite  
try {
  Module.FS.unlink("out.pdf"); Module.FS.unlink("input.pdf");
} catch {}
Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));
try {
  Module.callMain(["-dNOPAUSE", "-dBATCH", "-sDEVICE=pdfwrite", "-sOutputFile=out.pdf", "input.pdf"]);
  const out = Module.FS.readFile("out.pdf", { encoding: "binary" });
  console.log("Bare pdfwrite:", out.byteLength, "bytes");
} catch(e) {
  console.log("Bare pdfwrite FAILED:", e.name, "errno=" + (e.ha || e.message));
}
