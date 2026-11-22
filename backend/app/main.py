
from fastapi import Depends, FastAPI, File, UploadFile
from sqlalchemy.orm import Session

from app.db.dependencies import get_db
from app.ingestion.service import upload_document
from app.schemas.search import SearchRequest
from app.retrieval.search import search_similar_chunks@app.post("/api/search", tags=["Retrieval"])
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


@app.post("/api/documents/upload", status_code=201, tags=["Documents"])
async def upload_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    return await upload_document(file, db)
