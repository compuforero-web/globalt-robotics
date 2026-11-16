"""Regresiones del buscador del catálogo, sin dependencias externas."""
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]

class SearchTests(unittest.TestCase):
    def test_search_filters_keyboard_and_reset(self):
        subprocess.run(['node', 'tests/search.test.mjs'], cwd=ROOT, check=True)
