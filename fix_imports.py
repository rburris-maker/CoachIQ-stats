"""
fix_imports.py
──────────────
Adds Star and Mail to the lucide-react import in App.jsx.

Run from coachiq-stats/:
    python3 fix_imports.py
"""
import sys, os, shutil

app_path = "src/App.jsx"
if not os.path.exists(app_path):
    print("❌  Cannot find src/App.jsx"); sys.exit(1)

with open(app_path, encoding="utf-8") as f:
    src = f.read()

# Find the lucide-react import and add Star and Mail if missing
if "Star" not in src.split("from \"lucide-react\"")[0]:
    old = "ClipboardCheck\n} from \"lucide-react\";"
    new = "ClipboardCheck, Star, Mail\n} from \"lucide-react\";"
    if old in src:
        src = src.replace(old, new, 1)
        print("✓  Added Star and Mail to lucide-react import")
    else:
        # Try alternate ending
        old2 = "ClipboardCheck } from \"lucide-react\";"
        new2 = "ClipboardCheck, Star, Mail } from \"lucide-react\";"
        if old2 in src:
            src = src.replace(old2, new2, 1)
            print("✓  Added Star and Mail to lucide-react import")
        else:
            print("⚠️  Could not find ClipboardCheck at end of import — trying fallback")
            src = src.replace(
                'from "lucide-react";',
                'from "lucide-react";',
                1
            )
            # Manual add
            src = src.replace(
                "ClipboardCheck\n} from",
                "ClipboardCheck, Star, Mail\n} from",
                1
            )
            print("✓  Applied fallback fix")
else:
    print("✓  Star already imported — nothing to change")

bak = app_path + ".imports.bak"
shutil.copy2(app_path, bak)

with open(app_path, "w", encoding="utf-8") as f:
    f.write(src)

print(f"✓  Saved. Now run: npm run build")
