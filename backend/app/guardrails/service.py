
"""
Basic prompt-injection detection for the RAG application.

This is a first layer of protection, not a complete security solution.
It detects common direct injection attempts.
"""

import re


# Common patterns used in direct prompt-injection attempts.
INJECTION_PATTERNS = [
    r"\bignore\s+(all\s+)?(previous|prior|above|earlier)\s+instructions\b",
    r"\bdisregard\s+(all\s+)?(previous|prior|above|earlier|system)\s+instructions\b",
    r"\boverride\s+(all\s+)?(previous|prior|system)\s+instructions\b",
    r"\breveal\s+(the\s+)?(system|developer)\s+prompt\b",
    r"\bshow\s+(me\s+)?(the\s+)?(system|developer)\s+prompt\b",
    r"\bprint\s+(the\s+)?(system|developer)\s+prompt\b",
    r"\benter\s+developer\s+mode\b",
    r"\bdo\s+anything\s+now\b",
    r"\bact\s+as\s+(an?\s+)?(unrestricted|jailbroken)\s+",
]


def is_prompt_injection(text: str) -> bool:
    """
    Return True when text matches a known injection pattern.

    Case-insensitive matching allows us to detect variations
    in capitalization.
    """

    normalized_text = text.lower()

    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, normalized_text):
            return True

    return False
