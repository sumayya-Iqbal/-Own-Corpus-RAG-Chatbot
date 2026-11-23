
import logging

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.dependencies import get_db
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


# FEATURE 2: Search document chunks using semantic similarity.
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


# FEATURE 3: Retrieve document chunks and generate an answer with Gemini.
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
