"""
fix_landing_page.py
───────────────────
Run this from your coachiq-stats/ folder (NOT src/):
    python3 fix_landing_page.py
"""
import sys, os, shutil

app_path = "src/App.jsx"
if not os.path.exists(app_path):
    print("❌  Cannot find src/App.jsx — make sure you're running this from coachiq-stats/")
    sys.exit(1)

with open(app_path, encoding="utf-8") as f:
    lines = f.readlines()

total = len(lines)
print(f"✓  Loaded {total} lines from {app_path}")

# The error is at line 3732 (1-indexed).
# We need to look at lines around there and remove the extra </div>.
# Print context so we can see what's there:
ERR_LINE = 3732 - 1  # 0-indexed

print(f"\nContext around line 3732:")
for i in range(max(0, ERR_LINE-6), min(total, ERR_LINE+4)):
    marker = " <-- ERROR" if i == ERR_LINE else ""
    print(f"  {i+1:4d}: {lines[i].rstrip()}{marker}")

# Strategy: scan backwards from line 3732 to find a blank line followed by
# </div> — that's the extra one to remove.
# The pattern we want to remove is one of the consecutive </div> blocks
# just before {showAuth&&(

# Find the {showAuth&&( line (should be around 3734)
showauth_line = None
for i in range(ERR_LINE, min(total, ERR_LINE+10)):
    if "{showAuth&&(" in lines[i]:
        showauth_line = i
        break

if showauth_line is None:
    print("\n❌  Could not find {showAuth&&( near line 3732. Aborting.")
    sys.exit(1)

print(f"\n✓  Found {{showAuth&&( at line {showauth_line+1}")

# Now scan backwards from showauth_line to find consecutive </div> lines
# and remove one of them
closing_divs = []
i = showauth_line - 1
while i >= 0:
    stripped = lines[i].strip()
    if stripped == "" or stripped == "</div>":
        if stripped == "</div>":
            closing_divs.append(i)
        i -= 1
    else:
        break

print(f"✓  Found {len(closing_divs)} closing </div> lines before {{showAuth&&(: lines {[x+1 for x in closing_divs]}")

if len(closing_divs) < 2:
    print("\n⚠️  Only found one </div> — file may already be correct. Running build to check.")
    os.system("npm run build 2>&1 | tail -20")
    sys.exit(0)

# Remove the FIRST (outermost / last before showAuth) extra </div> and its surrounding blank lines
# We'll remove line closing_divs[0] and any immediately adjacent blank lines
remove_idx = closing_divs[0]

# Back up
bak = app_path + ".bak"
shutil.copy2(app_path, bak)
print(f"\n✓  Backup saved: {bak}")

# Remove that line and the blank line before it if present
to_remove = {remove_idx}
if remove_idx > 0 and lines[remove_idx-1].strip() == "":
    to_remove.add(remove_idx-1)

new_lines = [l for i,l in enumerate(lines) if i not in to_remove]

with open(app_path, "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print(f"✓  Removed {len(to_remove)} line(s) (the extra </div> and blank line before it)")
print(f"✓  File now has {len(new_lines)} lines (was {total})")
print("\n🎉  Done! Now run:  npm run build")
