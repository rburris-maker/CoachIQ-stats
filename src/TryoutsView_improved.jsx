// ─── TIME INPUT ───────────────────────────────────────────────────────────────
// Smart MM:SS entry.  Type "523" → "5:23"  "1023" → "10:23"  "45" → "0:45"
// Stores result as a string e.g. "5:23".  Returns "" if cleared.
function TimeInput({value, onChange, placeholder, style}){
  const [disp, setDisp] = useState(value||"");
  useEffect(()=>{ setDisp(value||""); },[value]);

  function fmt(raw){
    const d = raw.replace(/\D/g,"");
    if(!d) return "";
    if(d.length<=2){ const s=Math.min(parseInt(d,10),59); return "0:"+String(s).padStart(2,"0"); }
    const secs=d.slice(-2), mins=d.slice(0,-2);
    return parseInt(mins,10)+":"+String(Math.min(parseInt(secs,10),59)).padStart(2,"0");
  }

  function commit(){ const f=fmt(disp); setDisp(f); onChange(f); }

  return(
    <input
      value={disp}
      onChange={e=>setDisp(e.target.value.replace(/[^0-9:]/g,""))}
      onBlur={commit}
      onKeyDown={e=>{ if(e.key==="Enter"||e.key==="Tab"){ e.preventDefault(); commit(); } }}
      placeholder={placeholder||"0:00"}
      style={{textAlign:"center",fontFamily:"'Oswald',sans-serif",fontWeight:700,
        letterSpacing:1,...(style||{})}}
    />
  );
}

// ─── TRYOUTS VIEW ─────────────────────────────────────────────────────────────
function TryoutsView({tryouts, setTryouts, roster, setRoster, teams, activeTeamId, onSwitchTeam, addPlayerToTeam}){
  const [selTryout,  setSelTryout]  = useState(null);
  const [selCand,    setSelCand]    = useState(null);
  const [activeTab,  setActiveTab]  = useState("candidates");
  const [lineupTeam, setLineupTeam] = useState("varsity");
  const [creating,   setCreating]   = useState(false);
  const [addingCand, setAddingCand] = useState(false);
  const [pickingSlot,setPickingSlot]= useState(null);
  const [importMsg,  setImportMsg]  = useState(null);
  const [closeWizard,setCloseWizard]= useState(false);
  // NEW
  const [posFilter,      setPosFilter]     = useState("All");
  const [showBulk,       setShowBulk]      = useState(false);
  const [openStatNotes,  setOpenStatNotes] = useState({}); // {candId_statId: bool}

  const fileRef = useRef(null);

  const [tForm, setTForm] = useState({name:"",year:new Date().getFullYear().toString(),teamType:"highschool"});
  const [cForm, setCForm] = useState({name:"",primaryPos:"CM",secondaryPos:"",grade:"9",club:"",notes:""});
  const [newStatLabel, setNewStatLabel] = useState("");
  const [newStatUnit,  setNewStatUnit]  = useState("");
  const [newStatIsTime,setNewStatIsTime]= useState(false); // NEW

  const POSITIONS = ["GK","CB","FB","DM","CM","W","ST"];
  const SCORE_CATS = [
    {k:"technical",  label:"Technical",   desc:"Ball control, passing, first touch", color:"#ff6b00"},
    {k:"athletic",   label:"Athletic",    desc:"Speed, stamina, physicality",         color:"#ef5350"},
    {k:"tactical",   label:"Tactical",    desc:"Positioning, decision making",        color:"#42a5f5"},
    {k:"attitude",   label:"Attitude",    desc:"Effort, coachability, communication", color:"#66bb6a"},
    {k:"positional", label:"Positional",  desc:"Quality in their specific role",      color:"#7c6af5"},
  ];
  const HS_STATUS = [
    {k:"prospect",label:"Prospect",color:C.muted},
    {k:"varsity", label:"Varsity", color:C.accent},
    {k:"jv",      label:"JV",      color:"#ffb300"},
    {k:"jvb",     label:"JVB",     color:"#42a5f5"},
    {k:"cut",     label:"Cut",     color:C.danger},
  ];
  const LINEUP_TEAMS = [
    {k:"varsity",label:"Varsity",color:C.accent},
    {k:"jv",     label:"JV",     color:"#ffb300"},
    {k:"jvb",    label:"JVB",    color:"#42a5f5"},
  ];
  const FORMATIONS = ["4-3-3","4-4-2","4-2-3-1","3-5-2","5-3-2"];
  const SLOTS_FOR = f=>{
    const m={"4-3-3":{GK:1,DEF:4,MID:3,FWD:3},"4-4-2":{GK:1,DEF:4,MID:4,FWD:2},
              "4-2-3-1":{GK:1,DEF:4,MID:5,FWD:1},"3-5-2":{GK:1,DEF:3,MID:5,FWD:2},
              "5-3-2":{GK:1,DEF:5,MID:3,FWD:2}};
    return m[f]||m["4-3-3"];
  };
  const ZONES=[{key:"GK",label:"Goalkeeper",color:"#ffb300"},{key:"DEF",label:"Defenders",color:"#42a5f5"},
               {key:"MID",label:"Midfielders",color:"#66bb6a"},{key:"FWD",label:"Forwards",color:"#ff6b00"}];

  // Position filter groups
  const POS_GROUP={GK:"GK",CB:"DEF",FB:"DEF",DM:"MID",CM:"MID",W:"MID",AM:"MID",ST:"FWD"};
  const POS_FILTERS=["All","GK","DEF","MID","FWD"];
  const POS_FILTER_COL={All:C.accent,GK:"#ffb300",DEF:"#42a5f5",MID:"#66bb6a",FWD:"#ff6b00"};

  function avgScore(scores){
    const vals=Object.values(scores||{}).filter(v=>v>0);
    return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
  }

  // Detect time stat: explicit flag OR keyword in label/unit
  function isTimeStat(stat){
    if(stat.isTime) return true;
    const lc=(stat.label+"|"+stat.unit).toLowerCase();
    return /mile|run|time|sprint|speed|sec|min|40m|40y/.test(lc);
  }
  function timeToSecs(str){
    if(!str) return 9999;
    const p=String(str).split(":");
    return p.length===2 ? parseInt(p[0],10)*60+parseInt(p[1],10) : parseFloat(str)||9999;
  }

  function upd(fn){ setTryouts(prev=>prev.map(t=>t.id===selTryout?{...t,...fn(t)}:t)); }

  function createTryout(){
    if(!tForm.name.trim()) return;
    const t={id:`try${Date.now()}`,name:tForm.name.trim(),year:tForm.year,
      teamType:tForm.teamType||"highschool",status:"open",candidates:[],customStats:[],
      lineups:{
        varsity:{formation:"4-3-3",slots:{GK:[null],DEF:[null,null,null,null],MID:[null,null,null],FWD:[null,null,null]}},
        jv:     {formation:"4-3-3",slots:{GK:[null],DEF:[null,null,null,null],MID:[null,null,null],FWD:[null,null,null]}},
        jvb:    {formation:"4-3-3",slots:{GK:[null],DEF:[null,null,null,null],MID:[null,null,null],FWD:[null,null,null]}},
      },createdAt:new Date().toISOString()};
    setTryouts(prev=>[t,...prev]);
    setSelTryout(t.id); setCreating(false);
  }

  function addCandidate(){
    if(!cForm.name.trim()) return;
    const tryout=tryouts.find(t=>t.id===selTryout);
    const initCS={};
    (tryout?.customStats||[]).forEach(s=>{ initCS[s.id]=""; });
    const positions=[cForm.primaryPos,...(cForm.secondaryPos&&cForm.secondaryPos!==cForm.primaryPos?[cForm.secondaryPos]:[])];
    const c={id:`c${Date.now()}`,name:cForm.name.trim(),positions,primaryPos:cForm.primaryPos,
      grade:tryout?.teamType==="highschool"?cForm.grade:"",
      club:tryout?.teamType==="club"?cForm.club:"",
      scores:{technical:0,athletic:0,tactical:0,attitude:0,positional:0},
      customStats:initCS, customStatNotes:{},   // NEW: per-stat notes
      status:"prospect",notes:cForm.notes,coachNote:""};
    upd(t=>({candidates:[...t.candidates,c]}));
    setCForm({name:"",primaryPos:"CM",secondaryPos:"",grade:"9",club:"",notes:""});
    setAddingCand(false); setSelCand(c.id);
  }

  function updateScore(candId,cat,val){
    upd(t=>({candidates:t.candidates.map(c=>c.id!==candId?c:{...c,scores:{...c.scores,[cat]:val}})}));
  }
  function updateCandField(candId,key,val){
    upd(t=>({candidates:t.candidates.map(c=>c.id!==candId?c:{...c,[key]:val})}));
  }
  function updateCustomStat(candId,statId,val){
    upd(t=>({candidates:t.candidates.map(c=>c.id!==candId?c:{...c,customStats:{...c.customStats,[statId]:val}})}));
  }
  function updateStatNote(candId,statId,note){
    upd(t=>({candidates:t.candidates.map(c=>c.id!==candId?c:{...c,customStatNotes:{...(c.customStatNotes||{}),[statId]:note}})}));
  }
  function deleteCandidate(candId){
    upd(t=>({candidates:t.candidates.filter(c=>c.id!==candId)}));
    setSelCand(null);
  }

  function addCustomStat(){
    if(!newStatLabel.trim()) return;
    const stat={id:`st${Date.now()}`,label:newStatLabel.trim(),unit:newStatUnit.trim(),isTime:newStatIsTime};
    upd(t=>({
      customStats:[...(t.customStats||[]),stat],
      candidates:t.candidates.map(c=>({...c,customStats:{...c.customStats,[stat.id]:""}}))
    }));
    setNewStatLabel(""); setNewStatUnit(""); setNewStatIsTime(false);
  }
  function removeCustomStat(statId){
    upd(t=>({
      customStats:(t.customStats||[]).filter(s=>s.id!==statId),
      candidates:t.candidates.map(c=>{const cs={...c.customStats};delete cs[statId];return{...c,customStats:cs};})
    }));
  }

  function setLineupFormation(team,formation){
    const slots=SLOTS_FOR(formation);
    const ns={};
    Object.entries(slots).forEach(([zone,count])=>{ ns[zone]=Array(count).fill(null); });
    upd(t=>({lineups:{...t.lineups,[team]:{formation,slots:ns}}}));
  }
  function assignLineupSlot(team,zone,idx,candId){
    upd(t=>{
      const lu={...t.lineups[team]};
      const slots={...lu.slots,[zone]:[...lu.slots[zone]]};
      slots[zone][idx]=candId||null;
      return {lineups:{...t.lineups,[team]:{...lu,slots}}};
    });
    setPickingSlot(null);
  }

  function downloadTemplate(){
    const tryout=tryouts.find(t=>t.id===selTryout);
    const isHS=tryout?.teamType==="highschool";
    const wb=XLSX.utils.book_new();
    const headers=["Name","Primary Position","Secondary Position",isHS?"Grade":"Club/Team","Notes"];
    const sample=[["Alex Johnson","CM","W",isHS?"10":"FC United","Strong in transition"]];
    const ws=XLSX.utils.aoa_to_sheet([headers,...sample]);
    ws["!cols"]=[{wch:22},{wch:18},{wch:18},{wch:14},{wch:28}];
    XLSX.utils.book_append_sheet(wb,ws,"Candidates");
    const buf=XLSX.write(wb,{type:"array",bookType:"xlsx"});
    const url=URL.createObjectURL(new Blob([buf],{type:"application/octet-stream"}));
    const a=document.createElement("a");a.href=url;a.download="TryoutCandidates_Template.xlsx";a.click();
  }

  async function handleImport(e){
    const file=e.target.files?.[0]; if(!file)return;
    const tryout=tryouts.find(t=>t.id===selTryout);
    const isHS=tryout?.teamType==="highschool";
    try{
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:"array"});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
      const data=rows.slice(1).filter(r=>r[0]?.toString().trim());
      const initCS={};
      (tryout?.customStats||[]).forEach(s=>{ initCS[s.id]=""; });
      const newCands=data.map(r=>{
        const primary=(r[1]?.toString().trim().toUpperCase())||"CM";
        const secondary=(r[2]?.toString().trim().toUpperCase())||"";
        const positions=[primary,...(secondary&&secondary!==primary?[secondary]:[])];
        return{
          id:`c${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name:r[0].toString().trim(),positions,primaryPos:primary,
          grade:isHS?(r[3]?.toString().trim()||""):"",
          club:!isHS?(r[3]?.toString().trim()||""):"",
          notes:r[4]?.toString().trim()||"",
          scores:{technical:0,athletic:0,tactical:0,attitude:0,positional:0},
          customStats:{...initCS},customStatNotes:{},status:"prospect",coachNote:""
        };
      });
      upd(t=>({candidates:[...t.candidates,...newCands]}));
      setImportMsg({type:"ok",text:`✓ Imported ${newCands.length} candidates`});
    }catch(err){
      setImportMsg({type:"err",text:`✗ ${err.message}`});
    }
    e.target.value="";
    setTimeout(()=>setImportMsg(null),4000);
  }

  const iS=(extra={})=>({padding:"8px 12px",background:C.bg,border:`1px solid ${C.border}`,
    borderRadius:8,color:C.text,fontSize:13,outline:"none",
    fontFamily:"'Outfit',sans-serif",boxSizing:"border-box",width:"100%",...extra});

  // ── TRYOUT LIST ──────────────────────────────────────────────────────────
  if(!selTryout) return(
    <div style={{padding:20,maxWidth:800,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2}}>SQUAD</div>
          <h1 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:28,fontWeight:800,marginTop:4}}>Tryouts</h1>
        </div>
        <button onClick={()=>setCreating(true)}
          style={{display:"flex",alignItems:"center",gap:8,padding:"10px 18px",background:C.accent,
            border:"none",borderRadius:10,color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",
            fontFamily:"'Oswald',sans-serif"}}>
          <Plus size={15}/>New Tryout
        </button>
      </div>

      {creating&&(
        <div style={{background:C.card,border:`1px solid ${C.accent}44`,borderRadius:14,padding:20,marginBottom:16}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>NEW TRYOUT SESSION</div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            {[{k:"highschool",label:"High School"},{k:"club",label:"Club"}].map(opt=>(
              <button key={opt.k} onClick={()=>setTForm(f=>({...f,teamType:opt.k}))}
                style={{flex:1,padding:"9px",background:tForm.teamType===opt.k?C.accent+"22":C.surface,
                  border:`1px solid ${tForm.teamType===opt.k?C.accent:C.border}`,borderRadius:9,
                  color:tForm.teamType===opt.k?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:13}}>
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 120px",gap:10,marginBottom:12}}>
            <input value={tForm.name} onChange={e=>setTForm(f=>({...f,name:e.target.value}))}
              placeholder={tForm.teamType==="highschool"?"e.g. Varsity 2025-26":"e.g. U16 Spring Tryouts"} style={iS()}/>
            <input value={tForm.year} onChange={e=>setTForm(f=>({...f,year:e.target.value}))} placeholder="Year" style={iS()}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={createTryout} disabled={!tForm.name.trim()}
              style={{padding:"9px 20px",background:tForm.name.trim()?C.accent:"#2a1000",border:"none",borderRadius:9,
                color:tForm.name.trim()?"#000":C.muted,fontWeight:800,fontSize:14,cursor:"pointer"}}>Create</button>
            <button onClick={()=>setCreating(false)}
              style={{padding:"9px 16px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,color:C.muted,cursor:"pointer",fontSize:13}}>Cancel</button>
          </div>
        </div>
      )}

      {tryouts.length===0&&!creating
        ?<div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"48px 24px",textAlign:"center"}}>
            <ClipboardCheck size={40} style={{color:C.muted,opacity:.3,marginBottom:12}}/>
            <div style={{color:C.text,fontSize:15,fontWeight:600}}>No tryout sessions yet</div>
            <div style={{color:C.muted,fontSize:13,marginTop:6}}>Create your first tryout to start evaluating candidates</div>
          </div>
        :tryouts.map(t=>{
            const signed=t.candidates.filter(c=>c.status==="varsity").length;
            const jv=t.candidates.filter(c=>c.status==="jv").length;
            const cut=t.candidates.filter(c=>c.status==="cut").length;
            return(
              <div key={t.id} onClick={()=>{setSelTryout(t.id);setActiveTab("candidates");setSelCand(null);setPosFilter("All");}}
                style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,
                  padding:"16px 20px",marginBottom:10,cursor:"pointer",
                  display:"flex",alignItems:"center",gap:16,transition:"all .15s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                <div style={{width:46,height:46,borderRadius:11,background:C.accent+"22",
                  border:`2px solid ${C.accent}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <ClipboardCheck size={22} color={C.accent}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{color:C.text,fontWeight:700,fontSize:15,marginBottom:4}}>{t.name}</div>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                    <span style={{color:C.muted,fontSize:12}}>{t.year}</span>
                    <span style={{color:C.muted,fontSize:12,background:C.surface,padding:"1px 7px",borderRadius:5,border:`1px solid ${C.border}`}}>{t.teamType==="club"?"Club":"High School"}</span>
                    <span style={{color:C.muted,fontSize:12}}>{t.candidates.length} candidates</span>
                    {signed>0&&<span style={{color:C.accent,fontSize:12,fontWeight:700}}>{signed} varsity</span>}
                    {jv>0&&<span style={{color:"#ffb300",fontSize:12,fontWeight:700}}>{jv} JV</span>}
                    {cut>0&&<span style={{color:C.danger,fontSize:12,fontWeight:700}}>{cut} cut</span>}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{padding:"3px 10px",background:t.status==="open"?C.accent+"22":"#2a1000",
                    border:`1px solid ${t.status==="open"?C.accent:C.border}`,borderRadius:6,
                    color:t.status==="open"?C.accent:C.muted,fontSize:11,fontWeight:700}}>
                    {t.status==="open"?"OPEN":"CLOSED"}
                  </span>
                  <ChevronRight size={16} color={C.muted}/>
                </div>
              </div>
            );
          })
      }
    </div>
  );

  // ── CLOSE WIZARD ─────────────────────────────────────────────────────────
  if(closeWizard&&selTryout){
    const tryout=tryouts.find(t=>t.id===selTryout);
    if(tryout) return(
      <TryoutCloseWizard
        tryout={tryout} teams={teams||[]} addPlayerToTeam={addPlayerToTeam}
        onClose={()=>setCloseWizard(false)}
        onDone={()=>{ setTryouts(prev=>prev.map(t=>t.id===selTryout?{...t,status:"closed"}:t)); setCloseWizard(false); }}
      />
    );
  }

  // ── TRYOUT DETAIL ────────────────────────────────────────────────────────
  const tryout=tryouts.find(t=>t.id===selTryout);
  if(!tryout) return null;

  const customStats=tryout.customStats||[];
  const lineups=tryout.lineups||{};
  const curLineup=lineups[lineupTeam]||{formation:"4-3-3",slots:{GK:[null],DEF:[null,null,null,null],MID:[null,null,null],FWD:[null,null,null]}};

  const allSorted=[...tryout.candidates].sort((a,b)=>avgScore(b.scores)-avgScore(a.scores));
  const sorted=posFilter==="All"?allSorted
    :allSorted.filter(c=>POS_GROUP[c.primaryPos||c.positions?.[0]]===posFilter);
  const selCandObj=selCand?tryout.candidates.find(c=>c.id===selCand):null;

  // ── BULK ENTRY MODAL ─────────────────────────────────────────────────────
  // Defined as inner function so it closes over tryout state
  function BulkEntryModal(){
    if(!customStats.length) return(
      <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:2000,
        display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:28,maxWidth:400,width:"100%"}}>
          <h3 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:20,fontWeight:800,marginBottom:10}}>No Measurables Yet</h3>
          <p style={{color:C.muted,fontSize:14,lineHeight:1.6,marginBottom:20}}>
            Add stats like Mile Run or 40m Sprint in the Custom Stats tab first.
          </p>
          <button onClick={()=>setShowBulk(false)}
            style={{width:"100%",padding:"11px",background:C.surface,border:`1px solid ${C.border}`,
              borderRadius:9,color:C.muted,cursor:"pointer",fontSize:14}}>Close</button>
        </div>
      </div>
    );

    // Local state — flushed on Save All
    const [local, setLocal] = useState(()=>{
      const init={};
      tryout.candidates.forEach(c=>{ init[c.id]={...(c.customStats||{})}; });
      return init;
    });

    function updateLocal(cid,sid,val){
      setLocal(p=>({...p,[cid]:{...p[cid],[sid]:val}}));
    }

    function flushAndClose(){
      upd(t=>({candidates:t.candidates.map(c=>({...c,customStats:{...(c.customStats||{}),...(local[c.id]||{})}}))}));
      setShowBulk(false);
    }

    // Focus management: store refs in a flat map keyed by "candId_statId"
    const inputRefs=useRef({});

    function moveFocus(cid,sid,dir){
      const ci=allSorted.findIndex(c=>c.id===cid);
      const si=customStats.findIndex(s=>s.id===sid);
      let nc=cid, ns=sid;
      if(dir==="right"){ if(si<customStats.length-1) ns=customStats[si+1].id; else if(ci<allSorted.length-1){nc=allSorted[ci+1].id;ns=customStats[0].id;} }
      else if(dir==="left"){ if(si>0) ns=customStats[si-1].id; else if(ci>0){nc=allSorted[ci-1].id;ns=customStats[customStats.length-1].id;} }
      else if(dir==="down"&&ci<allSorted.length-1) nc=allSorted[ci+1].id;
      else if(dir==="up"&&ci>0) nc=allSorted[ci-1].id;
      inputRefs.current[nc+"_"+ns]?.focus();
    }

    function handleKeyNav(e,cid,sid){
      if(e.key==="Tab"&&!e.shiftKey){e.preventDefault();moveFocus(cid,sid,"right");}
      else if(e.key==="Tab"&&e.shiftKey){e.preventDefault();moveFocus(cid,sid,"left");}
      else if(e.key==="Enter"){e.preventDefault();moveFocus(cid,sid,"down");}
      else if(e.key==="ArrowDown"){e.preventDefault();moveFocus(cid,sid,"down");}
      else if(e.key==="ArrowUp"){e.preventDefault();moveFocus(cid,sid,"up");}
    }

    const cell={width:"100%",padding:"6px 8px",background:C.bg,border:`1px solid ${C.border}`,
      borderRadius:6,color:C.text,fontSize:13,fontWeight:700,outline:"none",
      fontFamily:"'Oswald',sans-serif",textAlign:"center",boxSizing:"border-box"};

    return(
      <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:2000,
        display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,
          width:"100%",maxWidth:Math.min(220+customStats.length*140,920),
          maxHeight:"90vh",display:"flex",flexDirection:"column"}}>

          {/* Header */}
          <div style={{padding:"18px 22px 14px",borderBottom:`1px solid ${C.border}`,
            flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2,marginBottom:2}}>BULK ENTRY</div>
              <h3 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:20,fontWeight:800}}>
                Enter Measurables — {allSorted.length} candidates
              </h3>
            </div>
            <div style={{color:C.muted,fontSize:11,textAlign:"right",lineHeight:1.8}}>
              <div>Tab → next cell</div>
              <div>Enter ↓ next row</div>
            </div>
          </div>

          {/* Grid */}
          <div style={{flex:1,overflowY:"auto",overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{borderBottom:`2px solid ${C.border}`}}>
                  <th style={{padding:"10px 16px",textAlign:"left",color:C.muted,fontWeight:600,
                    fontSize:11,letterSpacing:1,position:"sticky",left:0,background:C.card,
                    minWidth:160,zIndex:2}}>CANDIDATE</th>
                  {customStats.map(stat=>(
                    <th key={stat.id} style={{padding:"10px 14px",textAlign:"center",color:C.muted,
                      fontWeight:600,fontSize:10,letterSpacing:.5,minWidth:120,whiteSpace:"nowrap"}}>
                      <div>{stat.label.toUpperCase()}</div>
                      {stat.unit&&<div style={{color:C.border,fontWeight:400,fontSize:9}}>{stat.unit}</div>}
                      {isTimeStat(stat)&&<div style={{color:C.accent,fontSize:9,fontWeight:700,marginTop:1}}>⏱ MM:SS</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allSorted.map((c,ri)=>{
                  const pc=posColor(c.primaryPos||c.positions?.[0]||"CM");
                  return(
                    <tr key={c.id} style={{borderBottom:`1px solid ${C.border}`,
                      background:ri%2===0?C.card:C.surface}}>
                      {/* Sticky name column */}
                      <td style={{padding:"8px 16px",position:"sticky",left:0,
                        background:ri%2===0?C.card:C.surface,zIndex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:26,height:26,borderRadius:6,flexShrink:0,
                            background:pc+"22",border:`1.5px solid ${pc}44`,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontFamily:"'Oswald',sans-serif",fontWeight:700,color:pc,fontSize:11}}>
                            {(c.positions||[c.primaryPos||"CM"])[0]}
                          </div>
                          <div>
                            <div style={{color:C.text,fontWeight:700,fontSize:13}}>{c.name}</div>
                            {c.grade&&<div style={{color:C.muted,fontSize:10}}>Gr.{c.grade}</div>}
                          </div>
                        </div>
                      </td>
                      {/* Stat cells */}
                      {customStats.map(stat=>{
                        const key=c.id+"_"+stat.id;
                        const val=local[c.id]?.[stat.id]||"";
                        if(isTimeStat(stat)){
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
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div style={{padding:"14px 22px",borderTop:`1px solid ${C.border}`,
            display:"flex",gap:10,justifyContent:"flex-end",flexShrink:0}}>
            <button onClick={()=>setShowBulk(false)}
              style={{padding:"10px 20px",background:C.surface,border:`1px solid ${C.border}`,
                borderRadius:9,color:C.muted,cursor:"pointer",fontSize:13}}>Cancel</button>
            <button onClick={flushAndClose}
              style={{padding:"10px 28px",background:C.accent,border:"none",borderRadius:9,
                color:"#000",fontWeight:800,fontSize:14,cursor:"pointer",
                fontFamily:"'Oswald',sans-serif"}}>Save All →</button>
          </div>
        </div>
      </div>
    );
  }

  return(
    <div style={{padding:20,maxWidth:1200,margin:"0 auto"}}>

      {showBulk&&<BulkEntryModal/>}

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        <button onClick={()=>{setSelTryout(null);setSelCand(null);}}
          style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,
            padding:"8px 14px",color:C.text,cursor:"pointer",fontSize:13}}>← Back</button>
        <div style={{flex:1}}>
          <div style={{color:C.muted,fontSize:12}}>{tryout.year} · {tryout.teamType==="club"?"Club":"High School"}</div>
          <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:800}}>{tryout.name}</h2>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {customStats.length>0&&(
            <button onClick={()=>setShowBulk(true)}
              style={{display:"flex",alignItems:"center",gap:7,padding:"9px 16px",
                background:C.accent,border:"none",borderRadius:9,color:"#000",
                fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
              ⚡ Bulk Enter Times
            </button>
          )}
          <button onClick={()=>tryout.status==="open"?setCloseWizard(true):setTryouts(prev=>prev.map(t=>t.id===selTryout?{...t,status:"open"}:t))}
            style={{padding:"8px 14px",background:tryout.status==="open"?C.accent+"22":"#2a1000",
              border:`1px solid ${tryout.status==="open"?C.accent:C.border}`,borderRadius:8,
              color:tryout.status==="open"?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:12}}>
            {tryout.status==="open"?"Close & Submit":"Reopen"}
          </button>
          <button onClick={()=>{if(window.confirm("Delete this tryout?"))setTryouts(prev=>prev.filter(t=>t.id!==selTryout));setSelTryout(null);}}
            style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,
              padding:"8px 12px",color:C.muted,cursor:"pointer",display:"flex",
              alignItems:"center",gap:5,fontSize:12}}>
            <Trash2 size={13}/>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:18,borderBottom:`1px solid ${C.border}`,paddingBottom:0}}>
        {[{k:"candidates",label:"Candidates"},{k:"lineups",label:"Lineup Builder"},{k:"stats",label:"Custom Stats"}].map(tab=>(
          <button key={tab.k} onClick={()=>setActiveTab(tab.k)}
            style={{padding:"9px 18px",background:"transparent",border:"none",cursor:"pointer",
              color:activeTab===tab.k?C.accent:C.muted,fontWeight:700,fontSize:13,
              borderBottom:activeTab===tab.k?`2px solid ${C.accent}`:"2px solid transparent",
              marginBottom:-1,transition:"all .12s"}}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── CANDIDATES TAB ─────────────────────────────────────────────── */}
      {activeTab==="candidates"&&(
        <div>
          {/* Toolbar */}
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
            <button onClick={()=>setAddingCand(true)}
              style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",background:C.accent,
                border:"none",borderRadius:8,color:"#000",fontWeight:800,fontSize:13,cursor:"pointer"}}>
              <Plus size={14}/>Add Candidate
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" style={{display:"none"}} onChange={handleImport}/>
            <button onClick={()=>fileRef.current?.click()}
              style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",background:C.surface,
                border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,cursor:"pointer",
                fontWeight:700,fontSize:13}}><Upload size={14}/>Import</button>
            <button onClick={downloadTemplate}
              style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",background:C.surface,
                border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,cursor:"pointer",
                fontWeight:700,fontSize:13}}><Download size={14}/>Template</button>
            {importMsg&&<span style={{color:importMsg.type==="ok"?C.accent:C.danger,fontSize:13,fontWeight:600}}>{importMsg.text}</span>}
          </div>

          {/* ── POSITION FILTER ── */}
          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
            {POS_FILTERS.map(pf=>{
              const col=POS_FILTER_COL[pf];
              const cnt=pf==="All"?tryout.candidates.length
                :tryout.candidates.filter(c=>POS_GROUP[c.primaryPos||c.positions?.[0]]===pf).length;
              return(
                <button key={pf} onClick={()=>{setPosFilter(pf);setSelCand(null);}}
                  style={{padding:"5px 12px",background:posFilter===pf?col+"22":C.surface,
                    border:`1.5px solid ${posFilter===pf?col:C.border}`,borderRadius:8,
                    color:posFilter===pf?col:C.muted,cursor:"pointer",fontWeight:700,fontSize:12,
                    display:"flex",alignItems:"center",gap:5}}>
                  {pf}
                  <span style={{background:posFilter===pf?col+"33":C.border+"66",
                    color:posFilter===pf?col:C.muted,
                    borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:700}}>{cnt}</span>
                </button>
              );
            })}
            {posFilter!=="All"&&<div style={{color:C.muted,fontSize:12}}>Showing {posFilter} · {sorted.length} candidate{sorted.length!==1?"s":""}</div>}
          </div>

          {/* Add candidate form */}
          {addingCand&&(
            <div style={{background:C.card,border:`1px solid ${C.accent}44`,borderRadius:14,padding:20,marginBottom:16}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>NEW CANDIDATE</div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <input value={cForm.name} onChange={e=>setCForm(f=>({...f,name:e.target.value}))} placeholder="Full Name *" style={iS()}/>
                <div>
                  <label style={{color:C.muted,fontSize:10,fontWeight:600,display:"block",marginBottom:4}}>PRIMARY POS</label>
                  <select value={cForm.primaryPos} onChange={e=>setCForm(f=>({...f,primaryPos:e.target.value}))} style={iS()}>
                    {POSITIONS.map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{color:C.muted,fontSize:10,fontWeight:600,display:"block",marginBottom:4}}>SECONDARY POS</label>
                  <select value={cForm.secondaryPos} onChange={e=>setCForm(f=>({...f,secondaryPos:e.target.value}))} style={iS()}>
                    <option value="">None</option>
                    {POSITIONS.filter(p=>p!==cForm.primaryPos).map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                {tryout.teamType==="highschool"?(
                  <div>
                    <label style={{color:C.muted,fontSize:10,fontWeight:600,display:"block",marginBottom:4}}>GRADE</label>
                    <select value={cForm.grade} onChange={e=>setCForm(f=>({...f,grade:e.target.value}))} style={iS()}>
                      <option value="9">Grade 9</option><option value="10">Grade 10</option>
                      <option value="11">Grade 11</option><option value="12">Grade 12</option>
                    </select>
                  </div>
                ):(
                  <div>
                    <label style={{color:C.muted,fontSize:10,fontWeight:600,display:"block",marginBottom:4}}>CLUB</label>
                    <input value={cForm.club} onChange={e=>setCForm(f=>({...f,club:e.target.value}))} placeholder="e.g. FC United" style={iS()}/>
                  </div>
                )}
              </div>
              <input value={cForm.notes} onChange={e=>setCForm(f=>({...f,notes:e.target.value}))}
                placeholder="Initial notes (optional)" style={{...iS(),marginBottom:12}}/>
              <div style={{display:"flex",gap:8}}>
                <button onClick={addCandidate} disabled={!cForm.name.trim()}
                  style={{padding:"9px 20px",background:cForm.name.trim()?C.accent:"#2a1000",border:"none",borderRadius:9,
                    color:cForm.name.trim()?"#000":C.muted,fontWeight:800,fontSize:14,cursor:"pointer"}}>Add</button>
                <button onClick={()=>setAddingCand(false)}
                  style={{padding:"9px 16px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,color:C.muted,cursor:"pointer",fontSize:13}}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{display:"grid",gridTemplateColumns:"320px 1fr",gap:16}}>

            {/* Ranked list */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,
              maxHeight:"calc(100vh - 340px)",overflowY:"auto"}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:14}}>
                {posFilter==="All"?"ALL":"POS: "+posFilter} ({sorted.length})
              </div>
              {sorted.length===0
                ?<div style={{color:C.muted,fontSize:13,fontStyle:"italic"}}>No candidates{posFilter!=="All"?" in this position":""}</div>
                :sorted.map((c,rank)=>{
                    const avg=avgScore(c.scores);
                    const sc=HS_STATUS.find(s=>s.k===c.status);
                    const isSel=selCand===c.id;
                    const pc=posColor(c.primaryPos||c.positions?.[0]||"CM");
                    const positions=c.positions||[c.primaryPos||"CM"];
                    // Show best time stat inline if present
                    const bestTimeStat=customStats.filter(s=>isTimeStat(s)).find(s=>c.customStats?.[s.id]);
                    return(
                      <div key={c.id} onClick={()=>setSelCand(isSel?null:c.id)}
                        style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",
                          borderRadius:10,marginBottom:5,cursor:"pointer",transition:"all .12s",
                          background:isSel?C.accent+"18":C.surface,
                          border:`1px solid ${isSel?C.accent:C.border}`}}>
                        <div style={{width:20,color:C.muted,fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:13,textAlign:"center",flexShrink:0}}>{rank+1}</div>
                        <div style={{width:26,height:26,borderRadius:6,flexShrink:0,
                          background:pc+"22",border:`1.5px solid ${pc}44`,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontFamily:"'Oswald',sans-serif",fontWeight:700,color:pc,fontSize:11}}>
                          {positions[0]}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{color:C.text,fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</div>
                          <div style={{display:"flex",gap:6,alignItems:"center"}}>
                            <div style={{color:C.muted,fontSize:10}}>{tryout.teamType==="highschool"?(c.grade?`Gr.${c.grade}`:""):(c.club||"")}</div>
                            {bestTimeStat&&c.customStats?.[bestTimeStat.id]&&(
                              <div style={{color:C.accent,fontSize:10,fontWeight:700,fontFamily:"'Oswald',sans-serif"}}>
                                {c.customStats[bestTimeStat.id]}
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          {avg>0&&<div style={{color:rColor(avg),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:15}}>{avg.toFixed(1)}</div>}
                          <div style={{color:sc?.color||C.muted,fontSize:9,fontWeight:700,letterSpacing:.5}}>{sc?.label}</div>
                        </div>
                      </div>
                    );
                  })
              }
            </div>

            {/* Scoring panel */}
            {selCandObj?(
              <div style={{display:"flex",flexDirection:"column",gap:12,
                maxHeight:"calc(100vh - 340px)",overflowY:"auto"}}>

                {/* Candidate header */}
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,
                  display:"flex",alignItems:"center",gap:14}}>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    {(selCandObj.positions||[selCandObj.primaryPos||"CM"]).map((pos,i)=>(
                      <div key={pos} style={{width:i===0?52:36,height:i===0?52:36,
                        borderRadius:i===0?12:8,background:posColor(pos)+"22",
                        border:`2px solid ${posColor(pos)}44`,display:"flex",
                        alignItems:"center",justifyContent:"center",
                        fontFamily:"'Oswald',sans-serif",fontWeight:800,
                        color:posColor(pos),fontSize:i===0?18:13,opacity:i===0?1:.7}}>
                        {pos}
                      </div>
                    ))}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontWeight:800,fontSize:20}}>{selCandObj.name}</div>
                    <div style={{color:C.muted,fontSize:13,marginTop:2}}>
                      {tryout.teamType==="highschool"?(selCandObj.grade?`Grade ${selCandObj.grade}`:""):(selCandObj.club||"")}
                    </div>
                  </div>
                  {avgScore(selCandObj.scores)>0&&(
                    <div style={{textAlign:"center",flexShrink:0}}>
                      <div style={{color:rColor(avgScore(selCandObj.scores)),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:40,lineHeight:1}}>
                        {avgScore(selCandObj.scores).toFixed(1)}
                      </div>
                      <div style={{color:C.muted,fontSize:10,fontWeight:600}}>OVERALL</div>
                    </div>
                  )}
                  <button onClick={()=>deleteCandidate(selCandObj.id)}
                    style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:4}}>
                    <Trash2 size={15}/>
                  </button>
                </div>

                {/* Status */}
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                  <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>STATUS</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {HS_STATUS.map(opt=>(
                      <button key={opt.k} onClick={()=>updateCandField(selCandObj.id,"status",opt.k)}
                        style={{padding:"7px 16px",background:selCandObj.status===opt.k?opt.color+"22":C.surface,
                          border:`1.5px solid ${selCandObj.status===opt.k?opt.color:C.border}`,
                          borderRadius:8,color:selCandObj.status===opt.k?opt.color:C.muted,
                          cursor:"pointer",fontWeight:700,fontSize:13,transition:"all .12s"}}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Evaluation sliders */}
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                  <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:14}}>EVALUATION (1–10)</div>
                  {SCORE_CATS.map(cat=>{
                    const val=selCandObj.scores[cat.k]||0;
                    return(
                      <div key={cat.k} style={{marginBottom:14}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                          <div>
                            <span style={{color:cat.color,fontWeight:700,fontSize:13}}>{cat.label}</span>
                            <span style={{color:C.muted,fontSize:11,marginLeft:8}}>{cat.desc}</span>
                          </div>
                          <span style={{color:val>0?cat.color:C.muted,fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:18}}>{val>0?val:"-"}</span>
                        </div>
                        <div style={{display:"flex",gap:3}}>
                          {[1,2,3,4,5,6,7,8,9,10].map(n=>(
                            <button key={n} onClick={()=>updateScore(selCandObj.id,cat.k,n===val?0:n)}
                              style={{flex:1,height:26,borderRadius:5,
                                border:`1.5px solid ${n<=val?cat.color:C.border}`,
                                background:n<=val?cat.color+"22":"transparent",
                                color:n<=val?cat.color:C.muted,cursor:"pointer",
                                fontWeight:700,fontSize:11,transition:"all .08s"}}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── MEASURABLES — TimeInput + per-stat notes ── */}
                {customStats.length>0&&(
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                      <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1}}>MEASURABLES</div>
                      <button onClick={()=>setShowBulk(true)}
                        style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:6,
                          cursor:"pointer",background:C.accent+"22",
                          border:`1px solid ${C.accent}44`,color:C.accent}}>
                        ⚡ Bulk Entry
                      </button>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {customStats.map(stat=>{
                        const nKey=selCandObj.id+"_"+stat.id;
                        const noteOpen=openStatNotes[nKey]||false;
                        const noteVal=(selCandObj.customStatNotes||{})[stat.id]||"";
                        const isTm=isTimeStat(stat);
                        return(
                          <div key={stat.id}>
                            <div style={{display:"flex",alignItems:"center",gap:10}}>
                              <label style={{color:C.muted,fontSize:12,fontWeight:600,flex:1}}>
                                {stat.label}
                                {stat.unit&&<span style={{color:C.border,fontWeight:400}}> ({stat.unit})</span>}
                                {isTm&&<span style={{color:C.accent,fontSize:9,fontWeight:700,
                                  marginLeft:6,background:C.accent+"22",padding:"1px 5px",borderRadius:3}}>
                                  ⏱ MM:SS
                                </span>}
                              </label>
                              {isTm?(
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
                              )}
                              {/* Per-stat note toggle */}
                              <button
                                onClick={()=>setOpenStatNotes(p=>({...p,[nKey]:!noteOpen}))}
                                title="Add note for this stat"
                                style={{padding:"5px 8px",borderRadius:6,cursor:"pointer",flexShrink:0,fontSize:12,
                                  background:noteOpen||noteVal?C.accent+"22":"transparent",
                                  border:`1px solid ${noteOpen||noteVal?C.accent:C.border}`,
                                  color:noteOpen||noteVal?C.accent:C.muted}}>
                                📝
                              </button>
                            </div>
                            {/* Inline note field */}
                            {noteOpen&&(
                              <div style={{marginTop:5,paddingLeft:4}}>
                                <input
                                  value={noteVal}
                                  onChange={e=>updateStatNote(selCandObj.id,stat.id,e.target.value)}
                                  placeholder={`Note for ${stat.label}...`}
                                  autoFocus
                                  style={iS({fontSize:12,padding:"6px 10px"})}
                                />
                              </div>
                            )}
                            {/* Show saved note when collapsed */}
                            {!noteOpen&&noteVal&&(
                              <div onClick={()=>setOpenStatNotes(p=>({...p,[nKey]:true}))}
                                style={{marginTop:3,paddingLeft:4,color:C.accent,fontSize:11,
                                  fontStyle:"italic",cursor:"pointer"}}>
                                📝 {noteVal}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Coach note */}
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                  <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:10}}>COACH NOTES</div>
                  <textarea value={selCandObj.coachNote||""} rows={3}
                    onChange={e=>updateCandField(selCandObj.id,"coachNote",e.target.value)}
                    placeholder="Observations, strengths, areas of concern..."
                    style={iS({resize:"vertical"})}/>
                </div>
              </div>
            ):(
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:48,
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
                <ClipboardCheck size={40} style={{color:C.muted,opacity:.3}}/>
                <div style={{color:C.muted,fontSize:14}}>Select a candidate to evaluate</div>
                {customStats.length>0&&(
                  <button onClick={()=>setShowBulk(true)}
                    style={{marginTop:4,padding:"9px 20px",background:C.accent+"22",
                      border:`1px solid ${C.accent}44`,borderRadius:9,color:C.accent,
                      fontWeight:700,fontSize:13,cursor:"pointer"}}>
                    ⚡ Bulk Enter Times
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── LINEUP BUILDER TAB ─────────────────────────────────────────────── */}
      {activeTab==="lineups"&&(
        <div>
          {pickingSlot&&(
            <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:999,
              display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,
                padding:22,width:"100%",maxWidth:380,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <h3 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:18,fontWeight:700}}>Select Player</h3>
                  <button onClick={()=>setPickingSlot(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer"}}><X size={16}/></button>
                </div>
                <div style={{overflowY:"auto",flex:1}}>
                  <div onClick={()=>assignLineupSlot(lineupTeam,pickingSlot.zone,pickingSlot.idx,null)}
                    style={{padding:"9px 12px",borderRadius:8,marginBottom:5,cursor:"pointer",
                      background:"#1a0800",border:`1px solid ${C.border}`,color:C.muted,fontSize:13}}>
                    — Clear slot
                  </div>
                  {allSorted.map(c=>{
                    const pc=posColor(c.primaryPos||c.positions?.[0]||"CM");
                    const positions=c.positions||[c.primaryPos||"CM"];
                    return(
                      <div key={c.id} onClick={()=>assignLineupSlot(lineupTeam,pickingSlot.zone,pickingSlot.idx,c.id)}
                        style={{padding:"9px 12px",borderRadius:8,marginBottom:5,cursor:"pointer",
                          background:"#1a0800",border:`1px solid ${pc}33`,
                          display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:28,height:28,borderRadius:7,background:pc+"22",
                          border:`1.5px solid ${pc}44`,display:"flex",alignItems:"center",
                          justifyContent:"center",fontFamily:"'Oswald',sans-serif",
                          fontWeight:700,color:pc,fontSize:12,flexShrink:0}}>
                          {positions[0]}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{color:C.text,fontWeight:700,fontSize:13}}>{c.name}</div>
                          <div style={{color:C.muted,fontSize:11}}>{positions.join(" / ")}</div>
                        </div>
                        {avgScore(c.scores)>0&&<span style={{color:rColor(avgScore(c.scores)),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:15}}>{avgScore(c.scores).toFixed(1)}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div style={{display:"flex",gap:8,marginBottom:18}}>
            {LINEUP_TEAMS.map(t=>(
              <button key={t.k} onClick={()=>setLineupTeam(t.k)}
                style={{padding:"8px 20px",background:lineupTeam===t.k?t.color+"22":C.surface,
                  border:`1.5px solid ${lineupTeam===t.k?t.color:C.border}`,borderRadius:9,
                  color:lineupTeam===t.k?t.color:C.muted,cursor:"pointer",fontWeight:700,fontSize:14}}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"320px 1fr",gap:16}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:20}}>
              <div style={{marginBottom:16}}>
                <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:8}}>FORMATION</div>
                <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                  {FORMATIONS.map(f=>(
                    <button key={f} onClick={()=>setLineupFormation(lineupTeam,f)}
                      style={{padding:"7px 14px",background:curLineup.formation===f?C.accent+"22":C.surface,
                        border:`1px solid ${curLineup.formation===f?C.accent:C.border}`,borderRadius:8,
                        color:curLineup.formation===f?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:13}}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              {ZONES.map(zone=>(
                <div key={zone.key} style={{marginBottom:14}}>
                  <div style={{color:zone.color,fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:8}}>{zone.label.toUpperCase()}</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {(curLineup.slots[zone.key]||[]).map((candId,idx)=>{
                      const cand=candId?tryout.candidates.find(c=>c.id===candId):null;
                      const pc=cand?posColor(cand.primaryPos||cand.positions?.[0]||"CM"):"transparent";
                      return(
                        <div key={idx} onClick={()=>setPickingSlot({zone:zone.key,idx})}
                          style={{flex:"1 1 90px",minWidth:80,padding:"10px 6px",borderRadius:10,cursor:"pointer",
                            background:cand?"#1a0800":C.surface,
                            border:`1.5px solid ${cand?zone.color+"66":C.border}`,
                            display:"flex",flexDirection:"column",alignItems:"center",gap:4,
                            transition:"all .12s"}}
                          onMouseEnter={e=>e.currentTarget.style.borderColor=zone.color}
                          onMouseLeave={e=>e.currentTarget.style.borderColor=cand?zone.color+"66":C.border}>
                          {cand?<>
                            <div style={{width:34,height:34,borderRadius:8,background:pc+"22",
                              border:`2px solid ${pc}44`,display:"flex",alignItems:"center",
                              justifyContent:"center",fontFamily:"'Oswald',sans-serif",
                              fontWeight:900,color:pc,fontSize:15}}>
                              {(cand.positions||[cand.primaryPos||"CM"])[0]}
                            </div>
                            <div style={{color:C.text,fontSize:10,fontWeight:700,textAlign:"center",lineHeight:1.2}}>
                              {cand.name.split(" ")[1]||cand.name.split(" ")[0]}
                            </div>
                            {avgScore(cand.scores)>0&&<div style={{color:rColor(avgScore(cand.scores)),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:12}}>{avgScore(cand.scores).toFixed(1)}</div>}
                          </>:<>
                            <div style={{width:34,height:34,borderRadius:8,background:C.border,
                              display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:18}}>+</div>
                            <div style={{color:C.muted,fontSize:10}}>Empty</div>
                          </>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>CANDIDATE POOL</div>
              <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:500,overflowY:"auto"}}>
                {allSorted.map(c=>{
                  const positions=c.positions||[c.primaryPos||"CM"];
                  const pc=posColor(positions[0]);
                  const inLineup=Object.values(curLineup.slots).flat().includes(c.id);
                  return(
                    <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",
                      background:inLineup?C.accent+"11":C.surface,
                      border:`1px solid ${inLineup?C.accent+"44":C.border}`,
                      borderRadius:8,opacity:inLineup?.7:1}}>
                      <div style={{width:24,height:24,borderRadius:6,flexShrink:0,background:pc+"22",
                        border:`1.5px solid ${pc}44`,display:"flex",alignItems:"center",
                        justifyContent:"center",fontFamily:"'Oswald',sans-serif",
                        fontWeight:700,color:pc,fontSize:10}}>{positions[0]}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:C.text,fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</div>
                        {positions.length>1&&<div style={{color:C.muted,fontSize:10}}>{positions.join(" / ")}</div>}
                      </div>
                      {inLineup&&<span style={{color:C.accent,fontSize:9,fontWeight:700,flexShrink:0}}>✓ IN</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CUSTOM STATS TAB ─────────────────────────────────────────────── */}
      {activeTab==="stats"&&(
        <div style={{maxWidth:700}}>
          <div style={{color:C.muted,fontSize:13,marginBottom:18,lineHeight:1.6}}>
            Define measurable stats. Toggle <strong style={{color:C.accent}}>⏱ MM:SS</strong> for timed drills —
            mile runs, 40m sprints. Stats auto-detected by name too (mile, sprint, 40m).
          </div>

          {/* Add stat */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,marginBottom:18}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>ADD MEASURABLE</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto auto",gap:10,alignItems:"flex-end"}}>
              <div>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:5}}>STAT NAME</label>
                <input value={newStatLabel} onChange={e=>setNewStatLabel(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addCustomStat()}
                  placeholder="e.g. Mile Run, 40m Sprint" style={iS()}/>
              </div>
              <div>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:5}}>UNIT</label>
                <input value={newStatUnit} onChange={e=>setNewStatUnit(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addCustomStat()}
                  placeholder="e.g. min, inches" style={iS()}/>
              </div>
              {/* ── Time toggle ── */}
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <label style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:.5,whiteSpace:"nowrap"}}>TYPE</label>
                <button onClick={()=>setNewStatIsTime(v=>!v)}
                  style={{padding:"8px 12px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12,
                    whiteSpace:"nowrap",background:newStatIsTime?C.accent+"22":C.surface,
                    border:`1.5px solid ${newStatIsTime?C.accent:C.border}`,
                    color:newStatIsTime?C.accent:C.muted}}>
                  {newStatIsTime?"⏱ MM:SS":"# Number"}
                </button>
              </div>
              <button onClick={addCustomStat} disabled={!newStatLabel.trim()}
                style={{padding:"9px 18px",background:newStatLabel.trim()?C.accent:"#2a1000",border:"none",
                  borderRadius:8,color:newStatLabel.trim()?"#000":C.muted,fontWeight:800,fontSize:14,
                  cursor:"pointer",whiteSpace:"nowrap",alignSelf:"flex-end"}}>
                + Add
              </button>
            </div>
          </div>

          {/* Stat list with leaderboard */}
          {customStats.length===0
            ?<div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,
                padding:"32px 24px",textAlign:"center"}}>
                <div style={{color:C.muted,fontSize:13,fontStyle:"italic"}}>No measurables yet</div>
                <div style={{color:C.muted,fontSize:12,marginTop:6}}>Try: Mile Run (⏱), 40m Sprint (⏱), Vertical Jump (inches)</div>
              </div>
            :<div style={{display:"flex",flexDirection:"column",gap:8}}>
                {customStats.map(stat=>{
                  const entries=tryout.candidates
                    .filter(c=>c.customStats?.[stat.id]!==undefined&&c.customStats[stat.id]!=="")
                    .map(c=>({name:c.name,val:c.customStats[stat.id]}));
                  const sorted2=[...entries].sort((a,b)=>
                    isTimeStat(stat)?timeToSecs(a.val)-timeToSecs(b.val)
                    :parseFloat(b.val)-parseFloat(a.val)
                  );
                  const medals=["🥇","🥈","🥉"];
                  return(
                    <div key={stat.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                      padding:"14px 18px",display:"flex",alignItems:"center",gap:14}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:sorted2.length?6:0}}>
                          <div style={{color:C.text,fontWeight:700,fontSize:14}}>{stat.label}</div>
                          {stat.unit&&<div style={{color:C.muted,fontSize:12}}>{stat.unit}</div>}
                          {isTimeStat(stat)&&(
                            <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,
                              background:C.accent+"22",color:C.accent}}>⏱ MM:SS</span>
                          )}
                        </div>
                        {sorted2.length>0&&(
                          <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                            {sorted2.slice(0,3).map((e,i)=>(
                              <div key={e.name} style={{display:"flex",alignItems:"center",gap:4}}>
                                <span style={{fontSize:12}}>{medals[i]}</span>
                                <span style={{color:i===0?C.accent:C.text,fontWeight:700,fontSize:14,
                                  fontFamily:"'Oswald',sans-serif"}}>{e.val}</span>
                                <span style={{color:C.muted,fontSize:11}}>{e.name.split(" ")[0]}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{color:C.muted,fontSize:12,flexShrink:0}}>{entries.length} entered</div>
                      <button onClick={()=>removeCustomStat(stat.id)}
                        style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:4}}>
                        <X size={14}/>
                      </button>
                    </div>
                  );
                })}
              </div>
          }

          {customStats.length>0&&tryout.candidates.length>0&&(
            <div style={{marginTop:16,textAlign:"center"}}>
              <button onClick={()=>setShowBulk(true)}
                style={{padding:"11px 28px",background:C.accent,border:"none",borderRadius:10,
                  color:"#000",fontWeight:800,fontSize:14,cursor:"pointer",
                  fontFamily:"'Oswald',sans-serif"}}>
                ⚡ Open Bulk Entry Grid
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
