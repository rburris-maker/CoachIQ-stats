"""
find_squad_page.py  —  run from coachiq-stats/
Searches for roster/squad/player management code.
"""
import os, re

with open("src/App.jsx", encoding="utf-8") as f:
    lines = f.readlines()

total = len(lines)
print(f"Total lines: {total}\n")

# Search for key function names and nav items
searches = [
    "function Squad", "function Roster", "function Players",
    "function Team", "SquadView", "RosterView", "PlayersView",
    '"squad"', '"roster"', '"players"', '"team"',
    "Squad", "Roster", "player.name", "player.number",
    "addPlayerToTeam", "setRoster", "editPlayer",
]

found = {}
for term in searches:
    for i, line in enumerate(lines):
        if term in line and i not in found:
            found[i] = line.rstrip()

# Print unique matches sorted by line number
print("Key matches:\n")
for i in sorted(found.keys()):
    print(f"  {i+1:6d}: {found[i][:120]}")

# Also find the main nav/router to understand page structure
print("\n\nNav/router section (looking for page switching):\n")
for i, line in enumerate(lines):
    if any(x in line for x in ["activePage", "setPage", "currentPage", "navigate", "page ==="]):
        print(f"  {i+1:6d}: {line.rstrip()[:120]}")
