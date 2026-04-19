# LEXI PYTHON SCRIPT: create_apk
# Added: 2026-04-19T23:07:14.551Z
# Description: create apk

import subprocess
subprocess.run(["expo build:android --non-interactive --json"])