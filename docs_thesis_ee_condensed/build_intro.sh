#!/bin/bash
set -e

echo "Building introduction document..."

pandoc \
  docs_thesis_ee_condensed/00_introduction.md \
  docs_thesis_ee_condensed/90_kokkuvote.md \
  docs_thesis_ee_condensed/91_summary.md \
  -o docs_thesis_ee_condensed/Output_Wrappers_temp.docx \
  --reference-doc=docs_thesis_ee_condensed/Loputoo_mall_2025.docx \
  --lua-filter=docs_thesis_ee_condensed/body-text-style.lua

echo "Adding table borders..."
uv run python docs_thesis_ee_condensed/add_table_borders.py \
  docs_thesis_ee_condensed/Output_Wrappers_temp.docx \
  docs_thesis_ee_condensed/Output_Wrappers.docx

rm docs_thesis_ee_condensed/Output_Wrappers_temp.docx

echo "✅ Done! Output: docs_thesis_ee_condensed/Output_Wrappers.docx"

