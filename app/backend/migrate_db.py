import sqlite3
import os

# Adjust the path to stt.db based on the project structure
# migrate_db.py is in app/backend/
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.dirname(BACKEND_DIR)
DATA_DIR = os.path.join(APP_DIR, "data")
db_path = os.path.join(DATA_DIR, "stt.db")

def migrate_db():
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Check if diarization column exists
        cursor.execute("PRAGMA table_info(session)")
        columns = [column[1] for column in cursor.fetchall()]

        if "diarization" not in columns:
            print("Adding 'diarization' column to 'session' table...")
            cursor.execute("ALTER TABLE session ADD COLUMN diarization BOOLEAN DEFAULT FALSE;")
            conn.commit()
            print("'diarization' column added successfully.")
        else:
            print("'diarization' column already exists in 'session' table.")

    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    migrate_db()
