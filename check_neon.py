
import os
import psycopg
from dotenv import load_dotenv

# Load environment variables from the .env file
load_dotenv()

# Read the database connection string
database_url = os.getenv("DATABASE_URL")

# Check whether the connection string exists
if not database_url:
    raise RuntimeError("DATABASE_URL is missing from .env")

# Connect to Neon PostgreSQL
with psycopg.connect(database_url) as connection:
    with connection.cursor() as cursor:

        # Check the database connection
        cursor.execute("SELECT current_database()")
        database_name = cursor.fetchone()[0]
        print("Connected database:", database_name)

        # Check whether pgvector is available
        cursor.execute(
            "SELECT extversion FROM pg_extension WHERE extname = 'vector'"
        )
        result = cursor.fetchone()

        if result:
            print("pgvector version:", result[0])
        else:
            print("pgvector extension not found!")

print("Neon connection test completed!")
