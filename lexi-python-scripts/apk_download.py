# LEXI PYTHON SCRIPT: apk_download
# Added: 2026-04-19T23:07:07.298Z
# Description: download apk file

import subprocess
subprocess.run(["curl", "-s", "-X", "GET", "https://expo.build/abcdefghij/lexi-apk.apk", "-o", "/home/runner/workspace/lexi-apk/lexi-apk.apk"])