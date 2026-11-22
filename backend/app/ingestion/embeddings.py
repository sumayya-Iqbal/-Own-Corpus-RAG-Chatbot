
from functools import lru_cache

from sentence_transformers import SentenceTransformer


MODEL_NAME = "intfloat/multilingual-e5-small"


@lru_cache(maxsize=1)
def get_embedding_model():
    """Load the embedding model once and reuse it."""
    return SentenceTransformer(MODEL_NAME)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate normalized passage embeddings."""
    if not texts:
        return []

    model = get_embedding_model()

    prepared_texts = [
        f"passage: {text}" for text in texts
    ]

    embeddings = model.encode(
        prepared_texts,
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    return embeddings.tolist()
