"""
show_portal_full.py  —  run from coachiq-stats/
"""
import os

with open("src/App.jsx", encoding="utf-8") as f:
    lines = f.readlines()

# Find PlayerPortalPage start
start = next((i for i,l in enumerate(lines) if "function PlayerPortalPage(" in l), None)
if start is None:
    print("Not found"); exit()

# Find where next top-level function starts (end of PlayerPortalPage)
end = start + 1
depth = 0
for i in range(start, len(lines)):
    for ch in lines[i]:
        if ch == "{": depth += 1
        elif ch == "}": depth -= 1
    if depth == 0 and i > start:
        end = i + 1
        break

print(f"PlayerPortalPage: lines {start+1}–{end} ({end-start} lines total)\n")
for i in range(start, end):
    print(f"{i+1:6d}: {lines[i].rstrip()}")
