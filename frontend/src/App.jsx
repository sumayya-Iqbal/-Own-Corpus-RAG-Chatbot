
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import "./App.css";

// ==========================================
// CONFIGURATION
// ==========================================

// FastAPI backend address.
const API_URL = "http://127.0.0.1:8000";

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Clean escaped Markdown characters before rendering.
function normalizeMarkdown(content = "") {
  return String(content).replace(/\\([*_`])/g, "$1");
}

// Safely read JSON responses from the backend.
async function readApiResponse(response) {
  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("The backend returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(
      data.detail || data.message || "Something went wrong."
    );
  }

  return data;
}

// Detect the document file type.
function getFileType(filename = "") {
  const extension = filename.split(".").pop().toLowerCase();

  if (extension === "pdf") return "PDF";
  if (extension === "docx") return "DOC";

  return extension.toUpperCase() || "FILE";
}

// Group citations by filename and collect unique page numbers.
function groupCitations(citations = []) {
  const grouped = {};

  citations.forEach((citation) => {
    const filename = citation.filename || "Source document";

    if (!grouped[filename]) {
      grouped[filename] = {
        filename,
        pages: [],
      };
    }

    if (
      citation.page_number !== null &&
      citation.page_number !== undefined &&
      !grouped[filename].pages.includes(citation.page_number)
    ) {
      grouped[filename].pages.push(citation.page_number);
    }
  });

  return Object.values(grouped);
}

// Format similarity score as a percentage.
function formatSimilarityScore(score) {
  const numericScore = Number(score);

  if (!Number.isFinite(numericScore)) {
    return "Unavailable";
  }

  return `${(numericScore * 100).toFixed(2)}%`;
}

// ==========================================
// SIDEBAR NAVIGATION COMPONENT
// ==========================================

function NavigationItem({ icon, label, active, onClick }) {
  return (
    <button
      className={`nav-item ${active ? "active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>

      {active && <span className="nav-active-indicator" />}
    </button>
  );
}

// ==========================================
// DOCUMENT UPLOAD COMPONENT
// ==========================================

function UploadPanel({
  file,
  setFile,
  uploading,
  uploadMessage,
  handleUpload,
}) {
  const fileInputRef = useRef(null);

  // Validate the selected file.
  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) return;

    const validExtension = /\.(pdf|docx)$/i.test(selectedFile.name);

    if (!validExtension) {
      setFile(null);
      event.target.value = "";
      return;
    }

    setFile(selectedFile);
  }

  // Handle drag-and-drop file selection.
  function handleDrop(event) {
    event.preventDefault();

    const droppedFile = event.dataTransfer.files?.[0];

    if (!droppedFile) return;

    const validExtension = /\.(pdf|docx)$/i.test(droppedFile.name);

    if (validExtension) {
      setFile(droppedFile);
    }
  }

  return (
    <section className="panel upload-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">KNOWLEDGE BASE</span>
          <h2 className="panel-title">Upload documents</h2>

          <p className="panel-description">
            Add company documents to your AI knowledge base.
          </p>
        </div>

        <div className="panel-icon upload-panel-icon">↥</div>
      </div>

      <form onSubmit={handleUpload}>
        <label
          className="drop-zone"
          htmlFor="document-file"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="drop-zone-icon">↑</div>

          <h3>{file ? file.name : "Drop your document here"}</h3>

          <p>
            {file
              ? "Your document is ready to upload."
              : "Or click below to browse your files"}
          </p>

          <span className="file-format-label">
            PDF and DOCX supported
          </span>

          <input
            ref={fileInputRef}
            id="document-file"
            className="hidden-file-input"
            type="file"
            accept=".pdf,.docx"
            onChange={handleFileChange}
          />
        </label>

        <div className="upload-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            Browse files
          </button>

          <button
            type="submit"
            className="button button-primary"
            disabled={!file || uploading}
          >
            {uploading ? (
              <>
                <span className="button-spinner" />
                Processing...
              </>
            ) : (
              <>
                <span>↑</span>
                Upload document
              </>
            )}
          </button>
        </div>
      </form>

      {uploadMessage && (
        <div
          className={
            uploadMessage.type === "success"
              ? "feedback-message success-message"
              : "feedback-message error-message"
          }
          role="status"
        >
          <span>
            {uploadMessage.type === "success" ? "✓" : "!"}
          </span>

          {uploadMessage.text}
        </div>
      )}

      <div className="upload-security-note">
        <span>♧</span>
        Documents are processed and indexed for knowledge retrieval.
      </div>
    </section>
  );
}

// ==========================================
// DOCUMENT ITEM COMPONENT
// ==========================================

function DocumentItem({ document }) {
  const fileType = getFileType(document.filename);

  const uploadDate = document.created_at
    ? new Date(document.created_at).toLocaleString()
    : "Date unavailable";

  return (
    <div className="document-item">
      <div
        className={`document-file-icon ${
          fileType === "PDF" ? "pdf-icon" : "docx-icon"
        }`}
      >
        {fileType}
      </div>

      <div className="document-info">
        <strong>{document.filename}</strong>
        <span>Added {uploadDate}</span>
      </div>

      <span className="document-status">
        <span className="status-dot" />
        {document.status || "Indexed"}
      </span>
    </div>
  );
}

// ==========================================
// RETRIEVED CHUNKS COMPONENT
// ==========================================

// Display the actual chunks returned by the retrieval system.
// This component is rendered in the separate right-side panel.
function RetrievedChunks({ chunks = [] }) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return (
      <section className="retrieved-chunks">
        <div className="retrieved-chunks-heading">
          <div>
            <strong>Retrieved chunks</strong>
            <span>0 chunks fetched</span>
          </div>
        </div>

        <p className="retrieved-chunks-empty">
          No chunks were returned by the retrieval system.
        </p>
      </section>
    );
  }

  return (
    <section className="retrieved-chunks">
      <div className="retrieved-chunks-heading">
        <div>
          <strong>Retrieved chunks</strong>

          <span>
            {chunks.length}{" "}
            {chunks.length === 1 ? "chunk" : "chunks"} fetched from your
            knowledge base. Similarity indicates semantic relevance,
            not answer accuracy.
          </span>
        </div>
      </div>

      <div className="retrieved-chunks-list">
        {chunks.map((chunk, index) => (
          <details
            className="retrieved-chunk-item"
            key={
              chunk.chunk_id ||
              `${chunk.document_id || "document"}-${
                chunk.chunk_index ?? index
              }`
            }
            open={index === 0}
          >
            <summary className="retrieved-chunk-summary">
              <div className="retrieved-chunk-top">
                <strong>Chunk {index + 1}</strong>

                <span className="similarity-score">
                  Similarity:{" "}
                  {formatSimilarityScore(chunk.similarity_score)}
                </span>
              </div>

              <div className="retrieved-chunk-metadata">
                <span>
                  📄 {chunk.filename || "Unknown document"}
                </span>

                <span>
                  Page: {chunk.page_number ?? "Unavailable"}
                </span>

                <span>
                  Position: {chunk.chunk_index ?? "N/A"}
                </span>
              </div>
            </summary>

            <div className="retrieved-chunk-content">
              <ReactMarkdown>
                {normalizeMarkdown(
                  chunk.content || "No chunk text available."
                )}
              </ReactMarkdown>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

// ==========================================
// MAIN APPLICATION
// ==========================================

export default function App() {
  // ========================================
  // APPLICATION STATES
  // ========================================

  const [activePage, setActivePage] = useState("overview");

  // Document upload states.
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);

  // Chat states.
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [messages, setMessages] = useState([]);

  // Documents retrieved from the backend.
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState("");

  // Empty string means search across all indexed documents.
  const [selectedDocumentId, setSelectedDocumentId] = useState("");

  // Reference used to scroll to the latest chat message.
  const chatEndRef = useRef(null);

  // ========================================
  // FETCH DOCUMENTS
  // ========================================

  const fetchDocuments = useCallback(async () => {
    setDocumentsLoading(true);
    setDocumentsError("");

    try {
      const response = await fetch(`${API_URL}/api/documents`);
      const data = await readApiResponse(response);

      const loadedDocuments = Array.isArray(data.documents)
        ? data.documents
        : [];

      setDocuments(loadedDocuments);

      // Clear selection if its document no longer exists.
      setSelectedDocumentId((currentId) => {
        if (
          currentId &&
          !loadedDocuments.some(
            (document) => document.id === currentId
          )
        ) {
          return "";
        }

        return currentId;
      });
    } catch (error) {
      setDocumentsError(
        error.message || "Unable to connect to the backend."
      );
    } finally {
      setDocumentsLoading(false);
    }
  }, []);

  // Load documents when the application first opens.
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // ========================================
  // AUTO-SCROLL CHAT
  // ========================================

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, asking]);

  // ========================================
  // UPLOAD DOCUMENT
  // ========================================

  async function handleUpload(event) {
    event.preventDefault();

    if (!file || uploading) return;

    setUploading(true);
    setUploadMessage(null);

    try {
      const formData = new FormData();

      // Backend expects the multipart field name "file".
      formData.append("file", file);

      const response = await fetch(
        `${API_URL}/api/documents/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await readApiResponse(response);

      const documentName = data.filename || file.name;

      // Refresh the document list after successful upload.
      await fetchDocuments();

      setUploadMessage({
        type: "success",
        text: `${documentName} uploaded successfully. ${
          data.chunks !== undefined
            ? `${data.chunks} chunks created and indexed.`
            : "Document processed successfully."
        }`,
      });

      setFile(null);

      // Reset the HTML file input.
      const input = document.getElementById("document-file");

      if (input) {
        input.value = "";
      }
    } catch (error) {
      setUploadMessage({
        type: "error",
        text: error.message || "Unable to connect to the backend.",
      });
    } finally {
      setUploading(false);
    }
  }

  // ========================================
  // ASK QUESTION
  // ========================================

  async function handleAsk(event) {
    event.preventDefault();

    const userQuestion = question.trim();

    if (!userQuestion || asking) return;

    // Add the user's question to the conversation.
    const userMessage = {
      id: Date.now(),
      role: "user",
      content: userQuestion,
    };

    setMessages((previous) => [...previous, userMessage]);

    setQuestion("");
    setAsking(true);

    try {
      const response = await fetch(`${API_URL}/api/ask`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          question: userQuestion,
          top_k: 10,

          // Send the selected document UUID.
          // null means search across all documents.
          document_id: selectedDocumentId || null,
        }),
      });

      const data = await readApiResponse(response);

      // Add the answer and retrieval information to the conversation.
      setMessages((previous) => [
        ...previous,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: data.answer || "No answer was returned.",
          citations: Array.isArray(data.citations)
            ? data.citations
            : [],
          refused: data.refused || false,

          // Keep retrieved chunks in message state.
          // They will be displayed in the right-side panel.
          retrievedChunks: Array.isArray(data.retrieved_chunks_details)
            ? data.retrieved_chunks_details
            : [],
        },
      ]);
    } catch (error) {
      // Display an error message inside the conversation.
      setMessages((previous) => [
        ...previous,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: `I couldn't process your request. ${error.message}`,
          citations: [],
          retrievedChunks: [],
          error: true,
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  // ========================================
  // CHAT ACTIONS
  // ========================================

  function startNewChat() {
    if (asking) return;

    setMessages([]);
    setQuestion("");
  }

  function navigateTo(page) {
    setActivePage(page);
  }

  // ========================================
  // APPLICATION HEADER
  // ========================================

  function renderHeader() {
    const pageDetails = {
      overview: {
        title: "Overview",
      },

      assistant: {
        title: "AI Assistant",
      },

      documents: {
        title: "Document Library",
      },
    };

    const current = pageDetails[activePage];

    return (
      <header className="topbar">
        <div className="breadcrumb">
          <span>Acme Corp</span>

          <span className="breadcrumb-separator">/</span>

          <strong>{current.title}</strong>
        </div>

        <div className="topbar-actions">
          <div className="workspace-status">
            <span className="status-dot" />
            AI Workspace
          </div>

          <div className="avatar" title="Workspace user">
            A
          </div>
        </div>
      </header>
    );
  }

  // ========================================
  // OVERVIEW PAGE
  // ========================================

  function renderOverview() {
    return (
      <>
        <section className="welcome-section">
          <div>
            <span className="eyebrow">
              YOUR KNOWLEDGE WORKSPACE
            </span>

            <h1>Good to see you.</h1>

            <p>
              Everything your team needs to access company knowledge,
              in one intelligent workspace.
            </p>
          </div>

          <div className="welcome-art">
            <div className="welcome-art-circle circle-one" />
            <div className="welcome-art-circle circle-two" />
            <div className="welcome-art-icon">✧</div>
          </div>
        </section>

        {/* Dashboard statistics. */}
        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-top">
              <span className="stat-icon purple-icon">▤</span>
              <span className="stat-caption">DOCUMENTS</span>
            </div>

            <div className="stat-number">
              {documentsLoading ? "..." : documents.length}
            </div>

            <div className="stat-description">
              Indexed in your knowledge base
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span className="stat-icon blue-icon">✧</span>
              <span className="stat-caption">AI ACTIVITY</span>
            </div>

            <div className="stat-number">
              {
                messages.filter(
                  (message) => message.role === "user"
                ).length
              }
            </div>

            <div className="stat-description">
              Questions in current conversation
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span className="stat-icon green-icon">✓</span>
              <span className="stat-caption">WORKSPACE</span>
            </div>

            <div className="stat-number">Active</div>

            <div className="stat-description">
              Ready to retrieve company knowledge
            </div>
          </div>
        </section>

        <div className="overview-grid">
          {/* Quick access panel. */}
          <section className="panel quick-access-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">GET STARTED</span>
                <h2>Quick access</h2>
              </div>
            </div>

            <button
              className="quick-action"
              onClick={() => navigateTo("assistant")}
              type="button"
            >
              <div className="quick-action-icon assistant-action-icon">
                ✧
              </div>

              <div className="quick-action-content">
                <strong>Ask your AI assistant</strong>

                <span>
                  Get answers from your company documents.
                </span>
              </div>

              <span className="quick-action-arrow">→</span>
            </button>

            <button
              className="quick-action"
              onClick={() => navigateTo("documents")}
              type="button"
            >
              <div className="quick-action-icon document-action-icon">
                ↑
              </div>

              <div className="quick-action-content">
                <strong>Upload company documents</strong>

                <span>
                  Add PDF and DOCX files to your knowledge base.
                </span>
              </div>

              <span className="quick-action-arrow">→</span>
            </button>
          </section>

          {/* Recent documents panel. */}
          <section className="panel recent-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">RECENT ACTIVITY</span>
                <h2>Recent documents</h2>
              </div>

              <button
                className="text-button"
                onClick={() => navigateTo("documents")}
                type="button"
              >
                View all →
              </button>
            </div>

            {documentsLoading ? (
              <div className="empty-state">
                <strong>Loading documents...</strong>
              </div>
            ) : documentsError ? (
              <div className="empty-state">
                <strong>Unable to load documents</strong>
                <p>{documentsError}</p>
              </div>
            ) : documents.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">▤</div>

                <strong>No indexed documents</strong>

                <p>
                  Upload a PDF or DOCX file to build your knowledge base.
                </p>
              </div>
            ) : (
              <div className="document-list">
                {documents.slice(0, 4).map((document) => (
                  <DocumentItem
                    key={document.id}
                    document={document}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Bottom call-to-action banner. */}
        <section className="bottom-banner">
          <div className="banner-icon">✧</div>

          <div>
            <strong>
              Your company knowledge, made accessible.
            </strong>

            <p>
              Search your enterprise documents with AI-powered retrieval
              and source citations.
            </p>
          </div>

          <button
            className="button button-primary"
            onClick={() => navigateTo("assistant")}
            type="button"
          >
            Open AI Assistant →
          </button>
        </section>
      </>
    );
  }

  // ========================================
  // AI ASSISTANT PAGE
  // ========================================

  function renderAssistant() {
    // Find the latest successful AI response.
    // Its chunks will be displayed in the right panel.
    const latestAssistantMessage = [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" &&
          !message.error
      );

    const latestRetrievedChunks =
      latestAssistantMessage?.retrievedChunks || [];

    return (
      <section className="assistant-workspace">
        <div className="assistant-heading">
          <div>
            <span className="eyebrow">
              ACME CORP KNOWLEDGE ASSISTANT
            </span>

            <h1>How can I help you today?</h1>

            <p>
              Ask a question about company policies, HR, IT, operations,
              or other uploaded documents.
            </p>
          </div>

          <button
            className="button button-secondary new-chat-button"
            onClick={startNewChat}
            disabled={asking}
            type="button"
          >
            + New conversation
          </button>
        </div>

        {/* Two-column layout. */}
        <div className="assistant-content-layout">

          {/* =====================================
              LEFT SIDE: CHAT
          ====================================== */}
          <div className="chat-container">

            {/* Chat toolbar. */}
            <div className="chat-toolbar">
              <div className="chat-toolbar-title">
                <div className="assistant-avatar">✧</div>

                <div>
                  <strong>Acme AI Assistant</strong>

                  <span>
                    <span className="status-dot" />
                    Ready to help
                  </span>
                </div>
              </div>

              <span className="secure-label">
                Knowledge-grounded answers
              </span>
            </div>

            {/* Document selector. */}
            <div className="document-selector">
              <div className="document-selector-label">
                <span className="selector-icon">▤</span>

                <label htmlFor="document-selector">
                  Search in
                </label>
              </div>

              <select
                id="document-selector"
                value={selectedDocumentId}
                onChange={(event) =>
                  setSelectedDocumentId(event.target.value)
                }
                disabled={documentsLoading || asking}
              >
                <option value="">All Documents</option>

                {documents.map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.filename}
                  </option>
                ))}
              </select>

              <span className="document-selector-count">
                {documentsLoading
                  ? "Loading..."
                  : `${documents.length} indexed`}
              </span>
            </div>

            {documentsError && (
              <div className="document-loading-error" role="alert">
                {documentsError}

                <button
                  type="button"
                  className="text-button"
                  onClick={fetchDocuments}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Chat messages area. */}
            <div className="chat-messages">

              {/* Initial welcome screen. */}
              {messages.length === 0 && (
                <div className="chat-empty-state">
                  <div className="chat-welcome-icon">✧</div>

                  <h2>Welcome to Acme AI</h2>

                  <p>
                    I can help you find information in your company's
                    uploaded knowledge base. Ask me a question to get started.
                  </p>

                  <div className="suggestion-list">
                    <button
                      type="button"
                      onClick={() =>
                        setQuestion(
                          "What are the standard working hours at Acme Corp?"
                        )
                      }
                    >
                      <span>◷</span>
                      What are the standard working hours?
                      <span className="suggestion-arrow">↗</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setQuestion(
                          "What should I do if I need IT support?"
                        )
                      }
                    >
                      <span>⌘</span>
                      How can I get IT support?
                      <span className="suggestion-arrow">↗</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setQuestion(
                          "What are the company's cybersecurity guidelines?"
                        )
                      }
                    >
                      <span>◇</span>
                      What are the cybersecurity guidelines?
                      <span className="suggestion-arrow">↗</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Display conversation messages. */}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message-row ${
                    message.role === "user"
                      ? "user-row"
                      : "assistant-row"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="message-avatar">✧</div>
                  )}

                  <div className="message-content">
                    <div className="message-author">
                      {message.role === "user"
                        ? "You"
                        : "Acme AI Assistant"}
                    </div>

                    <div
                      className={`message-bubble ${
                        message.role === "user"
                          ? "user-bubble"
                          : "assistant-bubble"
                      } ${message.error ? "error-bubble" : ""}`}
                    >
                      {/* Only the generated answer appears in chat. */}
                      <ReactMarkdown>
                        {normalizeMarkdown(message.content)}
                      </ReactMarkdown>

                      {/* Answer citations stay inside the chat. */}
                      {message.citations?.length > 0 && (
                        <div className="citations">
                          <div className="citations-heading">
                            <span>▤</span>
                            Sources used
                          </div>

                          {groupCitations(message.citations).map(
                            (citation, index) => (
                              <div
                                className="citation-item"
                                key={`${citation.filename}-${index}`}
                              >
                                <span className="citation-file-icon">
                                  {getFileType(citation.filename)}
                                </span>

                                <div className="citation-information">
                                  <strong>{citation.filename}</strong>

                                  <span>
                                    {citation.pages.length > 0
                                      ? `Page${
                                          citation.pages.length > 1
                                            ? "s"
                                            : ""
                                        } ${citation.pages.join(", ")}`
                                      : "Page information unavailable"}
                                  </span>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {message.role === "user" && (
                    <div className="user-message-avatar">A</div>
                  )}
                </div>
              ))}

              {/* Loading indicator. */}
              {asking && (
                <div className="message-row assistant-row">
                  <div className="message-avatar">✧</div>

                  <div className="message-content">
                    <div className="message-author">
                      Acme AI Assistant
                    </div>

                    <div className="message-bubble assistant-bubble typing-bubble">
                      <span />
                      <span />
                      <span />

                      <small>
                        Searching your knowledge base...
                      </small>
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Question input area. */}
            <form className="chat-composer" onSubmit={handleAsk}>
              <div className="composer-input-wrapper">
                <textarea
                  id="question-input"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      event.currentTarget.form.requestSubmit();
                    }
                  }}
                  placeholder="Ask anything about your company knowledge..."
                  rows={2}
                  disabled={asking}
                />

                <div className="composer-bottom">
                  <span>
                    Answers are generated from retrieved company documents.
                  </span>

                  <button
                    type="submit"
                    className="send-button"
                    disabled={!question.trim() || asking}
                    aria-label="Send question"
                  >
                    {asking ? "..." : "↑"}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* =====================================
              RIGHT SIDE: RETRIEVAL PANEL
          ====================================== */}
          <aside className="retrieval-sidebar">

            <div className="retrieval-sidebar-header">
              <div>
                <span className="eyebrow">RAG PIPELINE</span>

                <h2>Retrieval details</h2>

                <p>
                  Context retrieved from your knowledge base for the
                  latest AI response.
                </p>
              </div>

              <span className="retrieval-count">
                {latestRetrievedChunks.length}
              </span>
            </div>

            {/* Show an informative message before the first question. */}
            {messages.length === 0 ? (
              <div className="retrieval-placeholder">
                <div className="retrieval-placeholder-icon">⌕</div>

                <strong>No retrieval yet</strong>

                <p>
                  Ask a question to see the document chunks retrieved
                  by your RAG system.
                </p>
              </div>
            ) : (
              <RetrievedChunks
                chunks={latestRetrievedChunks}
              />
            )}
          </aside>
        </div>

        <p className="assistant-disclaimer">
          AI-generated responses may need verification. Always refer to
          the cited company documents for important decisions.
        </p>
      </section>
    );
  }

  // ========================================
  // DOCUMENT MANAGEMENT PAGE
  // ========================================

  function renderDocuments() {
    return (
      <>
        <section className="documents-intro">
          <div>
            <span className="eyebrow">COMPANY KNOWLEDGE</span>

            <h1>Document management</h1>

            <p>
              Upload and organize the documents used by your AI assistant.
            </p>
          </div>

          <div className="documents-count">
            <span className="documents-count-icon">▤</span>

            <div>
              <strong>
                {documentsLoading ? "..." : documents.length}
              </strong>

              <span>Indexed documents</span>
            </div>
          </div>
        </section>

        <div className="documents-layout">
          <div className="documents-main">
            {/* Upload panel. */}
            <UploadPanel
              file={file}
              setFile={setFile}
              uploading={uploading}
              uploadMessage={uploadMessage}
              handleUpload={handleUpload}
            />

            {/* Indexed documents list. */}
            <section className="panel all-documents-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">YOUR FILES</span>
                  <h2>Indexed documents</h2>
                </div>

                <span className="count-pill">
                  {documents.length} files
                </span>
              </div>

              {documentsLoading ? (
                <div className="empty-state document-empty">
                  <strong>Loading documents...</strong>
                </div>
              ) : documentsError ? (
                <div className="empty-state document-empty">
                  <strong>Unable to load documents</strong>

                  <p>{documentsError}</p>

                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={fetchDocuments}
                  >
                    Try again
                  </button>
                </div>
              ) : documents.length === 0 ? (
                <div className="empty-state document-empty">
                  <div className="empty-state-icon">▤</div>

                  <strong>Your document library is empty</strong>

                  <p>
                    Upload your first PDF or DOCX file to begin building
                    your knowledge base.
                  </p>
                </div>
              ) : (
                <div className="document-list">
                  {documents.map((document) => (
                    <DocumentItem
                      key={document.id}
                      document={document}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Document information sidebar. */}
          <aside className="documents-sidebar">
            <section className="panel supported-panel">
              <span className="eyebrow">SUPPORTED FORMATS</span>

              <h3>File requirements</h3>

              <div className="format-item">
                <div className="format-icon pdf-icon">PDF</div>

                <div>
                  <strong>PDF documents</strong>
                  <span>Portable Document Format</span>
                </div>

                <span className="format-check">✓</span>
              </div>

              <div className="format-item">
                <div className="format-icon docx-icon">DOC</div>

                <div>
                  <strong>Word documents</strong>
                  <span>Microsoft DOCX format</span>
                </div>

                <span className="format-check">✓</span>
              </div>
            </section>

            <section className="knowledge-tip">
              <div className="tip-icon">✧</div>

              <strong>How document processing works</strong>

              <p>
                Uploaded documents are extracted, divided into smaller
                text chunks, converted into embeddings, and indexed for
                semantic search.
              </p>
            </section>
          </aside>
        </div>
      </>
    );
  }

  // ========================================
  // MAIN APPLICATION LAYOUT
  // ========================================

  return (
    <div className="app-shell">

      {/* Sidebar. */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">A</div>

          <div className="brand-text">
            <strong>
              acme<span>.</span>
            </strong>

            <small>INTELLIGENCE WORKSPACE</small>
          </div>
        </div>

        {/* Workspace information. */}
        <div className="sidebar-workspace">
          <div className="workspace-avatar">AC</div>

          <div>
            <strong>Acme Corporation</strong>
            <span>Enterprise workspace</span>
          </div>

          <span className="workspace-menu">⌄</span>
        </div>

        <div className="sidebar-section-label">
          WORKSPACE
        </div>

        {/* Main navigation. */}
        <nav className="sidebar-navigation">
          <NavigationItem
            icon="▦"
            label="Overview"
            active={activePage === "overview"}
            onClick={() => navigateTo("overview")}
          />

          <NavigationItem
            icon="✧"
            label="AI Assistant"
            active={activePage === "assistant"}
            onClick={() => navigateTo("assistant")}
          />

          <NavigationItem
            icon="▤"
            label="Documents"
            active={activePage === "documents"}
            onClick={() => navigateTo("documents")}
          />
        </nav>

        {/* Knowledge categories. */}
        <div className="sidebar-section-label knowledge-label">
          KNOWLEDGE AREAS
        </div>

        <div className="knowledge-navigation">
          <div className="knowledge-link">
            <span className="knowledge-dot hr-dot" />
            Human Resources
          </div>

          <div className="knowledge-link">
            <span className="knowledge-dot it-dot" />
            IT & Helpdesk
          </div>

          <div className="knowledge-link">
            <span className="knowledge-dot security-dot" />
            Cybersecurity
          </div>

          <div className="knowledge-link">
            <span className="knowledge-dot operations-dot" />
            Operations
          </div>

          <div className="knowledge-link">
            <span className="knowledge-dot finance-dot" />
            Finance
          </div>
        </div>

        {/* Sidebar footer. */}
        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <div className="help-icon">?</div>

            <div>
              <strong>Need help?</strong>
              <span>Enterprise knowledge workspace</span>
            </div>
          </div>

          <div className="sidebar-footer">
            <span className="sidebar-footer-dot" />
            Connected to local API
          </div>

          <div className="sidebar-version">
            Acme Corp Knowledge Assistant
          </div>
        </div>
      </aside>

      {/* Main workspace. */}
      <main className="main-content">
        {renderHeader()}

        <div className="page-content">
          {activePage === "overview" && renderOverview()}

          {activePage === "assistant" && renderAssistant()}

          {activePage === "documents" && renderDocuments()}
        </div>
      </main>
    </div>
  );
}
