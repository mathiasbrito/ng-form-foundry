"""Sphinx configuration for the ng-form-foundry documentation."""

project = "ng-form-foundry"
author = "Mathias Santos de Brito"
copyright = "2026, Mathias Santos de Brito"

version = "0.3"
release = "0.3.4"

extensions = [
    "myst_parser",
]

myst_enable_extensions = [
    "colon_fence",
    "deflist",
    "fieldlist",
    "attrs_inline",
]
myst_heading_anchors = 3

source_suffix = {
    ".md": "markdown",
    ".rst": "restructuredtext",
}

templates_path = ["_templates"]
exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]

# Angular templates use `[input]` binding syntax that the strict HTML lexer
# cannot tokenize; Pygments falls back to relaxed highlighting, which is fine.
suppress_warnings = ["misc.highlighting_failure"]

language = "en"
pygments_style = "friendly"
pygments_dark_style = "material"

html_theme = "furo"
html_title = "ng-form-foundry"
html_static_path = ["_static"]
html_theme_options = {
    "source_repository": "https://github.com/mathiasbrito/ng-form-foundry",
    "source_branch": "main",
    "source_directory": "docs/",
    "light_css_variables": {
        "color-brand-primary": "#b6642f",
        "color-brand-content": "#b6642f",
    },
    "dark_css_variables": {
        "color-brand-primary": "#d98a4f",
        "color-brand-content": "#d98a4f",
    },
}
