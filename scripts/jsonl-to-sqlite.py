#!/usr/bin/env python3

import json
import sqlite3
import sys

input_file = sys.argv[1] if len(sys.argv) > 1 else "output.txt"
output_db = sys.argv[2] if len(sys.argv) > 2 else "output.db"

print(f"📖 Reading from: {input_file}")
print(f"💾 Writing to: {output_db}")

conn = sqlite3.connect(output_db)
cursor = conn.cursor()

cursor.execute("""
    CREATE TABLE IF NOT EXISTS kraken_order (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL,
        timestamp INTEGER,
        message_data TEXT
    )
""")

batch = []
BATCH_SIZE = 1000
count = 0

with open(input_file, "r") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue

        try:
            json_obj = json.loads(line)

            batch.append(
                (
                    line,
                    json_obj.get("timestamp"),
                    json.dumps(json_obj.get("message")) if json_obj.get("message") else None,
                )
            )

            count += 1

            if len(batch) >= BATCH_SIZE:
                cursor.executemany(
                    "INSERT INTO kraken_order (data, timestamp, message_data) VALUES (?, ?, ?)",
                    batch,
                )
                conn.commit()
                batch = []

                if count % 10000 == 0:
                    print(f"✅ Inserted {count} records...")

        except json.JSONDecodeError as e:
            print(f"Error parsing line {count + 1}: {e}")

if batch:
    cursor.executemany(
        "INSERT INTO kraken_order (data, timestamp, message_data) VALUES (?, ?, ?)", batch
    )
    conn.commit()

conn.close()

print(f"\n✅ Complete! Inserted {count} records into {output_db}")
print(f"\nUsage:")
print(f'  sqlite3 {output_db} "SELECT COUNT(*) FROM kraken_order;"')
print(f'  sqlite3 {output_db} "SELECT * FROM kraken_order LIMIT 5;"')
