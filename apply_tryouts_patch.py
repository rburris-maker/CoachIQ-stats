"""
apply_tryouts_patch.py
──────────────────────
Applies TryoutsView_improved.jsx — replaces only the TryoutsView section.
Never touches TimeInput. Safe to run multiple times.

Run from coachiq-stats/:
    python3 apply_tryouts_patch.py
"""
import sys, os, shutil

app_path   = "src/App.jsx"
patch_name = "TryoutsView_improved.jsx"

if not os.path.exists(app_path):
    print("❌  Cannot find src/App.jsx"); sys.exit(1)

patch_path = patch_name
if not os.path.exists(patch_path):
    patch_path = os.path.join("src", patch_name)
if not os.path.exists(patch_path):
    print(f"❌  Cannot find {patch_name}"); sys.exit(1)

with open(app_path,   encoding="utf-8") as f: src   = f.read()
with open(patch_path, encoding="utf-8") as f: patch = f.read()

print(f"✓  App.jsx  : {app_path}  ({src.count(chr(10))} lines)")

# ── Verify patch starts with TRYOUTS VIEW (not TIME INPUT) ───────────────────
if patch.strip().startswith("// ─── TIME INPUT") or "function TimeInput(" in patch[:200]:
    print("❌  Patch file includes TimeInput — this would create a duplicate.")
    print("   Use a patch that starts with '// ─── TRYOUTS VIEW' only.")
    sys.exit(1)
print("✓  Patch    : starts with TryoutsView only (no TimeInput) ✓")

# ── Find start: TRYOUTS VIEW only (never TIME INPUT) ────────────────────────
START_PATTERNS = ["// ─── TRYOUTS VIEW", "// --- TRYOUTS VIEW"]
start_idx = None
for p in START_PATTERNS:
    i = src.find(p)
    if i != -1:
        start_idx = i
        print(f"✓  Start    : \"{p}\" at char {i}")
        break

if start_idx is None:
    # Fallback: find the function declaration
    i = src.find("function TryoutsView(")
    if i != -1:
        start_idx = i
        print(f"✓  Start    : \"function TryoutsView(\" at char {i}")

if start_idx is None:
    print("❌  Cannot find TryoutsView in App.jsx"); sys.exit(1)

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
    print("❌  Cannot find end of TryoutsView"); sys.exit(1)

# ── Build new source ─────────────────────────────────────────────────────────
new_src = src[:start_idx] + patch.rstrip() + "\n\n" + src[end_idx:]

# ── Verify TimeInput count unchanged ─────────────────────────────────────────
orig_ti = src.count("function TimeInput(")
new_ti  = new_src.count("function TimeInput(")
print(f"\n✓  TimeInput declarations: {orig_ti} → {new_ti} (should be unchanged)")
if new_ti != orig_ti:
    print(f"❌  TimeInput count changed! Aborting."); sys.exit(1)

# ── Sanity checks ─────────────────────────────────────────────────────────────
checks = [
    ("function TryoutsView(",  "TryoutsView function"),
    ("getLineupSaves",         "Multiple lineup saves"),
    ("getZoneRows",            "Staged formation rows"),
    ("onDragStart",            "Drag start handler"),
    ("onDropSlot",             "Drop on slot"),
    ("onDropPool",             "Drop to pool (remove)"),
    ("dragging",               "Drag state"),
    ("posFit",                 "Position fit"),
    ("isBackup",               "Backup slots"),
    ("addStatEntry",           "Stat history"),
    ("newStatTimeFormat",      "Time format toggle"),
    ("BulkEntryModal",         "Bulk entry"),
]
print("\nSanity checks:")
all_ok = True
for needle, label in checks:
    ok = needle in new_src
    print(f"  {'✓' if ok else '❌'}  {label}")
    if not ok: all_ok = False

if not all_ok:
    print("\n⚠️  Checks failed — aborting."); sys.exit(1)

# ── Backup + write ────────────────────────────────────────────────────────────
bak = app_path + ".bak"
shutil.copy2(app_path, bak)
print(f"\n✓  Backup   : {bak}")
with open(app_path, "w", encoding="utf-8") as f:
    f.write(new_src)
print(f"✓  Written  : {app_path}  ({new_src.count(chr(10))} lines)")
print("\n🎉  Done! Run:  npm run build")
print(f"   Restore  : cp \"{bak}\" \"{app_path}\"")
