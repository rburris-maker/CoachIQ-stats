"""
restore_from_git.py
────────────────────
Extracts OnboardingWizard from the git-history copy and
splices it back into the current App.jsx.

Run from coachiq-stats/ AFTER running:
    git show 589eabd:src/App.jsx > /tmp/old_app.jsx

Then:
    python3 restore_from_git.py
"""
import os, shutil

app_path  = "src/App.jsx"
old_path  = "/tmp/old_app.jsx"

if not os.path.exists(app_path):
    print("❌  Cannot find src/App.jsx"); exit(1)
if not os.path.exists(old_path):
    print("❌  Cannot find /tmp/old_app.jsx")
    print("   Run first:  git show 589eabd:src/App.jsx > /tmp/old_app.jsx")
    exit(1)

with open(app_path, encoding="utf-8") as f: src = f.read()
with open(old_path, encoding="utf-8") as f: old = f.read()

# ── Check if already present ──────────────────────────────────────────────────
if "function OnboardingWizard(" in src:
    print("✓  OnboardingWizard already present in App.jsx")
    print("   The issue may be something else — try: npm run build && npm run preview")
    exit(0)

# ── Extract OnboardingWizard block from old file ──────────────────────────────
START_MARKERS = ["// ─── ONBOARDING WIZARD", "function OnboardingWizard("]
start_idx = None
for m in START_MARKERS:
    i = old.find(m)
    if i != -1:
        start_idx = i
        print(f"✓  Found start: '{m}'")
        break

if start_idx is None:
    print("❌  OnboardingWizard not found in /tmp/old_app.jsx either")
    print("   Try a different commit:  git show 67958f1:src/App.jsx > /tmp/old_app.jsx")
    exit(1)

END_MARKERS = [
    "\n// ─── PITCH",
    "\n// ─── PRO GATE",
    "\n// ─── APP ",
    "\nfunction App(",
    "\nfunction TryoutCloseWizard(",
]
# Use whichever comes first after start
end_idx = None
for m in END_MARKERS:
    i = old.find(m, start_idx + 500)
    if i != -1:
        if end_idx is None or i < end_idx:
            end_idx = i
            end_marker = m

if end_idx is None:
    print("❌  Could not find end of OnboardingWizard block"); exit(1)

wizard_block = old[start_idx:end_idx].rstrip()
print(f"✓  Extracted {len(wizard_block.splitlines())} lines (up to '{end_marker.strip()}')")

# ── Find insertion point in current file ─────────────────────────────────────
INSERT_BEFORE = [
    "\n// ─── PITCH",
    "\n// ─── PRO GATE",
    "\nfunction App(",
    "\n// ─── APP ",
]
insert_idx = None
for m in INSERT_BEFORE:
    i = src.find(m)
    if i != -1:
        insert_idx = i + 1  # keep the leading newline
        print(f"✓  Inserting before: '{m.strip()}'")
        break

if insert_idx is None:
    # Last resort: insert before the final export or App function
    i = src.rfind("\nfunction ")
    if i != -1:
        insert_idx = i + 1
        print(f"✓  Inserting before last function at char {i}")

if insert_idx is None:
    print("❌  Could not find insertion point"); exit(1)

# ── Build new source ──────────────────────────────────────────────────────────
new_src = src[:insert_idx] + wizard_block + "\n\n" + src[insert_idx:]

# Verify
assert "function OnboardingWizard(" in new_src, "Verification failed"
print("✓  Verified OnboardingWizard present in new source")

# ── Backup + write ────────────────────────────────────────────────────────────
bak = app_path + ".pre_restore.bak"
shutil.copy2(app_path, bak)
print(f"✓  Backup: {bak}")

with open(app_path, "w", encoding="utf-8") as f:
    f.write(new_src)

print(f"✓  Written: {app_path} ({new_src.count(chr(10))} lines)")
print("\n🎉  Done! Now run:")
print("   npm run build")
print("   git add . && git commit -m 'Restore OnboardingWizard' && git push")
