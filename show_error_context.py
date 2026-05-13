"""
show_error_context.py
─────────────────────
Shows lines around the build error for diagnosis.

Run from coachiq-stats/:
    python3 show_error_context.py
"""
import os

app_path = "src/App.jsx"
if not os.path.exists(app_path):
    print("❌  Cannot find src/App.jsx"); exit(1)

with open(app_path, encoding="utf-8") as f:
    lines = f.readlines()

ERR = 7084
print(f"Total lines: {len(lines)}\n")
print(f"Context around line {ERR}:")
for i in range(max(0, ERR-15), min(len(lines), ERR+5)):
    marker = " <-- ERROR" if i+1 == ERR else ""
    print(f"  {i+1:5d}: {lines[i].rstrip()}{marker}")
