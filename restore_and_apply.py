"""
restore_and_apply.py
─────────────────────
Restores App.jsx from the last known-good backup, then applies
only the TryoutsView section (leaving the existing TimeInput alone).

Run from coachiq-stats/:
    python3 restore_and_apply.py
"""
import os, shutil, sys

app_path   = "src/App.jsx"
patch_name = "TryoutsView_improved.jsx"

# ── 1. Find the best backup ───────────────────────────────────────────────────
# .bak  = saved by apply_tryouts_patch.py (before lineup patch, known good)
# .dup.bak = saved by fix_duplicate (broken duplicate state)
# .orphan.bak = saved by fix_orphan (might be good)

BACKUPS_PREFERENCE = [
    app_path + ".bak",
    app_path + ".orphan.bak",
    app_path + ".dup.bak",
]

restore_from = None
for b in BACKUPS_PREFERENCE:
    if os.path.exists(b):
        restore_from = b
        break

if not restore_from:
    print("❌  No backup found. Cannot restore."); sys.exit(1)

print(f"✓  Restoring from: {restore_from}")
shutil.copy2(restore_from, app_path)

with open(app_path, encoding="utf-8") as f:
    src = f.read()
print(f"✓  Restored: {src.count(chr(10))} lines")

# ── 2. Verify TimeInput is present and not duplicated ────────────────────────
ti_count = src.count("function TimeInput(")
print(f"✓  TimeInput declarations in restored file: {ti_count}")
if ti_count == 0:
    print("❌  No TimeInput found in backup — something is wrong"); sys.exit(1)
if ti_count > 1:
    print("⚠️  Still has duplicates in backup — trying next backup")
    # Try next backups
    for b in BACKUPS_PREFERENCE:
        if b == restore_from: continue
        if not os.path.exists(b): continue
        shutil.copy2(b, app_path)
        with open(app_path, encoding="utf-8") as f:
            src = f.read()
        c = src.count("function TimeInput(")
        print(f"   Trying {b}: {c} TimeInput(s), {src.count(chr(10))} lines")
        if c == 1:
            restore_from = b
            print(f"✓  Using {b}")
            break

# ── 3. Load the patch file ────────────────────────────────────────────────────
patch_path = patch_name
if not os.path.exists(patch_path):
    patch_path = os.path.join("src", patch_name)
if not os.path.exists(patch_path):
    print(f"❌  Cannot find {patch_name}"); sys.exit(1)

with open(patch_path, encoding="utf-8") as f:
    patch_full = f.read()

# ── 4. Strip TimeInput from top of patch (keep only TryoutsView onwards) ─────
tv_marker = "// ─── TRYOUTS VIEW"
tv_idx = patch_full.find(tv_marker)
if tv_idx == -1:
    tv_idx = patch_full.find("function TryoutsView(")
if tv_idx == -1:
    print("❌  Cannot find TryoutsView in patch file"); sys.exit(1)

patch_tryouts_only = patch_full[tv_idx:]
print(f"✓  Patch (TryoutsView only): {patch_tryouts_only.count(chr(10))} lines")

# ── 5. Find TryoutsView section in restored file ──────────────────────────────
START_PATTERNS = ["// ─── TRYOUTS VIEW", "// --- TRYOUTS VIEW", "function TryoutsView("]
start_idx = None
for p in START_PATTERNS:
    i = src.find(p)
    if i != -1:
        start_idx = i
        print(f"✓  Start: \"{p}\" at char {i}")
        break
if start_idx is None:
    print("❌  Cannot find TryoutsView in restored file"); sys.exit(1)

END_PATTERNS = ["function TryoutCloseWizard(", "// ─── ONBOARDING WIZARD", "// ─── PITCH WITH PLAYERS"]
end_idx = None
for p in END_PATTERNS:
    i = src.find(p, start_idx + 200)
    if i != -1:
        end_idx = i
        print(f"✓  End  : \"{p}\" at char {i}")
        break
if end_idx is None:
    print("❌  Cannot find end of TryoutsView"); sys.exit(1)

# ── 6. Build new source ───────────────────────────────────────────────────────
new_src = src[:start_idx] + patch_tryouts_only.rstrip() + "\n\n" + src[end_idx:]

# ── 7. Sanity checks ──────────────────────────────────────────────────────────
ti_final = new_src.count("function TimeInput(")
checks = [
    (ti_final == 1,              f"Exactly 1 TimeInput (found {ti_final})"),
    ("function TryoutsView(" in new_src, "TryoutsView function"),
    ("getLineupSaves"        in new_src, "Multiple lineup saves"),
    ("posFit"                in new_src, "Position fit indicator"),
    ("isBackup"              in new_src, "Backup/sub slots"),
    ("addStatEntry"          in new_src, "Stat history tracking"),
    ("newStatTimeFormat"     in new_src, "Seconds/MM:SS toggle"),
    ("BulkEntryModal"        in new_src, "Bulk entry modal"),
]
print("\nSanity checks:")
all_ok = True
for ok, label in checks:
    print(f"  {'✓' if ok else '❌'}  {label}")
    if not ok: all_ok = False

if not all_ok:
    print("\n⚠️  Checks failed — restoring original"); shutil.copy2(restore_from, app_path); sys.exit(1)

# ── 8. Write ──────────────────────────────────────────────────────────────────
final_bak = app_path + ".good.bak"
shutil.copy2(app_path, final_bak)  # save current (restored) state
with open(app_path, "w", encoding="utf-8") as f:
    f.write(new_src)

print(f"\n✓  Written: {app_path}  ({new_src.count(chr(10))} lines)")
print(f"✓  Backup : {final_bak}")
print("\n🎉  Done! Run:  npm run build")
