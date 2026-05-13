"""
fix_orphaned_timeinput.py
─────────────────────────
Removes the orphaned TimeInput body left at line 7084.

Run from coachiq-stats/:
    python3 fix_orphaned_timeinput.py
"""
import os, shutil

app_path = "src/App.jsx"
if not os.path.exists(app_path):
    print("❌  Cannot find src/App.jsx"); exit(1)

with open(app_path, encoding="utf-8") as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

# Line 7084 (1-indexed) = index 7083 (0-indexed)
# It starts with "){"
# We need to find it and remove from there through the closing "}" of the body

start_idx = None
for i in range(7080, 7090):
    if i < len(lines) and lines[i].strip().startswith("){"):
        start_idx = i
        break

if start_idx is None:
    # broader search
    for i, line in enumerate(lines):
        if line.strip() == "){" and i > 7070 and i < 7100:
            start_idx = i
            break

if start_idx is None:
    print("❌  Could not find the orphaned ){ at line ~7084"); exit(1)

print(f"✓  Found orphaned body start at line {start_idx+1}: {lines[start_idx].rstrip()}")

# Walk forward to find the matching closing brace
depth = 0
end_idx = start_idx
for i in range(start_idx, len(lines)):
    for ch in lines[i]:
        if ch == "{": depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end_idx = i
                break
    if depth == 0 and i > start_idx:
        break

print(f"✓  Orphaned body ends at line {end_idx+1}: {lines[end_idx].rstrip()}")
print(f"   Removing lines {start_idx+1}–{end_idx+1} ({end_idx-start_idx+1} lines)")

bak = app_path + ".orphan.bak"
shutil.copy2(app_path, bak)
print(f"✓  Backup: {bak}")

new_lines = lines[:start_idx] + lines[end_idx+1:]

with open(app_path, "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print(f"✓  Fixed: {app_path}")
print(f"   Was {len(lines)} lines → now {len(new_lines)} lines")
print("\n🎉  Done! Run:  npm run build")
