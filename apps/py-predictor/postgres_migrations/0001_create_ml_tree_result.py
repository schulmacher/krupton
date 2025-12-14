from yoyo import step

steps = [
    step(
        """
        CREATE TABLE ml_tree_result (
            ml_tree_result_id SERIAL PRIMARY KEY,
            symbol              TEXT NOT NULL,
            platform            TEXT NOT NULL,
            target_name         TEXT NOT NULL,
            window_start        TIMESTAMPTZ NOT NULL,
            window_end          TIMESTAMPTZ NOT NULL,
            window_size_ms      BIGINT NOT NULL,
            methodology         TEXT NOT NULL,
            used_features       TEXT[] NOT NULL,
            used_features_lookback INTEGER NOT NULL,
            transformation      TEXT NOT NULL,
            training_data_length INTEGER NOT NULL,
            training_data_std    FLOAT NOT NULL,
            recall_score        FLOAT NOT NULL,
            recall_neg          FLOAT NOT NULL,
            recall_pos          FLOAT NOT NULL,
            precision_score     FLOAT NOT NULL,
            precision_neg       FLOAT NOT NULL,
            precision_pos       FLOAT NOT NULL,
            confusion_matrix_tn INTEGER NOT NULL,
            confusion_matrix_fp INTEGER NOT NULL,
            confusion_matrix_fn INTEGER NOT NULL,
            confusion_matrix_tp INTEGER NOT NULL,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "DROP TABLE ml_tree_result",
    ),
    step(
        """
        CREATE UNIQUE INDEX ml_tree_result_unique_run
        ON ml_tree_result (symbol, platform, window_start, window_end, window_size_ms, target_name, methodology, used_features, transformation)
        """,
        "DROP INDEX ml_tree_result_unique_run",
    ),
]
