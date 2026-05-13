// ─── TRYOUTS VIEW ─────────────────────────────────────────────────────────────
function TryoutsView({tryouts,setTryouts,roster,setRoster,teams,activeTeamId,onSwitchTeam,addPlayerToTeam}){
  const [selTryout,  setSelTryout]  = useState(null);
  const [selCand,    setSelCand]    = useState(null);
  const [activeTab,  setActiveTab]  = useState("candidates");
  const [lineupTeam, setLineupTeam] = useState("varsity");
  const [selLineupId,setSelLineupId]= useState("default");
  const [creatingLU, setCreatingLU] = useState(false);
  const [newLUName,  setNewLUName]  = useState("");
  const [creating,   setCreating]   = useState(false);
  const [addingCand, setAddingCand] = useState(false);
  const [pickingSlot,setPickingSlot]= useState(null);
  const [importMsg,  setImportMsg]  = useState(null);
  const [closeWizard,setCloseWizard]= useState(false);
  const [posFilter,  setPosFilter]  = useState("All");
  const [showBulk,   setShowBulk]   = useState(false);
  const [openStatNotes,setOpenStatNotes]=useState({});
  const [newEntryVals, setNewEntryVals] =useState({});
  // Drag and drop
  const [dragging,   setDragging]   = useState(null); // {candId,fromZone,fromIdx,isBackup}
  const [dragOver,   setDragOver]   = useState(null); // {zone,idx,isBackup}
  const fileRef = useRef(null);

  const [tForm,setTForm]=useState({name:"",year:new Date().getFullYear().toString(),teamType:"highschool"});
  const [cForm,setCForm]=useState({name:"",primaryPos:"CM",secondaryPos:"",grade:"9",club:"",notes:""});
  const [newStatLabel,     setNewStatLabel]     =useState("");
  const [newStatUnit,      setNewStatUnit]      =useState("");
  const [newStatTimeFormat,setNewStatTimeFormat]=useState("none");

  const POSITIONS=["GK","CB","FB","DM","CM","W","ST"];
  const SCORE_CATS=[
    {k:"technical", label:"Technical",  desc:"Ball control, passing, first touch",color:"#ff6b00"},
    {k:"athletic",  label:"Athletic",   desc:"Speed, stamina, physicality",       color:"#ef5350"},
    {k:"tactical",  label:"Tactical",   desc:"Positioning, decision making",      color:"#42a5f5"},
    {k:"attitude",  label:"Attitude",   desc:"Effort, coachability, communication",color:"#66bb6a"},
    {k:"positional",label:"Positional", desc:"Quality in their specific role",    color:"#7c6af5"},
  ];
  const HS_STATUS=[
    {k:"prospect",label:"Prospect",color:C.muted},
    {k:"varsity", label:"Varsity", color:C.accent},
    {k:"jv",      label:"JV",      color:"#ffb300"},
    {k:"jvb",     label:"JVB",     color:"#42a5f5"},
    {k:"cut",     label:"Cut",     color:C.danger},
  ];
  const LINEUP_TEAMS=[
    {k:"varsity",label:"Varsity",color:C.accent},
    {k:"jv",     label:"JV",     color:"#ffb300"},
    {k:"jvb",    label:"JVB",    color:"#42a5f5"},
  ];
  const FORMATIONS=["4-3-3","4-4-2","4-2-3-1","3-5-2","5-3-2"];
  const SLOTS_FOR=f=>{
    const m={"4-3-3":{GK:1,DEF:4,MID:3,FWD:3},"4-4-2":{GK:1,DEF:4,MID:4,FWD:2},
              "4-2-3-1":{GK:1,DEF:4,MID:5,FWD:1},"3-5-2":{GK:1,DEF:3,MID:5,FWD:2},
              "5-3-2":{GK:1,DEF:5,MID:3,FWD:2}};
    return m[f]||m["4-3-3"];
  };
  // For each zone, return array of row-groups (each row = array of slot indices)
  function getZoneRows(zoneKey, formation, slotCount){
    if(formation==="4-2-3-1"&&zoneKey==="MID"){
      // 5 mids: slots 0,1 = DMs (deep); slots 2,3,4 = LW,AM,RW (higher)
      // Render top-to-bottom on pitch = attack first: [2,3,4] then [0,1]
      return [[2,3,4],[0,1]];
    }
    if(formation==="3-5-2"&&zoneKey==="MID"){
      // 5 mids in 3-5-2: 1 DM deep, 2 CM mid, 2 WM wide
      return [[1,2],[0],[3,4]]; // CM pair, DM, WM pair — top to bottom on pitch
    }
    return [Array.from({length:slotCount},(_,i)=>i)];
  }

  const ZONES=[{key:"FWD",label:"Forwards",color:"#ff6b00"},{key:"MID",label:"Midfielders",color:"#66bb6a"},
               {key:"DEF",label:"Defenders",color:"#42a5f5"},{key:"GK",label:"Goalkeeper",color:"#ffb300"}];
  const POS_GROUP={GK:"GK",CB:"DEF",FB:"DEF",DM:"MID",CM:"MID",W:"MID",AM:"MID",ST:"FWD"};
  const POS_FILTERS=["All","GK","DEF","MID","FWD"];
  const POS_FILTER_COL={All:C.accent,GK:"#ffb300",DEF:"#42a5f5",MID:"#66bb6a",FWD:"#ff6b00"};

  function avgScore(scores){const vals=Object.values(scores||{}).filter(v=>v>0);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;}
  function isTimeStat(stat){
    if(stat.timeFormat==="mmss") return true;
    if(stat.isTime&&stat.timeFormat!=="seconds") return true;
    if(!stat.timeFormat&&!stat.isTime){const lc=(stat.label+"|"+stat.unit).toLowerCase();return /mile|run|time|sprint|speed|min/.test(lc);}
    return false;
  }
  function isSecondsStat(stat){
    if(stat.timeFormat==="seconds") return true;
    if(!stat.timeFormat){const lc=(stat.label+"|"+stat.unit).toLowerCase();return /\b40\b|40m|40y|40yd/.test(lc);}
    return false;
  }
  function timeToSecs(str){if(!str)return 9999;const p=String(str).split(":");return p.length===2?parseInt(p[0],10)*60+parseInt(p[1],10):parseFloat(str)||9999;}
  function getBestVal(entries,stat){
    const vals=entries.map(e=>e.value).filter(Boolean);
    if(!vals.length)return "";
    if(isTimeStat(stat))return vals.reduce((b,v)=>timeToSecs(v)<timeToSecs(b)?v:b);
    if(isSecondsStat(stat))return vals.reduce((b,v)=>parseFloat(v)<parseFloat(b)?v:b);
    return vals.reduce((b,v)=>parseFloat(v)>parseFloat(b)?v:b);
  }
  function getImprovement(entries,stat){
    if(!entries||entries.length<2)return null;
    const first=entries[0].value,latest=entries[entries.length-1].value;
    if(isTimeStat(stat)){
      const diff=timeToSecs(first)-timeToSecs(latest);if(!diff)return null;
      const abs=Math.abs(diff),m=Math.floor(abs/60),s=abs%60;
      return{improved:diff>0,label:`${diff>0?"↑":"↓"} ${m>0?m+":"+String(s).padStart(2,"0"):s+"s"}`};
    }else{
      const fv=parseFloat(first),lv=parseFloat(latest);
      if(isNaN(fv)||isNaN(lv)||fv===lv)return null;
      const diff=isSecondsStat(stat)?fv-lv:lv-fv;
      return{improved:diff>0,label:`${diff>0?"↑":"↓"} ${Math.abs(lv-fv).toFixed(2)}`};
    }
  }

  function upd(fn){setTryouts(prev=>prev.map(t=>t.id===selTryout?{...t,...fn(t)}:t));}

  function addStatEntry(candId,statId,value){
    if(!value?.toString().trim())return;
    const tryout=tryouts.find(t=>t.id===selTryout);
    const stat=(tryout?.customStats||[]).find(s=>s.id===statId);
    const entry={id:`e${Date.now()}`,date:new Date().toISOString().split("T")[0],value:value.toString().trim()};
    upd(t=>({candidates:t.candidates.map(c=>{
      if(c.id!==candId)return c;
      const history=c.customStatHistory||{};
      const existing=history[statId]||[];
      const allEntries=[...existing,entry];
      const bestVal=stat?getBestVal(allEntries,stat):value.toString();
      return{...c,customStatHistory:{...history,[statId]:allEntries},customStats:{...c.customStats,[statId]:bestVal}};
    })}));
    setNewEntryVals(p=>({...p,[statId]:""}));
  }
  function removeStatEntry(candId,statId,entryId){
    const tryout=tryouts.find(t=>t.id===selTryout);
    const stat=(tryout?.customStats||[]).find(s=>s.id===statId);
    upd(t=>({candidates:t.candidates.map(c=>{
      if(c.id!==candId)return c;
      const history=c.customStatHistory||{};
      const remaining=(history[statId]||[]).filter(e=>e.id!==entryId);
      const bestVal=remaining.length&&stat?getBestVal(remaining,stat):"";
      return{...c,customStatHistory:{...history,[statId]:remaining},customStats:{...c.customStats,[statId]:bestVal}};
    })}));
  }
  function updateStatNote(candId,statId,note){upd(t=>({candidates:t.candidates.map(c=>c.id!==candId?c:{...c,customStatNotes:{...(c.customStatNotes||{}),[statId]:note}})}));}
  function updateScore(candId,cat,val){upd(t=>({candidates:t.candidates.map(c=>c.id!==candId?c:{...c,scores:{...c.scores,[cat]:val}})}));}
  function updateCandField(candId,key,val){upd(t=>({candidates:t.candidates.map(c=>c.id!==candId?c:{...c,[key]:val})}));}
  function deleteCandidate(candId){upd(t=>({candidates:t.candidates.filter(c=>c.id!==candId)}));setSelCand(null);}
  function addCustomStat(){
    if(!newStatLabel.trim())return;
    const stat={id:`st${Date.now()}`,label:newStatLabel.trim(),unit:newStatUnit.trim(),isTime:newStatTimeFormat==="mmss",timeFormat:newStatTimeFormat};
    upd(t=>({customStats:[...(t.customStats||[]),stat],candidates:t.candidates.map(c=>({...c,customStats:{...c.customStats,[stat.id]:""}}))  }));
    setNewStatLabel("");setNewStatUnit("");setNewStatTimeFormat("none");
  }
  function removeCustomStat(statId){upd(t=>({customStats:(t.customStats||[]).filter(s=>s.id!==statId),candidates:t.candidates.map(c=>{const cs={...c.customStats};delete cs[statId];return{...c,customStats:cs};})}));}

  // ── LINEUP HELPERS ────────────────────────────────────────────────────────
  function emptyLineupSlots(formation){
    const counts=SLOTS_FOR(formation);
    const slots={},backups={};
    Object.entries(counts).forEach(([z,n])=>{slots[z]=Array(n).fill(null);backups[z]=Array(n).fill(null);});
    return{slots,backups};
  }
  function getLineupSaves(team){
    const tlu=tryout?.lineups?.[team];
    if(!tlu)return[{id:"default",name:"Default",formation:"4-3-3",...emptyLineupSlots("4-3-3"),note:""}];
    if(Array.isArray(tlu.saves))return tlu.saves;
    const{slots,backups}=emptyLineupSlots(tlu.formation||"4-3-3");
    return[{id:"default",name:"Default",formation:tlu.formation||"4-3-3",slots:tlu.slots||slots,backups:tlu.backups||backups,note:""}];
  }
  function getActiveLineup(team,lineupId){
    const saves=getLineupSaves(team);
    return saves.find(s=>s.id===lineupId)||saves[0]||null;
  }
  function updLineupSave(fn){
    upd(t=>{
      const saves=getLineupSaves(lineupTeam);
      const newSaves=saves.map(s=>s.id===activeID?{...s,...fn(s)}:s);
      return{lineups:{...t.lineups,[lineupTeam]:{saves:newSaves,active:activeID}}};
    });
  }
  function createNewLineup(name){
    const id=`l${Date.now()}`;
    const newSave={id,name:name||"New Lineup",formation:"4-3-3",...emptyLineupSlots("4-3-3"),note:""};
    upd(t=>{const saves=getLineupSaves(lineupTeam);return{lineups:{...t.lineups,[lineupTeam]:{saves:[...saves,newSave],active:id}}};});
    setSelLineupId(id);
  }
  function deleteLineup(id){
    upd(t=>{const saves=getLineupSaves(lineupTeam).filter(s=>s.id!==id);return{lineups:{...t.lineups,[lineupTeam]:{saves,active:saves[0]?.id||"default"}}};});
    setSelLineupId("default");
  }
  function setLineupFormation(formation){
    const{slots,backups}=emptyLineupSlots(formation);
    updLineupSave(()=>({formation,slots,backups}));
  }
  function assignSlot(zone,idx,isBackup,candId){
    updLineupSave(lu=>{
      if(isBackup){
        const bk={...(lu.backups||{}),[zone]:[...(lu.backups?.[zone]||Array(lu.slots[zone].length).fill(null))]};
        bk[zone][idx]=candId||null;return{backups:bk};
      }else{
        const sl={...lu.slots,[zone]:[...lu.slots[zone]]};sl[zone][idx]=candId||null;return{slots:sl};
      }
    });
    setPickingSlot(null);
  }
  function posFit(cand,zone){
    if(!cand)return"none";
    const positions=cand.positions||[cand.primaryPos||"CM"];
    if(POS_GROUP[positions[0]]===zone)return"primary";
    if(positions.slice(1).some(p=>POS_GROUP[p]===zone))return"secondary";
    return"none";
  }
  const FIT_COLOR={primary:"#66bb6a",secondary:"#ffb300",none:"#ef5350"};

  // ── DRAG AND DROP HANDLERS ────────────────────────────────────────────────
  function onDragStart(e,candId,fromZone,fromIdx,isBackup){
    setDragging({candId,fromZone,fromIdx,isBackup:!!isBackup});
    e.dataTransfer.effectAllowed="move";
    e.dataTransfer.setData("text/plain",candId);
  }
  function onDragEnd(){setDragging(null);setDragOver(null);}
  function onDragOverSlot(e,zone,idx,isBackup){
    e.preventDefault();e.stopPropagation();
    e.dataTransfer.dropEffect="move";
    const key=`${zone}-${idx}-${isBackup}`;
    const curKey=dragOver?`${dragOver.zone}-${dragOver.idx}-${dragOver.isBackup}`:"";
    if(key!==curKey)setDragOver({zone,idx,isBackup:!!isBackup});
  }
  function onDragLeaveSlot(){setDragOver(null);}
  function onDropSlot(e,toZone,toIdx,isBackup){
    e.preventDefault();e.stopPropagation();
    if(!dragging){setDragOver(null);return;}
    const{candId,fromZone,fromIdx,isBackup:fromBackup}=dragging;
    updLineupSave(lu=>{
      const newSlots={};
      Object.keys(lu.slots).forEach(z=>{newSlots[z]=[...lu.slots[z]];});
      const newBackups={};
      ZONES.forEach(zone=>{newBackups[zone.key]=[...((lu.backups||{})[zone.key]||Array(newSlots[zone.key].length).fill(null))];});
      // What's currently in the target slot
      const targetCandId=isBackup?(newBackups[toZone]?.[toIdx]??null):(newSlots[toZone]?.[toIdx]??null);
      // Clear / swap source
      if(fromZone!==null&&fromIdx!==null){
        if(fromBackup){newBackups[fromZone][fromIdx]=targetCandId;}
        else{newSlots[fromZone][fromIdx]=targetCandId;}
      }
      // Place in target
      if(isBackup){newBackups[toZone][toIdx]=candId;}
      else{newSlots[toZone][toIdx]=candId;}
      return{slots:newSlots,backups:newBackups};
    });
    setDragging(null);setDragOver(null);
  }
  function onDragOverPool(e){e.preventDefault();e.dataTransfer.dropEffect="move";}
  function onDropPool(e){
    e.preventDefault();
    if(!dragging||dragging.fromZone===null){setDragging(null);return;}
    updLineupSave(lu=>{
      const newSlots={};Object.keys(lu.slots).forEach(z=>{newSlots[z]=[...lu.slots[z]];});
      const newBackups={};ZONES.forEach(zone=>{newBackups[zone.key]=[...((lu.backups||{})[zone.key]||Array(newSlots[zone.key].length).fill(null))];});
      if(dragging.isBackup){newBackups[dragging.fromZone][dragging.fromIdx]=null;}
      else{newSlots[dragging.fromZone][dragging.fromIdx]=null;}
      return{slots:newSlots,backups:newBackups};
    });
    setDragging(null);setDragOver(null);
  }

  function createTryout(){
    if(!tForm.name.trim())return;
    const mkLU=()=>({saves:[{id:"default",name:"Default",formation:"4-3-3",...emptyLineupSlots("4-3-3"),note:""}],active:"default"});
    const t={id:`try${Date.now()}`,name:tForm.name.trim(),year:tForm.year,
      teamType:tForm.teamType||"highschool",status:"open",candidates:[],customStats:[],
      lineups:{varsity:mkLU(),jv:mkLU(),jvb:mkLU()},createdAt:new Date().toISOString()};
    setTryouts(prev=>[t,...prev]);setSelTryout(t.id);setCreating(false);
  }
  function addCandidate(){
    if(!cForm.name.trim())return;
    const tryout=tryouts.find(t=>t.id===selTryout);
    const initCS={};(tryout?.customStats||[]).forEach(s=>{initCS[s.id]="";});
    const positions=[cForm.primaryPos,...(cForm.secondaryPos&&cForm.secondaryPos!==cForm.primaryPos?[cForm.secondaryPos]:[])];
    const c={id:`c${Date.now()}`,name:cForm.name.trim(),positions,primaryPos:cForm.primaryPos,
      grade:tryout?.teamType==="highschool"?cForm.grade:"",club:tryout?.teamType==="club"?cForm.club:"",
      scores:{technical:0,athletic:0,tactical:0,attitude:0,positional:0},
      customStats:initCS,customStatNotes:{},customStatHistory:{},status:"prospect",notes:cForm.notes,coachNote:""};
    upd(t=>({candidates:[...t.candidates,c]}));
    setCForm({name:"",primaryPos:"CM",secondaryPos:"",grade:"9",club:"",notes:""});
    setAddingCand(false);setSelCand(c.id);
  }
  function downloadTemplate(){
    const tryout=tryouts.find(t=>t.id===selTryout);const isHS=tryout?.teamType==="highschool";
    const wb=XLSX.utils.book_new();
    const headers=["Name","Primary Position","Secondary Position",isHS?"Grade":"Club/Team","Notes"];
    const ws=XLSX.utils.aoa_to_sheet([headers,["Alex Johnson","CM","W",isHS?"10":"FC United","Strong in transition"]]);
    ws["!cols"]=[{wch:22},{wch:18},{wch:18},{wch:14},{wch:28}];
    XLSX.utils.book_append_sheet(wb,ws,"Candidates");
    const buf=XLSX.write(wb,{type:"array",bookType:"xlsx"});
    const url=URL.createObjectURL(new Blob([buf],{type:"application/octet-stream"}));
    const a=document.createElement("a");a.href=url;a.download="TryoutCandidates_Template.xlsx";a.click();
  }
  async function handleImport(e){
    const file=e.target.files?.[0];if(!file)return;
    const tryout=tryouts.find(t=>t.id===selTryout);const isHS=tryout?.teamType==="highschool";
    try{
      const buf=await file.arrayBuffer();const wb=XLSX.read(buf,{type:"array"});
      const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
      const initCS={};(tryout?.customStats||[]).forEach(s=>{initCS[s.id]="";});
      const newCands=rows.slice(1).filter(r=>r[0]?.toString().trim()).map(r=>{
        const primary=(r[1]?.toString().trim().toUpperCase())||"CM";
        const secondary=(r[2]?.toString().trim().toUpperCase())||"";
        const positions=[primary,...(secondary&&secondary!==primary?[secondary]:[])];
        return{id:`c${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name:r[0].toString().trim(),positions,primaryPos:primary,
          grade:isHS?(r[3]?.toString().trim()||""):"",club:!isHS?(r[3]?.toString().trim()||""):"",
          notes:r[4]?.toString().trim()||"",
          scores:{technical:0,athletic:0,tactical:0,attitude:0,positional:0},
          customStats:{...initCS},customStatNotes:{},customStatHistory:{},status:"prospect",coachNote:""};
      });
      upd(t=>({candidates:[...t.candidates,...newCands]}));
      setImportMsg({type:"ok",text:`✓ Imported ${newCands.length} candidates`});
    }catch(err){setImportMsg({type:"err",text:`✗ ${err.message}`});}
    e.target.value="";setTimeout(()=>setImportMsg(null),4000);
  }

  const iS=(extra={})=>({padding:"8px 12px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box",width:"100%",...extra});

  // ── TRYOUT LIST ──────────────────────────────────────────────────────────
  if(!selTryout)return(
    <div style={{padding:20,maxWidth:800,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div><div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2}}>SQUAD</div>
          <h1 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:28,fontWeight:800,marginTop:4}}>Tryouts</h1></div>
        <button onClick={()=>setCreating(true)} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 18px",background:C.accent,border:"none",borderRadius:10,color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}><Plus size={15}/>New Tryout</button>
      </div>
      {creating&&(
        <div style={{background:C.card,border:`1px solid ${C.accent}44`,borderRadius:14,padding:20,marginBottom:16}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>NEW TRYOUT SESSION</div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            {[{k:"highschool",label:"High School"},{k:"club",label:"Club"}].map(opt=>(
              <button key={opt.k} onClick={()=>setTForm(f=>({...f,teamType:opt.k}))} style={{flex:1,padding:"9px",background:tForm.teamType===opt.k?C.accent+"22":C.surface,border:`1px solid ${tForm.teamType===opt.k?C.accent:C.border}`,borderRadius:9,color:tForm.teamType===opt.k?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:13}}>{opt.label}</button>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 120px",gap:10,marginBottom:12}}>
            <input value={tForm.name} onChange={e=>setTForm(f=>({...f,name:e.target.value}))} placeholder={tForm.teamType==="highschool"?"e.g. Varsity 2025-26":"e.g. U16 Spring Tryouts"} style={iS()}/>
            <input value={tForm.year} onChange={e=>setTForm(f=>({...f,year:e.target.value}))} placeholder="Year" style={iS()}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={createTryout} disabled={!tForm.name.trim()} style={{padding:"9px 20px",background:tForm.name.trim()?C.accent:"#2a1000",border:"none",borderRadius:9,color:tForm.name.trim()?"#000":C.muted,fontWeight:800,fontSize:14,cursor:"pointer"}}>Create</button>
            <button onClick={()=>setCreating(false)} style={{padding:"9px 16px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,color:C.muted,cursor:"pointer",fontSize:13}}>Cancel</button>
          </div>
        </div>
      )}
      {tryouts.length===0&&!creating
        ?<div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"48px 24px",textAlign:"center"}}><ClipboardCheck size={40} style={{color:C.muted,opacity:.3,marginBottom:12}}/><div style={{color:C.text,fontSize:15,fontWeight:600}}>No tryout sessions yet</div><div style={{color:C.muted,fontSize:13,marginTop:6}}>Create your first tryout to start evaluating candidates</div></div>
        :tryouts.map(t=>{
          const signed=t.candidates.filter(c=>c.status==="varsity").length,jv=t.candidates.filter(c=>c.status==="jv").length,cut=t.candidates.filter(c=>c.status==="cut").length;
          return(
            <div key={t.id} onClick={()=>{setSelTryout(t.id);setActiveTab("candidates");setSelCand(null);setPosFilter("All");}} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 20px",marginBottom:10,cursor:"pointer",display:"flex",alignItems:"center",gap:16,transition:"all .15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
              <div style={{width:46,height:46,borderRadius:11,background:C.accent+"22",border:`2px solid ${C.accent}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><ClipboardCheck size={22} color={C.accent}/></div>
              <div style={{flex:1}}><div style={{color:C.text,fontWeight:700,fontSize:15,marginBottom:4}}>{t.name}</div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><span style={{color:C.muted,fontSize:12}}>{t.year}</span><span style={{color:C.muted,fontSize:12,background:C.surface,padding:"1px 7px",borderRadius:5,border:`1px solid ${C.border}`}}>{t.teamType==="club"?"Club":"High School"}</span><span style={{color:C.muted,fontSize:12}}>{t.candidates.length} candidates</span>{signed>0&&<span style={{color:C.accent,fontSize:12,fontWeight:700}}>{signed} varsity</span>}{jv>0&&<span style={{color:"#ffb300",fontSize:12,fontWeight:700}}>{jv} JV</span>}{cut>0&&<span style={{color:C.danger,fontSize:12,fontWeight:700}}>{cut} cut</span>}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{padding:"3px 10px",background:t.status==="open"?C.accent+"22":"#2a1000",border:`1px solid ${t.status==="open"?C.accent:C.border}`,borderRadius:6,color:t.status==="open"?C.accent:C.muted,fontSize:11,fontWeight:700}}>{t.status==="open"?"OPEN":"CLOSED"}</span><ChevronRight size={16} color={C.muted}/></div>
            </div>
          );
        })
      }
    </div>
  );

  if(closeWizard&&selTryout){
    const tryout=tryouts.find(t=>t.id===selTryout);
    if(tryout)return(<TryoutCloseWizard tryout={tryout} teams={teams||[]} addPlayerToTeam={addPlayerToTeam} onClose={()=>setCloseWizard(false)} onDone={()=>{setTryouts(prev=>prev.map(t=>t.id===selTryout?{...t,status:"closed"}:t));setCloseWizard(false);}}/>);
  }

  const tryout=tryouts.find(t=>t.id===selTryout);if(!tryout)return null;
  const customStats=tryout.customStats||[];
  const allSorted=[...tryout.candidates].sort((a,b)=>avgScore(b.scores)-avgScore(a.scores));
  const sorted=posFilter==="All"?allSorted:allSorted.filter(c=>POS_GROUP[c.primaryPos||c.positions?.[0]]===posFilter);
  const selCandObj=selCand?tryout.candidates.find(c=>c.id===selCand):null;
  const lineupSaves=getLineupSaves(lineupTeam);
  const activeID=lineupSaves.find(s=>s.id===selLineupId)?selLineupId:lineupSaves[0]?.id||"default";
  const curLU=getActiveLineup(lineupTeam,activeID)||{formation:"4-3-3",...emptyLineupSlots("4-3-3"),note:""};

  // ── BULK ENTRY MODAL ─────────────────────────────────────────────────────
  function BulkEntryModal(){
    if(!customStats.length)return(
      <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:28,maxWidth:400,width:"100%"}}>
          <h3 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:20,fontWeight:800,marginBottom:10}}>No Measurables Yet</h3>
          <p style={{color:C.muted,fontSize:14,lineHeight:1.6,marginBottom:20}}>Add stats in the Custom Stats tab first.</p>
          <button onClick={()=>setShowBulk(false)} style={{width:"100%",padding:"11px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,color:C.muted,cursor:"pointer",fontSize:14}}>Close</button>
        </div>
      </div>
    );
    const today=new Date().toISOString().split("T")[0];
    const[local,setLocal]=useState(()=>{const init={};allSorted.forEach(c=>{init[c.id]={};customStats.forEach(s=>{init[c.id][s.id]="";});});return init;});
    function updateLocal(cid,sid,val){setLocal(p=>({...p,[cid]:{...p[cid],[sid]:val}}));}
    function flushAndClose(){
      allSorted.forEach(c=>{customStats.forEach(stat=>{const val=(local[c.id]||{})[stat.id];if(val&&val.toString().trim()){
        const entry={id:`e${Date.now()}_${Math.random().toString(36).slice(2)}`,date:today,value:val.toString().trim()};
        upd(t=>({candidates:t.candidates.map(cc=>{if(cc.id!==c.id)return cc;const history=cc.customStatHistory||{};const existing=history[stat.id]||[];const allEntries=[...existing,entry];const bestVal=getBestVal(allEntries,stat);return{...cc,customStatHistory:{...history,[stat.id]:allEntries},customStats:{...cc.customStats,[stat.id]:bestVal}};})  }));
      }});});setShowBulk(false);
    }
    const inputRefs=useRef({});
    function moveFocus(cid,sid,dir){const ci=allSorted.findIndex(c=>c.id===cid),si=customStats.findIndex(s=>s.id===sid);let nc=cid,ns=sid;if(dir==="right"){if(si<customStats.length-1)ns=customStats[si+1].id;else if(ci<allSorted.length-1){nc=allSorted[ci+1].id;ns=customStats[0].id;}}else if(dir==="left"){if(si>0)ns=customStats[si-1].id;else if(ci>0){nc=allSorted[ci-1].id;ns=customStats[customStats.length-1].id;}}else if(dir==="down"&&ci<allSorted.length-1)nc=allSorted[ci+1].id;else if(dir==="up"&&ci>0)nc=allSorted[ci-1].id;inputRefs.current[nc+"_"+ns]?.focus();}
    function handleKeyNav(e,cid,sid){if(e.key==="Tab"&&!e.shiftKey){e.preventDefault();moveFocus(cid,sid,"right");}else if(e.key==="Tab"&&e.shiftKey){e.preventDefault();moveFocus(cid,sid,"left");}else if(e.key==="Enter"){e.preventDefault();moveFocus(cid,sid,"down");}else if(e.key==="ArrowDown"){e.preventDefault();moveFocus(cid,sid,"down");}else if(e.key==="ArrowUp"){e.preventDefault();moveFocus(cid,sid,"up");}}
    const cell={width:"100%",padding:"6px 8px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:13,fontWeight:700,outline:"none",fontFamily:"'Oswald',sans-serif",textAlign:"center",boxSizing:"border-box"};
    return(
      <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,width:"100%",maxWidth:Math.min(220+customStats.length*140,920),maxHeight:"90vh",display:"flex",flexDirection:"column"}}>
          <div style={{padding:"18px 22px 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2,marginBottom:2}}>BULK ENTRY · {today}</div><h3 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:20,fontWeight:800}}>Enter Measurables</h3><div style={{color:C.muted,fontSize:12,marginTop:2}}>Each filled cell adds a dated entry</div></div>
            <div style={{color:C.muted,fontSize:11,textAlign:"right",lineHeight:1.8}}><div>Tab→next</div><div>Enter↓row</div></div>
          </div>
          <div style={{flex:1,overflowY:"auto",overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead><tr style={{borderBottom:`2px solid ${C.border}`}}><th style={{padding:"10px 16px",textAlign:"left",color:C.muted,fontWeight:600,fontSize:11,letterSpacing:1,position:"sticky",left:0,background:C.card,minWidth:160,zIndex:2}}>CANDIDATE</th>{customStats.map(stat=>(<th key={stat.id} style={{padding:"10px 14px",textAlign:"center",color:C.muted,fontWeight:600,fontSize:10,letterSpacing:.5,minWidth:120,whiteSpace:"nowrap"}}><div>{stat.label.toUpperCase()}</div>{stat.unit&&<div style={{color:C.border,fontWeight:400,fontSize:9}}>{stat.unit}</div>}{isTimeStat(stat)&&<div style={{color:C.accent,fontSize:9,fontWeight:700,marginTop:1}}>⏱ MM:SS</div>}{isSecondsStat(stat)&&<div style={{color:"#42a5f5",fontSize:9,fontWeight:700,marginTop:1}}>⏱ Sec</div>}</th>))}</tr></thead>
              <tbody>{allSorted.map((c,ri)=>{const pc=posColor(c.primaryPos||c.positions?.[0]||"CM");return(<tr key={c.id} style={{borderBottom:`1px solid ${C.border}`,background:ri%2===0?C.card:C.surface}}><td style={{padding:"8px 16px",position:"sticky",left:0,background:ri%2===0?C.card:C.surface,zIndex:1}}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:26,height:26,borderRadius:6,flexShrink:0,background:pc+"22",border:`1.5px solid ${pc}44`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:700,color:pc,fontSize:11}}>{(c.positions||[c.primaryPos||"CM"])[0]}</div><div><div style={{color:C.text,fontWeight:700,fontSize:13}}>{c.name}</div>{c.grade&&<div style={{color:C.muted,fontSize:10}}>Gr.{c.grade}</div>}</div></div></td>{customStats.map(stat=>{const key=c.id+"_"+stat.id;const val=(local[c.id]||{})[stat.id]||"";const best=(c.customStats||{})[stat.id];if(isTimeStat(stat))return(<td key={stat.id} style={{padding:"5px 8px",textAlign:"center"}}>{best&&<div style={{color:C.muted,fontSize:9,marginBottom:2}}>best:{best}</div>}<div onKeyDown={e=>handleKeyNav(e,c.id,stat.id)}><TimeInput value={val} onChange={v=>updateLocal(c.id,stat.id,v)} placeholder="0:00" style={{...cell,ref:el=>{inputRefs.current[key]=el;}}}/></div></td>);if(isSecondsStat(stat))return(<td key={stat.id} style={{padding:"5px 8px",textAlign:"center"}}>{best&&<div style={{color:C.muted,fontSize:9,marginBottom:2}}>best:{best}</div>}<input ref={el=>{inputRefs.current[key]=el;}} type="number" step="0.01" value={val} onChange={e=>updateLocal(c.id,stat.id,e.target.value)} onKeyDown={e=>handleKeyNav(e,c.id,stat.id)} placeholder="4.97" style={cell}/></td>);return(<td key={stat.id} style={{padding:"5px 8px",textAlign:"center"}}>{best&&<div style={{color:C.muted,fontSize:9,marginBottom:2}}>best:{best}</div>}<input ref={el=>{inputRefs.current[key]=el;}} type="number" step="any" value={val} onChange={e=>updateLocal(c.id,stat.id,e.target.value)} onKeyDown={e=>handleKeyNav(e,c.id,stat.id)} placeholder="—" style={cell}/></td>);})}</tr>);})}</tbody>
            </table>
          </div>
          <div style={{padding:"14px 22px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,justifyContent:"flex-end",flexShrink:0}}>
            <button onClick={()=>setShowBulk(false)} style={{padding:"10px 20px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,color:C.muted,cursor:"pointer",fontSize:13}}>Cancel</button>
            <button onClick={flushAndClose} style={{padding:"10px 28px",background:C.accent,border:"none",borderRadius:9,color:"#000",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>Save All →</button>
          </div>
        </div>
      </div>
    );
  }

  return(
    <div style={{padding:20,maxWidth:1200,margin:"0 auto"}}>
      {showBulk&&<BulkEntryModal/>}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        <button onClick={()=>{setSelTryout(null);setSelCand(null);}} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",color:C.text,cursor:"pointer",fontSize:13}}>← Back</button>
        <div style={{flex:1}}><div style={{color:C.muted,fontSize:12}}>{tryout.year} · {tryout.teamType==="club"?"Club":"High School"}</div><h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:800}}>{tryout.name}</h2></div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {customStats.length>0&&<button onClick={()=>setShowBulk(true)} style={{display:"flex",alignItems:"center",gap:7,padding:"9px 16px",background:C.accent,border:"none",borderRadius:9,color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>⚡ Bulk Entry</button>}
          <button onClick={()=>tryout.status==="open"?setCloseWizard(true):setTryouts(prev=>prev.map(t=>t.id===selTryout?{...t,status:"open"}:t))} style={{padding:"8px 14px",background:tryout.status==="open"?C.accent+"22":"#2a1000",border:`1px solid ${tryout.status==="open"?C.accent:C.border}`,borderRadius:8,color:tryout.status==="open"?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:12}}>{tryout.status==="open"?"Close & Submit":"Reopen"}</button>
          <button onClick={()=>{if(window.confirm("Delete this tryout?"))setTryouts(prev=>prev.filter(t=>t.id!==selTryout));setSelTryout(null);}} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",color:C.muted,cursor:"pointer",display:"flex",alignItems:"center",gap:5,fontSize:12}}><Trash2 size={13}/></button>
        </div>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:18,borderBottom:`1px solid ${C.border}`}}>
        {[{k:"candidates",label:"Candidates"},{k:"lineups",label:"Lineup Builder"},{k:"stats",label:"Custom Stats"}].map(tab=>(
          <button key={tab.k} onClick={()=>setActiveTab(tab.k)} style={{padding:"9px 18px",background:"transparent",border:"none",cursor:"pointer",color:activeTab===tab.k?C.accent:C.muted,fontWeight:700,fontSize:13,borderBottom:activeTab===tab.k?`2px solid ${C.accent}`:"2px solid transparent",marginBottom:-1,transition:"all .12s"}}>{tab.label}</button>
        ))}
      </div>

      {/* ── CANDIDATES TAB ─────────────────────────────────────────────── */}
      {activeTab==="candidates"&&(
        <div>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
            <button onClick={()=>setAddingCand(true)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",background:C.accent,border:"none",borderRadius:8,color:"#000",fontWeight:800,fontSize:13,cursor:"pointer"}}><Plus size={14}/>Add Candidate</button>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" style={{display:"none"}} onChange={handleImport}/>
            <button onClick={()=>fileRef.current?.click()} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,cursor:"pointer",fontWeight:700,fontSize:13}}><Upload size={14}/>Import</button>
            <button onClick={downloadTemplate} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,cursor:"pointer",fontWeight:700,fontSize:13}}><Download size={14}/>Template</button>
            {importMsg&&<span style={{color:importMsg.type==="ok"?C.accent:C.danger,fontSize:13,fontWeight:600}}>{importMsg.text}</span>}
          </div>
          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
            {POS_FILTERS.map(pf=>{const col=POS_FILTER_COL[pf];const cnt=pf==="All"?tryout.candidates.length:tryout.candidates.filter(c=>POS_GROUP[c.primaryPos||c.positions?.[0]]===pf).length;return(<button key={pf} onClick={()=>{setPosFilter(pf);setSelCand(null);}} style={{padding:"5px 12px",background:posFilter===pf?col+"22":C.surface,border:`1.5px solid ${posFilter===pf?col:C.border}`,borderRadius:8,color:posFilter===pf?col:C.muted,cursor:"pointer",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:5}}>{pf}<span style={{background:posFilter===pf?col+"33":C.border+"66",color:posFilter===pf?col:C.muted,borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:700}}>{cnt}</span></button>);  })}
            {posFilter!=="All"&&<div style={{color:C.muted,fontSize:12}}>Showing {posFilter} · {sorted.length} candidate{sorted.length!==1?"s":""}</div>}
          </div>
          {addingCand&&(
            <div style={{background:C.card,border:`1px solid ${C.accent}44`,borderRadius:14,padding:20,marginBottom:16}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>NEW CANDIDATE</div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <input value={cForm.name} onChange={e=>setCForm(f=>({...f,name:e.target.value}))} placeholder="Full Name *" style={iS()}/>
                <div><label style={{color:C.muted,fontSize:10,fontWeight:600,display:"block",marginBottom:4}}>PRIMARY POS</label><select value={cForm.primaryPos} onChange={e=>setCForm(f=>({...f,primaryPos:e.target.value}))} style={iS()}>{POSITIONS.map(p=><option key={p}>{p}</option>)}</select></div>
                <div><label style={{color:C.muted,fontSize:10,fontWeight:600,display:"block",marginBottom:4}}>SECONDARY POS</label><select value={cForm.secondaryPos} onChange={e=>setCForm(f=>({...f,secondaryPos:e.target.value}))} style={iS()}><option value="">None</option>{POSITIONS.filter(p=>p!==cForm.primaryPos).map(p=><option key={p}>{p}</option>)}</select></div>
                {tryout.teamType==="highschool"?(<div><label style={{color:C.muted,fontSize:10,fontWeight:600,display:"block",marginBottom:4}}>GRADE</label><select value={cForm.grade} onChange={e=>setCForm(f=>({...f,grade:e.target.value}))} style={iS()}><option value="9">Grade 9</option><option value="10">Grade 10</option><option value="11">Grade 11</option><option value="12">Grade 12</option></select></div>):(<div><label style={{color:C.muted,fontSize:10,fontWeight:600,display:"block",marginBottom:4}}>CLUB</label><input value={cForm.club} onChange={e=>setCForm(f=>({...f,club:e.target.value}))} placeholder="e.g. FC United" style={iS()}/></div>)}
              </div>
              <input value={cForm.notes} onChange={e=>setCForm(f=>({...f,notes:e.target.value}))} placeholder="Initial notes (optional)" style={{...iS(),marginBottom:12}}/>
              <div style={{display:"flex",gap:8}}>
                <button onClick={addCandidate} disabled={!cForm.name.trim()} style={{padding:"9px 20px",background:cForm.name.trim()?C.accent:"#2a1000",border:"none",borderRadius:9,color:cForm.name.trim()?"#000":C.muted,fontWeight:800,fontSize:14,cursor:"pointer"}}>Add</button>
                <button onClick={()=>setAddingCand(false)} style={{padding:"9px 16px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,color:C.muted,cursor:"pointer",fontSize:13}}>Cancel</button>
              </div>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"320px 1fr",gap:16}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,maxHeight:"calc(100vh - 340px)",overflowY:"auto"}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:14}}>{posFilter==="All"?"ALL":"POS: "+posFilter} ({sorted.length})</div>
              {sorted.length===0?<div style={{color:C.muted,fontSize:13,fontStyle:"italic"}}>No candidates{posFilter!=="All"?" in this position":""}</div>
                :sorted.map((c,rank)=>{const avg=avgScore(c.scores),sc=HS_STATUS.find(s=>s.k===c.status),isSel=selCand===c.id,pc=posColor(c.primaryPos||c.positions?.[0]||"CM"),positions=c.positions||[c.primaryPos||"CM"];const bestTS=customStats.filter(s=>isTimeStat(s)||isSecondsStat(s)).find(s=>c.customStats?.[s.id]);const bth=bestTS?(c.customStatHistory||{})[bestTS.id]:null;const imp=bestTS&&bth?getImprovement(bth,bestTS):null;return(
                  <div key={c.id} onClick={()=>setSelCand(isSel?null:c.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:10,marginBottom:5,cursor:"pointer",transition:"all .12s",background:isSel?C.accent+"18":C.surface,border:`1px solid ${isSel?C.accent:C.border}`}}>
                    <div style={{width:20,color:C.muted,fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:13,textAlign:"center",flexShrink:0}}>{rank+1}</div>
                    <div style={{width:26,height:26,borderRadius:6,flexShrink:0,background:pc+"22",border:`1.5px solid ${pc}44`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:700,color:pc,fontSize:11}}>{positions[0]}</div>
                    <div style={{flex:1,minWidth:0}}><div style={{color:C.text,fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</div><div style={{display:"flex",gap:5,alignItems:"center"}}><div style={{color:C.muted,fontSize:10}}>{tryout.teamType==="highschool"?(c.grade?`Gr.${c.grade}`:""):(c.club||"")}</div>{bestTS&&c.customStats?.[bestTS.id]&&<div style={{color:C.accent,fontSize:10,fontWeight:700,fontFamily:"'Oswald',sans-serif"}}>{c.customStats[bestTS.id]}</div>}{imp&&<div style={{color:imp.improved?"#66bb6a":C.danger,fontSize:9,fontWeight:700}}>{imp.label}</div>}</div></div>
                    <div style={{textAlign:"right",flexShrink:0}}>{avg>0&&<div style={{color:rColor(avg),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:15}}>{avg.toFixed(1)}</div>}<div style={{color:sc?.color||C.muted,fontSize:9,fontWeight:700,letterSpacing:.5}}>{sc?.label}</div></div>
                  </div>
                );})}
            </div>
            {selCandObj?(
              <div style={{display:"flex",flexDirection:"column",gap:12,maxHeight:"calc(100vh - 340px)",overflowY:"auto"}}>
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,display:"flex",alignItems:"center",gap:14}}>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>{(selCandObj.positions||[selCandObj.primaryPos||"CM"]).map((pos,i)=>(<div key={pos} style={{width:i===0?52:36,height:i===0?52:36,borderRadius:i===0?12:8,background:posColor(pos)+"22",border:`2px solid ${posColor(pos)}44`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:800,color:posColor(pos),fontSize:i===0?18:13,opacity:i===0?1:.7}}>{pos}</div>))}</div>
                  <div style={{flex:1}}><div style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontWeight:800,fontSize:20}}>{selCandObj.name}</div><div style={{color:C.muted,fontSize:13,marginTop:2}}>{tryout.teamType==="highschool"?(selCandObj.grade?`Grade ${selCandObj.grade}`:""):(selCandObj.club||"")}</div></div>
                  {avgScore(selCandObj.scores)>0&&<div style={{textAlign:"center",flexShrink:0}}><div style={{color:rColor(avgScore(selCandObj.scores)),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:40,lineHeight:1}}>{avgScore(selCandObj.scores).toFixed(1)}</div><div style={{color:C.muted,fontSize:10,fontWeight:600}}>OVERALL</div></div>}
                  <button onClick={()=>deleteCandidate(selCandObj.id)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:4}}><Trash2 size={15}/></button>
                </div>
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                  <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>STATUS</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{HS_STATUS.map(opt=>(<button key={opt.k} onClick={()=>updateCandField(selCandObj.id,"status",opt.k)} style={{padding:"7px 16px",background:selCandObj.status===opt.k?opt.color+"22":C.surface,border:`1.5px solid ${selCandObj.status===opt.k?opt.color:C.border}`,borderRadius:8,color:selCandObj.status===opt.k?opt.color:C.muted,cursor:"pointer",fontWeight:700,fontSize:13,transition:"all .12s"}}>{opt.label}</button>))}</div>
                </div>
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                  <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:14}}>EVALUATION (1–10)</div>
                  {SCORE_CATS.map(cat=>{const val=selCandObj.scores[cat.k]||0;return(<div key={cat.k} style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><div><span style={{color:cat.color,fontWeight:700,fontSize:13}}>{cat.label}</span><span style={{color:C.muted,fontSize:11,marginLeft:8}}>{cat.desc}</span></div><span style={{color:val>0?cat.color:C.muted,fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:18}}>{val>0?val:"-"}</span></div><div style={{display:"flex",gap:3}}>{[1,2,3,4,5,6,7,8,9,10].map(n=>(<button key={n} onClick={()=>updateScore(selCandObj.id,cat.k,n===val?0:n)} style={{flex:1,height:26,borderRadius:5,border:`1.5px solid ${n<=val?cat.color:C.border}`,background:n<=val?cat.color+"22":"transparent",color:n<=val?cat.color:C.muted,cursor:"pointer",fontWeight:700,fontSize:11,transition:"all .08s"}}>{n}</button>))}</div></div>);})}
                </div>
                {customStats.length>0&&(
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1}}>MEASURABLES</div><button onClick={()=>setShowBulk(true)} style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:6,cursor:"pointer",background:C.accent+"22",border:`1px solid ${C.accent}44`,color:C.accent}}>⚡ Bulk Entry</button></div>
                    <div style={{display:"flex",flexDirection:"column",gap:14}}>
                      {customStats.map(stat=>{const history=(selCandObj.customStatHistory||{})[stat.id]||[];const bestVal=(selCandObj.customStats||{})[stat.id]||"";const imp=getImprovement(history,stat);const nKey=selCandObj.id+"_"+stat.id;const noteOpen=openStatNotes[nKey]||false;const noteVal=(selCandObj.customStatNotes||{})[stat.id]||"";const entryVal=newEntryVals[stat.id]||"";return(
                        <div key={stat.id} style={{background:C.surface,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:history.length?10:8}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{color:C.text,fontWeight:700,fontSize:13}}>{stat.label}</span>{stat.unit&&<span style={{color:C.muted,fontSize:11}}>({stat.unit})</span>}{isTimeStat(stat)&&<span style={{color:C.accent,fontSize:9,fontWeight:700,background:C.accent+"22",padding:"1px 5px",borderRadius:3}}>⏱ MM:SS</span>}{isSecondsStat(stat)&&<span style={{color:"#42a5f5",fontSize:9,fontWeight:700,background:"#42a5f522",padding:"1px 5px",borderRadius:3}}>⏱ Sec</span>}</div>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>{imp&&<span style={{color:imp.improved?"#66bb6a":C.danger,fontSize:12,fontWeight:700}}>{imp.label}</span>}{bestVal&&<span style={{color:C.accent,fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:16}}>{bestVal}</span>}{bestVal&&history.length>1&&<span style={{color:C.muted,fontSize:9,fontWeight:700}}>★ best</span>}<button onClick={()=>setOpenStatNotes(p=>({...p,[nKey]:!noteOpen}))} style={{padding:"4px 7px",borderRadius:5,cursor:"pointer",fontSize:11,background:noteOpen||noteVal?C.accent+"22":"transparent",border:`1px solid ${noteOpen||noteVal?C.accent:C.border}`,color:noteOpen||noteVal?C.accent:C.muted}}>📝</button></div>
                          </div>
                          {history.length>0&&(<div style={{marginBottom:8,display:"flex",flexDirection:"column",gap:3}}>{history.map((entry,i)=>{const isBest=entry.value===bestVal,isLatest=i===history.length-1;return(<div key={entry.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",borderRadius:6,background:isBest?C.accent+"11":C.bg,border:`1px solid ${isBest?C.accent+"33":C.border}`}}><span style={{color:C.muted,fontSize:10,minWidth:70}}>{entry.date}</span><span style={{color:isBest?C.accent:C.text,fontWeight:isBest?700:400,fontFamily:"'Oswald',sans-serif",fontSize:14,flex:1}}>{entry.value}</span>{isBest&&<span style={{color:C.accent,fontSize:9,fontWeight:700}}>★ best</span>}{isLatest&&!isBest&&<span style={{color:C.muted,fontSize:9}}>latest</span>}<button onClick={()=>removeStatEntry(selCandObj.id,stat.id,entry.id)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:"0 2px",fontSize:12,lineHeight:1}}>×</button></div>);})}</div>)}
                          <div style={{display:"flex",gap:6,alignItems:"center"}}>
                            {isTimeStat(stat)?<TimeInput value={entryVal} onChange={v=>setNewEntryVals(p=>({...p,[stat.id]:v}))} placeholder="0:00" style={iS({flex:1,padding:"6px 10px",fontSize:14})}/>:isSecondsStat(stat)?<input type="number" step="0.01" value={entryVal} onChange={e=>setNewEntryVals(p=>({...p,[stat.id]:e.target.value}))} placeholder="4.97" style={iS({flex:1,textAlign:"center",fontWeight:700,fontSize:14,padding:"6px 10px"})}/>:<input type="number" step="any" value={entryVal} onChange={e=>setNewEntryVals(p=>({...p,[stat.id]:e.target.value}))} placeholder="—" style={iS({flex:1,textAlign:"center",fontWeight:700,fontSize:14,padding:"6px 10px"})}/>}
                            <button onClick={()=>addStatEntry(selCandObj.id,stat.id,entryVal)} disabled={!entryVal?.toString().trim()} style={{padding:"6px 14px",background:entryVal?.toString().trim()?C.accent:"#2a1000",border:"none",borderRadius:7,color:entryVal?.toString().trim()?"#000":C.muted,fontWeight:700,fontSize:12,cursor:entryVal?.toString().trim()?"pointer":"default",flexShrink:0,fontFamily:"'Oswald',sans-serif"}}>+ Add</button>
                          </div>
                          {noteOpen&&<div style={{marginTop:8}}><input value={noteVal} onChange={e=>updateStatNote(selCandObj.id,stat.id,e.target.value)} placeholder={`Note for ${stat.label}...`} autoFocus style={iS({fontSize:12,padding:"6px 10px"})}/></div>}
                          {!noteOpen&&noteVal&&<div onClick={()=>setOpenStatNotes(p=>({...p,[nKey]:true}))} style={{marginTop:5,color:C.accent,fontSize:11,fontStyle:"italic",cursor:"pointer"}}>📝 {noteVal}</div>}
                        </div>
                      );})}
                    </div>
                  </div>
                )}
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}><div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:10}}>COACH NOTES</div><textarea value={selCandObj.coachNote||""} rows={3} onChange={e=>updateCandField(selCandObj.id,"coachNote",e.target.value)} placeholder="Observations, strengths, areas of concern..." style={iS({resize:"vertical"})}/></div>
              </div>
            ):(
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:48,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
                <ClipboardCheck size={40} style={{color:C.muted,opacity:.3}}/><div style={{color:C.muted,fontSize:14}}>Select a candidate to evaluate</div>
                {customStats.length>0&&<button onClick={()=>setShowBulk(true)} style={{marginTop:4,padding:"9px 20px",background:C.accent+"22",border:`1px solid ${C.accent}44`,borderRadius:9,color:C.accent,fontWeight:700,fontSize:13,cursor:"pointer"}}>⚡ Bulk Enter</button>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── LINEUP BUILDER TAB ─────────────────────────────────────────────── */}
      {activeTab==="lineups"&&(
        <div>
          {/* Player picker modal */}
          {pickingSlot&&(
            <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:22,width:"100%",maxWidth:400,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div><h3 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:18,fontWeight:700}}>{pickingSlot.isBackup?"Select Sub":"Select Starter"} — {pickingSlot.zone}</h3><div style={{color:C.muted,fontSize:11,marginTop:2}}>{pickingSlot.isBackup?"Backup / sub for this slot":"Starting player"}</div></div>
                  <button onClick={()=>setPickingSlot(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer"}}><X size={16}/></button>
                </div>
                <div style={{display:"flex",gap:12,marginBottom:10,padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                  {[["#66bb6a","Primary pos"],["#ffb300","Secondary pos"],["#ef5350","Out of pos"]].map(([col,lbl])=>(<div key={lbl} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:7,height:7,borderRadius:"50%",background:col}}/><span style={{color:C.muted,fontSize:10}}>{lbl}</span></div>))}
                </div>
                <div style={{overflowY:"auto",flex:1}}>
                  <div onClick={()=>assignSlot(pickingSlot.zone,pickingSlot.idx,pickingSlot.isBackup,null)} style={{padding:"9px 12px",borderRadius:8,marginBottom:5,cursor:"pointer",background:"#1a0800",border:`1px solid ${C.border}`,color:"rgba(255,255,255,.4)",fontSize:13}}>— Clear slot</div>
                  {[...allSorted].map(c=>({...c,fit:posFit(c,pickingSlot.zone)})).sort((a,b)=>{const fo={primary:0,secondary:1,none:2};if(fo[a.fit]!==fo[b.fit])return fo[a.fit]-fo[b.fit];return avgScore(b.scores)-avgScore(a.scores);}).map(c=>{
                    const pc=posColor(c.primaryPos||c.positions?.[0]||"CM"),positions=c.positions||[c.primaryPos||"CM"],avg=avgScore(c.scores),fitCol=FIT_COLOR[c.fit]||C.muted;
                    return(<div key={c.id} onClick={()=>assignSlot(pickingSlot.zone,pickingSlot.idx,pickingSlot.isBackup,c.id)} style={{padding:"9px 12px",borderRadius:8,marginBottom:5,cursor:"pointer",background:"#1a0800",border:`1px solid ${pc}33`,display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:7,height:7,borderRadius:"50%",background:fitCol,flexShrink:0}}/>
                      <div style={{width:28,height:28,borderRadius:7,background:pc+"22",border:`1.5px solid ${pc}44`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:700,color:pc,fontSize:12,flexShrink:0}}>{positions[0]}</div>
                      <div style={{flex:1}}><div style={{color:"rgba(255,255,255,.9)",fontWeight:700,fontSize:13}}>{c.name}</div><div style={{color:"rgba(255,255,255,.45)",fontSize:11}}>{positions.join(" / ")}{c.grade?` · Gr.${c.grade}`:""}</div></div>
                      {avg>0&&<span style={{color:rColor(avg),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:15}}>{avg.toFixed(1)}</span>}
                    </div>);
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Team selector */}
          <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
            {LINEUP_TEAMS.map(t=>(<button key={t.k} onClick={()=>{setLineupTeam(t.k);setSelLineupId(getLineupSaves(t.k)[0]?.id||"default");}} style={{padding:"8px 20px",background:lineupTeam===t.k?t.color+"22":C.surface,border:`1.5px solid ${lineupTeam===t.k?t.color:C.border}`,borderRadius:9,color:lineupTeam===t.k?t.color:C.muted,cursor:"pointer",fontWeight:700,fontSize:14}}>{t.label}</button>))}
          </div>

          {/* Lineup selector */}
          <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1}}>LINEUP:</div>
            {lineupSaves.map(lu=>(<button key={lu.id} onClick={()=>setSelLineupId(lu.id)} style={{padding:"5px 14px",background:activeID===lu.id?C.accent+"22":C.surface,border:`1.5px solid ${activeID===lu.id?C.accent:C.border}`,borderRadius:8,color:activeID===lu.id?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:6}}>{lu.name}{lineupSaves.length>1&&<span onClick={e=>{e.stopPropagation();if(window.confirm(`Delete "${lu.name}"?`))deleteLineup(lu.id);}} style={{color:C.muted,fontSize:12,lineHeight:1,padding:"0 2px",opacity:.5}}>×</span>}</button>))}
            {creatingLU?(<div style={{display:"flex",gap:6,alignItems:"center"}}><input value={newLUName} onChange={e=>setNewLUName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&newLUName.trim()){createNewLineup(newLUName);setNewLUName("");setCreatingLU(false);}if(e.key==="Escape"){setCreatingLU(false);setNewLUName("");}}} placeholder="Lineup name..." autoFocus style={{...iS({width:140,padding:"5px 10px",fontSize:13})}}/><button onClick={()=>{if(newLUName.trim()){createNewLineup(newLUName);setNewLUName("");setCreatingLU(false);}}} style={{padding:"5px 12px",background:C.accent,border:"none",borderRadius:7,color:"#000",fontWeight:700,fontSize:12,cursor:"pointer"}}>Save</button><button onClick={()=>{setCreatingLU(false);setNewLUName("");}} style={{padding:"5px 10px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,color:C.muted,cursor:"pointer",fontSize:12}}>✕</button></div>)
            :(<button onClick={()=>setCreatingLU(true)} style={{padding:"5px 12px",background:C.surface,border:`1px dashed ${C.border}`,borderRadius:8,color:C.muted,cursor:"pointer",fontWeight:600,fontSize:12,display:"flex",alignItems:"center",gap:4}}><Plus size={11}/>New Lineup</button>)}
          </div>

          {/* Formation + note */}
          <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div><div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:6}}>FORMATION</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{FORMATIONS.map(f=>(<button key={f} onClick={()=>setLineupFormation(f)} style={{padding:"6px 14px",background:curLU.formation===f?C.accent+"22":C.surface,border:`1px solid ${curLU.formation===f?C.accent:C.border}`,borderRadius:8,color:curLU.formation===f?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:13}}>{f}</button>))}</div>
            </div>
            <div style={{flex:1,minWidth:160}}><div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:6}}>OPPONENT / NOTE</div><input value={curLU.note||""} onChange={e=>updLineupSave(()=>({note:e.target.value}))} placeholder="e.g. vs Westview, Press system" style={iS({padding:"7px 12px"})}/></div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:16}}>

            {/* ── VISUAL PITCH with drag & drop ── */}
            <div style={{background:"linear-gradient(180deg,#162e16 0%,#1c3c1c 40%,#1c3c1c 60%,#162e16 100%)",borderRadius:16,padding:"20px 16px",border:"2px solid #2a522a",position:"relative",minHeight:480,userSelect:"none"}}>
              {/* Pitch markings */}
              <div style={{position:"absolute",top:"50%",left:20,right:20,height:1,background:"rgba(255,255,255,0.06)"}}/>
              <div style={{position:"absolute",top:"50%",left:"50%",width:90,height:90,borderRadius:"50%",border:"1px solid rgba(255,255,255,0.06)",transform:"translate(-50%,-50%)"}}/>
              <div style={{position:"absolute",bottom:16,left:"50%",transform:"translateX(-50%)",width:110,height:28,border:"1px solid rgba(255,255,255,0.06)",borderBottom:"none"}}/>
              <div style={{position:"absolute",top:16,left:"50%",transform:"translateX(-50%)",width:110,height:28,border:"1px solid rgba(255,255,255,0.06)",borderTop:"none"}}/>
              {/* Drag hint */}
              {!dragging&&<div style={{position:"absolute",top:10,left:12,color:"rgba(255,255,255,0.2)",fontSize:9}}>drag to move</div>}
              {/* Fit legend */}
              <div style={{position:"absolute",top:10,right:12,display:"flex",flexDirection:"column",gap:3}}>
                {[["#66bb6a","Primary"],["#ffb300","Secondary"],["#ef5350","Out of pos"]].map(([col,lbl])=>(<div key={lbl} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:6,height:6,borderRadius:"50%",background:col}}/><span style={{color:"rgba(255,255,255,0.3)",fontSize:9}}>{lbl}</span></div>))}
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:4,height:"100%",justifyContent:"space-around"}}>
                {ZONES.map(zone=>{
                  const slots=curLU.slots[zone.key]||[];
                  const backups=curLU.backups?.[zone.key]||Array(slots.length).fill(null);
                  const rows=getZoneRows(zone.key,curLU.formation,slots.length);
                  return(
                    <div key={zone.key}>
                      {rows.map((rowIndices,rowIdx)=>(
                        <div key={rowIdx} style={{display:"flex",justifyContent:"center",gap:8,marginBottom:rowIdx<rows.length-1?6:0}}>
                          {rowIndices.map(idx=>{
                            const candId=slots[idx]||null;
                            const cand=candId?tryout.candidates.find(c=>c.id===candId):null;
                            const subId=backups[idx]||null;
                            const sub=subId?tryout.candidates.find(c=>c.id===subId):null;
                            const avg=cand?avgScore(cand.scores):0;
                            const pc=cand?posColor(cand.primaryPos||cand.positions?.[0]||"CM"):null;
                            const fit=cand?posFit(cand,zone.key):null;
                            const fitCol=fit?FIT_COLOR[fit]:"transparent";
                            const isOver=dragOver?.zone===zone.key&&dragOver?.idx===idx&&!dragOver?.isBackup;
                            const isSubOver=dragOver?.zone===zone.key&&dragOver?.idx===idx&&dragOver?.isBackup;
                            const isDraggingThis=dragging?.fromZone===zone.key&&dragging?.fromIdx===idx&&!dragging?.isBackup;
                            const isDraggingSubThis=dragging?.fromZone===zone.key&&dragging?.fromIdx===idx&&dragging?.isBackup;
                            return(
                              <div key={idx} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                                {/* Starter slot */}
                                <div
                                  draggable={!!cand}
                                  onDragStart={cand?e=>onDragStart(e,cand.id,zone.key,idx,false):undefined}
                                  onDragEnd={onDragEnd}
                                  onDragOver={e=>onDragOverSlot(e,zone.key,idx,false)}
                                  onDragLeave={onDragLeaveSlot}
                                  onDrop={e=>onDropSlot(e,zone.key,idx,false)}
                                  onClick={()=>setPickingSlot({zone:zone.key,idx,isBackup:false})}
                                  style={{width:76,padding:"7px 6px",borderRadius:10,cursor:cand?"grab":"pointer",transition:"all .1s",opacity:isDraggingThis?.35:1,
                                    background:cand?"rgba(0,0,0,.5)":"rgba(255,255,255,0.03)",
                                    border:`2px solid ${isOver?C.accent:cand?(pc||zone.color)+"99":"rgba(255,255,255,0.12)"}`,
                                    boxShadow:isOver?`0 0 0 2px ${C.accent}44`:"none",
                                    display:"flex",flexDirection:"column",alignItems:"center",gap:3}}
                                  onMouseEnter={e=>{if(!dragging)e.currentTarget.style.borderColor=zone.color;}}
                                  onMouseLeave={e=>{if(!dragging)e.currentTarget.style.borderColor=cand?(pc||zone.color)+"99":"rgba(255,255,255,0.12)";}}>
                                  {cand?(<>
                                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                                      <div style={{width:20,height:20,borderRadius:4,background:(pc||zone.color)+"33",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:800,color:pc||zone.color,fontSize:9}}>{(cand.positions||[cand.primaryPos||"CM"])[0]}</div>
                                      <div style={{width:6,height:6,borderRadius:"50%",background:fitCol,flexShrink:0}}/>
                                    </div>
                                    <div style={{color:"#fff",fontSize:10,fontWeight:700,textAlign:"center",lineHeight:1.2,maxWidth:70,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cand.name.split(" ").slice(-1)[0]}</div>
                                    {avg>0&&<div style={{color:rColor(avg),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:11}}>{avg.toFixed(1)}</div>}
                                  </>):(<>
                                    <div style={{color:"rgba(255,255,255,0.2)",fontSize:18,lineHeight:1}}>+</div>
                                    <div style={{color:"rgba(255,255,255,0.12)",fontSize:8,fontWeight:600}}>{zone.key}</div>
                                  </>)}
                                </div>
                                {/* Sub slot */}
                                <div
                                  draggable={!!sub}
                                  onDragStart={sub?e=>onDragStart(e,sub.id,zone.key,idx,true):undefined}
                                  onDragEnd={onDragEnd}
                                  onDragOver={e=>onDragOverSlot(e,zone.key,idx,true)}
                                  onDragLeave={onDragLeaveSlot}
                                  onDrop={e=>onDropSlot(e,zone.key,idx,true)}
                                  onClick={()=>setPickingSlot({zone:zone.key,idx,isBackup:true})}
                                  title="Sub / backup"
                                  style={{width:64,padding:"3px 5px",borderRadius:7,cursor:sub?"grab":"pointer",transition:"all .1s",opacity:isDraggingSubThis?.35:1,
                                    background:sub?"rgba(0,0,0,.4)":"rgba(255,255,255,0.02)",
                                    border:`1px dashed ${isSubOver?C.accent:sub?"rgba(255,255,255,0.3)":"rgba(255,255,255,0.08)"}`,
                                    display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                                  {sub?(()=>{const spc=posColor(sub.primaryPos||sub.positions?.[0]||"CM"),sfit=posFit(sub,zone.key);return(<><div style={{display:"flex",alignItems:"center",gap:3}}><div style={{width:14,height:14,borderRadius:3,background:spc+"33",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:800,color:spc,fontSize:7}}>{(sub.positions||[sub.primaryPos||"CM"])[0]}</div><div style={{width:4,height:4,borderRadius:"50%",background:FIT_COLOR[sfit]}}/></div><div style={{color:"rgba(255,255,255,0.6)",fontSize:8,fontWeight:600,textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:58}}>{sub.name.split(" ").slice(-1)[0]}</div></>);})():<div style={{color:"rgba(255,255,255,0.1)",fontSize:9}}>sub</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── PLAYER POOL with drag support ── */}
            <div
              onDragOver={onDragOverPool}
              onDrop={onDropPool}
              style={{background:C.card,border:`2px dashed ${dragging?"#66bb6a44":C.border}`,borderRadius:14,padding:16,maxHeight:520,display:"flex",flexDirection:"column",transition:"border-color .15s"}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:6}}>CANDIDATE POOL</div>
              {dragging&&<div style={{color:"#66bb6a",fontSize:11,marginBottom:8,textAlign:"center"}}>↑ Drop here to remove from pitch</div>}
              <div style={{marginBottom:10,display:"flex",flexWrap:"wrap",gap:4}}>
                {ZONES.slice().reverse().map(zone=>{const filled=(curLU.slots[zone.key]||[]).filter(Boolean).length,total=(curLU.slots[zone.key]||[]).length;return(<div key={zone.key} style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:5,background:filled===total?zone.color+"22":C.surface,border:`1px solid ${filled===total?zone.color:C.border}`,color:filled===total?zone.color:C.muted}}>{zone.key} {filled}/{total}</div>);})}
              </div>
              <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
                {allSorted.map(c=>{
                  const positions=c.positions||[c.primaryPos||"CM"],pc=posColor(positions[0]),avg=avgScore(c.scores);
                  const allStarters=Object.values(curLU.slots||{}).flat();
                  const allBackups=Object.values(curLU.backups||{}).flat();
                  const isStarter=allStarters.includes(c.id),isSub=allBackups.includes(c.id);
                  const isDraggingThis=dragging?.candId===c.id;
                  return(
                    <div key={c.id}
                      draggable={true}
                      onDragStart={e=>onDragStart(e,c.id,null,null,false)}
                      onDragEnd={onDragEnd}
                      style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",
                        background:isStarter?C.accent+"11":isSub?"#ffb30011":C.surface,
                        border:`1px solid ${isStarter?C.accent+"44":isSub?"#ffb30044":C.border}`,
                        borderRadius:8,cursor:"grab",opacity:isDraggingThis?.4:1,transition:"opacity .1s"}}>
                      <div style={{width:24,height:24,borderRadius:6,flexShrink:0,background:pc+"22",border:`1.5px solid ${pc}44`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:700,color:pc,fontSize:10}}>{positions[0]}</div>
                      <div style={{flex:1,minWidth:0}}><div style={{color:C.text,fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</div>{positions.length>1&&<div style={{color:C.muted,fontSize:10}}>{positions.join(" / ")}</div>}</div>
                      {avg>0&&<span style={{color:rColor(avg),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:13,flexShrink:0}}>{avg.toFixed(1)}</span>}
                      {isStarter&&<span style={{color:C.accent,fontSize:9,fontWeight:700,flexShrink:0}}>▶</span>}
                      {isSub&&!isStarter&&<span style={{color:"#ffb300",fontSize:9,fontWeight:700,flexShrink:0}}>◎</span>}
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
          <div style={{color:C.muted,fontSize:13,marginBottom:18,lineHeight:1.6}}>Define measurable stats. Toggle type: <strong style={{color:C.accent}}>⏱ MM:SS</strong> for mile/drill times, <strong style={{color:"#42a5f5"}}>⏱ Seconds</strong> for sprints like the 40-yard dash.</div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,marginBottom:18}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>ADD MEASURABLE</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto auto",gap:10,alignItems:"flex-end"}}>
              <div><label style={{color:C.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:5}}>STAT NAME</label><input value={newStatLabel} onChange={e=>setNewStatLabel(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCustomStat()} placeholder="e.g. Mile Run, 40-Yard Dash" style={iS()}/></div>
              <div><label style={{color:C.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:5}}>UNIT</label><input value={newStatUnit} onChange={e=>setNewStatUnit(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCustomStat()} placeholder="e.g. min, sec, inches" style={iS()}/></div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}><label style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:.5,whiteSpace:"nowrap"}}>TYPE</label><button onClick={()=>setNewStatTimeFormat(f=>f==="none"?"seconds":f==="seconds"?"mmss":"none")} style={{padding:"8px 12px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12,whiteSpace:"nowrap",background:newStatTimeFormat==="mmss"?C.accent+"22":newStatTimeFormat==="seconds"?"#42a5f522":C.surface,border:`1.5px solid ${newStatTimeFormat==="mmss"?C.accent:newStatTimeFormat==="seconds"?"#42a5f5":C.border}`,color:newStatTimeFormat==="mmss"?C.accent:newStatTimeFormat==="seconds"?"#42a5f5":C.muted}}>{newStatTimeFormat==="mmss"?"⏱ MM:SS":newStatTimeFormat==="seconds"?"⏱ Seconds":"# Number"}</button></div>
              <button onClick={addCustomStat} disabled={!newStatLabel.trim()} style={{padding:"9px 18px",background:newStatLabel.trim()?C.accent:"#2a1000",border:"none",borderRadius:8,color:newStatLabel.trim()?"#000":C.muted,fontWeight:800,fontSize:14,cursor:"pointer",whiteSpace:"nowrap",alignSelf:"flex-end"}}>+ Add</button>
            </div>
          </div>
          {customStats.length===0
            ?<div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"32px 24px",textAlign:"center"}}><div style={{color:C.muted,fontSize:13,fontStyle:"italic"}}>No measurables yet</div><div style={{color:C.muted,fontSize:12,marginTop:6}}>Try: Mile Run (⏱ MM:SS), 40-Yard Dash (⏱ Seconds), Vertical Jump (# Number)</div></div>
            :<div style={{display:"flex",flexDirection:"column",gap:8}}>
                {customStats.map(stat=>{
                  const candBests=tryout.candidates.map(c=>{const hist=(c.customStatHistory||{})[stat.id]||[];const best=hist.length?getBestVal(hist,stat):(c.customStats?.[stat.id]||"");if(!best)return null;return{name:c.name,val:best,attempts:hist.length,imp:getImprovement(hist,stat)};}).filter(Boolean);
                  const sorted2=[...candBests].sort((a,b)=>isTimeStat(stat)?timeToSecs(a.val)-timeToSecs(b.val):isSecondsStat(stat)?parseFloat(a.val)-parseFloat(b.val):parseFloat(b.val)-parseFloat(a.val));
                  const medals=["🥇","🥈","🥉"];
                  return(<div key={stat.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"flex-start",gap:14}}>
                    <div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:sorted2.length?8:0}}><div style={{color:C.text,fontWeight:700,fontSize:14}}>{stat.label}</div>{stat.unit&&<div style={{color:C.muted,fontSize:12}}>{stat.unit}</div>}{isTimeStat(stat)&&<span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:C.accent+"22",color:C.accent}}>⏱ MM:SS</span>}{isSecondsStat(stat)&&<span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:"#42a5f522",color:"#42a5f5"}}>⏱ Sec</span>}</div>
                      {sorted2.length>0&&<div style={{display:"flex",flexDirection:"column",gap:5}}>{sorted2.slice(0,3).map((e,i)=>(<div key={e.name} style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:14}}>{medals[i]}</span><span style={{color:i===0?C.accent:C.text,fontWeight:700,fontSize:15,fontFamily:"'Oswald',sans-serif"}}>{e.val}</span><span style={{color:C.muted,fontSize:12}}>{e.name.split(" ")[0]}</span>{e.attempts>1&&<span style={{color:C.muted,fontSize:10}}>{e.attempts} attempts</span>}{e.imp&&<span style={{color:e.imp.improved?"#66bb6a":C.danger,fontSize:11,fontWeight:700}}>{e.imp.label}</span>}</div>))}</div>}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}><div style={{color:C.muted,fontSize:12}}>{candBests.length} entered</div></div>
                    <button onClick={()=>removeCustomStat(stat.id)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:4,flexShrink:0}}><X size={14}/></button>
                  </div>);
                })}
              </div>
          }
          {customStats.length>0&&tryout.candidates.length>0&&<div style={{marginTop:16,textAlign:"center"}}><button onClick={()=>setShowBulk(true)} style={{padding:"11px 28px",background:C.accent,border:"none",borderRadius:10,color:"#000",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>⚡ Open Bulk Entry Grid</button></div>}
        </div>
      )}
    </div>
  );
}
