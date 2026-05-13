"""
fix_lineup_picker_text.py
─────────────────────────
Fixes player name visibility in the lineup builder picker modal
when using light mode (dark card bg + dark text = invisible).

Run from coachiq-stats/:
    python3 fix_lineup_picker_text.py
"""
import os, shutil

app_path = "src/App.jsx"
if not os.path.exists(app_path):
    print("❌  Cannot find src/App.jsx"); exit(1)

with open(app_path, encoding="utf-8") as f:
    src = f.read()

changes = 0

# Fix 1: Player name in picker modal cards
old = """                          <div style={{color:C.text,fontWeight:700,fontSize:13}}>{c.name}</div>
                            <div style={{color:C.muted,fontSize:11}}>{positions.join(" / ")}{c.grade?` · Gr.${c.grade}`:""}</div>"""
new = """                          <div style={{color:"rgba(255,255,255,.9)",fontWeight:700,fontSize:13}}>{c.name}</div>
                            <div style={{color:"rgba(255,255,255,.45)",fontSize:11}}>{positions.join(" / ")}{c.grade?` · Gr.${c.grade}`:""}</div>"""
if old in src:
    src = src.replace(old, new, 1); changes += 1; print("✓  Fixed player name + position text in picker modal")
else:
    print("⚠️  Could not find picker modal name text — trying alternate")
    # Try alternate spacing
    old2 = "color:C.text,fontWeight:700,fontSize:13}}>{c.name}</div>"
    new2 = "color:\"rgba(255,255,255,.9)\",fontWeight:700,fontSize:13}}>{c.name}</div>"
    if old2 in src:
        src = src.replace(old2, new2, 1); changes += 1; print("✓  Fixed player name (alt match)")

# Fix 2: "Clear slot" text
old3 = "background:\"#1a0800\",border:`1px solid ${C.border}`,color:C.muted,fontSize:13}}>— Clear slot"
new3 = "background:\"#1a0800\",border:`1px solid ${C.border}`,color:\"rgba(255,255,255,.4)\",fontSize:13}}>— Clear slot"
if old3 in src:
    src = src.replace(old3, new3, 1); changes += 1; print("✓  Fixed clear slot text")

# Fix 3: player pool names (right panel) - these should use C.text but check if there's an issue
# The player pool uses C.surface background and C.text color which should be fine
# but let's also check the sub badge in player pool
print(f"\n✓  {changes} change(s) applied")

bak = app_path + ".picker.bak"
shutil.copy2(app_path, bak)
with open(app_path, "w", encoding="utf-8") as f:
    f.write(src)

print(f"✓  Saved. Run:  npm run build")
