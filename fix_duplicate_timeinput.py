"""
fix_duplicate_timeinput.py
──────────────────────────
Removes the second (duplicate) TimeInput declaration from App.jsx.

Run from coachiq-stats/:
    python3 fix_duplicate_timeinput.py
"""
import sys, os, shutil

app_path = "src/App.jsx"
if not os.path.exists(app_path):
    print("❌  Cannot find src/App.jsx"); sys.exit(1)

with open(app_path, encoding="utf-8") as f:
    src = f.read()

MARKER = "function TimeInput("
first = src.find(MARKER)
second = src.find(MARKER, first + 1)

if second == -1:
    print("✓  No duplicate found — file looks clean already")
    print("   Try:  npm run build")
    sys.exit(0)

print(f"✓  First  TimeInput at char {first}")
print(f"✓  Second TimeInput at char {second}")

# The second declaration starts at `second`.
# Walk back to include any leading comment block (// ─── TIME INPUT etc.)
# and walk forward to the closing brace of the function.

# Walk back to find start of the block (comment line or blank line before function)
block_start = second
# go back past blank lines and comment lines
lines = src[:second].split("\n")
# remove trailing blank/comment lines from before the duplicate
i = len(lines) - 1
while i >= 0 and (lines[i].strip() == "" or lines[i].strip().startswith("//")):
    i -= 1
block_start = len("\n".join(lines[:i+1])) + 1  # +1 for the newline

# Walk forward to find the end of the function (closing brace at depth 0)
depth = 0
pos = second
started = False
end_pos = second
for idx in range(second, len(src)):
    ch = src[idx]
    if ch == "{":
        depth += 1
        started = True
    elif ch == "}":
        depth -= 1
        if started and depth == 0:
            end_pos = idx + 1
            break

# Include trailing newline(s)
while end_pos < len(src) and src[end_pos] in "\n\r":
    end_pos += 1

removed_text = src[block_start:end_pos]
print(f"\nRemoving {len(removed_text.splitlines())} lines:")
for line in removed_text.splitlines()[:5]:
    print(f"  {line[:80]}")
if len(removed_text.splitlines()) > 5:
    print(f"  ... ({len(removed_text.splitlines())-5} more lines)")

bak = app_path + ".dup.bak"
shutil.copy2(app_path, bak)
print(f"\n✓  Backup : {bak}")

new_src = src[:block_start] + src[end_pos:]

with open(app_path, "w", encoding="utf-8") as f:
    f.write(new_src)

print(f"✓  Fixed  : {app_path}")
print(f"   Was {src.count(chr(10))} lines → now {new_src.count(chr(10))} lines")
print("\n🎉  Done! Run:  npm run build")
