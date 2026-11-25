
"""
API tests for the Production RAG Service.

These tests use a fake database and mocked AI services.
They do not connect to Neon or call Gemini.
"""

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import main
from app.db.dependencies import get_db


# A fixed UUID makes our tests predictable.
DOCUMENT_ID = UUID("43e7b8b1-38fb-47aa-948b-eefe4234b60d")


class FakeDatabase:
    """A small fake database used instead of the real Neon database."""

    def __init__(self):
        self.document = SimpleNamespace(
            id=DOCUMENT_ID,
            filename="test_document.pdf",
            status="indexed",
            created_at=datetime.now(timezone.utc),
        )

        self.deleted_document = None
        self.committed = False
        self.rolled_back = False

    def get(self, model, document_id):
        """Simulate finding a document by its ID."""
        if document_id == DOCUMENT_ID:
            return self.document
        return None

    def scalar(self, query):
        """Simulate counting the document's chunks."""
        return 3

    def delete(self, document):
        self.deleted_document = document

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


@pytest.fixture
def fake_db():
    return FakeDatabase()


@pytest.fixture
def client(fake_db):
    """Create a test client with the real database replaced."""

    def override_get_db():
        yield fake_db

    main.app.dependency_overrides[get_db] = override_get_db

    with TestClient(main.app) as test_client:
        yield test_client

    # Remove the override after each test.
    main.app.dependency_overrides.clear()


# --------------------------------------------------
# 1. Home and health endpoints
# --------------------------------------------------

def test_home_endpoint(client):
    response = client.get("/")

    assert response.status_code == 200
    assert response.json()["message"] == (
        "Production RAG Service is running!"
    )


def test_health_endpoint(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


# --------------------------------------------------
# 2. Document detail endpoint
# --------------------------------------------------

def test_get_document_success(client):
    response = client.get(f"/api/documents/{DOCUMENT_ID}")

    assert response.status_code == 200

    data = response.json()

    assert data["id"] == str(DOCUMENT_ID)
    assert data["filename"] == "test_document.pdf"
    assert data["status"] == "indexed"
    assert data["chunks_count"] == 3


def test_get_document_not_found(client, fake_db):
    fake_db.document = None

    response = client.get(f"/api/documents/{DOCUMENT_ID}")

    assert response.status_code == 404
    assert response.json()["detail"] == "Document not found."


# --------------------------------------------------
# 3. Document deletion endpoint
# --------------------------------------------------

def test_delete_document_success(client, fake_db):
    response = client.delete(f"/api/documents/{DOCUMENT_ID}")

    assert response.status_code == 200
    assert response.json()["document_id"] == str(DOCUMENT_ID)
    assert fake_db.deleted_document is not None
    assert fake_db.committed is True


def test_delete_document_not_found(client, fake_db):
    fake_db.document = None

    response = client.delete(f"/api/documents/{DOCUMENT_ID}")

    assert response.status_code == 404
    assert response.json()["detail"] == "Document not found."


# --------------------------------------------------
# 4. Semantic search endpoint
# --------------------------------------------------

def test_search_documents_success(client, monkeypatch):
    expected_results = [
        {
            "content": "Employees receive annual leave.",
            "filename": "employee_handbook.pdf",
        }
    ]

    def fake_search(question, db, top_k):
        assert question == "What is annual leave?"
        assert top_k == 5
        return expected_results

    monkeypatch.setattr(
        main,
        "search_similar_chunks",
        fake_search,
    )

    response = client.post(
        "/api/search",
        json={"question": "What is annual leave?"},
    )

    assert response.status_code == 200
    assert response.json()["results_count"] == 1
    assert response.json()["results"] == expected_results


def test_search_rejects_short_question(client):
    response = client.post(
        "/api/search",
        json={"question": "Hi"},
    )

    assert response.status_code == 422


# --------------------------------------------------
# 5. RAG answer generation endpoint
# --------------------------------------------------

def test_ask_documents_success(client, monkeypatch):
    retrieved_chunks = [
        {
            "content": "Employees receive 20 annual leave days.",
            "filename": "employee_handbook.pdf",
        }
    ]

    expected_answer = {
        "answer": "Employees receive 20 annual leave days.",
        "citations": ["employee_handbook.pdf"],
        "refused": False,
    }

    def fake_search(question, db, top_k):
        return retrieved_chunks

    def fake_generate(question, retrieved_chunks):
        return expected_answer

    monkeypatch.setattr(
        main,
        "search_similar_chunks",
        fake_search,
    )

    monkeypatch.setattr(
        main,
        "generate_answer",
        fake_generate,
    )

    response = client.post(
        "/api/ask",
        json={"question": "How many annual leave days are provided?"},
    )

    assert response.status_code == 200

    data = response.json()

    assert data["answer"] == expected_answer["answer"]
    assert data["citations"] == expected_answer["citations"]
    assert data["refused"] is False
    assert data["retrieved_chunks"] == 1


def test_ask_handles_generation_failure(client, monkeypatch):
    def fake_search(question, db, top_k):
        return []

    def fake_generate(question, retrieved_chunks):
        raise RuntimeError("Simulated Gemini failure")

    monkeypatch.setattr(
        main,
        "search_similar_chunks",
        fake_search,
    )

    monkeypatch.setattr(
        main,
        "generate_answer",
        fake_generate,
    )

    response = client.post(
        "/api/ask",
        json={"question": "What is the company leave policy?"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Answer generation is temporarily unavailable. Please try again."
    )


# --------------------------------------------------
# 6. Document upload endpoint
# --------------------------------------------------

def test_upload_document_success(client, monkeypatch):
    async def fake_upload(file, db):
        return {
            "message": "Document uploaded and indexed successfully.",
            "filename": file.filename,
        }

    monkeypatch.setattr(
        main,
        "upload_document",
        fake_upload,
    )

    response = client.post(
        "/api/documents/upload",
        files={
            "file": (
                "test.pdf",
                b"Fake PDF content",
                "application/pdf",
            )
        },
    )

    assert response.status_code == 201
    assert response.json()["filename"] == "test.pdf"
