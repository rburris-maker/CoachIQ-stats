"""
add_seconds_format.py
─────────────────────
Adds a third stat type (Seconds / decimal) alongside MM:SS and Number.

Run from coachiq-stats/:
    python3 add_seconds_format.py
"""
import sys, os, shutil

app_path = "src/App.jsx"
if not os.path.exists(app_path):
    print("❌  Cannot find src/App.jsx"); sys.exit(1)

with open(app_path, encoding="utf-8") as f:
    src = f.read()

bak = app_path + ".seconds.bak"
shutil.copy2(app_path, bak)
print(f"✓  Backup: {bak}")

changes = 0

# ── 1. Replace newStatIsTime state with newStatTimeFormat ────────────────────
old = 'const [newStatIsTime,setNewStatIsTime]= useState(false); // NEW'
new = 'const [newStatTimeFormat,setNewStatTimeFormat]= useState("none"); // "none"|"mmss"|"seconds"'
if old in src:
    src = src.replace(old, new, 1); changes += 1; print("✓  1. Updated newStatTimeFormat state")
else:
    # try without comment
    old2 = 'const [newStatIsTime,setNewStatIsTime]= useState(false);'
    new2 = 'const [newStatTimeFormat,setNewStatTimeFormat]= useState("none");'
    if old2 in src:
        src = src.replace(old2, new2, 1); changes += 1; print("✓  1. Updated newStatTimeFormat state (alt)")
    else:
        print("⚠️  1. Could not find newStatIsTime state — skipping")

# ── 2. Update addCustomStat to use timeFormat ────────────────────────────────
old = '    const stat={id:`st${Date.now()}`,label:newStatLabel.trim(),unit:newStatUnit.trim(),isTime:newStatIsTime};'
new = '    const stat={id:`st${Date.now()}`,label:newStatLabel.trim(),unit:newStatUnit.trim(),isTime:newStatTimeFormat==="mmss",timeFormat:newStatTimeFormat};'
if old in src:
    src = src.replace(old, new, 1); changes += 1; print("✓  2. Updated addCustomStat")
else:
    print("⚠️  2. Could not update addCustomStat")

# ── 3. Reset newStatTimeFormat after adding ──────────────────────────────────
old = 'setNewStatLabel(""); setNewStatUnit(""); setNewStatIsTime(false);'
new = 'setNewStatLabel(""); setNewStatUnit(""); setNewStatTimeFormat("none");'
if old in src:
    src = src.replace(old, new, 1); changes += 1; print("✓  3. Updated reset after addCustomStat")
else:
    print("⚠️  3. Could not update reset")

# ── 4. Replace isTimeStat + add isSecondsStat ────────────────────────────────
old = '''  // Detect time stat: explicit flag OR keyword in label/unit
  function isTimeStat(stat){
    if(stat.isTime) return true;
    const lc=(stat.label+"|"+stat.unit).toLowerCase();
    return /mile|run|time|sprint|speed|sec|min|40m|40y/.test(lc);
  }'''
new = '''  // Detect MM:SS time stat
  function isTimeStat(stat){
    if(stat.timeFormat==="mmss") return true;
    if(stat.isTime&&stat.timeFormat!=="seconds") return true;
    if(!stat.timeFormat&&!stat.isTime){
      const lc=(stat.label+"|"+stat.unit).toLowerCase();
      return /mile|run|time|sprint|speed|min/.test(lc);
    }
    return false;
  }
  // Detect decimal-seconds stat (e.g. 40-yard dash: 4.97)
  function isSecondsStat(stat){
    if(stat.timeFormat==="seconds") return true;
    if(!stat.timeFormat){
      const lc=(stat.label+"|"+stat.unit).toLowerCase();
      return /\b40\b|40m|40y|40yd/.test(lc);
    }
    return false;
  }'''
if old in src:
    src = src.replace(old, new, 1); changes += 1; print("✓  4. Added isSecondsStat + updated isTimeStat")
else:
    print("⚠️  4. Could not update isTimeStat — trying fallback")
    old2 = '''  function isTimeStat(stat){
    if(stat.isTime) return true;
    const lc=(stat.label+"|"+stat.unit).toLowerCase();
    return /mile|run|time|sprint|speed|sec|min|40m|40y/.test(lc);
  }'''
    new2 = '''  function isTimeStat(stat){
    if(stat.timeFormat==="mmss") return true;
    if(stat.isTime&&stat.timeFormat!=="seconds") return true;
    if(!stat.timeFormat&&!stat.isTime){
      const lc=(stat.label+"|"+stat.unit).toLowerCase();
      return /mile|run|time|sprint|speed|min/.test(lc);
    }
    return false;
  }
  function isSecondsStat(stat){
    if(stat.timeFormat==="seconds") return true;
    if(!stat.timeFormat){
      const lc=(stat.label+"|"+stat.unit).toLowerCase();
      return /\b40\b|40m|40y|40yd/.test(lc);
    }
    return false;
  }'''
    if old2 in src:
        src = src.replace(old2, new2, 1); changes += 1; print("✓  4. Added isSecondsStat (fallback)")
    else:
        print("✗  4. FAILED — isTimeStat not found")

# ── 5. Update leaderboard sorting to sort seconds ascending ─────────────────
old = '''                  const sorted2=[...entries].sort((a,b)=>
                    isTimeStat(stat)?timeToSecs(a.val)-timeToSecs(b.val)
                    :parseFloat(b.val)-parseFloat(a.val)
                  );'''
new = '''                  const sorted2=[...entries].sort((a,b)=>
                    isTimeStat(stat)?timeToSecs(a.val)-timeToSecs(b.val)
                    :isSecondsStat(stat)?parseFloat(a.val)-parseFloat(b.val)
                    :parseFloat(b.val)-parseFloat(a.val)
                  );'''
if old in src:
    src = src.replace(old, new, 1); changes += 1; print("✓  5. Updated leaderboard sort for seconds")
else:
    print("⚠️  5. Could not update leaderboard sort")

# ── 6. Update scoring panel: three-way input (TimeInput / seconds / number) ──
old = '''                              {isTm?(
                                <TimeInput
                                  value={selCandObj.customStats?.[stat.id]||""}
                                  onChange={v=>updateCustomStat(selCandObj.id,stat.id,v)}
                                  placeholder="0:00"
                                  style={iS({width:88,padding:"6px 8px",fontSize:16})}
                                />
                              ):(
                                <input type="number" step="any"
                                  value={selCandObj.customStats?.[stat.id]||""}
                                  onChange={e=>updateCustomStat(selCandObj.id,stat.id,e.target.value)}
                                  placeholder="—"
                                  style={iS({width:88,textAlign:"center",fontWeight:700,fontSize:16,padding:"6px 8px"})}/>
                              )}'''
new = '''                              {isTimeStat(stat)?(
                                <TimeInput
                                  value={selCandObj.customStats?.[stat.id]||""}
                                  onChange={v=>updateCustomStat(selCandObj.id,stat.id,v)}
                                  placeholder="0:00"
                                  style={iS({width:88,padding:"6px 8px",fontSize:16})}
                                />
                              ):isSecondsStat(stat)?(
                                <input type="number" step="0.01"
                                  value={selCandObj.customStats?.[stat.id]||""}
                                  onChange={e=>updateCustomStat(selCandObj.id,stat.id,e.target.value)}
                                  placeholder="4.97"
                                  style={iS({width:88,textAlign:"center",fontWeight:700,fontSize:16,padding:"6px 8px"})}/>
                              ):(
                                <input type="number" step="any"
                                  value={selCandObj.customStats?.[stat.id]||""}
                                  onChange={e=>updateCustomStat(selCandObj.id,stat.id,e.target.value)}
                                  placeholder="—"
                                  style={iS({width:88,textAlign:"center",fontWeight:700,fontSize:16,padding:"6px 8px"})}/>
                              )}'''
if old in src:
    src = src.replace(old, new, 1); changes += 1; print("✓  6. Updated scoring panel inputs")
else:
    print("⚠️  6. Could not update scoring panel inputs")

# ── 7. Update scoring panel badge label ─────────────────────────────────────
old = '''                                {isTm&&<span style={{color:C.accent,fontSize:9,fontWeight:700,
                                  marginLeft:6,background:C.accent+"22",padding:"1px 5px",borderRadius:3}}>
                                  ⏱ MM:SS
                                </span>}'''
new = '''                                {isTimeStat(stat)&&<span style={{color:C.accent,fontSize:9,fontWeight:700,
                                  marginLeft:6,background:C.accent+"22",padding:"1px 5px",borderRadius:3}}>
                                  ⏱ MM:SS
                                </span>}
                                {isSecondsStat(stat)&&<span style={{color:"#42a5f5",fontSize:9,fontWeight:700,
                                  marginLeft:6,background:"#42a5f522",padding:"1px 5px",borderRadius:3}}>
                                  ⏱ Sec
                                </span>}'''
if old in src:
    src = src.replace(old, new, 1); changes += 1; print("✓  7. Updated scoring panel badge labels")
else:
    print("⚠️  7. Could not update scoring panel badges")

# ── 8. Update bulk entry cell for seconds ────────────────────────────────────
old = '''                        if(isTimeStat(stat)){
                          // Wrap TimeInput so we can intercept keydown for grid navigation
                          return(
                            <td key={stat.id} style={{padding:"5px 8px",textAlign:"center"}}>
                              <div onKeyDown={e=>handleKeyNav(e,c.id,stat.id)}>
                                <TimeInput
                                  value={val}
                                  onChange={v=>updateLocal(c.id,stat.id,v)}
                                  placeholder="0:00"
                                  style={{...cell,
                                    ref:el=>{ inputRefs.current[key]=el; }
                                  }}
                                />
                              </div>
                            </td>
                          );
                        }
                        return(
                          <td key={stat.id} style={{padding:"5px 8px",textAlign:"center"}}>
                            <input
                              ref={el=>{ inputRefs.current[key]=el; }}
                              type="number" step="any"
                              value={val}
                              onChange={e=>updateLocal(c.id,stat.id,e.target.value)}
                              onKeyDown={e=>handleKeyNav(e,c.id,stat.id)}
                              placeholder="—"
                              style={cell}
                            />
                          </td>
                        );'''
new = '''                        if(isTimeStat(stat)){
                          return(
                            <td key={stat.id} style={{padding:"5px 8px",textAlign:"center"}}>
                              <div onKeyDown={e=>handleKeyNav(e,c.id,stat.id)}>
                                <TimeInput
                                  value={val}
                                  onChange={v=>updateLocal(c.id,stat.id,v)}
                                  placeholder="0:00"
                                  style={{...cell,
                                    ref:el=>{ inputRefs.current[key]=el; }
                                  }}
                                />
                              </div>
                            </td>
                          );
                        }
                        if(isSecondsStat(stat)){
                          return(
                            <td key={stat.id} style={{padding:"5px 8px",textAlign:"center"}}>
                              <input
                                ref={el=>{ inputRefs.current[key]=el; }}
                                type="number" step="0.01"
                                value={val}
                                onChange={e=>updateLocal(c.id,stat.id,e.target.value)}
                                onKeyDown={e=>handleKeyNav(e,c.id,stat.id)}
                                placeholder="4.97"
                                style={cell}
                              />
                            </td>
                          );
                        }
                        return(
                          <td key={stat.id} style={{padding:"5px 8px",textAlign:"center"}}>
                            <input
                              ref={el=>{ inputRefs.current[key]=el; }}
                              type="number" step="any"
                              value={val}
                              onChange={e=>updateLocal(c.id,stat.id,e.target.value)}
                              onKeyDown={e=>handleKeyNav(e,c.id,stat.id)}
                              placeholder="—"
                              style={cell}
                            />
                          </td>
                        );'''
if old in src:
    src = src.replace(old, new, 1); changes += 1; print("✓  8. Updated bulk entry cells")
else:
    print("⚠️  8. Could not update bulk entry cells")

# ── 9. Update bulk entry column header badge ─────────────────────────────────
old = '''                      {isTimeStat(stat)&&<div style={{color:C.accent,fontSize:9,fontWeight:700,marginTop:1}}>⏱ MM:SS</div>}'''
new = '''                      {isTimeStat(stat)&&<div style={{color:C.accent,fontSize:9,fontWeight:700,marginTop:1}}>⏱ MM:SS</div>}
                      {isSecondsStat(stat)&&<div style={{color:"#42a5f5",fontSize:9,fontWeight:700,marginTop:1}}>⏱ Sec</div>}'''
if old in src:
    src = src.replace(old, new, 1); changes += 1; print("✓  9. Updated bulk entry header badges")
else:
    print("⚠️  9. Could not update bulk entry header badges")

# ── 10. Update the type toggle button in Custom Stats tab ────────────────────
old = '''              {/* ── Time toggle ── */}
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <label style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:.5,whiteSpace:"nowrap"}}>TYPE</label>
                <button onClick={()=>setNewStatIsTime(v=>!v)}
                  style={{padding:"8px 12px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12,
                    whiteSpace:"nowrap",background:newStatIsTime?C.accent+"22":C.surface,
                    border:`1.5px solid ${newStatIsTime?C.accent:C.border}`,
                    color:newStatIsTime?C.accent:C.muted}}>
                  {newStatIsTime?"⏱ MM:SS":"# Number"}
                </button>
              </div>'''
new = '''              {/* ── Type toggle: Number → Seconds → MM:SS ── */}
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <label style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:.5,whiteSpace:"nowrap"}}>TYPE</label>
                <button onClick={()=>setNewStatTimeFormat(f=>f==="none"?"seconds":f==="seconds"?"mmss":"none")}
                  style={{padding:"8px 12px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12,
                    whiteSpace:"nowrap",
                    background:newStatTimeFormat==="mmss"?C.accent+"22":newStatTimeFormat==="seconds"?"#42a5f522":C.surface,
                    border:`1.5px solid ${newStatTimeFormat==="mmss"?C.accent:newStatTimeFormat==="seconds"?"#42a5f5":C.border}`,
                    color:newStatTimeFormat==="mmss"?C.accent:newStatTimeFormat==="seconds"?"#42a5f5":C.muted}}>
                  {newStatTimeFormat==="mmss"?"⏱ MM:SS":newStatTimeFormat==="seconds"?"⏱ Seconds":"# Number"}
                </button>
              </div>'''
if old in src:
    src = src.replace(old, new, 1); changes += 1; print("✓  10. Updated type toggle button")
else:
    print("⚠️  10. Could not update type toggle button")

# ── 11. Update Custom Stats tab badge display ────────────────────────────────
old = '''                          {isTimeStat(stat)&&(
                            <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,
                              background:C.accent+"22",color:C.accent}}>⏱ MM:SS</span>
                          )}'''
new = '''                          {isTimeStat(stat)&&(
                            <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,
                              background:C.accent+"22",color:C.accent}}>⏱ MM:SS</span>
                          )}
                          {isSecondsStat(stat)&&(
                            <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,
                              background:"#42a5f522",color:"#42a5f5"}}>⏱ Sec</span>
                          )}'''
if old in src:
    src = src.replace(old, new, 1); changes += 1; print("✓  11. Updated Custom Stats tab badges")
else:
    print("⚠️  11. Could not update Custom Stats tab badges")

# ── Write ─────────────────────────────────────────────────────────────────────
with open(app_path, "w", encoding="utf-8") as f:
    f.write(src)

print(f"\n✓  {changes}/11 changes applied")
if changes >= 8:
    print("🎉  Good to go! Run:  npm run build")
else:
    print("⚠️  Some changes missed — check warnings above")
    print("    The app will still work; missed items are cosmetic or optional.")
    print("    Run:  npm run build  to check")
