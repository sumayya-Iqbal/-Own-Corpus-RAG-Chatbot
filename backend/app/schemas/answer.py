
from pydantic import BaseModel, Field


class AnswerRequest(BaseModel):
    # The question the user wants answered from uploaded documents.
    question: str = Field(
        min_length=3,
        max_length=1000,
        description="Question to answer using the uploaded documents.",
    )

    # Number of relevant document chunks to retrieve before generating an answer.
    top_k: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Number of document chunks to retrieve.",
    )
