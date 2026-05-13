"""
show_roster_view.py  —  run from coachiq-stats/
"""
with open("src/App.jsx", encoding="utf-8") as f:
    lines = f.readlines()

start = next(i for i,l in enumerate(lines) if "function RosterView(" in l)
depth, end = 0, start
for i in range(start, len(lines)):
    for ch in lines[i]:
        if ch=="{": depth+=1
        elif ch=="}": depth-=1
    if depth==0 and i>start: end=i+1; break

print(f"RosterView: lines {start+1}–{end} ({end-start} lines)\n")
for i in range(start, end):
    print(f"{i+1:6d}: {lines[i].rstrip()}")
