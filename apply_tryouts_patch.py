"""
apply_tryouts_patch.py
──────────────────────
Applies TryoutsView_improved.jsx and patches TryoutCloseWizard to pass
tryout stats to the player profile when a candidate makes the team.

Run from coachiq-stats/:
    python3 apply_tryouts_patch.py
"""
import sys, os, shutil

app_path = "src/App.jsx"
patch_name = "TryoutsView_improved.jsx"

# ── Locate files ─────────────────────────────────────────────────────────────
if not os.path.exists(app_path):
    print("❌  Cannot find src/App.jsx"); sys.exit(1)

patch_path = patch_name
if not os.path.exists(patch_path):
    patch_path = os.path.join("src", patch_name)
if not os.path.exists(patch_path):
    print(f"❌  Cannot find {patch_name}"); sys.exit(1)

with open(app_path, encoding="utf-8") as f:
    src = f.read()
with open(patch_path, encoding="utf-8") as f:
    patch = f.read()

print(f"✓  App.jsx  : {app_path}  ({src.count(chr(10))} lines)")
print(f"✓  Patch    : {patch_path}")

# ── Find TryoutsView section ──────────────────────────────────────────────────
START_PATTERNS = ["// ─── TIME INPUT", "// ─── TRYOUTS VIEW", "// --- TRYOUTS VIEW"]
start_idx = None
for p in START_PATTERNS:
    i = src.find(p)
    if i != -1:
        start_idx = i
        print(f"✓  Start    : \"{p}\" at char {i}")
        break
if start_idx is None:
    print("❌  Cannot find TryoutsView start"); sys.exit(1)

END_PATTERNS = ["function TryoutCloseWizard(", "// ─── ONBOARDING WIZARD", "// ─── PITCH WITH PLAYERS"]
end_idx = None
for p in END_PATTERNS:
    i = src.find(p, start_idx + 200)
    if i != -1:
        end_idx = i
        print(f"✓  End      : \"{p}\" at char {i}")
        break
if end_idx is None:
    print("❌  Cannot find TryoutsView end"); sys.exit(1)

# ── Build new source with TryoutsView replaced ───────────────────────────────
new_src = src[:start_idx] + patch.rstrip() + "\n\n" + src[end_idx:]

# ── Patch TryoutCloseWizard to attach tryout stats to player ─────────────────
# Look for where the newPlayer object is built inside TryoutCloseWizard
# We add tryoutHistory field to it

WIZARD_PLAYER_PATTERNS = [
    # Pattern A: typical newPlayer construction ending
    "coachNote:\"\"",
    "coachNote: \"\"",
]

wizard_patched = False
for pat in WIZARD_PLAYER_PATTERNS:
    idx = new_src.find(pat, new_src.find("function TryoutCloseWizard("))
    if idx != -1:
        # Check we're in the right place (inside newPlayer object)
        context = new_src[max(0,idx-300):idx+100]
        if "newPlayer" in context or "id:" in context:
            # Insert tryoutHistory after coachNote
            old = pat
            new_field = pat + """,
              tryoutHistory:{
                tryoutName:tryout.name,
                year:tryout.year,
                createdAt:new Date().toISOString(),
                stats:Object.fromEntries(
                  (tryout.customStats||[]).map(s=>[
                    s.label,
                    {
                      best:(cand.customStats||{})[s.id]||"",
                      history:(cand.customStatHistory||{})[s.id]||[],
                      unit:s.unit||"",
                      timeFormat:s.timeFormat||"none",
                      isTime:!!s.isTime,
                    }
                  ])
                )
              }"""
            new_src = new_src.replace(old, new_field, 1)
            wizard_patched = True
            print("✓  Patched  : TryoutCloseWizard → tryoutHistory on player")
            break

if not wizard_patched:
    print("⚠️  Could not patch TryoutCloseWizard — tryout stats won't carry to player profile")
    print("    (App will still build and work; this is a non-critical patch)")

# ── Patch PlayerPortalPage to show tryout history ────────────────────────────
# Find PlayerPortalPage and add a tryout results section
# We look for a good insertion point: after the player stats section or before the closing return

portal_patched = False
PORTAL_TRYOUT_SECTION = """
              {/* ── TRYOUT HISTORY ── */}
              {player.tryoutHistory&&Object.keys(player.tryoutHistory.stats||{}).length>0&&(
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:20,marginTop:16}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                    <ClipboardCheck size={18} color={C.accent}/>
                    <div>
                      <div style={{color:C.accent,fontSize:10,fontWeight:700,letterSpacing:1.5}}>TRYOUT RESULTS</div>
                      <div style={{color:C.text,fontWeight:700,fontSize:14}}>{player.tryoutHistory.tryoutName} · {player.tryoutHistory.year}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {Object.entries(player.tryoutHistory.stats).map(([label,stat])=>{
                      const history=stat.history||[];
                      const hasMult=history.length>1;
                      // Compute improvement
                      let impLabel=null;
                      if(hasMult){
                        const first=history[0].value, latest=history[history.length-1].value;
                        if(stat.timeFormat==="mmss"){
                          const toS=s=>{const p=String(s).split(":");return p.length===2?parseInt(p[0])*60+parseInt(p[1]):parseFloat(s)||9999;};
                          const diff=toS(first)-toS(latest);
                          if(diff){const abs=Math.abs(diff),m=Math.floor(abs/60),s=abs%60;impLabel={improved:diff>0,label:`${diff>0?"↑":"↓"} ${m>0?m+":"+String(s).padStart(2,"0"):s+"s"}`};}
                        } else {
                          const fv=parseFloat(first),lv=parseFloat(latest);
                          if(!isNaN(fv)&&!isNaN(lv)&&fv!==lv){
                            const diff=stat.timeFormat==="seconds"?fv-lv:lv-fv;
                            impLabel={improved:diff>0,label:`${diff>0?"↑":"↓"} ${Math.abs(lv-fv).toFixed(2)}`};
                          }
                        }
                      }
                      return(
                        <div key={label} style={{background:C.surface,borderRadius:9,padding:"10px 14px",border:`1px solid ${C.border}`}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:hasMult?8:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <span style={{color:C.text,fontWeight:700,fontSize:13}}>{label}</span>
                              {stat.unit&&<span style={{color:C.muted,fontSize:11}}>({stat.unit})</span>}
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              {impLabel&&<span style={{color:impLabel.improved?"#66bb6a":"#ef5350",fontSize:12,fontWeight:700}}>{impLabel.label}</span>}
                              <span style={{color:C.accent,fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:17}}>{stat.best||"—"}</span>
                              {hasMult&&<span style={{color:C.muted,fontSize:9,fontWeight:700}}>★ best</span>}
                            </div>
                          </div>
                          {hasMult&&(
                            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                              {history.map((e,i)=>(
                                <div key={e.id||i} style={{display:"flex",alignItems:"center",gap:4,
                                  background:e.value===stat.best?C.accent+"11":C.bg,
                                  border:`1px solid ${e.value===stat.best?C.accent+"44":C.border}`,
                                  borderRadius:5,padding:"3px 8px"}}>
                                  <span style={{color:C.muted,fontSize:9}}>{e.date}</span>
                                  <span style={{color:e.value===stat.best?C.accent:C.text,fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:12}}>{e.value}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}"""

# Find PlayerPortalPage and a good insertion point
portal_fn_idx = new_src.find("function PlayerPortalPage(")
if portal_fn_idx == -1:
    portal_fn_idx = new_src.find("function PlayerPortal(")

if portal_fn_idx != -1:
    # Look for where the home/profile tab renders player info
    # Insert after the "coach notes" section or before the closing of the main tab content
    # Simple approach: find "coachNote" display in the portal and insert after it
    PORTAL_INSERT_AFTER = [
        "player.coachNote&&(",
        "{player.coachNote",
        "COACH NOTE",
        "coachNote",
    ]
    for marker in PORTAL_INSERT_AFTER:
        m_idx = new_src.find(marker, portal_fn_idx)
        if m_idx != -1:
            # Find the closing </div> of that block
            close_idx = new_src.find("</div>", m_idx)
            if close_idx != -1:
                close_idx = new_src.find("</div>", close_idx + 6)  # skip inner div
                if close_idx != -1:
                    insert_at = close_idx + 6
                    new_src = new_src[:insert_at] + PORTAL_TRYOUT_SECTION + new_src[insert_at:]
                    portal_patched = True
                    print("✓  Patched  : PlayerPortalPage → tryout history section added")
                    break
    if not portal_patched:
        print("⚠️  Could not auto-patch PlayerPortalPage — tryout history won't show in portal")
        print("    (App will still build and work)")
else:
    print("⚠️  Could not find PlayerPortalPage function")

# ── Sanity checks ─────────────────────────────────────────────────────────────
checks = [
    ("function TimeInput(",     "TimeInput component"),
    ("function TryoutsView(",   "TryoutsView function"),
    ("addStatEntry",            "addStatEntry function"),
    ("getImprovement",          "getImprovement function"),
    ("getBestVal",              "getBestVal function"),
    ("customStatHistory",       "History data structure"),
    ("newEntryVals",            "Per-stat entry inputs"),
    ("removeStatEntry",         "Remove entry"),
    ("BulkEntryModal",          "Bulk entry modal"),
    ("posFilter",               "Position filter"),
    ("newStatTimeFormat",       "Seconds/MM:SS type toggle"),
]
print("\nSanity checks:")
all_ok = True
for needle, label in checks:
    ok = needle in new_src
    print(f"  {'✓' if ok else '❌'}  {label}")
    if not ok: all_ok = False

if not all_ok:
    print("\n⚠️  Some checks failed. Aborting to protect your file.")
    sys.exit(1)

# ── Backup + write ─────────────────────────────────────────────────────────────
bak = app_path + ".bak"
shutil.copy2(app_path, bak)
print(f"\n✓  Backup   : {bak}")
with open(app_path, "w", encoding="utf-8") as f:
    f.write(new_src)
print(f"✓  Written  : {app_path}  ({new_src.count(chr(10))} lines)")
print("\n🎉  Done! Run:  npm run build")
print(f"   Restore  : cp \"{bak}\" \"{app_path}\"")
