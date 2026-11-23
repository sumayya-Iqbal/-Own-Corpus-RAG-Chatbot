
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Document, DocumentChunk
from app.ingestion.embeddings import get_embedding_model


def search_similar_chunks(
    question: str,
    db: Session,
    top_k: int = 5,
) -> list[dict]:
    """
    Find relevant document chunks using vector cosine similarity.

    Also return the original document filename so generated answers
    can provide meaningful source citations.
    """

    # Load the same embedding model used during document indexing.
    model = get_embedding_model()

    # E5 requires the query: prefix for questions.
    query_embedding = model.encode(
        [f"query: {question}"],
        normalize_embeddings=True,
    )[0].tolist()

    # Calculate cosine distance between the question and stored chunks.
    distance = DocumentChunk.embedding.cosine_distance(query_embedding)

    # Join documents so we can retrieve the original filename.
    statement = (
        select(
            DocumentChunk,
            Document.filename,
            distance.label("distance"),
        )
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(DocumentChunk.embedding.is_not(None))
        .order_by(distance)
        .limit(top_k)
    )

    results = db.execute(statement).all()

    matches = []

    for chunk, filename, similarity_distance in results:
        matches.append({
            "chunk_id": str(chunk.id),
            "document_id": str(chunk.document_id),
            "filename": filename,
            "content": chunk.content,
            "page_number": chunk.page_number,
            "chunk_index": chunk.chunk_index,
            "similarity_score": round(1 - similarity_distance, 4),
        })

    return matches
