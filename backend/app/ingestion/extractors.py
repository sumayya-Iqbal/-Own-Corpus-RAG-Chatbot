
from pathlib import Path

from docx import Document as DocxDocument
from pypdf import PdfReader


def extract_pdf(file_path: str) -> list[dict]:
    """Extract text page by page from a PDF."""
    reader = PdfReader(file_path)
    pages = []

    for page_number, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""

        if text.strip():
            pages.append({
                "page_number": page_number,
                "text": text.strip(),
            })

    return pages


def extract_docx(file_path: str) -> list[dict]:
    """Extract paragraphs from a DOCX document."""
    document = DocxDocument(file_path)
    text = "\n".join(
        paragraph.text.strip()
        for paragraph in document.paragraphs
        if paragraph.text.strip()
    )

    return [{"page_number": None, "text": text}] if text else []


def extract_document(file_path: str, extension: str) -> list[dict]:
    """Choose the appropriate text extractor."""
    extension = extension.lower().lstrip(".")

    if extension == "pdf":
        return extract_pdf(file_path)

    if extension == "docx":
        return extract_docx(file_path)

    raise ValueError(f"Unsupported file format: {extension}")
