"""Legacy import alias: this module moved to ``work4you_constants`` (brand rename).

Installed skills and user scripts import the old name; the sys.modules swap
makes it BE the real module (same object, same state). Removed at the end of
the brand migration.
"""

import sys

import work4you_constants as _mod

sys.modules[__name__] = _mod
