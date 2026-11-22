
import hashlib
import os
import tempfile

from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Document, DocumentChunk
from app.ingestion.extractors import extract_document
from app.ingestion.chunking import chunk_text
from app.ingestion.embeddings import embed_texts, get_embedding_model


ALLOWED_EXTENSIONS = {".pdf", ".docx"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


async def upload_document(file: UploadFile, db: Session):
    filename = os.path.basename(file.filename or "")
    extension = os.path.splitext(filename)[1].lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail="Only PDF and DOCX files are supported currently.",
        )

    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File size exceeds 10 MB.")

    file_hash = hashlib.sha256(content).hexdigest()

    existing = db.scalar(
        select(Document).where(Document.file_hash == file_hash)
    )

    if existing:
        raise HTTPException(
            status_code=409,
            detail="This document has already been uploaded.",
        )

    temporary_path = None

    try:
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=extension,
        ) as temporary_file:
            temporary_file.write(content)
            temporary_path = temporary_file.name

        pages = extract_document(temporary_path, extension)

        if not pages:
            raise HTTPException(
                status_code=422,
                detail="No readable text was found in this document.",
            )

        # Split extracted text into overlapping chunks.
        model = get_embedding_model()
        all_chunks = []

        for page in pages:
            page_chunks = chunk_text(
                page["text"],
                tokenizer=model.tokenizer,
                chunk_size=400,
                overlap=50,
            )

            for chunk in page_chunks:
                all_chunks.append({
                    "content": chunk,
                    "page_number": page["page_number"],
                })

        if not all_chunks:
            raise HTTPException(
                status_code=422,
                detail="No text chunks could be generated.",
            )

        # Generate one 384-dimensional vector per chunk.
        vectors = embed_texts([
            chunk["content"] for chunk in all_chunks
        ])

        document = Document(
            filename=filename,
            file_hash=file_hash,
            status="indexed",
        )

        db.add(document)
        db.flush()

        for index, (chunk, vector) in enumerate(zip(all_chunks, vectors)):
            db.add(
                DocumentChunk(
                    document_id=document.id,
                    content=chunk["content"],
                    chunk_index=index,
                    page_number=chunk["page_number"],
                    embedding=vector,
                )
            )

        db.commit()
        db.refresh(document)

        return {
            "message": "Document uploaded, chunked and indexed successfully.",
            "document_id": str(document.id),
            "filename": document.filename,
            "pages_extracted": len(pages),
            "chunks_created": len(all_chunks),
            "embedding_dimensions": len(vectors[0]),
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Document processing failed. Check the backend terminal logs.",
        )

    finally:
        if temporary_path and os.path.exists(temporary_path):
            os.remove(temporary_path)
