
def chunk_text(
    text: str,
    tokenizer,
    chunk_size: int = 400,
    overlap: int = 50,
) -> list[str]:
    """Split text into overlapping chunks using the model tokenizer."""

    if chunk_size <= overlap:
        raise ValueError("chunk_size must be greater than overlap")

    token_ids = tokenizer.encode(
        text,
        add_special_tokens=False,
    )

    chunks = []
    start = 0

    while start < len(token_ids):
        end = min(start + chunk_size, len(token_ids))

        chunk = tokenizer.decode(
            token_ids[start:end],
            skip_special_tokens=True,
        ).strip()

        if chunk:
            chunks.append(chunk)

        if end == len(token_ids):
            break

        start = end - overlap

    return chunks
