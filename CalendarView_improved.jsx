function CalendarView({schedule, setSchedule, games, setGames, practices, setView, teamName, activeTeamId}){
  const today   = new Date();
  const [curMonth, setCurMonth] = useState(today.getMonth());
  const [curYear,  setCurYear]  = useState(today.getFullYear());
  const [selDay,   setSelDay]   = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editEvt,  setEditEvt]  = useState(null);
  const [form, setForm] = useState({
    type:"game", title:"", date:"", time:"", location:"", opponent:"", notes:""
  });

  const EVENT_TYPES = [
    {k:"game",       label:"Game",       color:"#ff6b00"},
    {k:"practice",   label:"Practice",   color:"#66bb6a"},
    {k:"tournament", label:"Tournament", color:"#7c6af5"},
    {k:"other",      label:"Other",      color:"#42a5f5"},
  ];
  const typeColor = k => EVENT_TYPES.find(t=>t.k===k)?.color || C.accent;

  const allEvents = useMemo(()=>{
    const evts = [...schedule];
    games.filter(g=>g.status==="completed").forEach(g=>{
      if(!schedule.find(e=>e.linkedGameId===g.id)){
        evts.push({id:`auto_g_${g.id}`, type:"game", title:`vs ${g.opponent}`,
          date:g.date, time:"", location:g.location||"",
          opponent:g.opponent, linkedGameId:g.id, auto:true,
          result:{our:g.ourScore, their:g.theirScore}});
      }
    });
    return evts;
  },[schedule, games]);

  const daysInMonth = new Date(curYear, curMonth+1, 0).getDate();
  const firstDay    = new Date(curYear, curMonth, 1).getDay();
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  function eventsOnDay(d){
    const dateStr = `${curYear}-${String(curMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    return allEvents.filter(e=>e.date===dateStr).sort((a,b)=>(a.time||"").localeCompare(b.time||""));
  }

  function prevMonth(){ if(curMonth===0){setCurMonth(11);setCurYear(y=>y-1);}else setCurMonth(m=>m-1); }
  function nextMonth(){ if(curMonth===11){setCurMonth(0);setCurYear(y=>y+1);}else setCurMonth(m=>m+1); }

  function saveEvent(){
    if(!form.date) return;
    if(editEvt){
      setSchedule(prev=>prev.map(e=>e.id===editEvt?{...e,...form}:e));
      setEditEvt(null);
    } else {
      setSchedule(prev=>[...prev,{id:`ev${Date.now()}`,...form,createdAt:new Date().toISOString()}]);
    }
    setShowForm(false);
    setForm({type:"game",title:"",date:selDay||"",time:"",location:"",opponent:"",notes:""});
  }

  function deleteEvent(id){ setSchedule(prev=>prev.filter(e=>e.id!==id)); }

  function openAdd(dateStr){
    setSelDay(dateStr);
    setForm({type:"game",title:"",date:dateStr,time:"",location:"",opponent:"",notes:""});
    setEditEvt(null);
    setShowForm(true);
  }

  function openEdit(evt){
    if(evt.auto) return;
    setForm({type:evt.type,title:evt.title,date:evt.date,time:evt.time||"",
      location:evt.location||"",opponent:evt.opponent||"",notes:evt.notes||""});
    setEditEvt(evt.id);
    setShowForm(true);
  }

  const iStyle = (extra={}) => ({padding:"9px 12px",background:C.bg,border:`1px solid ${C.border}`,
    borderRadius:8,color:C.text,fontSize:13,outline:"none",fontFamily:"'Outfit',sans-serif",
    boxSizing:"border-box",width:"100%",...extra});

  // Sidebar: show all events in the currently viewed month, sorted by date
  const monthEvents = useMemo(()=>{
    const prefix = `${curYear}-${String(curMonth+1).padStart(2,"0")}`;
    return allEvents
      .filter(e=>e.date && e.date.startsWith(prefix))
      .sort((a,b)=>a.date.localeCompare(b.date)||(a.time||"").localeCompare(b.time||""));
  },[allEvents, curMonth, curYear]);

  // Stats for current month
  const monthGames    = monthEvents.filter(e=>e.type==="game");
  const monthPractice = monthEvents.filter(e=>e.type==="practice");

  const todayStr = today.toISOString().split("T")[0];

  return(
    <div style={{padding:20,maxWidth:1160,margin:"0 auto"}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2}}>SEASON</div>
          <h1 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:28,fontWeight:800,marginTop:4}}>Calendar</h1>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <button onClick={()=>downloadICS(allEvents,teamName)}
            style={{display:"flex",alignItems:"center",gap:6,padding:"9px 14px",
              background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,
              color:C.muted,cursor:"pointer",fontWeight:700,fontSize:12}}>
            ⬇ Export .ics
          </button>
          <button onClick={()=>{
              const link=window.location.origin+window.location.pathname+"#/schedule/"+activeTeamId;
              navigator.clipboard?.writeText(link).then(()=>alert("Schedule link copied!")).catch(()=>alert(link));
            }}
            style={{display:"flex",alignItems:"center",gap:6,padding:"9px 14px",
              background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,
              color:C.muted,cursor:"pointer",fontWeight:700,fontSize:12}}>
            ⎘ Share Schedule
          </button>
          <button onClick={()=>openAdd(todayStr)}
            style={{display:"flex",alignItems:"center",gap:8,padding:"10px 18px",
              background:C.accent,border:"none",borderRadius:10,color:"#000",
              fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
            <Plus size={15}/>Add Event
          </button>
        </div>
      </div>

      {/* Add/Edit form modal */}
      {showForm&&(
        <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:999,
          display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,
            padding:28,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <h3 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:20,fontWeight:800}}>
                {editEvt?"Edit Event":"Add Event"}
              </h3>
              <button onClick={()=>setShowForm(false)}
                style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20}}>×</button>
            </div>

            {/* Type selector */}
            <div style={{marginBottom:16}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:8}}>TYPE</label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {EVENT_TYPES.map(t=>(
                  <button key={t.k} onClick={()=>setForm(f=>({...f,type:t.k}))}
                    style={{padding:"7px 14px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700,
                      background:form.type===t.k?t.color+"22":"transparent",
                      border:`1px solid ${form.type===t.k?t.color:C.border}`,
                      color:form.type===t.k?t.color:C.muted}}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {form.type==="game"?(
              <div style={{marginBottom:14}}>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>OPPONENT</label>
                <input value={form.opponent} onChange={e=>setForm(f=>({...f,opponent:e.target.value,title:`vs ${e.target.value}`}))}
                  placeholder="vs Team Name" autoFocus style={iStyle()}/>
              </div>
            ):(
              <div style={{marginBottom:14}}>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>TITLE</label>
                <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}
                  placeholder="Event name" autoFocus style={iStyle()}/>
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <div>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>DATE</label>
                <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={iStyle()}/>
              </div>
              <div>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>TIME</label>
                <input type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))} style={iStyle()}/>
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>LOCATION</label>
              <input value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))}
                placeholder="Home / Away / Address" style={iStyle()}/>
            </div>

            <div style={{marginBottom:20}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>NOTES</label>
              <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                placeholder="Optional notes..." rows={2}
                style={{...iStyle(),resize:"vertical"}}/>
            </div>

            <div style={{display:"flex",gap:10}}>
              {editEvt&&(
                <button onClick={()=>{deleteEvent(editEvt);setShowForm(false);setEditEvt(null);}}
                  style={{padding:"10px 14px",background:C.surface,border:`1px solid ${C.border}`,
                    borderRadius:9,color:C.danger,cursor:"pointer",fontSize:13,fontWeight:700}}>
                  Delete
                </button>
              )}
              <button onClick={()=>setShowForm(false)}
                style={{flex:1,padding:"11px",background:C.surface,border:`1px solid ${C.border}`,
                  borderRadius:9,color:C.muted,cursor:"pointer",fontSize:14}}>Cancel</button>
              <button onClick={saveEvent}
                style={{flex:2,padding:"11px",background:C.accent,border:"none",borderRadius:9,
                  color:"#000",fontWeight:900,fontSize:15,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
                {editEvt?"Save Changes":"Add Event"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main grid + sidebar */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:16,alignItems:"start"}}>

        {/* ── CALENDAR GRID ── */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden"}}>

          {/* Month navigation */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"16px 20px",borderBottom:`1px solid ${C.border}`}}>
            <button onClick={prevMonth}
              style={{width:34,height:34,borderRadius:9,background:C.surface,
                border:`1px solid ${C.border}`,color:C.text,cursor:"pointer",
                fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
            <div style={{textAlign:"center"}}>
              <div style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontWeight:800,fontSize:22,lineHeight:1}}>
                {MONTHS[curMonth]}
              </div>
              <div style={{color:C.muted,fontSize:12,marginTop:2}}>{curYear}</div>
            </div>
            <button onClick={nextMonth}
              style={{width:34,height:34,borderRadius:9,background:C.surface,
                border:`1px solid ${C.border}`,color:C.text,cursor:"pointer",
                fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
          </div>

          {/* Day headers */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",
            borderBottom:`1px solid ${C.border}`}}>
            {DAYS.map((d,i)=>(
              <div key={d} style={{padding:"10px 0",textAlign:"center",
                fontSize:11,fontWeight:700,letterSpacing:.5,
                color:i===0||i===6?C.accent+"99":C.muted}}>
                {d}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
            {Array(firstDay).fill(null).map((_,i)=>(
              <div key={`empty-${i}`}
                style={{minHeight:100,borderRight:`1px solid ${C.border}`,
                  borderBottom:`1px solid ${C.border}`,
                  background:C.surface+"44"}}/>
            ))}
            {Array.from({length:daysInMonth},(_,i)=>i+1).map(d=>{
              const dateStr=`${curYear}-${String(curMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
              const dayEvts=eventsOnDay(d);
              const isToday=d===today.getDate()&&curMonth===today.getMonth()&&curYear===today.getFullYear();
              const col=(firstDay+d-1)%7;
              const isWeekend=col===0||col===6;
              const isLastCol=col===6;
              const isPast=dateStr<todayStr;
              return(
                <div key={d}
                  onClick={()=>openAdd(dateStr)}
                  style={{minHeight:100,padding:"8px 6px 6px",
                    borderRight:isLastCol?"none":`1px solid ${C.border}`,
                    borderBottom:`1px solid ${C.border}`,
                    cursor:"pointer",transition:"background .1s",
                    background:isWeekend?C.surface+"66":"transparent",
                    opacity:isPast?.75:1}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.accent+"0d"}
                  onMouseLeave={e=>e.currentTarget.style.background=isWeekend?C.surface+"66":"transparent"}>

                  {/* Day number */}
                  <div style={{
                    width:28,height:28,borderRadius:8,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    marginBottom:5,fontSize:12,fontWeight:isToday?900:500,
                    background:isToday?C.accent:"transparent",
                    color:isToday?"#000":isWeekend?C.accent+"bb":C.text}}>
                    {d}
                  </div>

                  {/* Event chips */}
                  {dayEvts.slice(0,2).map(evt=>{
                    const col=typeColor(evt.type);
                    const label=evt.opponent||(evt.title&&evt.title.replace(/^vs /i,""))||evt.title;
                    return(
                      <div key={evt.id}
                        onClick={e=>{e.stopPropagation();openEdit(evt);}}
                        style={{display:"flex",alignItems:"center",gap:3,
                          fontSize:10,fontWeight:700,padding:"3px 6px",
                          borderRadius:5,marginBottom:3,
                          background:col+"1a",
                          borderLeft:`2.5px solid ${col}`,
                          overflow:"hidden",cursor:evt.auto?"default":"pointer"}}>
                        {evt.time&&(
                          <span style={{color:col+"bb",fontSize:9,flexShrink:0,fontFamily:"'Oswald',sans-serif"}}>
                            {evt.time.slice(0,5)}
                          </span>
                        )}
                        <span style={{color:col,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {label}
                        </span>
                      </div>
                    );
                  })}
                  {dayEvts.length>2&&(
                    <div style={{fontSize:9,color:C.muted,fontWeight:700,paddingLeft:6}}>
                      +{dayEvts.length-2} more
                    </div>
                  )}
                </div>
              );
            })}
            {/* Fill remaining cells to complete the last row */}
            {(()=>{
              const totalCells = firstDay + daysInMonth;
              const remainder = totalCells % 7;
              if(remainder===0) return null;
              return Array(7-remainder).fill(null).map((_,i)=>(
                <div key={`trail-${i}`}
                  style={{minHeight:100,borderBottom:`1px solid ${C.border}`,
                    background:C.surface+"44"}}/>
              ));
            })()}
          </div>
        </div>

        {/* ── SIDEBAR ── */}
        <div style={{display:"flex",flexDirection:"column",gap:12,position:"sticky",top:20}}>

          {/* Month summary stats */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16}}>
            <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.5,marginBottom:12}}>
              {MONTHS[curMonth].toUpperCase()} {curYear}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[
                {label:"Games",    val:monthGames.length,    color:"#ff6b00"},
                {label:"Practices",val:monthPractice.length, color:"#66bb6a"},
                {label:"Events",   val:monthEvents.length,   color:"#42a5f5"},
                {label:"This week",val:(()=>{
                  const ws=new Date(today);ws.setDate(today.getDate()-today.getDay());
                  const we=new Date(ws);we.setDate(ws.getDate()+6);
                  return allEvents.filter(e=>e.date>=ws.toISOString().split("T")[0]&&e.date<=we.toISOString().split("T")[0]).length;
                })(), color:"#7c6af5"},
              ].map(s=>(
                <div key={s.label} style={{background:C.surface,borderRadius:9,
                  padding:"10px 12px",textAlign:"center"}}>
                  <div style={{color:s.color,fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:22,lineHeight:1}}>
                    {s.val}
                  </div>
                  <div style={{color:C.muted,fontSize:10,fontWeight:600,marginTop:3}}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Event type legend — compact inline */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,
            padding:"12px 16px",display:"flex",gap:12,flexWrap:"wrap"}}>
            {EVENT_TYPES.map(t=>(
              <div key={t.k} style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:8,height:8,borderRadius:2,background:t.color,flexShrink:0}}/>
                <span style={{color:C.muted,fontSize:11,fontWeight:600}}>{t.label}</span>
              </div>
            ))}
          </div>

          {/* This month's events list */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16}}>
            <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1.5,marginBottom:12}}>
              {monthEvents.length===0?"NO EVENTS THIS MONTH":"THIS MONTH"}
            </div>
            {monthEvents.length===0?(
              <div style={{color:C.muted,fontSize:13,fontStyle:"italic",textAlign:"center",padding:"16px 0"}}>
                Click any day to add an event
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:400,overflowY:"auto"}}>
                {monthEvents.map(evt=>{
                  const col=typeColor(evt.type);
                  const d=new Date(evt.date+"T12:00:00");
                  const dayLabel=d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
                  const isPast=evt.date<todayStr;
                  const isUpcoming=evt.date>=todayStr;
                  const r=evt.result;
                  return(
                    <div key={evt.id}
                      onClick={()=>!evt.auto&&openEdit(evt)}
                      style={{borderRadius:10,overflow:"hidden",
                        border:`1px solid ${C.border}`,
                        opacity:isPast?.7:1,
                        cursor:evt.auto?"default":"pointer",
                        transition:"border-color .12s"}}
                      onMouseEnter={e=>{if(!evt.auto)e.currentTarget.style.borderColor=col;}}
                      onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                      {/* Colored top strip */}
                      <div style={{height:3,background:col}}/>
                      <div style={{padding:"8px 10px",background:C.surface}}>
                        <div style={{display:"flex",justifyContent:"space-between",
                          alignItems:"flex-start",gap:6}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{color:C.text,fontWeight:700,fontSize:13,
                              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {evt.title||evt.opponent||"Event"}
                            </div>
                            <div style={{color:C.muted,fontSize:11,marginTop:2}}>
                              {dayLabel}{evt.time&&` · ${evt.time.slice(0,5)}`}
                            </div>
                            {evt.location&&(
                              <div style={{color:C.muted,fontSize:10,marginTop:1}}>📍 {evt.location}</div>
                            )}
                          </div>
                          <div style={{flexShrink:0,textAlign:"right"}}>
                            {r&&(
                              <div style={{color:r.our>r.their?C.accent:r.our<r.their?C.danger:"#f57c00",
                                fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:14}}>
                                {r.our}–{r.their}
                              </div>
                            )}
                            {isUpcoming&&!r&&(
                              <div style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:10,
                                background:col+"22",color:col,marginTop:2}}>
                                {evt.type.toUpperCase()}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Log Result button */}
                        {evt.type==="game"&&evt.opponent&&(()=>{
                          const already=(games||[]).some(g=>g.opponent===evt.opponent&&g.date===evt.date);
                          const isp=evt.date<todayStr;
                          if(already) return(
                            <div style={{color:"#27a560",fontSize:10,fontWeight:700,marginTop:5}}>✓ Logged</div>
                          );
                          return(
                            <button onClick={e=>{
                                e.stopPropagation();
                                const newGame={id:"g"+Date.now(),opponent:evt.opponent,
                                  date:evt.date,time:evt.time||"",location:evt.location||"Home",
                                  ourScore:isp?0:"",theirScore:isp?0:"",
                                  status:isp?"completed":"upcoming",stats:[],coachNotes:"",formation:"4-3-3"};
                                setGames(prev=>[newGame,...prev]);
                                setView("games");
                              }}
                              style={{marginTop:6,padding:"4px 10px",width:"100%",
                                background:isp?C.accent+"22":"#27a56022",
                                border:"1px solid "+(isp?C.accent+"44":"#27a56044"),
                                borderRadius:6,color:isp?C.accent:"#27a560",
                                fontSize:11,fontWeight:700,cursor:"pointer"}}>
                              {isp?"Log Result →":"Add to Games →"}
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
