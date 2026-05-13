function PlayerPortalPage(){
  var playerId = window.location.hash.replace("#/player/","").split("?")[0];
  var [player,    setPlayer]    = useState(null);
  var [teamName,  setTeamName]  = useState("");
  var [games,     setGamesP]    = useState([]);
  var [schedule,  setSchedule]  = useState([]);
  var [practices, setPractices] = useState([]);
  var [error,     setError]     = useState(null);
  var [loading,   setLoading]   = useState(true);
  var [tab,       setTab]       = useState("home");
  var [expandedGame, setExpandedGame] = useState(null);
  var [bio,       setBio]       = useState("");
  var [editBio,   setEditBio]   = useState(false);
  var [savingBio, setSavingBio] = useState(false);
  var [copied,    setCopied]    = useState(false);
  var [recruitCopied, setRecruitCopied] = useState(false);
  var [photoUrl,  setPhotoUrl]  = useState("");
  var [editPhoto, setEditPhoto] = useState(false);
  var [photoInput,setPhotoInput]= useState("");
  var [videos,    setVideos]    = useState([]);
  var [addingVid, setAddingVid] = useState(false);
  var [newVideo,  setNewVideo]  = useState({label:"",url:""});
  var [savingVid, setSavingVid] = useState(false);

  var A = "#ff6b00";

  useEffect(function(){
    async function load(){
      setLoading(true);
      try{
        var {data:rosters} = await supabase.from("rosters").select("*");
        var found=null, tid=null;
        for(var i=0;i<(rosters||[]).length;i++){
          var p=(rosters[i].players||[]).find(function(p){return p.id===playerId;});
          if(p){found=p;tid=rosters[i].team_id;break;}
        }
        if(!found){setError("Player not found.");setLoading(false);return;}
        setPlayer(Object.assign({},found,{teamId:tid}));
        setBio(found.playerBio||"");
        setPhotoUrl(found.photoUrl||"");
        setVideos(found.videoLinks||[]);
        var {data:teams} = await supabase.from("teams").select("name").eq("id",tid);
        setTeamName(teams?.[0]?.name||"");
        var {data:gData} = await supabase.from("games").select("*").eq("team_id",tid);
        setGamesP((gData||[]).map(function(x){return x.data;}).filter(function(g){return g.status==="completed";}));
        var {data:sData} = await supabase.from("schedule").select("*").eq("team_id",tid);
        setSchedule((sData||[]).map(function(x){return x.data;}));
        var {data:pData} = await supabase.from("practices").select("*").eq("team_id",tid);
        setPractices((pData||[]).map(function(x){return x.data;}));
      }catch(e){setError("Failed to load.");}
      setLoading(false);
    }
    load();
  },[]);

  async function saveField(field, value){
    if(!player) return;
    var {data:rosters} = await supabase.from("rosters").select("*").eq("team_id",player.teamId);
    if(rosters&&rosters[0]){
      var updated=(rosters[0].players||[]).map(function(p){
        return p.id===playerId?Object.assign({},p,{[field]:value}):p;
      });
      await supabase.from("rosters").update({players:updated}).eq("id",rosters[0].id);
    }
  }
  async function saveBio(){
    setSavingBio(true);
    await saveField("playerBio",bio);
    setEditBio(false);setSavingBio(false);
    setPlayer(function(p){return Object.assign({},p,{playerBio:bio});});
  }
  async function savePhoto(){
    if(!photoInput.trim()) return;
    await saveField("photoUrl",photoInput.trim());
    setPhotoUrl(photoInput.trim());
    setPlayer(function(p){return Object.assign({},p,{photoUrl:photoInput.trim()});});
    setEditPhoto(false);setPhotoInput("");
  }
  async function saveVideos(list){
    setSavingVid(true);
    await saveField("videoLinks",list);
    setVideos(list);setSavingVid(false);
    setAddingVid(false);setNewVideo({label:"",url:""});
  }
  function copyLink(type){
    var base = window.location.origin+window.location.pathname;
    var url = base+(type==="recruit"?"#/recruit/":"#/player/")+playerId;
    navigator.clipboard.writeText(url).then(function(){
      if(type==="recruit"){setRecruitCopied(true);setTimeout(function(){setRecruitCopied(false);},2500);}
      else{setCopied(true);setTimeout(function(){setCopied(false);},2500);}
    }).catch(function(){alert(url);});
  }

  if(loading) return(
    <div style={{minHeight:"100vh",background:"#f5f5f5",display:"flex",alignItems:"center",
      justifyContent:"center",flexDirection:"column",gap:14,fontFamily:"'Outfit',sans-serif"}}>
      <div style={{width:32,height:32,borderRadius:"50%",border:"3px solid "+A,
        borderTopColor:"transparent",animation:"spin .7s linear infinite"}}/>
      <div style={{color:A,fontSize:13,fontWeight:600}}>Loading...</div>
    </div>
  );

  if(error) return(
    <div style={{minHeight:"100vh",background:"#f5f5f5",display:"flex",alignItems:"center",
      justifyContent:"center",padding:24,fontFamily:"'Outfit',sans-serif"}}>
      <div style={{color:"#c00",fontSize:14,textAlign:"center"}}>{error}</div>
    </div>
  );

  // ── Calculations ──────────────────────────────────────────────────────────
  var pos    = primaryPos(player);
  var posCol = posColor(pos);
  var isGK   = allPos(player).includes("GK");
  var isCB   = ["CB","FB"].some(function(p){return allPos(player).includes(p);});
  var isMid  = ["CM","DM","W"].some(function(p){return allPos(player).includes(p);});

  var playerGames = (games||[]).filter(function(g){
    return (g.stats||[]).some(function(s){return s.playerId===playerId;});
  });
  var gp = playerGames.length||1;
  var allStats = playerGames.flatMap(function(g){
    return (g.stats||[]).filter(function(s){return s.playerId===playerId;});
  });
  var tots = allStats.reduce(function(acc,s){
    return {
      goals:acc.goals+(s.goals||0), assists:acc.assists+(s.assists||0),
      shots:acc.shots+(s.shots||0), shotsOnTarget:acc.shotsOnTarget+(s.shotsOnTarget||0),
      tackles:acc.tackles+(s.tackles||0), interceptions:acc.interceptions+(s.interceptions||0),
      keyPasses:acc.keyPasses+(s.keyPasses||0),
      passesCompleted:acc.passesCompleted+(s.passesCompleted||0),
      passesAttempted:acc.passesAttempted+((s.passesCompleted||0)+(s.passesIncomplete||s.passesAttempted||0)),
      saves:acc.saves+(s.saves||0), goalsConceded:acc.goalsConceded+(s.goalsConceded||0),
      aerialDuelsWon:acc.aerialDuelsWon+(s.aerialDuelsWon||0),
      fouls:acc.fouls+(s.fouls||0), dangerousTurnovers:acc.dangerousTurnovers+(s.dangerousTurnovers||0),
      minutes:acc.minutes+(s.minutesPlayed||0),
    };
  },{goals:0,assists:0,shots:0,shotsOnTarget:0,tackles:0,interceptions:0,
   keyPasses:0,passesCompleted:0,passesAttempted:0,saves:0,goalsConceded:0,
   aerialDuelsWon:0,fouls:0,dangerousTurnovers:0,minutes:0});

  var passAcc  = tots.passesAttempted>0 ? Math.round(tots.passesCompleted/tots.passesAttempted*100) : 0;
  var shotConv = tots.shots>0 ? Math.round(tots.goals/tots.shots*100) : 0;

  var ratingList = playerGames.map(function(g){
    var s=(g.stats||[]).find(function(x){return x.playerId===playerId;});
    if(!s) return null;
    return {r:calcRating(s,pos,g.theirScore===0).rating,opp:g.opponent,date:g.date};
  }).filter(Boolean);
  var avgRating = ratingList.length
    ? (ratingList.reduce(function(a,b){return a+b.r;},0)/ratingList.length) : 0;

  var last5 = ratingList.slice(-5);
  var maxR  = Math.max.apply(null, last5.map(function(x){return x.r;}).concat([10]));

  var attended = (practices||[]).filter(function(p){
    var att=p.attendance||{};
    if(Array.isArray(att)) return att.find(function(a){return a.playerId===playerId&&a.present;});
    return att[playerId]==="present"||att[playerId]===true;
  }).length;
  var attendPct = practices.length>0 ? Math.round(attended/practices.length*100) : null;

  var sortedGames = [].concat(playerGames).sort(function(a,b){
    return (b.date||"").localeCompare(a.date||"");
  });
  var lastGame = sortedGames[0];
  var lastRating = lastGame ? (function(){
    var s=(lastGame.stats||[]).find(function(x){return x.playerId===playerId;});
    if(!s) return null;
    return calcRating(s,pos,lastGame.theirScore===0);
  })() : null;
  var lastCoachNote = lastRating ? (function(){
    var s=(lastGame.stats||[]).find(function(x){return x.playerId===playerId;});
    if(!s) return null;
    return calcRating(s,pos,lastGame.theirScore===0).coachNote;
  })() : null;

  var today = new Date().toISOString().split("T")[0];
  var upcomingEvents = [].concat(schedule||[])
    .filter(function(e){return e.date>=today;})
    .sort(function(a,b){return (a.date||"").localeCompare(b.date||"");});
  var nextGame = upcomingEvents.find(function(e){return e.type==="game"||e.opponent;});
  var daysUntil = nextGame ? Math.ceil((new Date(nextGame.date)-new Date(today))/(1000*60*60*24)) : null;

  var recLabel = {open:"Open",d1:"D1 Target",d2:"D2 Target",d3:"D3 Target",
    committed:"Committed",not_recruiting:"Not Recruiting"}[player.recruitingStatus]||"";
  var recColor = {open:A,d1:"#7c3aed",d2:"#1565c0",d3:"#2d7a3a",
    committed:"#2e7d32",not_recruiting:"#888"}[player.recruitingStatus]||A;

  // Coach evaluation scores
  var scores = player.scores||{};
  var scoreCats = [
    {k:"technical", label:"Technical",  color:"#ff6b00"},
    {k:"athletic",  label:"Athletic",   color:"#ef5350"},
    {k:"tactical",  label:"Tactical",   color:"#42a5f5"},
    {k:"attitude",  label:"Attitude",   color:"#66bb6a"},
    {k:"positional",label:"Positional", color:"#7c6af5"},
  ];
  var scoreVals = scoreCats.map(function(c){return scores[c.k]||0;}).filter(function(v){return v>0;});
  var overallScore = scoreVals.length ? (scoreVals.reduce(function(a,b){return a+b;},0)/scoreVals.length) : 0;
  var hasScores = scoreVals.length > 0;

  var TABS = [{t:"home",l:"Home"},{t:"games",l:"Games"},
              {t:"schedule",l:"Schedule"},{t:"recruit",l:"Recruit"}];

  // ESPN stat row helper
  function StatRow(label, value, max, color, isBold){
    var pct = max>0 ? Math.min(100,Math.round(value/max*100)) : 0;
    return(
      <div key={label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"8px 16px",borderBottom:"0.5px solid #f0f0f0"}}>
        <span style={{color:"#888",fontSize:12,minWidth:110}}>{label}</span>
        <div style={{display:"flex",alignItems:"center",gap:10,flex:1,justifyContent:"flex-end"}}>
          <div style={{width:80,height:4,background:"#f0f0f0",borderRadius:2,overflow:"hidden"}}>
            <div style={{height:"100%",width:pct+"%",background:color||"#ddd",borderRadius:2,transition:"width .4s"}}/>
          </div>
          <span style={{fontWeight:isBold?700:600,fontSize:13,color:isBold?color:"#111",minWidth:34,textAlign:"right"}}>{value}</span>
        </div>
      </div>
    );
  }

  return(
    <div style={{minHeight:"100vh",background:"#f5f5f5",fontFamily:"'Outfit',sans-serif"}}>

      {/* ── HEADER ── */}
      <div style={{background:"#fff",borderBottom:"1px solid #eee"}}>

        {/* Position color accent strip */}
        <div style={{height:4,background:posCol,opacity:.85}}/>

        {/* Top bar */}
        <div style={{padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:A}}/>
            <span style={{color:A,fontSize:11,fontWeight:700,letterSpacing:2}}>COACHIQ</span>
            {teamName&&<span style={{color:"#ccc",fontSize:11,marginLeft:2}}>· {teamName}</span>}
          </div>
          <button onClick={function(){copyLink("player");}}
            style={{padding:"5px 14px",background:copied?"#27a56018":A+"18",
              border:"1px solid "+(copied?"#27a56044":A+"44"),borderRadius:20,
              color:copied?"#27a560":A,fontWeight:700,fontSize:11,cursor:"pointer",
              display:"flex",alignItems:"center",gap:5}}>
            {copied?"✓ Copied":"⎘ Share"}
          </button>
        </div>

        {/* Player hero */}
        <div style={{padding:"4px 16px 18px",display:"flex",gap:14,alignItems:"flex-start"}}>

          {/* Avatar / jersey number */}
          <div style={{position:"relative",flexShrink:0}}>
            {photoUrl?(
              <img src={photoUrl} alt={player.name} onError={function(){setPhotoUrl("");}}
                style={{width:80,height:80,borderRadius:16,objectFit:"cover",
                  border:"3px solid "+posCol+"44"}}/>
            ):(
              <div style={{width:80,height:80,borderRadius:16,
                background:posCol+"15",border:"3px solid "+posCol+"33",
                display:"flex",flexDirection:"column",alignItems:"center",
                justifyContent:"center",gap:1}}>
                <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:900,
                  color:posCol,fontSize:28,lineHeight:1}}>#{player.number}</div>
                <div style={{background:posCol+"25",borderRadius:5,padding:"2px 7px",
                  fontFamily:"'Oswald',sans-serif",fontWeight:700,color:posCol,fontSize:10}}>
                  {allPos(player)[0]}
                </div>
              </div>
            )}
            <button onClick={function(){setEditPhoto(true);setPhotoInput(photoUrl);}}
              style={{position:"absolute",bottom:-4,right:-4,width:22,height:22,
                borderRadius:"50%",background:"#fff",border:"1.5px solid #e0e0e0",
                fontSize:11,cursor:"pointer",boxShadow:"0 1px 4px rgba(0,0,0,.12)",
                display:"flex",alignItems:"center",justifyContent:"center"}}>📷</button>
          </div>

          {/* Name + details */}
          <div style={{flex:1,minWidth:0}}>
            <h1 style={{color:"#111",fontFamily:"'Oswald',sans-serif",fontSize:26,
              fontWeight:900,margin:"0 0 3px",lineHeight:1.1}}>{player.name}</h1>
            <div style={{color:"#999",fontSize:12,marginBottom:8}}>
              {allPos(player).join(" · ")}
              {player.gradYear&&<span style={{color:"#bbb"}}> · Class of {player.gradYear}</span>}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              {recLabel&&(
                <span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,
                  background:recColor+"18",border:"1px solid "+recColor+"33",color:recColor}}>
                  {recLabel}
                </span>
              )}
              {attendPct!==null&&(
                <span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,
                  background:attendPct>=80?"#27a56018":"#f59e0b18",
                  border:"1px solid "+(attendPct>=80?"#27a56033":"#f59e0b33"),
                  color:attendPct>=80?"#27a560":"#f59e0b"}}>
                  {attendPct}% attendance
                </span>
              )}
              {hasScores&&(
                <span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,
                  background:A+"15",border:"1px solid "+A+"33",color:A}}>
                  ★ {overallScore.toFixed(1)} eval
                </span>
              )}
            </div>
          </div>

          {/* Rating */}
          <div style={{textAlign:"center",flexShrink:0}}>
            <div style={{
              width:52,height:52,borderRadius:14,
              background:avgRating>0?rColor(avgRating)+"18":"#f5f5f5",
              border:"2px solid "+(avgRating>0?rColor(avgRating)+"44":"#eee"),
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
              <div style={{color:avgRating>0?rColor(avgRating):"#ccc",
                fontFamily:"'Oswald',sans-serif",fontWeight:900,
                fontSize:avgRating>0?22:16,lineHeight:1}}>
                {avgRating>0?avgRating.toFixed(1):"—"}
              </div>
            </div>
            <div style={{color:"#bbb",fontSize:8,fontWeight:700,marginTop:4,letterSpacing:.5}}>
              AVG RTG
            </div>
          </div>
        </div>

        {/* Photo edit */}
        {editPhoto&&(
          <div style={{padding:"12px 16px",borderTop:"1px solid #f5f5f5",background:"#fafafa"}}>
            <input value={photoInput} onChange={function(e){setPhotoInput(e.target.value);}}
              placeholder="Paste photo URL..."
              style={{width:"100%",padding:"9px 12px",background:"#fff",border:"1px solid #eee",
                borderRadius:8,color:"#111",fontSize:13,outline:"none",
                fontFamily:"'Outfit',sans-serif",boxSizing:"border-box",marginBottom:8}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={savePhoto}
                style={{flex:1,padding:"8px",background:A,border:"none",borderRadius:8,
                  color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>Save</button>
              <button onClick={function(){setEditPhoto(false);}}
                style={{padding:"8px 14px",background:"#eee",border:"none",borderRadius:8,
                  color:"#666",fontSize:12,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{display:"flex",borderTop:"1px solid #f0f0f0"}}>
          {TABS.map(function(item){return(
            <button key={item.t} onClick={function(){setTab(item.t);}}
              style={{flex:1,padding:"12px 0",background:"none",border:"none",
                borderBottom:"2px solid "+(tab===item.t?A:"transparent"),
                color:tab===item.t?A:"#999",cursor:"pointer",
                fontWeight:700,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>
              {item.l}
            </button>
          );})}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{maxWidth:600,margin:"0 auto",padding:"16px 14px 60px"}}>

        {/* ══ HOME TAB ══ */}
        {tab==="home"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>

            {/* Quick stats */}
            <div style={{background:"#fff",borderRadius:14,border:"1px solid #eee",
              padding:"14px 16px"}}>
              <div style={{color:"#bbb",fontSize:9,fontWeight:700,letterSpacing:1.5,
                marginBottom:12}}>THIS SEASON</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                {(isGK
                  ? [{l:"Saves",v:tots.saves},{l:"Conceded",v:tots.goalsConceded},{l:"Games",v:playerGames.length||0},{l:"Avg Rtg",v:avgRating>0?avgRating.toFixed(1):"—"}]
                  : isCB
                  ? [{l:"Goals",v:tots.goals},{l:"Tackles",v:tots.tackles},{l:"Games",v:playerGames.length||0},{l:"Avg Rtg",v:avgRating>0?avgRating.toFixed(1):"—"}]
                  : [{l:"Goals",v:tots.goals},{l:"Assists",v:tots.assists},{l:"Games",v:playerGames.length||0},{l:"Avg Rtg",v:avgRating>0?avgRating.toFixed(1):"—"}]
                ).map(function(item){return(
                  <div key={item.l} style={{textAlign:"center",background:"#f8f8f8",
                    borderRadius:10,padding:"12px 4px"}}>
                    <div style={{color:A,fontFamily:"'Oswald',sans-serif",
                      fontWeight:900,fontSize:22,lineHeight:1}}>{item.v}</div>
                    <div style={{color:"#bbb",fontSize:8,fontWeight:700,
                      letterSpacing:.5,marginTop:4}}>{item.l.toUpperCase()}</div>
                  </div>
                );})}
              </div>
            </div>

            {/* ── COACH EVALUATION ── */}
            {hasScores&&(
              <div style={{background:"#fff",borderRadius:14,border:"1px solid #eee",
                padding:"14px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",marginBottom:14}}>
                  <div style={{color:"#bbb",fontSize:9,fontWeight:700,letterSpacing:1.5}}>
                    COACH EVALUATION
                  </div>
                  <div style={{background:A+"18",border:"1px solid "+A+"33",borderRadius:20,
                    padding:"3px 10px",display:"flex",alignItems:"center",gap:5}}>
                    <span style={{color:A,fontSize:11,fontWeight:700}}>★</span>
                    <span style={{color:A,fontFamily:"'Oswald',sans-serif",
                      fontWeight:900,fontSize:14}}>{overallScore.toFixed(1)}</span>
                    <span style={{color:A+"99",fontSize:9,fontWeight:600}}>overall</span>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {scoreCats.map(function(cat){
                    var val = scores[cat.k]||0;
                    if(!val) return null;
                    return(
                      <div key={cat.k}>
                        <div style={{display:"flex",justifyContent:"space-between",
                          alignItems:"center",marginBottom:5}}>
                          <span style={{color:"#666",fontSize:12,fontWeight:500}}>
                            {cat.label}
                          </span>
                          <span style={{color:cat.color,fontFamily:"'Oswald',sans-serif",
                            fontWeight:700,fontSize:13}}>{val}<span style={{color:"#ddd",
                              fontWeight:400}}>/10</span></span>
                        </div>
                        <div style={{height:6,background:"#f0f0f0",borderRadius:3,
                          overflow:"hidden"}}>
                          <div style={{height:"100%",
                            width:Math.round(val/10*100)+"%",
                            background:cat.color,borderRadius:3,
                            transition:"width .5s ease"}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Form chart */}
            {last5.length>=2&&(
              <div style={{background:"#fff",borderRadius:14,border:"1px solid #eee",
                padding:"14px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",marginBottom:10}}>
                  <div style={{color:"#bbb",fontSize:9,fontWeight:700,letterSpacing:1.5}}>
                    RECENT FORM (LAST {last5.length})
                  </div>
                  <div style={{color:rColor(last5[last5.length-1].r),fontSize:12,fontWeight:700}}>
                    {last5[last5.length-1].r.toFixed(1)} last game
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"flex-end",gap:5,height:52}}>
                  {last5.map(function(t,i){
                    var h=Math.max(15,Math.round((t.r/maxR)*100));
                    var isLatest=i===last5.length-1;
                    return(
                      <div key={i} style={{flex:1,display:"flex",flexDirection:"column",
                        alignItems:"center",gap:3}}>
                        <div style={{fontSize:8,color:isLatest?rColor(t.r):"#bbb",fontWeight:700}}>
                          {t.r.toFixed(1)}
                        </div>
                        <div style={{width:"100%",
                          background:isLatest?rColor(t.r):rColor(t.r)+"55",
                          borderRadius:"3px 3px 0 0",height:h+"%"}}/>
                        <div style={{color:"#ccc",fontSize:8,overflow:"hidden",
                          textOverflow:"ellipsis",whiteSpace:"nowrap",
                          maxWidth:"100%",textAlign:"center"}}>
                          {(t.opp||"").split(" ")[0]}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Next game */}
            {nextGame&&(
              <div style={{background:"#fff",borderRadius:14,border:"1px solid #eee",
                padding:"14px 16px"}}>
                <div style={{color:"#bbb",fontSize:9,fontWeight:700,letterSpacing:1.5,
                  marginBottom:10}}>NEXT GAME</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:"#111",fontWeight:700,fontSize:15}}>
                      vs {nextGame.opponent||nextGame.title}
                    </div>
                    <div style={{color:"#aaa",fontSize:12,marginTop:3}}>
                      {nextGame.date}{nextGame.time?" · "+nextGame.time:""}
                      {nextGame.location?" · "+nextGame.location:""}
                    </div>
                  </div>
                  {daysUntil!==null&&(
                    <div style={{textAlign:"center",background:A+"15",
                      padding:"10px 16px",borderRadius:12}}>
                      <div style={{color:A,fontFamily:"'Oswald',sans-serif",
                        fontWeight:900,fontSize:daysUntil===0?14:24,lineHeight:1}}>
                        {daysUntil===0?"TODAY":daysUntil}
                      </div>
                      {daysUntil>0&&<div style={{color:A+"88",fontSize:8,fontWeight:700,
                        marginTop:2}}>DAYS</div>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Last game + coach note */}
            {lastGame&&lastRating&&(
              <div style={{background:"#fff",borderRadius:14,border:"1px solid #eee",
                overflow:"hidden"}}>
                <div style={{padding:"14px 16px",borderBottom:"1px solid #f5f5f5"}}>
                  <div style={{color:"#bbb",fontSize:9,fontWeight:700,letterSpacing:1.5,
                    marginBottom:10}}>LAST GAME</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{color:"#111",fontWeight:700,fontSize:14}}>
                        vs {lastGame.opponent}
                      </div>
                      <div style={{color:"#aaa",fontSize:12,marginTop:2}}>{lastGame.date}</div>
                      <div style={{color:lastGame.ourScore>lastGame.theirScore?A:"#e53935",
                        fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:20,marginTop:4}}>
                        {lastGame.ourScore}–{lastGame.theirScore}
                      </div>
                    </div>
                    <div style={{position:"relative",width:60,height:60,flexShrink:0}}>
                      <svg viewBox="0 0 60 60" style={{width:60,height:60,transform:"rotate(-90deg)"}}>
                        <circle cx="30" cy="30" r="24" fill="none" stroke="#f0f0f0" strokeWidth="5"/>
                        <circle cx="30" cy="30" r="24" fill="none"
                          stroke={rColor(lastRating.rating)} strokeWidth="5"
                          strokeDasharray={Math.round(2*Math.PI*24*lastRating.rating/10)+" 999"}
                          strokeLinecap="round"/>
                      </svg>
                      <div style={{position:"absolute",inset:0,display:"flex",
                        alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
                        <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:900,
                          fontSize:16,color:rColor(lastRating.rating),lineHeight:1}}>
                          {lastRating.rating.toFixed(1)}
                        </div>
                        <div style={{fontSize:8,color:"#bbb",fontWeight:700,marginTop:1}}>
                          {lastRating.label.toUpperCase().slice(0,4)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {lastCoachNote&&(
                  <div style={{padding:"12px 16px",background:"#fff8f3",
                    borderBottom:"1px solid #f5f5f5"}}>
                    <div style={{color:A,fontSize:9,fontWeight:700,letterSpacing:1.5,
                      marginBottom:5}}>COACH NOTE</div>
                    <div style={{color:"#555",fontSize:13,lineHeight:1.6,fontStyle:"italic"}}>
                      "{lastCoachNote}"
                    </div>
                  </div>
                )}
                <div style={{padding:"10px 16px",display:"flex",gap:8}}>
                  <button onClick={function(){setTab("games");setExpandedGame(lastGame.id);}}
                    style={{flex:1,padding:"9px",background:"#f5f5f5",border:"none",
                      borderRadius:9,color:"#666",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                    Full Breakdown →
                  </button>
                </div>
              </div>
            )}

            {/* Tryout history — fixed to use light mode colors */}
            {player.tryoutHistory&&Object.keys(player.tryoutHistory.stats||{}).length>0&&(
              <div style={{background:"#fff",border:"1px solid #eee",borderRadius:14,
                padding:"14px 16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <div style={{width:32,height:32,borderRadius:8,background:A+"18",
                    display:"flex",alignItems:"center",justifyContent:"center",color:A,fontSize:16}}>
                    📋
                  </div>
                  <div>
                    <div style={{color:A,fontSize:9,fontWeight:700,letterSpacing:1.5}}>
                      TRYOUT RESULTS
                    </div>
                    <div style={{color:"#111",fontWeight:700,fontSize:14}}>
                      {player.tryoutHistory.tryoutName} · {player.tryoutHistory.year}
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {Object.entries(player.tryoutHistory.stats).map(function(entry){
                    var label=entry[0], stat=entry[1];
                    var history=stat.history||[];
                    var hasMult=history.length>1;
                    var impLabel=null;
                    if(hasMult){
                      var first=history[0].value, latest=history[history.length-1].value;
                      if(stat.timeFormat==="mmss"){
                        var toS=function(s){var p=String(s).split(":");return p.length===2?parseInt(p[0])*60+parseInt(p[1]):parseFloat(s)||9999;};
                        var diff=toS(first)-toS(latest);
                        if(diff){var abs=Math.abs(diff),m=Math.floor(abs/60),se=abs%60;impLabel={improved:diff>0,label:(diff>0?"↑":"↓")+" "+(m>0?m+":"+String(se).padStart(2,"0"):se+"s")};}
                      } else {
                        var fv=parseFloat(first),lv=parseFloat(latest);
                        if(!isNaN(fv)&&!isNaN(lv)&&fv!==lv){
                          var d2=stat.timeFormat==="seconds"?fv-lv:lv-fv;
                          impLabel={improved:d2>0,label:(d2>0?"↑":"↓")+" "+Math.abs(lv-fv).toFixed(2)};
                        }
                      }
                    }
                    return(
                      <div key={label} style={{background:"#f8f8f8",borderRadius:10,
                        padding:"10px 14px",border:"1px solid #eee"}}>
                        <div style={{display:"flex",alignItems:"center",
                          justifyContent:"space-between",marginBottom:hasMult?8:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{color:"#333",fontWeight:700,fontSize:13}}>{label}</span>
                            {stat.unit&&<span style={{color:"#aaa",fontSize:11}}>({stat.unit})</span>}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            {impLabel&&<span style={{color:impLabel.improved?"#27a560":"#e53935",
                              fontSize:12,fontWeight:700}}>{impLabel.label}</span>}
                            <span style={{color:A,fontFamily:"'Oswald',sans-serif",
                              fontWeight:900,fontSize:17}}>{stat.best||"—"}</span>
                            {hasMult&&<span style={{color:"#bbb",fontSize:9,fontWeight:700}}>★ best</span>}
                          </div>
                        </div>
                        {hasMult&&(
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            {history.map(function(e,i){
                              var isBest=e.value===stat.best;
                              return(
                                <div key={e.id||i} style={{display:"flex",alignItems:"center",
                                  gap:4,background:isBest?A+"12":"#fff",
                                  border:"1px solid "+(isBest?A+"44":"#eee"),
                                  borderRadius:6,padding:"3px 8px"}}>
                                  <span style={{color:"#bbb",fontSize:9}}>{e.date}</span>
                                  <span style={{color:isBest?A:"#555",
                                    fontFamily:"'Oswald',sans-serif",
                                    fontWeight:700,fontSize:12}}>{e.value}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Attendance */}
            {attendPct!==null&&(
              <div style={{background:"#fff",borderRadius:14,border:"1px solid #eee",
                padding:"14px 16px",display:"flex",justifyContent:"space-between",
                alignItems:"center"}}>
                <div>
                  <div style={{color:"#bbb",fontSize:9,fontWeight:700,letterSpacing:1.5,
                    marginBottom:4}}>PRACTICE ATTENDANCE</div>
                  <div style={{color:"#111",fontWeight:700,fontSize:15}}>
                    {attended} of {practices.length} sessions
                  </div>
                  <div style={{color:"#aaa",fontSize:12,marginTop:2}}>This season</div>
                </div>
                <div style={{position:"relative",width:56,height:56,flexShrink:0}}>
                  <svg viewBox="0 0 56 56" style={{width:56,height:56,transform:"rotate(-90deg)"}}>
                    <circle cx="28" cy="28" r="22" fill="none" stroke="#f0f0f0" strokeWidth="5"/>
                    <circle cx="28" cy="28" r="22" fill="none"
                      stroke={attendPct>=80?A:"#f59e0b"} strokeWidth="5"
                      strokeDasharray={Math.round(2*Math.PI*22*attendPct/100)+" 999"}
                      strokeLinecap="round"/>
                  </svg>
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",
                    justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:900,
                    fontSize:14,color:attendPct>=80?A:"#f59e0b"}}>
                    {attendPct}%
                  </div>
                </div>
              </div>
            )}

            {/* Empty state when no games yet */}
            {playerGames.length===0&&!nextGame&&(
              <div style={{background:"#fff",borderRadius:14,border:"1px solid #eee",
                padding:"28px 20px",textAlign:"center"}}>
                <div style={{fontSize:28,marginBottom:8}}>⚽</div>
                <div style={{color:"#999",fontWeight:700,fontSize:14,marginBottom:4}}>
                  Season hasn't started yet
                </div>
                <div style={{color:"#bbb",fontSize:12,lineHeight:1.6}}>
                  Game stats will appear here after your coach logs results
                </div>
              </div>
            )}

            {/* Recruiting CTA */}
            <button onClick={function(){copyLink("recruit");}}
              style={{width:"100%",padding:"16px",background:A,border:"none",
                borderRadius:14,cursor:"pointer",
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{textAlign:"left"}}>
                <div style={{color:"#000",fontWeight:800,fontSize:15,
                  fontFamily:"'Oswald',sans-serif",letterSpacing:.5}}>
                  Recruiting Profile
                </div>
                <div style={{color:"rgba(0,0,0,.5)",fontSize:11,marginTop:2}}>
                  {recruitCopied?"Link copied! Send to college coaches ✓":"Share with college coaches"}
                </div>
              </div>
              <div style={{background:"rgba(0,0,0,.15)",padding:"8px 16px",borderRadius:9,
                color:"#000",fontWeight:700,fontSize:12}}>
                {recruitCopied?"✓ Copied":"⎘ Copy Link"}
              </div>
            </button>
          </div>
        )}

        {/* ══ GAMES TAB ══ */}
        {tab==="games"&&(
          <div>
            {sortedGames.length===0?(
              <div style={{textAlign:"center",padding:"60px 0",color:"#bbb"}}>
                <div style={{fontSize:32,marginBottom:10}}>⚽</div>
                <div style={{fontWeight:700,color:"#999",marginBottom:4}}>No games yet</div>
                <div style={{fontSize:13}}>Stats will appear after games are logged</div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {sortedGames.map(function(g){
                  var s=(g.stats||[]).find(function(x){return x.playerId===playerId;});
                  if(!s) return null;
                  var rat  = calcRating(s,pos,g.theirScore===0);
                  var win  = g.ourScore>g.theirScore;
                  var loss = g.ourScore<g.theirScore;
                  var rc   = win?A:loss?"#e53935":"#f57c00";
                  var rl   = win?"W":loss?"L":"D";
                  var isExpanded = expandedGame===g.id;
                  var paTotal = (s.passesCompleted||0)+(s.passesIncomplete||s.passesAttempted||0);
                  var pacc = paTotal>0?Math.round((s.passesCompleted||0)/paTotal*100):0;
                  var avgG=tots.goals/gp, avgA=tots.assists/gp, avgSh=tots.shots/gp;
                  var avgTac=tots.tackles/gp;
                  return(
                    <div key={g.id} style={{background:"#fff",border:"1px solid #eee",
                      borderRadius:14,overflow:"hidden"}}>
                      <div onClick={function(){setExpandedGame(isExpanded?null:g.id);}}
                        style={{padding:"12px 14px",cursor:"pointer",
                          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{width:28,height:28,borderRadius:7,background:rc+"18",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontWeight:900,fontSize:11,color:rc,
                            fontFamily:"'Oswald',sans-serif",flexShrink:0}}>{rl}</div>
                          <div>
                            <div style={{color:"#111",fontWeight:700,fontSize:14}}>
                              vs {g.opponent}
                            </div>
                            <div style={{color:"#bbb",fontSize:10,marginTop:1}}>
                              {g.date}{g.location?" · "+g.location:""}
                            </div>
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                          <div style={{textAlign:"right"}}>
                            <div style={{color:rc,fontFamily:"'Oswald',sans-serif",
                              fontWeight:900,fontSize:17,lineHeight:1}}>
                              {g.ourScore}–{g.theirScore}
                            </div>
                            <div style={{color:rColor(rat.rating),fontSize:11,
                              fontWeight:700,marginTop:2}}>
                              {rat.rating.toFixed(1)} · {rat.label}
                            </div>
                          </div>
                          <div style={{color:"#ccc",fontSize:14,
                            transform:isExpanded?"rotate(90deg)":"none",
                            transition:"transform .2s"}}>›</div>
                        </div>
                      </div>
                      {isExpanded&&(
                        <div style={{borderTop:"1px solid #f0f0f0"}}>
                          <div style={{padding:"14px 16px",background:"#fafafa",
                            display:"flex",alignItems:"center",gap:14,
                            borderBottom:"1px solid #f0f0f0"}}>
                            <div style={{position:"relative",width:56,height:56,flexShrink:0}}>
                              <svg viewBox="0 0 56 56" style={{width:56,height:56,transform:"rotate(-90deg)"}}>
                                <circle cx="28" cy="28" r="22" fill="none" stroke="#eee" strokeWidth="4.5"/>
                                <circle cx="28" cy="28" r="22" fill="none"
                                  stroke={rColor(rat.rating)} strokeWidth="4.5"
                                  strokeDasharray={Math.round(2*Math.PI*22*rat.rating/10)+" 999"}
                                  strokeLinecap="round"/>
                              </svg>
                              <div style={{position:"absolute",inset:0,display:"flex",
                                alignItems:"center",justifyContent:"center",
                                fontFamily:"'Oswald',sans-serif",fontWeight:900,
                                fontSize:16,color:rColor(rat.rating)}}>
                                {rat.rating.toFixed(1)}
                              </div>
                            </div>
                            <div>
                              <div style={{fontWeight:700,fontSize:15,color:"#111"}}>
                                {rat.label} Performance
                              </div>
                              <div style={{color:"#aaa",fontSize:12,marginTop:2}}>
                                {rat.rating>=avgRating?"Above your season avg":"Below your season avg"}
                                {" · "+(s.minutesPlayed||90)+" mins"}
                              </div>
                            </div>
                          </div>
                          <div style={{padding:"8px 16px",background:"#f8f8f8",borderBottom:"0.5px solid #eee"}}>
                            <div style={{fontSize:9,fontWeight:700,color:"#aaa",letterSpacing:1.5}}>ATTACKING</div>
                          </div>
                          {StatRow("Goals",s.goals||0,Math.max(avgG*2,3),A,(s.goals||0)>0)}
                          {StatRow("Assists",s.assists||0,Math.max(avgA*2,2),A,(s.assists||0)>0)}
                          {StatRow("Shots",s.shots||0,Math.max(avgSh*2,5),"#f59e0b",false)}
                          {StatRow("Shots on Target",s.shotsOnTarget||0,Math.max(avgSh,4),"#f59e0b",false)}
                          {StatRow("Key Passes",s.keyPasses||0,Math.max((tots.keyPasses/gp)*2,3),"#8b5cf6",false)}
                          <div style={{padding:"8px 16px",background:"#f8f8f8",borderBottom:"0.5px solid #eee",borderTop:"0.5px solid #eee"}}>
                            <div style={{fontSize:9,fontWeight:700,color:"#aaa",letterSpacing:1.5}}>PASSING</div>
                          </div>
                          {StatRow("Pass Accuracy",pacc+"%",100,"#27a560",pacc>70)}
                          {StatRow("Passes Completed",s.passesCompleted||0,Math.max((tots.passesCompleted/gp)*2,20),"#27a560",false)}
                          <div style={{padding:"8px 16px",background:"#f8f8f8",borderBottom:"0.5px solid #eee",borderTop:"0.5px solid #eee"}}>
                            <div style={{fontSize:9,fontWeight:700,color:"#aaa",letterSpacing:1.5}}>DEFENSIVE</div>
                          </div>
                          {StatRow("Tackles",s.tackles||0,Math.max(avgTac*2,4),"#3b82f6",false)}
                          {StatRow("Interceptions",s.interceptions||0,Math.max((tots.interceptions/gp)*2,3),"#3b82f6",false)}
                          {StatRow("Aerial Duels Won",s.aerialDuelsWon||0,Math.max((tots.aerialDuelsWon/gp)*2,3),"#3b82f6",false)}
                          <div style={{padding:"8px 16px",background:"#f8f8f8",borderBottom:"0.5px solid #eee",borderTop:"0.5px solid #eee"}}>
                            <div style={{fontSize:9,fontWeight:700,color:"#aaa",letterSpacing:1.5}}>DISCIPLINE</div>
                          </div>
                          {StatRow("Fouls",s.fouls||0,5,"#f59e0b",false)}
                          {StatRow("Bad Turnovers",s.dangerousTurnovers||0,5,"#ef4444",false)}
                          {rat.coachNote&&(
                            <div style={{padding:"12px 16px",background:"#fff8f3",
                              borderTop:"1px solid "+A+"22"}}>
                              <div style={{color:A,fontSize:9,fontWeight:700,
                                letterSpacing:1.5,marginBottom:5}}>COACH NOTE</div>
                              <div style={{color:"#555",fontSize:13,lineHeight:1.6,fontStyle:"italic"}}>
                                "{rat.coachNote}"
                              </div>
                            </div>
                          )}
                          {g.possession&&(g.possession.home+g.possession.away)>0&&(
                            <div style={{padding:"12px 16px",borderTop:"1px solid #f0f0f0",
                              display:"flex",alignItems:"center",gap:10}}>
                              <div style={{color:"#aaa",fontSize:10,fontWeight:700,
                                letterSpacing:.5,flexShrink:0}}>TEAM POSSESSION</div>
                              <div style={{flex:1,height:6,background:"#f0f0f0",
                                borderRadius:3,overflow:"hidden"}}>
                                <div style={{height:"100%",background:A,borderRadius:3,
                                  width:Math.round(g.possession.home/(g.possession.home+g.possession.away)*100)+"%"}}/>
                              </div>
                              <div style={{color:A,fontSize:12,fontWeight:700,flexShrink:0}}>
                                {Math.round(g.possession.home/(g.possession.home+g.possession.away)*100)}%
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ SCHEDULE TAB ══ */}
        {tab==="schedule"&&(
          <div>
            {upcomingEvents.length===0?(
              <div style={{textAlign:"center",padding:"60px 0",color:"#bbb"}}>
                <div style={{fontSize:32,marginBottom:10}}>📅</div>
                <div style={{fontWeight:700,color:"#999",marginBottom:4}}>No upcoming events</div>
                <div style={{fontSize:13}}>Check back when your coach adds fixtures</div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {upcomingEvents.map(function(e){
                  var isGame = e.type==="game"||e.opponent;
                  var typeColor = {game:A,practice:"#27a560",tournament:"#7c6af5",other:"#42a5f5"}[e.type]||A;
                  var dLeft = Math.ceil((new Date(e.date)-new Date(today))/(1000*60*60*24));
                  return(
                    <div key={e.id} style={{background:"#fff",border:"1px solid #eee",
                      borderRadius:12,padding:"14px 16px",
                      display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:typeColor,flexShrink:0}}/>
                          <div style={{color:"#111",fontWeight:700,fontSize:14}}>
                            {isGame?"vs "+(e.opponent||""):(e.title||"Event")}
                          </div>
                        </div>
                        <div style={{color:"#aaa",fontSize:11,paddingLeft:16}}>
                          {e.date}{e.time?" · "+e.time:""}{e.location?" · "+e.location:""}
                        </div>
                      </div>
                      <div style={{flexShrink:0,textAlign:"right"}}>
                        {dLeft===0?(<span style={{background:A+"18",color:A,fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:20}}>TODAY</span>)
                        :dLeft===1?(<span style={{background:"#f0f0f0",color:"#555",fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:20}}>TOMORROW</span>)
                        :(<span style={{color:"#bbb",fontSize:12,fontWeight:700}}>in {dLeft}d</span>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ RECRUIT TAB ══ */}
        {tab==="recruit"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:A,borderRadius:14,padding:"16px 18px"}}>
              <div style={{color:"rgba(0,0,0,.6)",fontSize:10,fontWeight:700,letterSpacing:1.5,marginBottom:4}}>RECRUITING PROFILE LINK</div>
              <div style={{color:"#000",fontWeight:700,fontSize:14,marginBottom:10}}>
                Share this link with college coaches — it only shows your stats, bio and highlights.
              </div>
              <button onClick={function(){copyLink("recruit");}}
                style={{width:"100%",padding:"10px",background:"rgba(0,0,0,.15)",border:"none",
                  borderRadius:9,color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",
                  fontFamily:"'Oswald',sans-serif"}}>
                {recruitCopied?"✓ LINK COPIED!":"⎘ COPY RECRUITING LINK"}
              </button>
            </div>

            {/* Bio */}
            <div style={{background:"#fff",border:"1px solid #eee",borderRadius:14,padding:"14px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{color:"#bbb",fontSize:9,fontWeight:700,letterSpacing:1.5}}>ABOUT ME</div>
                {!editBio&&(
                  <button onClick={function(){setEditBio(true);}}
                    style={{background:"none",border:"1px solid #eee",borderRadius:6,
                      padding:"3px 10px",color:"#aaa",fontSize:11,cursor:"pointer",fontWeight:700}}>
                    {player.playerBio?"Edit":"+ Add Bio"}
                  </button>
                )}
              </div>
              {editBio?(
                <div>
                  <textarea value={bio} onChange={function(e){setBio(e.target.value);}}
                    placeholder="Tell college coaches about yourself..."
                    rows={4}
                    style={{width:"100%",padding:"10px 12px",background:"#f8f8f8",
                      border:"1px solid #eee",borderRadius:9,color:"#111",fontSize:13,
                      outline:"none",fontFamily:"'Outfit',sans-serif",
                      boxSizing:"border-box",resize:"vertical",lineHeight:1.6,marginBottom:8}}/>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={saveBio} disabled={savingBio}
                      style={{flex:1,padding:"9px",background:A,border:"none",borderRadius:9,
                        color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                      {savingBio?"Saving...":"Save"}
                    </button>
                    <button onClick={function(){setEditBio(false);setBio(player.playerBio||"");}}
                      style={{padding:"9px 14px",background:"#f0f0f0",border:"none",
                        borderRadius:9,color:"#666",fontSize:13,cursor:"pointer"}}>Cancel</button>
                  </div>
                </div>
              ):(
                <div style={{color:player.playerBio?"#444":"#ccc",fontSize:14,lineHeight:1.7,
                  fontStyle:player.playerBio?"normal":"italic"}}>
                  {player.playerBio||"No bio yet — tap Edit to introduce yourself to college coaches"}
                </div>
              )}
            </div>

            {/* Stats */}
            <div style={{background:"#fff",border:"1px solid #eee",borderRadius:14,overflow:"hidden"}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid #f5f5f5",background:"#fafafa"}}>
                <div style={{color:"#bbb",fontSize:9,fontWeight:700,letterSpacing:1.5}}>SEASON STATS</div>
              </div>
              {[
                {l:"Goals",v:tots.goals},{l:"Assists",v:tots.assists},
                {l:"Games Played",v:playerGames.length||0},
                {l:"Avg Rating",v:avgRating>0?avgRating.toFixed(1):"—"},
                {l:"Pass Accuracy",v:passAcc>0?passAcc+"%":"—"},
                {l:"Shot Conversion",v:shotConv>0?shotConv+"%":"—"},
              ].map(function(item,i){return(
                <div key={item.l} style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",padding:"11px 16px",
                  borderBottom:i<5?"1px solid #f5f5f5":"none"}}>
                  <div style={{color:"#888",fontSize:13}}>{item.l}</div>
                  <div style={{color:"#111",fontSize:14,fontWeight:700}}>{item.v}</div>
                </div>
              );})}
            </div>

            {/* Player info */}
            <div style={{background:"#fff",border:"1px solid #eee",borderRadius:14,overflow:"hidden"}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid #f5f5f5",background:"#fafafa"}}>
                <div style={{color:"#bbb",fontSize:9,fontWeight:700,letterSpacing:1.5}}>PLAYER INFO</div>
              </div>
              {[
                {l:"Position",v:allPos(player).join(", ")},
                {l:"Jersey",v:"#"+player.number},
                {l:"Graduation Year",v:player.gradYear},
                {l:"Height",v:player.height},
                {l:"Weight",v:player.weight&&player.weight+" lbs"},
                {l:"GPA",v:player.gpa},
              ].filter(function(x){return x.v;}).map(function(item,i,arr){return(
                <div key={item.l} style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",padding:"11px 16px",
                  borderBottom:i<arr.length-1?"1px solid #f5f5f5":"none"}}>
                  <div style={{color:"#888",fontSize:13}}>{item.l}</div>
                  <div style={{color:"#111",fontSize:14,fontWeight:700}}>{item.v}</div>
                </div>
              );})}
            </div>

            {/* Highlights */}
            {player.highlightsUrl&&(
              <a href={player.highlightsUrl} target="_blank" rel="noopener noreferrer"
                style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",
                  background:"#fff",border:"1px solid #eee",borderRadius:14,textDecoration:"none"}}>
                <div style={{width:44,height:44,borderRadius:10,background:A+"18",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  color:A,fontSize:20,flexShrink:0}}>▶</div>
                <div>
                  <div style={{color:"#111",fontWeight:700,fontSize:14}}>Watch Highlights</div>
                  <div style={{color:"#aaa",fontSize:11,marginTop:2,overflow:"hidden",
                    textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:240}}>
                    {player.highlightsUrl}
                  </div>
                </div>
              </a>
            )}

            {/* Videos */}
            {(videos.length>0||addingVid)&&(
              <div>
                <div style={{color:"#bbb",fontSize:9,fontWeight:700,letterSpacing:1.5,
                  marginBottom:8,paddingLeft:2}}>MY VIDEOS</div>
                {videos.map(function(v){return(
                  <div key={v.id} style={{background:"#fff",border:"1px solid #eee",
                    borderRadius:12,padding:"12px 14px",marginBottom:8,
                    display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:40,height:40,borderRadius:9,background:A+"15",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      color:A,fontSize:18,flexShrink:0}}>▶</div>
                    <div style={{flex:1,overflow:"hidden"}}>
                      <div style={{color:"#111",fontWeight:700,fontSize:13}}>{v.label}</div>
                      <a href={v.url} target="_blank" rel="noopener noreferrer"
                        style={{color:A,fontSize:11,textDecoration:"none",display:"block",
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.url}</a>
                    </div>
                    <button onClick={function(){saveVideos(videos.filter(function(x){return x.id!==v.id;}));}}
                      style={{background:"none",border:"none",color:"#ddd",cursor:"pointer",fontSize:18,padding:4}}>×</button>
                  </div>
                );})}
                {!addingVid&&(
                  <button onClick={function(){setAddingVid(true);}}
                    style={{width:"100%",padding:"10px",background:"#f5f5f5",border:"none",
                      borderRadius:10,color:"#aaa",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                    + Add Video Link
                  </button>
                )}
                {addingVid&&(
                  <div style={{background:"#fff",border:"1px solid "+A+"33",borderRadius:12,padding:14}}>
                    <input value={newVideo.label}
                      onChange={function(e){setNewVideo(function(v){return Object.assign({},v,{label:e.target.value});});}}
                      placeholder="Label e.g. Junior Year Highlights"
                      style={{width:"100%",padding:"9px 12px",background:"#f8f8f8",border:"1px solid #eee",
                        borderRadius:8,color:"#111",fontSize:13,outline:"none",
                        fontFamily:"'Outfit',sans-serif",boxSizing:"border-box",marginBottom:8}}/>
                    <input value={newVideo.url}
                      onChange={function(e){setNewVideo(function(v){return Object.assign({},v,{url:e.target.value});});}}
                      placeholder="YouTube, Hudl, or any video URL"
                      style={{width:"100%",padding:"9px 12px",background:"#f8f8f8",border:"1px solid #eee",
                        borderRadius:8,color:"#111",fontSize:13,outline:"none",
                        fontFamily:"'Outfit',sans-serif",boxSizing:"border-box",marginBottom:10}}/>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={function(){if(!newVideo.url.trim())return;saveVideos(videos.concat([{id:"v"+Date.now(),label:newVideo.label.trim()||"Highlights",url:newVideo.url.trim()}]));}}
                        disabled={savingVid}
                        style={{flex:1,padding:"9px",background:A,border:"none",borderRadius:8,
                          color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                        {savingVid?"Saving...":"Save Link"}
                      </button>
                      <button onClick={function(){setAddingVid(false);}}
                        style={{padding:"9px 14px",background:"#f0f0f0",border:"none",
                          borderRadius:8,color:"#666",fontSize:13,cursor:"pointer"}}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {videos.length===0&&!addingVid&&(
              <button onClick={function(){setAddingVid(true);}}
                style={{width:"100%",padding:"12px",background:"#f5f5f5",border:"1px dashed #ddd",
                  borderRadius:12,color:"#aaa",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                + Add Video / Highlight Link
              </button>
            )}

            {/* Schools */}
            {(player.recruitingSchools||[]).length>0&&(
              <div>
                <div style={{color:"#bbb",fontSize:9,fontWeight:700,letterSpacing:1.5,marginBottom:8,paddingLeft:2}}>INTERESTED SCHOOLS</div>
                {(player.recruitingSchools||[]).map(function(s){
                  var sc={identified:"#aaa",contacted:"#f57c00",visit:A,committed:"#2e7d32"}[s.status]||"#aaa";
                  var sl={identified:"Identified",contacted:"Contacted",visit:"Official Visit",committed:"Committed"}[s.status]||s.status;
                  return(
                    <div key={s.id} style={{background:"#fff",border:"1px solid #eee",borderRadius:12,
                      padding:"12px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{color:"#111",fontWeight:700,fontSize:14}}>{s.school}</div>
                        {s.contact&&<div style={{color:"#999",fontSize:12,marginTop:2}}>Contact: {s.contact}</div>}
                      </div>
                      <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                        <div style={{background:sc+"18",color:sc,fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:20}}>{sl}</div>
                        <div style={{color:"#ccc",fontSize:11,marginTop:3}}>{s.division}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{textAlign:"center",marginTop:8,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:A,opacity:.35}}/>
              <span style={{color:"#ccc",fontSize:11,fontWeight:700,letterSpacing:1}}>COACHIQ</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
