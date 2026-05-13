"""
fix_duplicate_timeinput.py
──────────────────────────
Finds and removes the second complete TimeInput function declaration.

Run from coachiq-stats/:
    python3 fix_duplicate_timeinput.py
"""
import os, shutil

app_path = "src/App.jsx"
if not os.path.exists(app_path):
    print("❌  Cannot find src/App.jsx"); exit(1)

with open(app_path, encoding="utf-8") as f:
    src = f.read()

MARKER = "function TimeInput("

occurrences = []
start = 0
while True:
    idx = src.find(MARKER, start)
    if idx == -1: break
    occurrences.append(idx)
    start = idx + 1

print(f"✓  Found {len(occurrences)} TimeInput declaration(s)")

if len(occurrences) < 2:
    print("✓  No duplicate — try: npm run build")
    exit(0)

second = occurrences[1]
lines = src.splitlines(keepends=True)

# Find line number of second occurrence
char_count = 0
second_line = 0
for i, line in enumerate(lines):
    if char_count + len(line) > second:
        second_line = i
        break
    char_count += len(line)

print(f"✓  Second TimeInput at line {second_line+1}")

# Walk back to include leading comment block
block_start_line = second_line
while block_start_line > 0:
    prev = lines[block_start_line - 1].strip()
    if prev == "" or prev.startswith("//"):
        block_start_line -= 1
    else:
        break

print(f"✓  Block starts at line {block_start_line+1}")

# Walk forward to find the closing brace
depth = 0
started = False
end_line = second_line
for i in range(second_line, len(lines)):
    for ch in lines[i]:
        if ch == "{":
            depth += 1
            started = True
        elif ch == "}":
            depth -= 1
            if started and depth == 0:
                end_line = i
                break
    if started and depth == 0:
        break

# Consume trailing blank lines
while end_line + 1 < len(lines) and lines[end_line + 1].strip() == "":
    end_line += 1

print(f"✓  Block ends at line {end_line+1}")
print(f"   Removing {end_line - block_start_line + 1} lines")

bak = app_path + ".dup.bak"
shutil.copy2(app_path, bak)
print(f"✓  Backup: {bak}")

new_lines = lines[:block_start_line] + lines[end_line+1:]

with open(app_path, "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print(f"✓  Fixed: {app_path}  ({len(lines)} → {len(new_lines)} lines)")
print("\n🎉  Done! Run:  npm run build")
