function PlayerModal({player, onSave, onDelete, onClose}){
  const isNew = !player.id;
  const initPositions = (()=>{
    const p = player.position || player.positions;
    if(Array.isArray(p)&&p.length) return p;
    if(typeof p==="string"&&p) return [p];
    return [];
  })();

  const [form, setForm] = useState({
    id:           player.id            || ("p"+Date.now()),
    name:         player.name          || "",
    number:       player.number        ?? "",
    positions:    initPositions,
    captain:      player.captain       || false,
    email:        player.email         || "",
    parentEmail:  player.parentEmail   || "",
    grade:        player.grade         || "",
    availability: player.availability  || "available",
    availNote:    player.availNote     || "",
    returnDate:   player.returnDate    || "",
    gradYear:     player.gradYear      || "",
    height:       player.height        || "",
    weight:       player.weight        || "",
    gpa:          player.gpa           || "",
    highlightsUrl:     player.highlightsUrl     || "",
    recruitingStatus:  player.recruitingStatus  || "open",
    recruitingSchools: player.recruitingSchools || [],
    coachScoutNotes:   player.coachScoutNotes   || "",
    videoLinks:        player.videoLinks        || [],
    playerBio:         player.playerBio         || "",
    scores:       player.scores || {technical:0,athletic:0,tactical:0,attitude:0,positional:0},
    coachNote:    player.coachNote || "",
    initialTab:   player.initialTab || "info",
  });

  const [err,          setErr]          = useState("");
  const [activeTab,    setActiveTab]    = useState(player.initialTab||"info");
  const [addingSchool, setAddingSchool] = useState(false);
  const [newSchool,    setNewSchool]    = useState({school:"",division:"D1",contact:"",status:"identified",notes:""});

  const POSITIONS  = ["GK","CB","FB","DM","CM","W","AM","ST"];
  const primaryColor = posColor(form.positions[0]||"CM");

  const SCORE_CATS = [
    {k:"technical",  label:"Technical",  desc:"Ball control, passing, touch", color:"#ff6b00"},
    {k:"athletic",   label:"Athletic",   desc:"Speed, stamina, physicality",  color:"#ef5350"},
    {k:"tactical",   label:"Tactical",   desc:"Positioning, decisions",       color:"#42a5f5"},
    {k:"attitude",   label:"Attitude",   desc:"Effort, coachability",         color:"#66bb6a"},
    {k:"positional", label:"Positional", desc:"Role-specific quality",        color:"#7c6af5"},
  ];

  const scoreVals   = SCORE_CATS.map(c=>form.scores[c.k]||0).filter(v=>v>0);
  const overallScore = scoreVals.length ? scoreVals.reduce((a,b)=>a+b,0)/scoreVals.length : 0;

  function togglePos(p){
    setForm(f=>({...f,positions:f.positions.includes(p)?f.positions.filter(x=>x!==p):[...f.positions,p]}));
  }
  function setScore(cat,val){
    setForm(f=>({...f,scores:{...f.scores,[cat]:val===(f.scores[cat]||0)?0:val}}));
  }
  function addSchool(){
    if(!newSchool.school.trim()) return;
    setForm(f=>({...f,recruitingSchools:[...f.recruitingSchools,{...newSchool,id:"s"+Date.now()}]}));
    setNewSchool({school:"",division:"D1",contact:"",status:"identified",notes:""});
    setAddingSchool(false);
  }
  function removeSchool(id){
    setForm(f=>({...f,recruitingSchools:f.recruitingSchools.filter(s=>s.id!==id)}));
  }
  function save(){
    if(!form.name.trim()){setErr("Name is required");return;}
    onSave({...form,number:parseInt(form.number)||0,position:form.positions,positions:form.positions});
  }

  const iStyle=(extra={})=>({
    width:"100%",padding:"9px 12px",background:C.bg,
    border:"1px solid "+C.border,borderRadius:7,
    color:C.text,fontSize:13,outline:"none",
    fontFamily:"'Outfit',sans-serif",boxSizing:"border-box",...extra
  });

  const TABS = isNew
    ? [{t:"info",l:"Info"}]
    : [{t:"info",l:"Info"},{t:"coaching",l:"Coaching"},{t:"recruiting",l:"Recruiting"}];

  return(
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:1000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:16,
        width:"100%",maxWidth:520,maxHeight:"92vh",display:"flex",flexDirection:"column"}}>

        {/* Header */}
        <div style={{padding:"20px 24px 0",flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:46,height:46,borderRadius:11,background:primaryColor+"22",
                border:"2px solid "+primaryColor+"44",display:"flex",alignItems:"center",
                justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:900,
                color:primaryColor,fontSize:20,flexShrink:0}}>
                {form.number||"#"}
              </div>
              <div>
                <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:20,
                  fontWeight:800,margin:0,lineHeight:1.1}}>
                  {form.name||"New Player"}
                </h2>
                <div style={{color:C.muted,fontSize:12,marginTop:2}}>
                  {form.positions.length>0?form.positions.join(" · "):"No position set"}
                  {form.grade?` · Grade ${form.grade}`:""}
                </div>
              </div>
            </div>
            <button onClick={onClose}
              style={{background:"none",border:"none",color:C.muted,cursor:"pointer",
                fontSize:22,lineHeight:1,padding:4}}>×</button>
          </div>

          {/* Tabs */}
          {!isNew&&(
            <div style={{display:"flex",gap:0,borderBottom:"1px solid "+C.border}}>
              {TABS.map(item=>(
                <button key={item.t} onClick={()=>setActiveTab(item.t)}
                  style={{padding:"9px 16px",background:"none",border:"none",
                    borderBottom:"2px solid "+(activeTab===item.t?C.accent:"transparent"),
                    color:activeTab===item.t?C.accent:C.muted,cursor:"pointer",
                    fontWeight:700,fontSize:13,marginBottom:-1,
                    display:"flex",alignItems:"center",gap:5}}>
                  {item.l}
                  {item.t==="coaching"&&overallScore>0&&(
                    <span style={{background:C.accent+"22",color:C.accent,fontSize:10,
                      fontWeight:700,padding:"1px 6px",borderRadius:10}}>
                      ★{overallScore.toFixed(1)}
                    </span>
                  )}
                  {item.t==="info"&&(form.email||form.parentEmail)&&(
                    <span style={{width:6,height:6,borderRadius:"50%",
                      background:"#66bb6a",display:"inline-block"}}/>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>

          {/* ── INFO TAB ── */}
          {(isNew||activeTab==="info")&&(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>

              <div>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,
                  display:"block",marginBottom:5}}>NAME</label>
                <input value={form.name}
                  onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                  placeholder="Full name" autoFocus style={iStyle()}/>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,
                    display:"block",marginBottom:5}}>JERSEY #</label>
                  <input type="number" value={form.number}
                    onChange={e=>setForm(f=>({...f,number:e.target.value}))}
                    placeholder="9" style={iStyle()}/>
                </div>
                <div>
                  <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,
                    display:"block",marginBottom:5}}>GRADE</label>
                  <select value={form.grade}
                    onChange={e=>setForm(f=>({...f,grade:e.target.value}))}
                    style={iStyle()}>
                    <option value="">—</option>
                    <option value="9">Grade 9</option>
                    <option value="10">Grade 10</option>
                    <option value="11">Grade 11</option>
                    <option value="12">Grade 12</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,
                  display:"block",marginBottom:5}}>PLAYER EMAIL</label>
                <input type="email" value={form.email}
                  onChange={e=>setForm(f=>({...f,email:e.target.value}))}
                  placeholder="player@email.com" style={iStyle()}/>
              </div>

              <div>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,
                  display:"block",marginBottom:5}}>PARENT EMAIL</label>
                <input type="email" value={form.parentEmail||""}
                  onChange={e=>setForm(f=>({...f,parentEmail:e.target.value}))}
                  placeholder="parent@email.com" style={iStyle()}/>
              </div>

              <div>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,
                  display:"block",marginBottom:8}}>POSITIONS</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {POSITIONS.map(p=>(
                    <button key={p} onClick={()=>togglePos(p)}
                      style={{padding:"6px 12px",borderRadius:7,cursor:"pointer",
                        fontSize:12,fontWeight:700,
                        background:form.positions.includes(p)?posColor(p)+"22":"transparent",
                        border:"1px solid "+(form.positions.includes(p)?posColor(p):C.border),
                        color:form.positions.includes(p)?posColor(p):C.muted}}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,
                  display:"block",marginBottom:8}}>AVAILABILITY</label>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {[["available","Available"],["injured","Injured"],["doubtful","Doubtful"],["suspended","Suspended"]].map(([k,l])=>(
                    <button key={k} onClick={()=>setForm(f=>({...f,availability:k}))}
                      style={{padding:"6px 12px",borderRadius:7,cursor:"pointer",
                        fontSize:12,fontWeight:700,
                        background:form.availability===k?C.accent+"22":"transparent",
                        border:"1px solid "+(form.availability===k?C.accent:C.border),
                        color:form.availability===k?C.accent:C.muted}}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                <input type="checkbox" checked={form.captain}
                  onChange={e=>setForm(f=>({...f,captain:e.target.checked}))}
                  style={{width:16,height:16,accentColor:C.accent}}/>
                <span style={{color:C.text,fontSize:13,fontWeight:600}}>Team Captain</span>
              </label>

              {err&&<div style={{color:C.danger,fontSize:12,fontWeight:600}}>{err}</div>}
            </div>
          )}

          {/* ── COACHING TAB ── */}
          {!isNew&&activeTab==="coaching"&&(
            <div style={{display:"flex",flexDirection:"column",gap:18}}>

              {/* Overall score badge */}
              {overallScore>0&&(
                <div style={{display:"flex",alignItems:"center",
                  justifyContent:"space-between",background:C.accent+"12",
                  border:"1px solid "+C.accent+"33",borderRadius:12,
                  padding:"12px 18px"}}>
                  <div>
                    <div style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:1}}>
                      OVERALL EVALUATION
                    </div>
                    <div style={{color:C.muted,fontSize:12,marginTop:2}}>
                      Based on {scoreVals.length} categor{scoreVals.length===1?"y":"ies"}
                    </div>
                  </div>
                  <div style={{color:C.accent,fontFamily:"'Oswald',sans-serif",
                    fontWeight:900,fontSize:36,lineHeight:1}}>
                    {overallScore.toFixed(1)}
                    <span style={{color:C.muted,fontSize:14,fontWeight:400}}>/10</span>
                  </div>
                </div>
              )}

              {/* Score categories */}
              <div>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,
                  display:"block",marginBottom:16}}>EVALUATION SCORES (1–10)</label>
                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  {SCORE_CATS.map(cat=>{
                    const val=form.scores[cat.k]||0;
                    return(
                      <div key={cat.k}>
                        <div style={{display:"flex",justifyContent:"space-between",
                          alignItems:"center",marginBottom:7}}>
                          <div>
                            <span style={{color:cat.color,fontWeight:700,fontSize:13}}>
                              {cat.label}
                            </span>
                            <span style={{color:C.muted,fontSize:11,marginLeft:8}}>
                              {cat.desc}
                            </span>
                          </div>
                          <span style={{color:val>0?cat.color:C.muted,
                            fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:20,
                            minWidth:28,textAlign:"right"}}>
                            {val>0?val:"—"}
                          </span>
                        </div>
                        <div style={{display:"flex",gap:3}}>
                          {[1,2,3,4,5,6,7,8,9,10].map(n=>(
                            <button key={n} onClick={()=>setScore(cat.k,n)}
                              style={{flex:1,height:28,borderRadius:5,cursor:"pointer",
                                border:"1.5px solid "+(n<=val?cat.color:C.border),
                                background:n<=val?cat.color+"22":"transparent",
                                color:n<=val?cat.color:C.muted,
                                fontWeight:700,fontSize:11,transition:"all .08s"}}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Coach note */}
              <div>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,
                  display:"block",marginBottom:8}}>COACH NOTES</label>
                <textarea value={form.coachNote||""} rows={4}
                  onChange={e=>setForm(f=>({...f,coachNote:e.target.value}))}
                  placeholder="Strengths, areas to develop, season observations..."
                  style={{...iStyle(),resize:"vertical",lineHeight:1.6}}/>
              </div>
            </div>
          )}

          {/* ── RECRUITING TAB ── */}
          {!isNew&&activeTab==="recruiting"&&(
            <RecruitingTab
              form={form} setForm={setForm}
              addingSchool={addingSchool} setAddingSchool={setAddingSchool}
              newSchool={newSchool} setNewSchool={setNewSchool}
              addSchool={addSchool} removeSchool={removeSchool}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{padding:"16px 24px",borderTop:"1px solid "+C.border,
          flexShrink:0,display:"flex",gap:10}}>
          {!isNew&&(
            <button onClick={()=>onDelete&&onDelete()}
              style={{padding:"10px 14px",background:C.surface,
                border:"1px solid "+C.border,borderRadius:9,
                color:C.danger,cursor:"pointer",fontSize:13,fontWeight:700}}>
              Delete
            </button>
          )}
          <button onClick={onClose}
            style={{flex:1,padding:"11px",background:C.surface,
              border:"1px solid "+C.border,borderRadius:9,
              color:C.muted,cursor:"pointer",fontSize:14}}>
            Cancel
          </button>
          <button onClick={save}
            style={{flex:2,padding:"11px",background:C.accent,border:"none",
              borderRadius:9,color:"#000",fontWeight:900,fontSize:15,
              cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
            {isNew?"Add Player":"Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
