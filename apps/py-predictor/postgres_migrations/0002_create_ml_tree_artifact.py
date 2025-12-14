from yoyo import step

steps = [
    step(
        """
        CREATE TABLE ml_tree_artifact (
            ml_tree_result_id   INTEGER PRIMARY KEY REFERENCES ml_tree_result(ml_tree_result_id)
                ON DELETE CASCADE,
            model_bytes         BYTEA NOT NULL,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "DROP TABLE ml_tree_artifact",
    ),
]
