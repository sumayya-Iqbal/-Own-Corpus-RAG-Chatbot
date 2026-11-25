
import sys
from pathlib import Path

# --------------------------------------------------
# 1. Configure Python import path
# --------------------------------------------------

# Locate the backend folder and make it accessible.
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))


# --------------------------------------------------
# 2. Import required libraries
# --------------------------------------------------

from google import genai
from google.genai import types

from app.config.settings import settings


# --------------------------------------------------
# 3. Configure Gemini
# --------------------------------------------------

# Reuse the API key from the project's .env file.
client = genai.Client(
    api_key=settings.GEMINI_API_KEY
)

# Use the same model as the RAG generation service.
MODEL_NAME = "gemini-3.5-flash-lite"


# --------------------------------------------------
# 4. Load the chart image
# --------------------------------------------------

image_path = BACKEND_DIR / "test_files" / "sales_chart.png"

if not image_path.exists():
    raise FileNotFoundError(
        f"Chart image not found: {image_path}"
    )

image_bytes = image_path.read_bytes()


# --------------------------------------------------
# 5. Write the vision prompt
# --------------------------------------------------

prompt = """
Analyze the sales chart in the provided image.

Please explain:

1. What information does the chart show?
2. What are the sales values for January, February and March?
3. What trend can you observe?
4. Which month has the highest sales?

Important instructions:
- Only report information visible in the image.
- Do not invent missing information.
- Explain the chart in simple language.
"""


# --------------------------------------------------
# 6. Send the image and prompt to Gemini
# --------------------------------------------------

response = client.models.generate_content(
    model=MODEL_NAME,
    contents=[
        prompt,
        types.Part.from_bytes(
            data=image_bytes,
            mime_type="image/png",
        ),
    ],
)


# --------------------------------------------------
# 7. Display Gemini's response
# --------------------------------------------------

print("\n" + "=" * 50)
print("       GEMINI VISION RESULT")
print("=" * 50)

print(response.text)

print("\n" + "=" * 50)
print("Vision test completed.")
print("=" * 50)
