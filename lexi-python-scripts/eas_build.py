# LEXI PYTHON SCRIPT: eas_build
# Added: 2026-04-19T23:07:07.283Z
# Description: trigger eas build

import subprocess
subprocess.run(["eas", "build", "--platform", "android", "--profile", "preview", "--non-interactive", "--json", "--no-wait"])