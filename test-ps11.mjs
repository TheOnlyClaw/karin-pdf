import loadWASM from "@okathira/ghostpdl-wasm";
import { readFileSync } from "fs";

const Module = await loadWASM();
const pdfBytes = readFileSync("/root/.hermes/cache/documents/doc_489277700315_תרגולים 15.pdf");

// Step 1: PDF -> PS
Module.FS.writeFile("input.pdf", new Uint8Array(pdfBytes));
Module.callMain(["-dNOPAUSE", "-dBATCH", "-sDEVICE=ps2write", "-sOutputFile=temp.ps", "input.pdf"]);
const ps = Module.FS.readFile("temp.ps", { encoding: "binary" });
try { Module.FS.unlink("input.pdf"); Module.FS.unlink("temp.ps"); } catch {}

// Step 2: try capturing stdout by overriding the tty ops
// In Emscripten, the TTY device's put_char method handles output
// fd 1 maps to the TTY device

// Let's find and override the tty ops
const chunks = [];

// Try patching the internal errno to see what happens
// Actually, let's check what happens if we use a SINGLE pipeline
// by using the PostScript `run` operator within gs

// Or simplest: just use %pipe% to pipe to a process that writes back to MEMFS
// That won't work in WASM.

// Let me try overriding the FS streams directly
// In Emscripten, streams[1] is stdout
if (Module.FS.streams && Module.FS.streams[1]) {
  console.log("Found stdout stream");
  const stdoutStream = Module.FS.streams[1];
  // Try wrapping the write callback
}

// Let me try the absolute simplest approach that would work in browser too
// Try overriding the FS.write handler using lower-level hooks

// Actually, in Emscripten, when Module is created with MODULARIZE,
// we can override how stdout is handled by setting:
// - Module.print (for text stdout)
// - Module.printErr (for stderr)
// But for binary stdout, we need a different approach

// In the compiled gs.js, the TTY output handler is:
// The TTY device in Emscripten writes to stdout via the file descriptor.
// Binary data written to fd 1 goes through the device put_char method.

// Let's find the put_char method for the TTY device
try {
  // Emscripten stores TTY devices in FS.tty.devices
  if (Module.FS.tty && Module.FS.tty.devices) {
    console.log("TTY devices:", Object.keys(Module.FS.tty.devices));
    for (const [key, dev] of Object.entries(Module.FS.tty.devices)) {
      console.log(`  Device ${key}:`, Object.keys(dev));
    }
  }
  
  // Try modifying the FS device for fd 1
  // In Emscripten's internals, the TTY ops are registered in a module-level object
  // Let's search for the actual stream ops
  
  // Check if FD 1 has stream ops we can patch
  const stream = Module.FS.streams?.[1];
  if (stream) {
    console.log("Stream 1 type:", stream.node?.mode);
    console.log("Stream 1 ops:", Object.keys(stream.node?.ops || {}));
    if (stream.node?.ops?.write) {
      const origWrite = stream.node.ops.write;
      stream.node.ops.write = function(stream, buffer, offset, length, position) {
        const chunk = buffer.slice(offset, offset + length);
        chunks.push(Buffer.from(chunk));
        return length;
      };
      console.log("Patched stdout write");
    }
  }
} catch(e) {
  console.log("Patching attempt:", e.message);
}

Module.FS.writeFile("input.ps", ps);

try {
  console.log("\nCalling pdfwrite with %stdout%...");
  Module.callMain([
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-dEmbedAllFonts=false",
    "-sOutputFile=%stdout%",
    "input.ps"
  ]);
  
  console.log("CallMain completed!");
  if (chunks.length > 0) {
    const total = chunks.reduce((a, b) => a + b.length, 0);
    console.log("Captured", chunks.length, "chunks,", total, "bytes");
    if (total > 0) {
      const result = Buffer.concat(chunks);
      console.log("First bytes hex:", result.slice(0, 8).toString("hex"));
      console.log("Is PDF:", result.slice(0, 5).toString() === "%PDF-");
    }
  } else {
    console.log("No data captured");
  }
} catch(e) {
  console.log("FAILED:", e.name, "errno=" + (e.ha || e.message));
}
