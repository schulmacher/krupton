Install quarto locally

## Themes

- **HTML (reveal.js)**: Uses custom `taltech-theme.scss` with TalTech brand colors (#AB1352 red, #E4067E pink, #332B60 blue)
- **PowerPoint**: Uses official `TalTech_16-9_EST.pptx` template

## Rendering

- **Reveal.js (HTML)**

```bash
cd docs/thesis_presentation
quarto render slides.qmd --to revealjs
```

Result: `slides.html`

- **PowerPoint (PPTX)** with TalTech template

```bash
cd docs/thesis_presentation
quarto render slides.qmd --to pptx --reference-doc TalTech_16-9_EST.pptx
```

Result: `slides.pptx`

The `TalTech_16-9_EST.pptx` template provides the official TalTech branding and styling.


