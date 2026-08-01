"""Legacy entry alias: the real module is ``work4you_cli.main``.

Kept as a PHYSICAL file on purpose: desktop shells released before the
package rename validate an engine checkout by probing for the literal path
``wayne_cli/main.py`` before spawning it. With this file present, a renamed
engine ZIP still passes that probe; execution itself is redirected by the
``sys.modules`` swap in ``wayne_cli/__init__``, so this file's body only
runs when someone executes the path directly.
"""

from work4you_cli.main import *  # noqa: F401,F403
from work4you_cli.main import main

if __name__ == "__main__":
    main()
