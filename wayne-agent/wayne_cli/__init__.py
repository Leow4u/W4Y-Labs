"""Legacy import alias: the package moved to ``work4you_cli`` (brand rename).

Old service units and scheduled tasks exec ``python -m wayne_cli.main``, and
user scripts / installed skills may import ``wayne_cli.*``. The sys.modules
swap makes this name BE the real package (same module object, same state), so
both keep working until the alias is removed at the end of the migration.
"""

import sys

import work4you_cli as _pkg

sys.modules[__name__] = _pkg
