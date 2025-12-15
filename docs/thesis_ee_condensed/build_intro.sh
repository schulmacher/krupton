#!/bin/bash
set -e

echo "Building introduction document..."

pandoc \
  docs/thesis_ee_condensed/00_introduction.md \
  docs/thesis_ee_condensed/90_kokkuvote.md \
  docs/thesis_ee_condensed/91_summary.md \
  -o docs/thesis_ee_condensed/Output_Wrappers_temp.docx \
  --reference-doc=docs/thesis_ee_condensed/Loputoo_mall_2025.docx \
  --lua-filter=docs/thesis_ee_condensed/body-text-style.lua

echo "Adding table borders..."
uv run python docs/thesis_ee_condensed/add_table_borders.py \
  docs/thesis_ee_condensed/Output_Wrappers_temp.docx \
  docs/thesis_ee_condensed/Output_Wrappers.docx

rm docs/thesis_ee_condensed/Output_Wrappers_temp.docx

echo "✅ Done! Output: docs/thesis_ee_condensed/Output_Wrappers.docx"

