import loadWASM from "@okathira/ghostpdl-wasm";
import { readFileSync } from "fs";

const pdfBytes = readFileSync("/root/.hermes/cache/documents/doc_489277700315_תרגולים 15.pdf");
console.log("Original:", pdfBytes.length, "bytes");

async function test(tier, keepFonts) {
  const Module = await loadWASM();
  
  Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));
  Module.callMain(["-dNOPAUSE", "-dBATCH", "-sDEVICE=pdfwrite", "-sOutputFile=pass1.pdf", "input.pdf"]);
  const p1 = Module.FS.readFile("pass1.pdf", { encoding: "binary" });
  
  try { Module.FS.unlink("input.pdf"); } catch {}
  Module.FS.writeFile("pass1.pdf", p1);
  Module.callMain(["-dNOPAUSE", "-dBATCH", "-sDEVICE=ps2write", "-sOutputFile=temp.ps", "pass1.pdf"]);
  const ps = Module.FS.readFile("temp.ps", { encoding: "binary" });
  
  try { Module.FS.unlink("pass1.pdf"); Module.FS.unlink("temp.ps"); } catch {}
  Module.FS.writeFile("temp.ps", ps);
  
  const args = ["-dNOPAUSE", "-dBATCH", "-sDEVICE=pdfwrite"];
  if (tier) args.push(`-dPDFSETTINGS=${tier}`);
  if (!keepFonts) args.push("-dEmbedAllFonts=false", "-dSubsetFonts=false");
  args.push("-sOutputFile=output.pdf", "temp.ps");
  
  Module.callMain(args);
  const out = Module.FS.readFile("output.pdf", { encoding: "binary" });
  console.log(`${tier || "none"} ${keepFonts ? "w/fonts" : "no-fonts"}: ${out.byteLength} bytes`);
}

// Test one config at a time - fresh module per test
await test("/ebook", true);    // ebook WITH fonts
