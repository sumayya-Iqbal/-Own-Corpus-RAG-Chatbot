
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import DocumentChunk
from app.ingestion.embeddings import get_embedding_model


def search_similar_chunks(
    question: str,
    db: Session,
    top_k: int = 5,
) -> list[dict]:
    """Find the most relevant document chunks using cosine distance."""

    model = get_embedding_model()

    query_embedding = model.encode(
        [f"query: {question}"],
        normalize_embeddings=True,
    )[0].tolist()

    distance = DocumentChunk.embedding.cosine_distance(query_embedding)

    statement = (
        select(DocumentChunk, distance.label("distance"))
        .where(DocumentChunk.embedding.is_not(None))
        .order_by(distance)
        .limit(top_k)
    )

    results = db.execute(statement).all()

    matches = []

    for chunk, similarity_distance in results:
        matches.append({
            "chunk_id": str(chunk.id),
            "document_id": str(chunk.document_id),
            "content": chunk.content,
            "page_number": chunk.page_number,
            "chunk_index": chunk.chunk_index,
            "similarity_score": round(1 - similarity_distance, 4),
        })

    return matches
