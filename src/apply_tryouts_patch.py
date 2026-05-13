"""
apply_tryouts_patch.py
──────────────────────
Replaces TryoutsView (and injects TimeInput above it) in CoachIQStats.jsx.

Usage — run from the folder containing App.jsx:
    python3 apply_tryouts_patch.py

Or pass the path explicitly:
    python3 apply_tryouts_patch.py /path/to/src/App.jsx
"""
import sys, os, shutil

# ── 1. Locate App.jsx ────────────────────────────────────────────────────────
if len(sys.argv) > 1:
    app_path = sys.argv[1]
else:
    candidates = [
        "App.jsx", "src/App.jsx",
        os.path.join(os.path.dirname(__file__), "App.jsx"),
        os.path.join(os.path.dirname(__file__), "src", "App.jsx"),
    ]
    app_path = next((p for p in candidates if os.path.exists(p)), None)
    if not app_path:
        print("❌  Could not find App.jsx. Pass the path as an argument.")
        sys.exit(1)

# ── 2. Locate patch file ─────────────────────────────────────────────────────
patch_name = "TryoutsView_improved.jsx"
patch_candidates = [
    patch_name,
    os.path.join(os.path.dirname(__file__), patch_name),
]
patch_path = next((p for p in patch_candidates if os.path.exists(p)), None)
if not patch_path:
    print(f"❌  Could not find {patch_name} next to this script.")
    sys.exit(1)

print(f"✓  App.jsx  : {app_path}")
print(f"✓  Patch    : {patch_path}")

# ── 3. Read files ─────────────────────────────────────────────────────────────
with open(app_path, encoding="utf-8") as f:
    original = f.read()
with open(patch_path, encoding="utf-8") as f:
    patch = f.read()

# ── 4. Find start of replacement block ──────────────────────────────────────
# Look for existing TimeInput (if a previous patch was applied) OR the
# tryouts comment that precedes TryoutsView.
START_PATTERNS = [
    "// ─── TIME INPUT",
    "// ─── TRYOUTS VIEW",
    "// --- TRYOUTS VIEW",
    "// ─── TRYOUT",
]
start_idx = None
for pat in START_PATTERNS:
    idx = original.find(pat)
    if idx != -1:
        start_idx = idx
        print(f"✓  Start    : \"{pat}\" at char {idx}")
        break

if start_idx is None:
    print("❌  Could not find the TryoutsView section in App.jsx.")
    sys.exit(1)

# ── 5. Find end of replacement block ────────────────────────────────────────
END_PATTERNS = [
    "// ─── ONBOARDING WIZARD",
    "function TryoutCloseWizard(",
    "// ─── TRYOUT CLOSE WIZARD",
    "// ─── PITCH WITH PLAYERS",
    "// ─── PRO GATE",
]
end_idx = None
for pat in END_PATTERNS:
    idx = original.find(pat, start_idx + 200)
    if idx != -1:
        end_idx = idx
        print(f"✓  End      : \"{pat}\" at char {idx}")
        break

if end_idx is None:
    print("❌  Could not find end of TryoutsView. Aborting.")
    sys.exit(1)

# ── 6. Build new source ──────────────────────────────────────────────────────
# Strip the header comment block from the patch file (pure documentation)
patch_lines = patch.splitlines(keepends=True)
code_start = 0
for i, line in enumerate(patch_lines):
    s = line.strip()
    if s.startswith("//") and any(kw in s for kw in ["─","REPLACE","CHANGES","DROP","patch","paste"]):
        code_start = i + 1
    elif s and not s.startswith("//"):
        break

clean_patch = "".join(patch_lines[code_start:])
sep = "\n\n" if not clean_patch.endswith("\n\n") else ""
new_source = original[:start_idx] + clean_patch + sep + original[end_idx:]

# ── 7. Sanity checks ─────────────────────────────────────────────────────────
checks = [
    ("function TimeInput(",    "TimeInput component"),
    ("function TryoutsView(",  "TryoutsView function"),
    ("BulkEntryModal",         "Bulk entry modal"),
    ("posFilter",              "Position filter"),
    ("isTimeStat",             "Time stat detection"),
    ("customStatNotes",        "Per-stat notes"),
    ("newStatIsTime",          "Time toggle in Custom Stats tab"),
]
print("\nSanity checks:")
all_ok = True
for needle, label in checks:
    ok = needle in new_source
    print(f"  {'✓' if ok else '❌'}  {label}")
    if not ok: all_ok = False

if not all_ok:
    print("\n⚠️  Some expected symbols are missing. Aborting.")
    sys.exit(1)

# ── 8. Backup + write ─────────────────────────────────────────────────────────
bak = app_path + ".bak"
shutil.copy2(app_path, bak)
print(f"\n✓  Backup   : {bak}")

with open(app_path, "w", encoding="utf-8") as f:
    f.write(new_source)

print(f"✓  Written  : {app_path}")
print(f"   Before   : {original.count(chr(10)):,} lines")
print(f"   After    : {new_source.count(chr(10)):,} lines")
print("\n🎉  Done! Commit and push to redeploy.")
print(f"   Restore  : cp \"{bak}\" \"{app_path}\"")
