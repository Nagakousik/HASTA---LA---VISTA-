/**
 * resumeReader.js: turns an uploaded resume file into plain text, in the browser.
 * Supports PDF, Word (.docx) and text files. Nothing is uploaded anywhere.
 *
 * Needs:  npm install pdfjs-dist@4.10.38 mammoth@1.13.0   (these exact versions are the ones tested)
 * The two libraries are loaded only when someone actually picks a file,
 * so they don't slow down the rest of the app.
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_PDF_PAGES = 6;           // resumes are short; this keeps parsing fast

const clean = (text) =>
  text
    .replace(/\r/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

async function readPdf(file) {
  // The "legacy" build also works on slightly older browsers
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { default: workerUrl } = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (err) {
    if (err?.name === "PasswordException") throw new Error("This PDF is password protected. Remove the password and try again.");
    throw new Error("Couldn't open this PDF. Try another copy, or paste the text instead.");
  }

  let text = "";
  const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join("") + "\n";
  }
  doc.destroy?.();

  if (text.replace(/\s/g, "").length < 30) {
    throw new Error("This PDF has no readable text (it may be a scan or an image). Use a text-based PDF, or paste the text instead.");
  }
  return text;
}

async function readDocx(file) {
  const mod = await import("mammoth/mammoth.browser.js");
  const mammoth = mod.default || mod;
  try {
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    if (!value || value.replace(/\s/g, "").length < 30) throw new Error("empty");
    return value;
  } catch {
    throw new Error("Couldn't read this Word file. Save it as PDF or paste the text instead.");
  }
}

/** Returns the resume text, or throws an Error with a message that is safe to show the user. */
export async function readResumeFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (file.size > MAX_BYTES) throw new Error("That file is too large. Use a file under 5 MB.");

  if (ext === "txt" || ext === "md") return clean(await file.text());
  if (ext === "pdf") return clean(await readPdf(file));
  if (ext === "docx") return clean(await readDocx(file));
  if (ext === "doc") throw new Error("Old .doc files can't be read. Save it as .docx or PDF and try again.");
  throw new Error("That file type isn't supported. Use a PDF, Word (.docx) or .txt file.");
}