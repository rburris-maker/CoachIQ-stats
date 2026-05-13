"""
show_portal_code.py
────────────────────
Shows the current PlayerPortalPage and nearby code.

Run from coachiq-stats/:
    python3 show_portal_code.py
"""
import os

app_path = "src/App.jsx"
with open(app_path, encoding="utf-8") as f:
    lines = f.readlines()

total = len(lines)
print(f"Total lines: {total}\n")

# Find PlayerPortalPage
for label, marker in [
    ("PlayerPortalPage", "function PlayerPortalPage("),
    ("SquadPage / RosterPage", "function SquadPage("),
    ("RosterPage", "function RosterPage("),
    ("PlayersPage", "function PlayersPage("),
]:
    for i, line in enumerate(lines):
        if marker in line:
            print(f"── {label} at line {i+1} ──")
            for j in range(i, min(i+80, total)):
                print(f"  {j+1:5d}: {lines[j].rstrip()}")
            print(f"  ... (continues)\n")
            break
    else:
        print(f"── {label}: NOT FOUND ──\n")
