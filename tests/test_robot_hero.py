from pathlib import Path
import subprocess
import unittest

class RobotHeroTests(unittest.TestCase):
    def test_animation_geometry_controls_and_reduced_motion(self):
        subprocess.run(['node', '--test', 'tests/robot-hero.test.mjs'],
                       cwd=Path(__file__).resolve().parents[1], check=True)
