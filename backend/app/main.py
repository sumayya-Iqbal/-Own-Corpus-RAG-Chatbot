
import logging
from uuid import UUID

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.dependencies import get_db
from app.db.models import Document, DocumentChunk
from app.ingestion.service import upload_document
from app.schemas.search import SearchRequest
from app.schemas.answer import AnswerRequest
from app.retrieval.search import search_similar_chunks
from app.generation.service import generate_answer


# Configure logging so errors appear in the terminal.
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Production RAG Service",
    description="A document-based question-answering API using RAG.",
    version="0.1.0",
)


@app.get("/", tags=["Home"])
def home():
    return {"message": "Production RAG Service is running!"}


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "Production RAG Service",
    }


# FEATURE 1: Upload documents and extract their text.
@app.post("/api/documents/upload", status_code=201, tags=["Documents"])
async def upload_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    return await upload_document(file, db)


# FEATURE 2: Get details about one uploaded document.
@app.get("/api/documents/{document_id}", tags=["Documents"])
def get_document(
    document_id: UUID,
    db: Session = Depends(get_db),
):
    # Step 1: Find the document using its UUID.
    document = db.get(Document, document_id)

    # Step 2: Return 404 if the document does not exist.
    if document is None:
        raise HTTPException(
            status_code=404,
            detail="Document not found.",
        )

    # Step 3: Count its chunks directly in the database.
    # This avoids loading every chunk and embedding into memory.
    chunks_count = db.scalar(
        select(func.count(DocumentChunk.id)).where(
            DocumentChunk.document_id == document_id
        )
    )

    # Step 4: Return useful document information.
    return {
        "id": str(document.id),
        "filename": document.filename,
        "status": document.status,
        "created_at": document.created_at,
        "chunks_count": chunks_count,
    }


# FEATURE 3: Delete a document and its associated chunks.
@app.delete("/api/documents/{document_id}", tags=["Documents"])
def delete_document(
    document_id: UUID,
    db: Session = Depends(get_db),
):
    # Step 1: Check whether the document exists.
    document = db.get(Document, document_id)

    if document is None:
        raise HTTPException(
            status_code=404,
            detail="Document not found.",
        )

    try:
        # Step 2: Delete the document.
        # The SQLAlchemy relationship cascade deletes its chunks too.
        db.delete(document)

        # Step 3: Save the deletion in the database.
        db.commit()

        return {
            "message": "Document and its associated chunks deleted successfully.",
            "document_id": str(document_id),
        }

    except Exception:
        # Undo the transaction if deletion fails.
        db.rollback()

        logger.exception("Document deletion failed")

        raise HTTPException(
            status_code=500,
            detail="Document deletion failed. Please try again.",
        )


# FEATURE 4: Search document chunks using semantic similarity.
@app.post("/api/search", tags=["Retrieval"])
def search_documents(
    request: SearchRequest,
    db: Session = Depends(get_db),
):
    results = search_similar_chunks(
        question=request.question,
        db=db,
        top_k=request.top_k,
    )

    return {
        "question": request.question,
        "results_count": len(results),
        "results": results,
    }


# FEATURE 5: Retrieve document chunks and generate an answer with Gemini.
@app.post("/api/ask", tags=["Generation"])
def ask_documents(
    request: AnswerRequest,
    db: Session = Depends(get_db),
):
    # Step 1: Retrieve relevant document chunks from Neon.
    retrieved_chunks = search_similar_chunks(
        question=request.question,
        db=db,
        top_k=request.top_k,
    )

    try:
        # Step 2: Send the retrieved context to Gemini.
        result = generate_answer(
            question=request.question,
            retrieved_chunks=retrieved_chunks,
        )

    except Exception:
        # Log the actual error in the backend terminal.
        logger.exception("Gemini answer generation failed")

        # Return a safe message without exposing internal details.
        raise HTTPException(
            status_code=503,
            detail="Answer generation is temporarily unavailable. Please try again.",
        )

    # Step 3: Return the generated answer and its source citations.
    return {
        "question": request.question,
        "retrieved_chunks": len(retrieved_chunks),
        "answer": result["answer"],
        "citations": result["citations"],
        "refused": result["refused"],
    }
