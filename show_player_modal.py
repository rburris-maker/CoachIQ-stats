"""
show_player_modal.py  —  run from coachiq-stats/
"""
with open("src/App.jsx", encoding="utf-8") as f:
    lines = f.readlines()

start = next((i for i,l in enumerate(lines) if "function PlayerModal(" in l), None)
if start is None:
    # Try alternate names
    for term in ["PlayerModal", "playerModal", "EditPlayer"]:
        for i,l in enumerate(lines):
            if f"function {term}(" in l:
                start = i; break
        if start: break

if start is None:
    print("PlayerModal not found as function — searching for const/component")
    for i,l in enumerate(lines):
        if "PlayerModal" in l and ("const" in l or "=" in l):
            print(f"  {i+1}: {l.rstrip()}")
    exit()

depth, end = 0, start
for i in range(start, len(lines)):
    for ch in lines[i]:
        if ch=="{": depth+=1
        elif ch=="}": depth-=1
    if depth==0 and i>start: end=i+1; break

print(f"PlayerModal: lines {start+1}–{end} ({end-start} lines)\n")
for i in range(start, end):
    print(f"{i+1:6d}: {lines[i].rstrip()}")
