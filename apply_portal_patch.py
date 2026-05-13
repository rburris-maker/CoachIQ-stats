"""
apply_portal_patch.py
──────────────────────
Replaces PlayerPortalPage with the improved version.

Run from coachiq-stats/:
    python3 apply_portal_patch.py
"""
import os, shutil, sys

app_path   = "src/App.jsx"
patch_name = "PlayerPortalPage_improved.jsx"

if not os.path.exists(app_path):
    print("❌  Cannot find src/App.jsx"); sys.exit(1)

patch_path = patch_name
if not os.path.exists(patch_path):
    patch_path = os.path.join("src", patch_name)
if not os.path.exists(patch_path):
    print(f"❌  Cannot find {patch_name}"); sys.exit(1)

with open(app_path,   encoding="utf-8") as f: src   = f.read()
with open(patch_path, encoding="utf-8") as f: patch = f.read()

print(f"✓  App.jsx  : {src.count(chr(10))} lines")

# Find start
start_idx = src.find("function PlayerPortalPage(")
if start_idx == -1:
    print("❌  Cannot find PlayerPortalPage"); sys.exit(1)
print(f"✓  Start    : PlayerPortalPage at char {start_idx}")

# Find end by matching braces
depth = 0
started = False
end_idx = start_idx
for i in range(start_idx, len(src)):
    for ch in src[i]:
        if ch == "{": depth += 1; started = True
        elif ch == "}":
            depth -= 1
            if started and depth == 0:
                end_idx = i + 1
                break
    if started and depth == 0:
        break

print(f"✓  End      : char {end_idx} ({end_idx - start_idx} chars replaced)")

new_src = src[:start_idx] + patch.rstrip() + "\n" + src[end_idx:]

# Sanity checks
checks = [
    ("function PlayerPortalPage(", "PlayerPortalPage function"),
    ("COACH EVALUATION",           "Coach evaluation section"),
    ("posCol",                     "Position color accent"),
    ("tryoutHistory",              "Tryout history (light mode)"),
    ("hasScores",                  "Scores detection"),
    ("overallScore",               "Overall score calc"),
    ("empty state",                "Empty state for no games"),
    ("scoreCats",                  "Score categories"),
]
print("\nSanity checks:")
all_ok = True
for needle, label in checks:
    ok = needle in new_src
    print(f"  {'✓' if ok else '❌'}  {label}")
    if not ok: all_ok = False

if not all_ok:
    print("⚠️  Checks failed — aborting"); sys.exit(1)

bak = app_path + ".portal.bak"
shutil.copy2(app_path, bak)
print(f"\n✓  Backup   : {bak}")
with open(app_path, "w", encoding="utf-8") as f:
    f.write(new_src)
print(f"✓  Written  : {app_path}  ({new_src.count(chr(10))} lines)")
print("\n🎉  Done! Run:  npm run build")
