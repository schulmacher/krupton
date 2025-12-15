#!/bin/bash
set -e

echo "Building thesis document..."

pandoc \
  docs/thesis_ee_condensed/01_system_architecture_overview_ee_2.md \
  docs/thesis_ee_condensed/02_external_bridge_ee.md \
  docs/thesis_ee_condensed/03_internal_bridge_ee.md \
  docs/thesis_ee_condensed/04_py_window_features_ee.md \
  docs/thesis_ee_condensed/05_ml_pipeline_ee.md \
  docs/thesis_ee_condensed/06_live_predictions_ee.md \
  docs/thesis_ee_condensed/99_references.md \
  -o docs/thesis_ee_condensed/Output_Thesis_temp.docx \
  --reference-doc=docs/thesis_ee_condensed/Loputoo_mall_2025.docx \
  --lua-filter=docs/thesis_ee_condensed/body-text-style.lua

echo "Adding table borders..."
uv run python docs/thesis_ee_condensed/add_table_borders.py \
  docs/thesis_ee_condensed/Output_Thesis_temp.docx \
  docs/thesis_ee_condensed/Output_Thesis.docx

rm docs/thesis_ee_condensed/Output_Thesis_temp.docx

echo "✅ Done! Output: docs/thesis_ee_condensed/Output_Thesis.docx"

