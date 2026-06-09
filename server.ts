import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import mammoth from "mammoth";
import TurndownService from "turndown";

// Since some libraries do not have official ESM declarations, we declare them or load them via createRequire
import { createRequire } from "module";
const require = createRequire(import.meta.url);

import { extractText } from "unpdf";
import * as WordExtractorModule from "word-extractor";

let WordExtractor: any;
try {
  WordExtractor = require("word-extractor");
  if (WordExtractor && typeof WordExtractor !== "function") {
    WordExtractor = WordExtractor.default || WordExtractor;
  }
} catch (e) {
  WordExtractor = (WordExtractorModule as any).default || WordExtractorModule;
}

const app = express();
const PORT = 3000;

// Set up Multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max limit
  }
});

// Configure Turndown for clean Markdown conversion
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  strongDelimiter: "**",
  bullet: "-"
} as any);

// Clean up text extracted from PDF
function cleanPdfText(text: string): string {
  if (!text) return "";
  
  // Split into lines
  const lines = text.split("\n");
  const cleanedLines: string[] = [];
  let currentParagraph = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line === "") {
      if (currentParagraph) {
        cleanedLines.push(currentParagraph);
        currentParagraph = "";
      }
      cleanedLines.push(""); // Preserve visual paragraph separation
    } else {
      // If the line looks like a header (short, starting with uppercase) or a list item
      const isHeader = line.length < 80 && /^[A-Z0-9][A-Z0-9\s\-_.,:;()'"¡!¿?]+$/.test(line);
      const isListItem = /^[•\-*+]\s/.test(line) || /^\d+\.\s/.test(line);

      if (isHeader || isListItem) {
        if (currentParagraph) {
          cleanedLines.push(currentParagraph);
          currentParagraph = "";
        }
        if (isHeader) {
          cleanedLines.push(`## ${line}`);
        } else {
          cleanedLines.push(line);
        }
      } else {
        // Append to current paragraph
        if (currentParagraph) {
          currentParagraph += " " + line;
        } else {
          currentParagraph = line;
        }
      }
    }
  }

  if (currentParagraph) {
    cleanedLines.push(currentParagraph);
  }

  // Filter out excessive blank lines (more than 2 consecutive)
  let resultText = "";
  let blankCount = 0;
  for (const line of cleanedLines) {
    if (line === "") {
      blankCount++;
      if (blankCount <= 2) {
        resultText += "\n";
      }
    } else {
      blankCount = 0;
      resultText += line + "\n";
    }
  }

  return resultText.trim();
}

// Clean up text extracted from .doc Word Document
function cleanDocText(text: string): string {
  if (!text) return "";

  // Normalize line endings and trim spaces
  const lines = text.split(/\r?\n/);
  const cleanedLines: string[] = [];
  let currentParagraph = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "") {
      if (currentParagraph) {
        cleanedLines.push(currentParagraph);
        currentParagraph = "";
      }
      cleanedLines.push("");
    } else {
      // Basic header detection (short lines that are in uppercase or stand alone)
      const isHeader = line.length < 60 && /^[A-Z0-9][A-Z0-9\s\-_.,:;()'"¡!¿?]+$/.test(line);
      const isListItem = /^[•\-*+]\s/.test(line) || /^\d+\.\s/.test(line);

      if (isHeader || isListItem) {
        if (currentParagraph) {
          cleanedLines.push(currentParagraph);
          currentParagraph = "";
        }
        if (isHeader) {
          cleanedLines.push(`## ${line}`);
        } else {
          cleanedLines.push(line);
        }
      } else {
        if (currentParagraph) {
          // If the previous line looks like it belongs to the same flow or can be concatenated
          currentParagraph += " " + line;
        } else {
          currentParagraph = line;
        }
      }
    }
  }

  if (currentParagraph) {
    cleanedLines.push(currentParagraph);
  }

  return cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function startServer() {
  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Main Conversion API Endpoint
  app.post("/api/convert", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No se ha subido ningún archivo" });
        return;
      }

      const originalName = req.file.originalname;
      const extension = path.extname(originalName).toLowerCase();
      const buffer = req.file.buffer;

      let markdownContent = "";

      if (extension === ".docx") {
        // Use Mammoth to convert .docx to clean HTML
        const result = await mammoth.convertToHtml({ buffer });
        let html = result.value;
        
        // Convert to markdown using Turndown
        markdownContent = turndownService.turndown(html);
        
        // Include conversion comments or metadata headers if available
        if (result.messages && result.messages.length > 0) {
          console.log("Mammoth warnings:", result.messages);
        }
      } 
      else if (extension === ".pdf") {
        // Use unpdf for extremely robust, modern PDF text extraction
        // Node's Buffer needs to be cast/converted to a Uint8Array for unpdf / pdf.js
        const uint8Array = new Uint8Array(buffer);
        const pdfData = await extractText(uint8Array, { mergePages: true });
        markdownContent = cleanPdfText(pdfData.text || "");
      } 
      else if (extension === ".doc") {
        // Write buffer to a temp file because WordExtractor works with files
        const tempFilePath = path.join(
          os.tmpdir(),
          `convert_${Date.now()}_${Math.random().toString(36).substring(7)}${extension}`
        );
        
        await fs.promises.writeFile(tempFilePath, buffer);

        try {
          const extractor = new WordExtractor();
          const doc = await extractor.extract(tempFilePath);
          const rawText = doc.getBody();
          markdownContent = cleanDocText(rawText);
        } finally {
          // Ensure file is deleted to keep server clean
          try {
            await fs.promises.unlink(tempFilePath);
          } catch (unlinkError) {
            console.error("No se pudo eliminar el archivo temporal:", unlinkError);
          }
        }
      } 
      else {
        res.status(400).json({ 
          error: `Formato de archivo no soportado: ${extension}. Solo se aceptan .doc, .docx y .pdf` 
        });
        return;
      }

      // Safeguard against empty conversions
      if (!markdownContent.trim()) {
        markdownContent = `# ${originalName.replace(/\.[^./]+$/, "")}\n\n[El archivo convertido no contiene texto extraíble]`;
      }

      // Generate markdown file name
      const mdFilename = originalName.replace(/\.[^./]+$/, "") + ".md";

      res.json({
        success: true,
        filename: mdFilename,
        content: markdownContent,
      });

    } catch (error: any) {
      console.error("Error en la conversión del archivo:", error);
      res.status(500).json({ 
        error: `Error interno de conversión: ${error.message || "Error desconocido"}` 
      });
    }
  });

  // Vite integration middleware (Dev vs Prod setups)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("No se pudo iniciar el servidor:", err);
});
