"""
apply_tryouts_patch.py
──────────────────────
Run from coachiq-stats/:
    python3 apply_tryouts_patch.py
"""
import sys, os, shutil

app_path  = "src/App.jsx"
patch_name = "TryoutsView_improved.jsx"

if not os.path.exists(app_path):
    print("❌  Cannot find src/App.jsx"); sys.exit(1)

patch_path = patch_name
if not os.path.exists(patch_path):
    patch_path = os.path.join("src", patch_name)
if not os.path.exists(patch_path):
    print(f"❌  Cannot find {patch_name}"); sys.exit(1)

with open(app_path,  encoding="utf-8") as f: src   = f.read()
with open(patch_path,encoding="utf-8") as f: patch = f.read()

print(f"✓  App.jsx  : {app_path}  ({src.count(chr(10))} lines)")

# ── Find start ───────────────────────────────────────────────────────────────
START_PATTERNS = ["// ─── TIME INPUT", "// ─── TRYOUTS VIEW", "// --- TRYOUTS VIEW"]
start_idx = None
for p in START_PATTERNS:
    i = src.find(p)
    if i != -1:
        start_idx = i
        print(f"✓  Start    : \"{p}\" at char {i}")
        break
if start_idx is None:
    print("❌  Cannot find TryoutsView start"); sys.exit(1)

# ── Find end ─────────────────────────────────────────────────────────────────
END_PATTERNS = ["function TryoutCloseWizard(", "// ─── ONBOARDING WIZARD", "// ─── PITCH WITH PLAYERS"]
end_idx = None
for p in END_PATTERNS:
    i = src.find(p, start_idx + 200)
    if i != -1:
        end_idx = i
        print(f"✓  End      : \"{p}\" at char {i}")
        break
if end_idx is None:
    print("❌  Cannot find TryoutsView end"); sys.exit(1)

# ── Build new source ─────────────────────────────────────────────────────────
new_src = src[:start_idx] + patch.rstrip() + "\n\n" + src[end_idx:]

# ── Sanity checks ─────────────────────────────────────────────────────────────
checks = [
    ("function TimeInput(",      "TimeInput component"),
    ("function TryoutsView(",    "TryoutsView function"),
    ("getLineupSaves",           "Multiple lineup saves"),
    ("getActiveLineup",          "Active lineup helper"),
    ("updLineupSave",            "Lineup update helper"),
    ("createNewLineup",          "New lineup creation"),
    ("posFit",                   "Position fit indicator"),
    ("FIT_COLOR",                "Fit color map"),
    ("isBackup",                 "Backup/sub slots"),
    ("addStatEntry",             "Stat history tracking"),
    ("getImprovement",           "Growth display"),
    ("newStatTimeFormat",        "Seconds/MM:SS toggle"),
    ("BulkEntryModal",           "Bulk entry modal"),
    ("posFilter",                "Position filter"),
]
print("\nSanity checks:")
all_ok = True
for needle, label in checks:
    ok = needle in new_src
    print(f"  {'✓' if ok else '❌'}  {label}")
    if not ok: all_ok = False

if not all_ok:
    print("\n⚠️  Some checks failed — aborting to protect your file.")
    sys.exit(1)

# ── Backup + write ─────────────────────────────────────────────────────────────
bak = app_path + ".bak"
shutil.copy2(app_path, bak)
print(f"\n✓  Backup   : {bak}")
with open(app_path, "w", encoding="utf-8") as f:
    f.write(new_src)
print(f"✓  Written  : {app_path}  ({new_src.count(chr(10))} lines)")
print("\n🎉  Done! Run:  npm run build")
print(f"   Restore  : cp \"{bak}\" \"{app_path}\"")
