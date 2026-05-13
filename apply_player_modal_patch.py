"""
apply_player_modal_patch.py
────────────────────────────
1. Replaces PlayerModal with improved version (coaching tab, parent email, grade, eval scores)
2. Adds search + eval score indicators to RosterView

Run from coachiq-stats/:
    python3 apply_player_modal_patch.py
"""
import os, shutil, sys

app_path   = "src/App.jsx"
patch_name = "PlayerModal_improved.jsx"

if not os.path.exists(app_path):
    print("❌  Cannot find src/App.jsx"); sys.exit(1)
patch_path = patch_name
if not os.path.exists(patch_path):
    patch_path = os.path.join("src", patch_name)
if not os.path.exists(patch_path):
    print(f"❌  Cannot find {patch_name}"); sys.exit(1)

with open(app_path,   encoding="utf-8") as f: src   = f.read()
with open(patch_path, encoding="utf-8") as f: patch = f.read()

print(f"✓  Loaded App.jsx ({src.count(chr(10))} lines)")

changes = 0

# ── 1. Replace PlayerModal function ──────────────────────────────────────────
start_idx = src.find("function PlayerModal(")
if start_idx == -1:
    print("❌  Cannot find PlayerModal"); sys.exit(1)

# Find end by brace matching
depth, started, end_idx = 0, False, start_idx
for i in range(start_idx, len(src)):
    for ch in src[i]:
        if ch=="{": depth+=1; started=True
        elif ch=="}":
            depth-=1
            if started and depth==0: end_idx=i+1; break
    if started and depth==0: break

print(f"✓  PlayerModal: chars {start_idx}–{end_idx} ({end_idx-start_idx} chars)")
src = src[:start_idx] + patch.rstrip() + "\n" + src[end_idx:]
changes += 1
print("✓  Replaced PlayerModal")

# ── 2. Add search state to RosterView ────────────────────────────────────────
old = "  const [importing, setImporting]         = useState(false);\n  const fileRef = useRef(null);"
new = "  const [importing, setImporting]         = useState(false);\n  const [search,    setSearch]            = useState(\"\");\n  const fileRef = useRef(null);"
if old in src:
    src = src.replace(old, new, 1); changes += 1; print("✓  Added search state to RosterView")
else:
    print("⚠️  Could not add search state")

# ── 3. Add search input in RosterView header ─────────────────────────────────
old = """      {msg&&(
        <div style={{marginBottom:14,padding:"10px 16px",borderRadius:9,"""
new = """      {/* Search */}
      <div style={{marginBottom:14}}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder={`Search ${(players||[]).length} players…`}
          style={{width:"100%",padding:"9px 14px",background:C.surface,
            border:"1px solid "+C.border,borderRadius:9,color:C.text,
            fontSize:13,outline:"none",fontFamily:"'Outfit',sans-serif",
            boxSizing:"border-box"}}/>
      </div>

      {msg&&(
        <div style={{marginBottom:14,padding:"10px 16px",borderRadius:9,"""
if old in src:
    src = src.replace(old, new, 1); changes += 1; print("✓  Added search input to RosterView")
else:
    print("⚠️  Could not add search input")

# ── 4. Apply search filter to grouped players ─────────────────────────────────
old = "  const grouped = posGroups.map(pos=>({" + "\n" + "    pos, players: (players||[]).filter(p=>primaryPos(p)===pos)" + "\n" + "  })).filter(g=>g.players.length>0);" + "\n" + "  const ungrouped = (players||[]).filter(p=>!posGroups.includes(primaryPos(p)));"
new = "  const searchLC = search.toLowerCase();\n  const filteredPlayers = (players||[]).filter(p=>\n    !search || p.name?.toLowerCase().includes(searchLC) ||\n    allPos(p).some(x=>x.toLowerCase().includes(searchLC))\n  );\n  const grouped = posGroups.map(pos=>({\n    pos, players: filteredPlayers.filter(p=>primaryPos(p)===pos)\n  })).filter(g=>g.players.length>0);\n  const ungrouped = filteredPlayers.filter(p=>!posGroups.includes(primaryPos(p)));"
if old in src:
    src = src.replace(old, new, 1); changes += 1; print("✓  Applied search filter to player groups")
else:
    print("⚠️  Could not apply search filter (trying alternate)")
    old2 = "  const grouped = posGroups.map(pos=>({pos, players: (players||[]).filter(p=>primaryPos(p)===pos)})).filter(g=>g.players.length>0);"
    if old2 in src:
        new2 = "  const searchLC = search.toLowerCase();\n  const filteredPlayers = (players||[]).filter(p=>!search||p.name?.toLowerCase().includes(searchLC)||allPos(p).some(x=>x.toLowerCase().includes(searchLC)));\n  const grouped = posGroups.map(pos=>({pos, players: filteredPlayers.filter(p=>primaryPos(p)===pos)})).filter(g=>g.players.length>0);"
        src = src.replace(old2, new2, 1); changes += 1; print("✓  Applied search filter (alt)")

# ── 5. Show eval score + email indicator on player cards ─────────────────────
old = """                         {avg&&<div style={{color:rColor(parseFloat(avg)),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:18}}>{avg}</div>}"""
new = """                         <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                           {avg&&<div style={{color:rColor(parseFloat(avg)),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:18}}>{avg}</div>}
                           {(()=>{const sv=Object.values(player.scores||{}).filter(v=>v>0);const ov=sv.length?sv.reduce((a,b)=>a+b,0)/sv.length:0;return ov>0?<div style={{color:C.accent,fontSize:10,fontWeight:700}}>★{ov.toFixed(1)}</div>:null;})()}
                         </div>
                         <div style={{display:"flex",flexDirection:"column",gap:3,alignItems:"center",flexShrink:0}}>
                           <div title={player.email?"Has player email":"No email"} style={{width:6,height:6,borderRadius:"50%",background:player.email?"#66bb6a":C.border}}/>
                           <div title={player.parentEmail?"Has parent email":"No parent email"} style={{width:6,height:6,borderRadius:"50%",background:player.parentEmail?"#42a5f5":C.border}}/>
                         </div>"""
if old in src:
    src = src.replace(old, new, 1); changes += 1; print("✓  Added eval score + email dots to cards")
else:
    print("⚠️  Could not update player cards")

# ── Sanity checks ─────────────────────────────────────────────────────────────
checks = [
    ("function PlayerModal(",   "PlayerModal function"),
    ("parentEmail",             "Parent email field"),
    ("grade:",                  "Grade field"),
    ("SCORE_CATS",              "Score categories"),
    ("coaching",                "Coaching tab"),
    ("coachNote",               "Coach note field"),
    ("setScore(",               "Score setter"),
    ("search",                  "Search feature"),
]
print("\nSanity checks:")
all_ok = True
for needle, label in checks:
    ok = needle in src
    print(f"  {'✓' if ok else '❌'}  {label}")
    if not ok: all_ok = False

if not all_ok:
    print("⚠️  Some checks failed — aborting"); sys.exit(1)

bak = app_path + ".modal.bak"
shutil.copy2(app_path, bak)
print(f"\n✓  Backup   : {bak}")
with open(app_path, "w", encoding="utf-8") as f:
    f.write(src)
print(f"✓  Written  : {app_path}  ({src.count(chr(10))} lines)")
print(f"✓  {changes} changes applied")
print("\n🎉  Done! Run:  npm run build")
