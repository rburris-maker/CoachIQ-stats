import { useState, useMemo, useRef, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  LayoutDashboard, Users, Trophy, Radio, BarChart2,
  Target, Award, MapPin, ChevronRight,
  Search, Calendar, AlertTriangle, RefreshCw, Cpu,
  Check, Activity, Plus, Zap, Upload, Download, FileSpreadsheet, X, ClipboardList, UserPlus, Trash2, Pencil, Save, ChevronDown, Settings, BookOpen, Dumbbell, ChevronUp, AlignLeft, CalendarDays, ClipboardCheck
} from "lucide-react";
import * as XLSX from "xlsx";

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
const SUPABASE_URL = "https://lfhbkvdfxlawwwxtvwmj.supabase.co";

// ─── SUPABASE REALTIME ────────────────────────────────────────────────────────
const realtimeManager = (()=>{
  let ws=null, channelId=null, heartbeatTimer=null, reconnectTimer=null;
  let _onMessage=null, _onStatus=null, _deliberateClose=false;

  function getToken(){
    try{ const s=JSON.parse(localStorage.getItem("coachiq_session")||"null"); return s?.access_token||null; }
    catch{ return null; }
  }

  function connect(channel, onMessage, onStatus){
    if(ws) disconnect(true);
    channelId=channel; _onMessage=onMessage; _onStatus=onStatus; _deliberateClose=false;
    const url=`wss://${SUPABASE_URL.replace("https://","")}/realtime/v1/websocket?apikey=${SUPABASE_KEY}&vsn=1.0.0`;
    try{ ws=new WebSocket(url); } catch(e){ console.error("RT WS error",e); return; }

    ws.onopen=()=>{
      _onStatus&&_onStatus("connected");
      ws.send(JSON.stringify({topic:"realtime:"+channel,event:"phx_join",
        payload:{config:{broadcast:{self:false}},access_token:getToken()||SUPABASE_KEY},ref:"1"}));
      heartbeatTimer=setInterval(()=>{
        ws&&ws.readyState===1&&ws.send(JSON.stringify({topic:"phoenix",event:"heartbeat",payload:{},ref:"hb"}));
      },20000);
    };
    ws.onmessage=(e)=>{
      try{
        const msg=JSON.parse(e.data);
        if(msg.event==="broadcast"&&msg.payload?.event){
          _onMessage&&_onMessage(msg.payload.event, msg.payload.payload);
        }
      }catch{}
    };
    ws.onclose=(e)=>{
      clearInterval(heartbeatTimer);
      _onStatus&&_onStatus("disconnected");
      if(!_deliberateClose&&channelId){
        reconnectTimer=setTimeout(()=>connect(channel,onMessage,onStatus),3000);
      }
    };
    ws.onerror=()=>_onStatus&&_onStatus("error");
  }

  function broadcast(event, payload){
    if(!ws||ws.readyState!==1) return false;
    ws.send(JSON.stringify({topic:"realtime:"+channelId,event:"broadcast",
      payload:{event,payload},ref:String(Date.now())}));
    return true;
  }

  function disconnect(silent=false){
    _deliberateClose=!silent; clearInterval(heartbeatTimer); clearTimeout(reconnectTimer);
    if(ws){ws.close(1000);ws=null;} channelId=null;
  }

  return {connect,broadcast,disconnect};
})();
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmaGJrdmRmeGxhd3d3eHR2d21qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg1NjksImV4cCI6MjA4OTg1NDU2OX0.7mKYx3z4nkMCh03fCU9t2nQiUFhwQCJ0y8KPQrBmNtg";

const supabase = (() => {
  const baseHeaders = {"Content-Type":"application/json","apikey":SUPABASE_KEY};

  function getToken(){
    try{ const s=JSON.parse(localStorage.getItem("coachiq_session")||"null"); return s?.access_token||null; }
    catch{ return null; }
  }

  function h(extra={}){
    const token=getToken();
    return {...baseHeaders,"Authorization":`Bearer ${token||SUPABASE_KEY}`,...extra};
  }

  async function req(url,opts){
    const res=await fetch(url,opts);
    if(res.status===204||res.status===205) return {data:null,error:null};
    let data; try{ data=await res.json(); }catch{ data=null; }
    if(!res.ok){
      const msg=data?.message||data?.error||data?.details||`HTTP ${res.status}`;
      console.error(`Supabase error [${res.status}]`,url,data);
      return {data:null,error:{message:msg,status:res.status,code:data?.code}};
    }
    return {data,error:null};
  }

  // Chainable query builder
  function makeBuilder(table){
    const b={
      _filters:[],_cols:"*",_method:"GET",_body:null,
      _upsert:false,_upsertOpts:{},_single:false,_limit:null,

      // Filter chainers
      eq(col,val){  if(val===null||val===undefined){ console.warn(`⚠️ .eq("${col}") called with ${val} — filter skipped`); return this; } this._filters.push([col,"eq",val]);  return this; },
      neq(col,val){ this._filters.push([col,"neq",val]); return this; },
      is(col,val){  this._filters.push([col,"is",val]);  return this; },
      not(col,op,val){ this._filters.push([col,`not.${op}`,val]); return this; },
      single(){ this._single=true; return this; },
      limit(n){ this._limit=n; return this; },

      // Operation setters
      select(cols="*",opts={}){
        this._method="GET"; this._cols=cols;
        // Legacy filter support: select("*",{filter:{team_id:"abc"}})
        if(opts.filter) Object.entries(opts.filter).forEach(([k,v])=>this._filters.push([k,"eq",v]));
        return this;
      },
      insert(rows){ this._method="POST"; this._body=Array.isArray(rows)?rows:[rows]; return this; },
      update(vals){ this._method="PATCH"; this._body=vals; return this; },
      delete(){ this._method="DELETE"; return this; },
      upsert(rows,opts={}){ this._method="POST"; this._upsert=true; this._upsertOpts=opts; this._body=Array.isArray(rows)?rows:[rows]; return this; },

      // Execute — makes builder awaitable (thenable)
      then(resolve,reject){ return this._run().then(resolve,reject); },
      catch(reject){ return this._run().catch(reject); },

      async _run(){
        const p=new URLSearchParams();
        if(this._method==="GET") p.set("select",this._cols);
        this._filters.forEach(([col,op,val])=>p.set(col,`${op}.${val}`));
        if(this._limit) p.set("limit",this._limit);
        const qs=p.toString()?`?${p}`:"";

        // Safety: no filter deletes/updates are blocked
        if(this._method==="DELETE"&&!this._filters.length){
          console.warn("🛑 Delete without filter blocked — use .eq() to filter");
          return {data:null,error:{message:"DELETE requires a WHERE clause"}};
        }
        if(this._method==="PATCH"&&!this._filters.length){
          console.warn("🛑 Update without filter blocked — use .eq() to filter");
          return {data:null,error:{message:"UPDATE requires a WHERE clause"}};
        }

        let hdrs=h();
        let body=undefined;

        if(this._method==="POST"){
          if(this._upsert){
            const up=new URLSearchParams();
            if(this._upsertOpts.onConflict) up.set("on_conflict",this._upsertOpts.onConflict);
            const uqs=up.toString()?`?${up}`:"";
            hdrs=h({"Prefer":"return=representation,resolution=merge-duplicates"});
            body=JSON.stringify(this._body);
            const r=await req(`${SUPABASE_URL}/rest/v1/${table}${uqs}`,{method:"POST",headers:hdrs,body});
            return r;
          }
          hdrs=h({"Prefer":"return=representation"});
          body=JSON.stringify(this._body);
        } else if(this._method==="PATCH"){
          hdrs=h({"Prefer":"return=representation"});
          body=JSON.stringify(this._body);
        }

        const r=await req(`${SUPABASE_URL}/rest/v1/${table}${qs}`,{method:this._method,headers:hdrs,body});
        if(this._single&&Array.isArray(r.data)) r.data=r.data[0]||null;
        return r;
      }
    };
    return b;
  }

  return {
    auth:{
      async signUp({email,password}){
        const r=await req(`${SUPABASE_URL}/auth/v1/signup`,{method:"POST",headers:h(),body:JSON.stringify({email,password})});
        if(r.data?.access_token) localStorage.setItem("coachiq_session",JSON.stringify(r.data));
        return r;
      },
      async signInWithPassword({email,password}){
        const r=await req(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:"POST",headers:h(),body:JSON.stringify({email,password})});
        if(r.data?.access_token) localStorage.setItem("coachiq_session",JSON.stringify(r.data));
        if(r.data?.error_description) return {data:r.data,error:{message:r.data.error_description}};
        return r;
      },
      async signOut(){
        await req(`${SUPABASE_URL}/auth/v1/logout`,{method:"POST",headers:h()});
        localStorage.removeItem("coachiq_session");
      },
      getSession(){
        try{ const s=JSON.parse(localStorage.getItem("coachiq_session")||"null"); return {data:{session:s}}; }
        catch{ return {data:{session:null}}; }
      },
      async resetPasswordForEmail(email){
        return req(`${SUPABASE_URL}/auth/v1/recover`,{method:"POST",headers:h(),body:JSON.stringify({email})});
      },
      onAuthStateChange(cb){ return {data:{subscription:{unsubscribe:()=>{}}}}; },
    },

    from(table){ return makeBuilder(table); },
  };
})();



// ─── EMAILJS CONFIG ───────────────────────────────────────────────────────────
const EJS_SERVICE       = "service_67o2kbq";
const EJS_TEMPLATE      = "template_xlcc4wg";   // match report
const EJS_KEY           = "XdWTyjACtwXgLPPkV";

async function sendPlayerEmail(templateParams){
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      service_id:  EJS_SERVICE,
      template_id: EJS_TEMPLATE,
      user_id:     EJS_KEY,
      template_params: templateParams,
    }),
  });
  if(!res.ok) throw new Error(`EmailJS error ${res.status}: ${await res.text()}`);
  return res;
}


// ─── PERSISTENT STORAGE HOOK ─────────────────────────────────────────────────
function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s !== null ? JSON.parse(s) : initial;
    } catch { return initial; }
  });
  function setValue(newVal) {
    const resolved = typeof newVal === 'function' ? newVal(val) : newVal;
    setVal(resolved);
    try { localStorage.setItem(key, JSON.stringify(resolved)); } catch(e) { console.warn('localStorage error', e); }
  }
  return [val, setValue];
}

function AppLogo({size=36, glow=true}){
  const g = glow ? "drop-shadow(0 0 6px #ff6b00aa) drop-shadow(0 0 14px #ff6b0055)" : "none";
  return(
    <svg width={size} height={size} viewBox="0 0 100 110" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{filter:g,flexShrink:0}}>
      <defs>
        <linearGradient id="lgShield" x1="50" y1="4" x2="50" y2="106" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ff8c00"/>
          <stop offset="100%" stopColor="#cc3300"/>
        </linearGradient>
        <radialGradient id="lgGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff6b0033"/>
          <stop offset="100%" stopColor="#ff6b0000"/>
        </radialGradient>
      </defs>
      {/* Glow fill */}
      <ellipse cx="50" cy="55" rx="44" ry="50" fill="url(#lgGlow)"/>
      {/* Shield outline — matches logo shape */}
      <path d="M50 4 C50 4 14 16 14 16 L14 58 C14 80 30 96 50 106 C70 96 86 80 86 58 L86 16 Z"
        fill="none" stroke="url(#lgShield)" strokeWidth="3" strokeLinejoin="round"/>
      {/* Inner shield line */}
      <path d="M50 10 C50 10 20 20 20 20 L20 58 C20 77 34 91 50 100 C66 91 80 77 80 58 L80 20 Z"
        fill="none" stroke="#ff6b0033" strokeWidth="1"/>
      {/* Halfway line */}
      <line x1="22" y1="55" x2="78" y2="55" stroke="#ff6b00" strokeWidth="1.8" opacity="0.9"/>
      {/* Center circle */}
      <circle cx="50" cy="55" r="10" fill="none" stroke="#ff6b00" strokeWidth="1.8" opacity="0.9"/>
      {/* Center spot */}
      <circle cx="50" cy="55" r="2" fill="#ff6b00" opacity="0.9"/>
      {/* Top goal box */}
      <rect x="35" y="20" width="30" height="14" rx="1"
        fill="none" stroke="#ff6b00" strokeWidth="1.8" opacity="0.9"/>
      {/* Top goal (small box) */}
      <rect x="41" y="20" width="18" height="7" rx="1"
        fill="none" stroke="#ff6b00" strokeWidth="1.4" opacity="0.7"/>
      {/* Bottom goal box */}
      <rect x="35" y="76" width="30" height="14" rx="1"
        fill="none" stroke="#ff6b00" strokeWidth="1.8" opacity="0.9"/>
      {/* Bottom goal (small box) */}
      <rect x="41" y="83" width="18" height="7" rx="1"
        fill="none" stroke="#ff6b00" strokeWidth="1.4" opacity="0.7"/>
      {/* Top touchline segments (inside shield) */}
      <line x1="22" y1="20" x2="78" y2="20" stroke="#ff6b00" strokeWidth="1.4" opacity="0.6"/>
      <line x1="22" y1="90" x2="78" y2="90" stroke="#ff6b00" strokeWidth="1.4" opacity="0.6"/>
    </svg>
  );
}

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
// ─── THEME TOKENS ────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg:"#080808", surface:"#111111", card:"#181818",
    border:"#3a1a00", accent:"#ff6b00", accent2:"#ff9500",
    danger:"#ff2200", warning:"#ff9500", text:"#fff0e0", muted:"#7a4a2a",
    sidebar:"#080808", sidebarBorder:"#2a1000", topbar:"#080808",
  },
  light: {
    bg:"#f5f0ea", surface:"#ffffff", card:"#ffffff",
    border:"#d4c4b0", accent:"#cc4400", accent2:"#a33800",
    danger:"#cc1100", warning:"#c4620a", text:"#1a0e00", muted:"#6b4020",
    sidebar:"#1a0e00", sidebarBorder:"#3a2010", topbar:"#ffffff",
  },
};
// C is set dynamically in the App shell and mutated on theme change
let C = {...THEMES.dark};

// ─── POSITION METADATA ───────────────────────────────────────────────────────
const POS_META = {
  GK:{ label:"GK", color:"#ffb300", group:"Goalkeeper" },
  CB:{ label:"CB", color:"#ff6b00", group:"Defender"   },
  FB:{ label:"FB", color:"#ff8c00", group:"Defender"   },
  DM:{ label:"DM", color:"#ff4500", group:"Midfielder" },
  CM:{ label:"CM", color:"#ffa040", group:"Midfielder" },
  W: { label:"W",  color:"#ffcc00", group:"Midfielder" },
  ST:{ label:"ST", color:"#ff2200", group:"Forward"    },
};
const posColor   = pos => POS_META[pos]?.color || "#fff";
// helpers to support multi-position players (position stored as array)
const primaryPos = p => Array.isArray(p?.position) ? p.position[0] : (p?.position || "CM");
const allPos     = p => Array.isArray(p?.position) ? p.position : (p?.position ? [p.position] : ["CM"]);

// ─── SQUAD ────────────────────────────────────────────────────────────────────
const DEFAULT_PLAYERS = [
  { id:"p1",  name:"James Mitchell", number:1,  position:["GK"], captain:false },
  { id:"p2",  name:"Carlos Rivera",  number:2,  position:["FB"], captain:false },
  { id:"p3",  name:"Tom Bradley",    number:5,  position:["CB"], captain:false },
  { id:"p4",  name:"Kai Johnson",    number:6,  position:["CB"], captain:false },
  { id:"p5",  name:"Marcus Webb",    number:3,  position:["FB"], captain:false },
  { id:"p6",  name:"Diego Santos",   number:8,  position:["DM","CM"], captain:false },
  { id:"p7",  name:"Liam Chen",      number:10, position:["CM","W"], captain:false },
  { id:"p8",  name:"Noah Patel",     number:4,  position:["CM","DM"], captain:true  },
  { id:"p9",  name:"Ethan Brooks",   number:7,  position:["W","CM"], captain:false },
  { id:"p10", name:"Alex Torres",    number:9,  position:["ST","W"], captain:false },
  { id:"p11", name:"Ryan Murphy",    number:11, position:["W","ST"], captain:false },
  { id:"p12", name:"Sam Wilson",     number:21, position:["ST"], captain:false },
];


// ─── ROSTER TEMPLATE (embedded base64) ───────────────────────────────────────
const ROSTER_TEMPLATE_B64 = "UEsDBBQACAgIAKuQclwAAAAAAAAAAAAAAAAaAAAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHOtUkFqwzAQvOcVYu+17KSEUiznEgq5pukDhLy2TGxJaDdt8vuqTWgcCKEHn8TMameGYcvVcejFJ0bqvFNQZDkIdMbXnWsVfOzenl5gVc3KLfaa0xeyXSCRdhwpsMzhVUoyFgdNmQ/o0qTxcdCcYGxl0GavW5TzPF/KONaA6kZTbGoFcVMXIHangP/R9k3TGVx7cxjQ8R0LyWkXk6COLbKCX3gmiyyJgbyfYT5lBuJTj3QNccaP7BdT2n/5uCeLyNcEf1QK9/M87OJ50i6sjli/c0zHNa5kTF/CzEp5c3LVN1BLBwi+0DoZ4AAAAKkCAABQSwMEFAAICAgAq5ByXAAAAAAAAAAAAAAAAA8AAAB4bC93b3JrYm9vay54bWyNU9uOmzAQfe9XIL8nQG5NopBVSoJ2pd6UbHefDQzBjbGRPblt1X/vYMJ2q/ahD4Dn4jNnZg6Lu0slvRMYK7SKWNgPmAcq07lQ+4h9e0x6U+ZZ5CrnUiuI2BUsu1u+W5y1OaRaHzy6r2zESsR67vs2K6Hitq9rUBQptKk4kmn2vq0N8NyWAFhJfxAEE7/iQrEWYW7+B0MXhchgrbNjBQpbEAOSI7G3pagtWy4KIeGpbcjjdf2ZV0Q75jJj/vKV9lfjpTw7HOuEsiNWcGmBGi31+Uv6HTKkjriUzMs5QjgLRl3KHxAaKZPKkLNxPAk429/xxnSI99qIF62Qy11mtJQRQ3O8VSOiKLJ/RXbNoB55ajvn5VmoXJ8jRiu6vjmf3fFZ5FjSAifD6ajz3YPYlxixaTgbMA95um0GFbFxQNcKYSy6Ig6FUycnoHqNRQ35bzpyO+u+nnID3WqLYBqq5HvIqbLTCVLoJKxIJTE2c0EB85APHWIHQ+1mNH9B9yk/1kdFFMKGk4Hik84JYkVot/jrcm72GiRyItkPgiBscOGCHy26701KUtP5LzlJkRpoBeS0xLyjERH78X4ymMTTyaA3WIXDXhhuxr0Pw9G4l2yShCYXr+NZ8pN05VDn9MQtf4uGfpItFLsr7fYSsc0lA7lynHxKa9+Omt9pYvkLUEsHCDLcj4b8AQAAcAMAAFBLAwQUAAgICACrkHJcAAAAAAAAAAAAAAAAEwAAAHhsL3RoZW1lL3RoZW1lMS54bWzNV8Fy2yAQvfcrGO4Jkiw5sid2Dkk9PXSmM036AQghiQYhDdCk/vsisCUUOa7TOp36gGF5vF0e7GJf3/ysOXiiUrFGrGB4GUBABWlyJsoV/PawuUghUBqLHPNG0BXcUgVv1h+u8VJXtKbALBdqiVew0rpdIqSIMWN12bRUmLmikTXWZihLlEv8bGhrjqIgmKMaMwF36+Up65uiYITeNeRHTYV2JJJyrE3oqmKtgkDg2sT4xQLBQxcgXO9D/chpt051BsLlPbHx+yssNn8Muy8ly+yWS/CE+QoG9gPR+hr1AK6nuMJ+drgdIH+MJriwiBdXec8XOb4pjlJKaNjzWQAmxOxi6jsu0jDbc3og151ykyAJ4jHe459N8Issy5LFCD8b8PEEnwbzGEcjfDzgk2n8mZmZj/DJgJ9Ptb5azOMx3oIqzsTjwRPsT6aHFA3/dBCeGni6P/ABhbyb49YL/do9qvH3Rm4MwB6uuaQC6G1LC0wM7hbXmWQYgpZpUm1wzfjWBAkBqbBUVJsr0jnHS4q9Vc5E1AsTeuGsZuKYZ86M6/N5HpwhXxArT+0PGOf3esvpZ2UDUw1n+cYY7cDCevnbynShZexn3MhfVEo89NWOtlSgbVS3oyO8piIwoZ0t8VJ77KxUPuGsA55KOrs6jTR0heVE1jA5xoo8Fcx1Bbir4OE8ci6AIpjTvD9ezTj9SokG3J6+tq20bda1zstI4r+QW1U4pzu9w9OkSX+vjMe6mJ1PcJ82PoPiwZ8pjqY5w8V4BJ5NiEmUmOzFrSmJJtlNt26NUyVKCDAvzaNOtNtXK5W+w6pyW7OptH9axMAXJXEX/PkIZ2l4HkL0UgBaFEbPVyzD0Mw5koOz5wejQ5Fl5eY/LYDxiQUwfkupivelapxOi3fJ0ujoDvwsbbGuQNeYO8ck4e6p7tLsodnnpnsQuvy8cDWoS9Kd0SRqmHreOqp/X00HmdMTz+6Ngs7eSdDkgJ7JGeRE0/xCo58faPIfYG9Z/wJQSwcIO6HfCvQCAAACDQAAUEsDBBQACAgIAKuQclwAAAAAAAAAAAAAAAANAAAAeGwvc3R5bGVzLnhtbO1cW4/aOBR+318R5b3NjQlhBVRMdlnty6raTqWVVn0IxEDUxI4cTwv99WvHuRKbJgwDzMpBoyTn+Jzznc8XbGvM9MM+ibVvAGcRgjPdem/qGoBrFEZwO9M/Py3febqWkQCGQYwgmOkHkOkf5r9MM3KIwacdAESjHmA203eEpL8aRrbegSTI3qMUQKrZIJwEhL7irZGlGARhxoyS2LBN0zWSIIL6fAqfk2VCMm2NniGhMCqRxm9/hlTojnSNu/NRSKH8ASDAQawb86lROJhPNwjWfmxX55L5NPuhfQti6sVi5dcoRlgjFClg0agEBgngJfwgjlY4YsJNkETxgYvt3G4X4IymzF3lkbn7oyBm2+UCRxxn06F5Z+YrriD4GTBd5c2tCcPb1Uxf0st9NHsH+QlnkSSs2Qk7XowW9uJCYWXZ2oJsl+bvr5ytdz/JPjoXq1pZWOt1OR4S9oLZnohzs8r0/JtU5hXCirK94Kg0JNsrhBVlO3q4SbZXCCvKdmGObpHtBcNeaxwawqp/m/HhCmFF2dr2TbK9YFjJ9GHyWt84+Y3NqqM4rmbV+aSaCubTNCAEYLikL1rx/HRI6ZQa0rUCd5OX+0npLQ4Olv3Q3yBDcRQyFFu/mbTpsQ9zszpSLM0xrwOj4fOF0SyPfQTRrAWFcfFoldNr5FY7PY5WUSyMlt9oe1khHNI1ZbUO00uRFkbBFsEg/pzO9E0QZ0CvRL+h77AUzqcx2BAaBkfbHbsTlDI0iBCU0IfShgHhns+LoOXrWNqjdvk6tNWHnAUlnTPLihZYelrkZXPYPQ1oyTK/nha8sJiL4oFWxRrE8Sfm759NXR8mdbvfdBfXMH8x6SOtx+KReypegjSND0vEnOSDEBc85kVaokUcbWECjgp+xIiANcn3GnLxfBqUBbUdwtEP6poNQttibc+2Jki0ZiKerq4RsCd/IxJwLxTTdxykT1RYVXcEwzww1WU7HMGvT2gZVWpKU1rB0GK0/grCEuQuCqlpo6Sx3xwxZdY8WefyVOA8JqopbjJVNti3A8ZWYCRgzu5bCowCo8AoMArMOWBGzj19U46su0Izuis09j2hmdwYjNGcvvPJfGMe79jnzuP3my70JqAXYn9rk/oWbaOaNrsHbS9dB53mbE0FADcpKyUnKOORrsfYQ82Yoxjrw5g5rI2JuqaYsv91z3Rr1kZN1izVziSMjSU9UzEmY8yT9EzFmIyxyT0xxnZqB/J19WHMko3+qo1JKbMUZUMpa+x7PijKBo5kt2fsTYxkzj0x9ibaWHMkU5T1o0y2IleUSSl7UJS9oJWpjjm4lSnKBs/KVMccPMlQlPWjzFUdcyhlY0XZUMrUXtlgyu5qs+xtUOapjvmCVqYo60WZbSrKhlKm9mQHU6Zm/4MpU1uMgylTOxmDKburf2E5Y+v/dQgzin84axwjaR0Dq6QaO2Y20/9iP88QNyhbPUcxiSB/M7oGPkqSoCzPtpMaBo7UQPvX/FIZuS0jV2j0jDGA60NlM27ZjE7ZtGJ5LbuxyO4jwKy6KpNJy4QfcqvJLE730Duruj0I/eIVb1ftg1f5xayPNfwSa8qjh11v7E+sYTpZHBkCmQ2TizWeNB+THXQTa6rDZ11vMhsm96RxxBrfZB9ZHLHNhF4y3soj0wJGi1896CDwZby5rmm6rthbeVi5m6nr+r44DosktKlOAPavbXkLOd0OxIyebiGyOpW3RFmmcq6ZRswbuyYTcTuQxeE6cRx52ykPhh9rHMd1xTaOw2pVhk1Wp3KNJ9WUP3zQbaOuK2HHZR9x/bCMxPlMJmJNfQK3Y1OdkjzW1Aeju+zIETAMQgT1Ud+j8dsox3Wj/qWk+X9QSwcILLDrP24FAABuSQAAUEsDBBQACAgIAKuQclwAAAAAAAAAAAAAAAAYAAAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1svVpNc9s2EL33V3B46MkxRVCiJFdSpybjJNO4zlRuMu2NFiELY4pgQEiy/eu7AEgKBBRFydg8OCYflvvxdgGsA0x+f1xnzhazktB86vrnPdfB+YKmJL+fuv/cXr0ZuU7JkzxNMprjqfuES/f32S+THWUP5Qpj7oCCvJy6K86LC88rFyu8TspzWuAcRpaUrRMOr+zeKwuGk1R+tM481OuF3johuas0XLBTdNDlkixwTBebNc65UsJwlnBwv1yRoqy1PaYn6UtZsoNQa380F2M10ujz+5a+NVkwWtIlP1/QdeWaHeXYG7fifGTo5zT5Awh1S0SmUK1svTglynXCHjbFG9BdAFN3JCP8SQbsziZS/yfmLEnGMbumKSR5mWQlhrEiucdzzP8p5Di/pZ8AqIe92cSrPp5NUgL5EJ45DC+n7h/+RRwgISIlPhO8K7Vnp1zR3RU4uMmSstYnwXeMpB9Jjtvo33QX0ew9sAGFOnU521QD/2GgrQYYuV+Bjx/xkjdf8+RujjO84DjVv7vZ8AyszJ/WdzRrFKR4mWwyLnwAc5TV+BZcnrq5IDQDlbQQJiKcZSJQ11kI2Q+gP+y7zjOl6/kiyYAmv9fT3v+Sn5uoIPRj8kQ3kpdqVMytO0ofBCT09mQqcuw8zgtInQCcp+pxYDoUuk6y4GQLqsV8vaOc07UYl/OYi/Qx+oxzmRxJjchaIYUrTbWGfYj7d+WPU36t8nxIjW7zxzR5TYnoz3XpXMmShlqsEgVJ+kJSvpq6o/NwOA5Hw0GTRCiZ91gUBHAK6DMUSv1elQZVNfARb3EG0tIZHQPtinqvZXw2gXyX8l+R+SwpSlFbldLFpoTQK69U9axImuL8oFlpc508go/wm+Tyd8mfRPWIOlBq/L6g5mXtocoeOmAPjV7eXlDZCzqKr1/Z6x+yJxcmT6VRrfUJT2YTRncOkylQVlXGG0OidILh+cDyQEnX1aWctLyyQoOIhTUxJ0ppFL4tAd3OehNvK/yrJC5rCa8CIhOINcCDKJpQ0JFQ/PGLh4KkG0gLxTdCqSWaUEwg1oBWKMGRUMIXjiOQPgSNU5cmEJlArAEtt/vHiuml/e5LJ/oa/8jg35YI2hKRLdFvS8S2xKCRaMU+OBI78s+HL11+A+nYQHMsNMK3JYZG+LbEyAjflhgfDj88Fv7gxSdfKP0KpV/5wcmnJIb69DSWmkiJjHQRQ0usRMa6CDpMwLBbAoZqEexpDJjlX4noi61vToBKprWKmVOgkglOIGHULQkj5VlfI2FgkDCyy8AQiSotepH7xlyKRyfXwbhbCsbKeX0mmOvA+EAdmCtBJTM8xsH49DoQddklC8Ke8G2k0RCYjUXPLgVjuYtqPeNj86ESOqUY/GPt1WvwoHojpC8LI5MH/0A9jE0iKkW6EOqZRPg/UBHHurPXYKJqrZC+RVi9JrJKAvkmE5UiPUiETCbQ6SVxrLd7DSJUs4b0RbJv8hDYJYHMraJWNDhKRCUU6kL9bzBxrF18DSZUL4eGGhNDk4m+XRHmflHr0RsHZC6WldBJFXG0dXwFHlRTh8YaD2OTh8GBijA3jUoo6OlCZgdZazppkei4i/RDuyLMFvDStztJZC2X4SklcXoz6XfcTfpDuyTMlfDSP9BQBmZPXQl9pyZ+oKX0O+4p/brVa/4etpDIQmIdabvfcT/oN13a3n8LimwobkHt/1fpuJlDPTMDFhJZSKwjbfc77sGQb2XAhiIbiltQO4SOmyeErAyYSGQhsY603e+45UGBnQELimwobkHtEDruVVDfyoCJRBYS60jb/Y5bDDSwM2BBkQ3FLagdQse9AQqtDJhIZCGxjrTd73hHR0M7AxYU2VDcgtohdLwTI2sntpDIQmL0rZ0YdbwTI3sntqHIhmL0zZ046HgnDqyd2EIiC4mDb+3EQccnNIHakIJWw2p2tXuhfUgWFLcgFZSnHaatMbuXx7wleLPJuTgx0ND9NQH5vYmjixgdwoOLODiIo/q+gbc3PJuk4MrnJCOpuh9Se4Jcc8hJsozuLrMkf6hJxYyJGwDXwLdzhx2aw8/ywnn355kTXZ45V/ATX8Mz/Hw5c+a31RdzddoISSoq5JZwgXzIt8Kc84mWRJiEtBWYJVwYucN8hzFA4m5CzGgR090+5QJ8KzRd47KUFzD2Fxk+5MWGN3j9gTpSj8ILWYv8qYCxjJQc4l6qWxf+7NevG8p/g3AgGggGYoFQvpzNb9XAxGsk62+QOJlsnidem8JTKW0R9PMUaAPHOIjDi/h7HPyLy7O/6E+HbQBQdgUjOb8pVM2tcCIuU+0vtNxbV1waZI6bOb2ijDzTnCdZhHOOmXYmvsWMk4U94KkLO9cJuydgOJP3YHrynI2p5UK9APPywFld05CPK3m1RggMfH/k+z0UhAj1+rDzLSnlh4e85oLQpnCKBFI5J89Y/jlfajdg5MWh6gTfr16bqxmuI1TcMGk9hZTfrnB+AxFCbTACAUpOp25BGWcJ4eB1liwe/sjTLyvC9+lOWaLd+lnA9I/oWlwRK8XFnbxFaFwQsXH09kzukQUtCK7P0hUrV5IAJyXLJbCd8yvCyr2pBr5J07fb/UI9m9A0VTeWoES0Z3hUGhXcPOvG4LW5Xzf7H1BLBwh+CrYTtAcAAKMnAABQSwMEFAAICAgAq5ByXAAAAAAAAAAAAAAAABQAAAB4bC9zaGFyZWRTdHJpbmdzLnhtbI1VwW7TQBC98xUjc4EDcVoQ0CpORRxS0ZKoNKkijhN7Gq+y3jG767SROPQf4MS/8DP5EsaBwg3NwSvv+M3M27cz48HZfW1hSz4Ydlly1OsnQK7g0rh1ltwsJi/eJhAiuhItO8qSHYXkbPhkEEIEcXUhS6oYm9M0DUVFNYYeN+Tkyy37GqNs/ToNjScsQ0UUa5se9/uv0xqNS6Dg1sUsefUmgdaZLy3lvw0vj5PhIJjh4JDkNDRYSG6JEshvKRnuf/wEyBmL6sMnmEfJA/uH73DNIZKHm8YyloM0DgdpF+Q/gSbGWjAO5Gzg+Q4acW8s7sj34IqDiSIL1K0cdkUHEN9CrAjQWr6jErZoWwo9Va4LUZl28FRHrBViM6xJhX6kqgLn2ERRX4WdtfVKJBERQmV8hGdH+4dvJyfPleJ6EU5qByzKi9Oe5vwSvkI+kmXSLeNpt+2WpTzzhSrGZwrAHmasuxqhFmBqotSwtUqSOgF1BHL0lgNcG2lF1Ik7UsEWXMPIY2lppyOiC3uJBi64ckFZc1P0RRtgSauVCj82tGaYo4scdA5TFeyjwRryipSdogs6Y6zgCiPpKkdKU4V7Hyt0cnnMG53DUoV6Z+keFuy9koay4a53Qnba+qbSFdpcLmJprLaA/g7j89aUdAoAMiUyOGe0G6JubEM3MjLIyUVPMMJiI6ZJZzrM0oMhlZRu/fhRBksGY7olF6TvpP3LLsj0MQjaP6alWDq/Q5L5Qnbz6M2G/D/mqfwPh78AUEsHCLYdpNo8AgAATQcAAFBLAwQUAAgICACrkHJcAAAAAAAAAAAAAAAACwAAAF9yZWxzLy5yZWxzrZLBTsMwDIbve4oq9zXdQAihprtMSLshNB7AJG4btYmjxIPy9kQTEgyNssOOcX5//mKl3kxuLN4wJkteiVVZiQK9JmN9p8TL/nF5LzbNon7GEThHUm9DKnKPT0r0zOFByqR7dJBKCujzTUvRAedj7GQAPUCHcl1VdzL+ZIjmhFnsjBJxZ1ai2H8EvIRNbWs1bkkfHHo+M+JXIpMhdshKTKN8pzi8Eg1lhgp53mV9ucvf75QOGQwwSE0RlyHm7sgW07eOIf2Uy+mYmBO6ueZycGL0Bs28EoQwZ3R7TSN9SEzunxUdM19Ki1qe/MvmE1BLBwiFmjSa7gAAAM4CAABQSwMEFAAICAgAq5ByXAAAAAAAAAAAAAAAABEAAABkb2NQcm9wcy9jb3JlLnhtbJ1Sy26DMBC89yuQ72AIahQhIFJb5dRIlZKoVW+u2RC3xli2E8Lf1zaBvnLqbXdmPPtyvjw3PDiB0qwVBUqiGAUgaFsxURdot12FCxRoQ0RFeCugQD1otCxvcioz2ip4Uq0EZRjowBoJnVFZoIMxMsNY0wM0REdWISy5b1VDjE1VjSWhH6QGPIvjOW7AkIoYgp1hKCdHdLGs6GQpj4p7g4pi4NCAMBonUYK/tAZUo68+8Mw3ZcNML+GqdCQn9VmzSdh1XdSlXmr7T/DL+nHjRw2ZcKuigMr80khGFRADVWANsqHcyDyn9w/bFSpn8WwexmmYLLbJIotvsyR9zfGv985wiFtVuoXK/sydagKdoAJNFZPG3rL05A/A5pyI+mgXX4IIdxsvmSB3Uk60Wdvj7xlUd731uIKNnTUX7N+jjQa+soITc3+wjH3RKXVd6+PbO1AzjDQlNjbMcBjgMfzzL8tPUEsHCFiWLXNhAQAA4wIAAFBLAwQUAAgICACrkHJcAAAAAAAAAAAAAAAAEAAAAGRvY1Byb3BzL2FwcC54bWydkMFuwjAMhu97iiri2iZEHUMoDdo07YS0HTq0W5UlLmRqk6hxUXn7BdCA83yyf1uf7V+sp77LDjBE611F5gUjGTjtjXW7inzWb/mSZBGVM6rzDipyhEjW8kF8DD7AgBZilgguVmSPGFaURr2HXsUitV3qtH7oFaZy2FHftlbDq9djDw4pZ2xBYUJwBkwerkByIa4O+F+o8fp0X9zWx5B4UtTQh04hSEFvae1RdbXtQbIkXwvxHEJntcLkiNzY7wHezysoLwtePBV8trFunJqv5aJZlNndRJN++AGNtORs9jLazuRc0Hvcib29mC3njwVLcR740wS9+Sp/AVBLBwhelgGP+wAAAJwBAABQSwMEFAAICAgAq5ByXAAAAAAAAAAAAAAAABMAAABkb2NQcm9wcy9jdXN0b20ueG1snc6xCsIwFIXh3acI2dtUB5HStIs4O1T3kN62AXNvyE2LfXsjgu6Ohx8+TtM9/UOsENkRarkvKykALQ0OJy1v/aU4ScHJ4GAehKDlBiy7dtdcIwWIyQGLLCBrOacUaqXYzuANlzljLiNFb1KecVI0js7CmeziAZM6VNVR2YUT+SJ8Ofnx6jX9Sw5k3+/43m8he22jfmfbF1BLBwjh1gCAlwAAAPEAAABQSwMEFAAICAgAq5ByXAAAAAAAAAAAAAAAABMAAABbQ29udGVudF9UeXBlc10ueG1svVXJTsMwEL33KyJfUeKWA0IobQ8sR6hEOSNjTxLTeJHtlvbvGSdQldKFKhWXWPHMW2YysfPxUtXJApyXRg/JIOuTBDQ3QupySF6mD+k1GY96+XRlwSeYq/2QVCHYG0o9r0AxnxkLGiOFcYoFfHUltYzPWAn0st+/otzoADqkIXKQUX4HBZvXIblf4nari3CS3LZ5UWpImLW15CxgmMYo3YlzUPsDwIUWW+7SL2cZIpscX0nrL/YrWF1uCUgVK4v7uxHvFnZDmgBinrDdTgpIJsyFR6YwgS5r+hqLoR/Gzd6MmWVoKTtzeXuENyVPUzNFITkIw+cKIZm3DpjwFUBA882aKSb1Ef2AYwTtc9DZQ0NzRNCHVQ3+3OU2pH9odQPwtFm61/vTxJr/WAcq5kA8B4e/+dkbscl9yEc78P8x5Oh04oz1eBQ5OL3cb72ITi0SgQvy8LdeKyJ15/5CPFwEiFO1+dwHozrLtzS/xXs5ba6F0SdQSwcIKJkGmHMBAABFBgAAUEsBAhQAFAAICAgAq5ByXL7QOhngAAAAqQIAABoAAAAAAAAAAAAAAAAAAAAAAHhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzUEsBAhQAFAAICAgAq5ByXDLcj4b8AQAAcAMAAA8AAAAAAAAAAAAAAAAAKAEAAHhsL3dvcmtib29rLnhtbFBLAQIUABQACAgIAKuQclw7od8K9AIAAAINAAATAAAAAAAAAAAAAAAAAGEDAAB4bC90aGVtZS90aGVtZTEueG1sUEsBAhQAFAAICAgAq5ByXCyw6z9uBQAAbkkAAA0AAAAAAAAAAAAAAAAAlgYAAHhsL3N0eWxlcy54bWxQSwECFAAUAAgICACrkHJcfgq2E7QHAACjJwAAGAAAAAAAAAAAAAAAAAA/DAAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1sUEsBAhQAFAAICAgAq5ByXLYdpNo8AgAATQcAABQAAAAAAAAAAAAAAAAAORQAAHhsL3NoYXJlZFN0cmluZ3MueG1sUEsBAhQAFAAICAgAq5ByXIWaNJruAAAAzgIAAAsAAAAAAAAAAAAAAAAAtxYAAF9yZWxzLy5yZWxzUEsBAhQAFAAICAgAq5ByXFiWLXNhAQAA4wIAABEAAAAAAAAAAAAAAAAA3hcAAGRvY1Byb3BzL2NvcmUueG1sUEsBAhQAFAAICAgAq5ByXF6WAY/7AAAAnAEAABAAAAAAAAAAAAAAAAAAfhkAAGRvY1Byb3BzL2FwcC54bWxQSwECFAAUAAgICACrkHJc4dYAgJcAAADxAAAAEwAAAAAAAAAAAAAAAAC3GgAAZG9jUHJvcHMvY3VzdG9tLnhtbFBLAQIUABQACAgIAKuQclwomQaYcwEAAEUGAAATAAAAAAAAAAAAAAAAAI8bAABbQ29udGVudF9UeXBlc10ueG1sUEsFBgAAAAALAAsAwQIAAEMdAAAAAA==";

function downloadRosterTemplate(){
  const bytes=atob(ROSTER_TEMPLATE_B64);
  const arr=new Uint8Array(bytes.length);
  for(let i=0;i<bytes.length;i++) arr[i]=bytes.charCodeAt(i);
  const blob=new Blob([arr],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download="CoachIQ_Roster_Template.xlsx"; a.click();
  URL.revokeObjectURL(url);
}

function parseRosterSpreadsheet(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=(e)=>{
      try{
        const wb=XLSX.read(e.target.result,{type:"binary"});
        const ws=wb.Sheets["Roster"];
        if(!ws) throw new Error("Missing 'Roster' sheet — make sure you're using the CoachIQ roster template");
        // Rows start at row 6 (0-indexed row 5) after title/subtitle/spacer/header/hint
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
        const players=[];
        const VALID_POS=["GK","CB","FB","DM","CM","W","ST"];
        for(let ri=5;ri<rows.length;ri++){
          const row=rows[ri];
          const num=parseInt(row[0]);
          const name=String(row[1]||"").trim();
          const pos=String(row[2]||"").trim().toUpperCase();
          const cap=String(row[3]||"").trim().toLowerCase();
          if(!name||!pos||!VALID_POS.includes(pos)) continue;
          players.push({
            id:`p${Date.now()}-${ri}`,
            name,
            number: isNaN(num)?0:num,
            position: [pos],
            captain: cap==="yes"||cap==="true",
          });
        }
        if(players.length===0) throw new Error("No valid players found — check that Name and Position columns are filled in");
        resolve(players);
      }catch(err){reject(err);}
    };
    reader.onerror=()=>reject(new Error("Failed to read file"));
    reader.readAsBinaryString(file);
  });
}

// mutable squad ref — updated by App when roster changes
let PLAYERS = DEFAULT_PLAYERS;

// Derive passesAttempted from passesCompleted + passesIncomplete (live entry mode)
// Falls back to stored passesAttempted for imported/spreadsheet stats
function enrichStats(s){
  if(!s) return s;
  if(typeof s.passesIncomplete === "number"){
    return {...s, passesAttempted:(s.passesCompleted||0)+(s.passesIncomplete||0)};
  }
  return s;
}

// ─── STATS FACTORY ───────────────────────────────────────────────────────────
// goals,assists,shots,shotsOT,passComp,passAtt,tackles,inter,fouls,saves,mins,
// keyPasses,aerialWon,bigChancesMissed,dangerousTurnovers,goalsConceded
const mk = (
  pid,g=0,a=0,sh=0,sot=0,pc=0,pa=0,ta=0,int=0,fo=0,sv=0,min=90,
  kp=0,aw=0,bcm=0,dt=0,gc=0
) => ({
  playerId:pid,goals:g,assists:a,shots:sh,shotsOnTarget:sot,
  passesCompleted:pc,passesAttempted:pa,tackles:ta,interceptions:int,
  fouls:fo,saves:sv,minutesPlayed:min,
  keyPasses:kp,aerialDuelsWon:aw,bigChancesMissed:bcm,
  dangerousTurnovers:dt,goalsConceded:gc,
});

const GAMES = [
  { id:"g1", date:"2026-03-08", opponent:"City FC",   location:"Home", formation:"4-3-3",
    ourScore:3, theirScore:1, status:"completed", stats:[
      mk("p1",  0,0,0,0, 28,35, 0,2,0,5,90, 0,0,0,1,1),
      mk("p2",  0,1,1,0, 41,48, 4,3,1,0,90, 2,1,0,0,0),
      mk("p3",  0,0,0,0, 45,52, 5,2,0,0,90, 0,4,0,0,0),
      mk("p4",  0,0,1,1, 38,44, 3,4,1,0,90, 0,5,0,1,0),
      mk("p5",  0,0,0,0, 43,50, 4,2,1,0,90, 1,1,0,0,0),
      mk("p6",  1,1,4,2, 52,61, 3,2,1,0,90, 2,0,0,0,0),
      mk("p7",  0,1,3,2, 60,68, 2,1,2,0,90, 3,0,0,0,0),
      mk("p8",  1,0,5,3, 58,65, 4,3,0,0,90, 2,0,0,0,0),
      mk("p9",  0,0,2,1, 44,53, 3,2,1,0,77, 2,0,0,1,0),
      mk("p10", 1,0,6,4, 22,28, 1,0,1,0,90, 1,0,1,0,0),
      mk("p11", 0,1,4,2, 25,31, 1,1,0,0,90, 2,0,0,0,0),
      mk("p12", 0,0,3,1, 18,24, 0,0,2,0,68, 0,0,1,1,0),
    ]},
  { id:"g2", date:"2026-03-01", opponent:"United SC", location:"Away", formation:"4-3-3",
    ourScore:1, theirScore:1, status:"completed", stats:[
      mk("p1",  0,0,0,0, 22,30, 0,1,0,7,90, 0,0,0,2,1),
      mk("p2",  0,0,0,0, 36,45, 3,2,2,0,90, 0,2,0,1,0),
      mk("p3",  0,0,0,0, 40,49, 4,3,0,0,90, 0,4,0,0,0),
      mk("p4",  0,0,0,0, 34,43, 3,3,2,0,90, 0,3,0,1,0),
      mk("p5",  0,0,0,0, 38,47, 3,1,2,0,90, 0,1,0,1,0),
      mk("p6",  0,0,3,1, 46,58, 2,2,2,0,90, 1,0,0,1,0),
      mk("p7",  1,0,4,3, 54,63, 2,1,1,0,90, 2,0,0,0,0),
      mk("p8",  0,1,2,1, 51,62, 3,2,1,0,90, 2,0,0,1,0),
      mk("p9",  0,0,1,0, 38,48, 2,1,3,0,90, 1,0,0,2,0),
      mk("p10", 0,0,4,2, 18,26, 1,0,2,0,83, 1,0,2,0,0),
      mk("p11", 0,0,3,1, 20,28, 1,0,1,0,90, 1,0,0,1,0),
      mk("p12", 0,0,2,1, 14,20, 0,0,1,0,62, 0,0,1,1,0),
    ]},
  { id:"g3", date:"2026-02-22", opponent:"Eagles FC", location:"Home", formation:"4-4-2",
    ourScore:2, theirScore:0, status:"completed", stats:[
      mk("p1",  0,0,0,0, 30,38, 0,2,0,3,90, 0,0,0,0,0),
      mk("p2",  1,0,2,1, 43,50, 5,3,0,0,90, 2,2,0,0,0),
      mk("p3",  0,0,0,0, 47,54, 6,4,1,0,90, 0,5,0,0,0),
      mk("p4",  0,1,0,0, 40,46, 4,5,0,0,90, 0,6,0,0,0),
      mk("p5",  0,0,0,0, 44,51, 4,3,1,0,90, 1,2,0,0,0),
      mk("p6",  1,1,5,3, 55,63, 3,2,0,0,90, 2,0,0,0,0),
      mk("p7",  0,0,2,1, 58,66, 2,2,2,0,90, 2,0,0,0,0),
      mk("p8",  0,1,3,2, 60,68, 5,3,0,0,90, 3,0,0,0,0),
      mk("p9",  0,0,1,1, 46,55, 2,1,1,0,90, 2,0,0,0,0),
      mk("p10", 0,0,5,3, 24,31, 1,0,1,0,90, 1,0,1,0,0),
      mk("p11", 0,0,4,2, 22,29, 0,1,0,0,90, 2,0,0,0,0),
      mk("p12", 0,0,2,0, 16,22, 0,0,1,0,55, 0,0,0,1,0),
    ]},
  { id:"g4", date:"2026-02-15", opponent:"Rovers",    location:"Away", formation:"4-3-3",
    ourScore:0, theirScore:2, status:"completed", stats:[
      mk("p1",  0,0,0,0, 18,27, 0,0,0,2,90, 0,0,0,2,2),
      mk("p2",  0,0,0,0, 30,42, 2,1,3,0,90, 0,1,0,2,0),
      mk("p3",  0,0,0,0, 32,44, 3,2,2,0,90, 0,3,0,1,0),
      mk("p4",  0,0,0,0, 28,40, 2,2,3,0,90, 0,2,0,2,0),
      mk("p5",  0,0,0,0, 31,43, 2,1,2,0,90, 0,1,0,1,0),
      mk("p6",  0,0,2,0, 38,52, 2,1,3,0,90, 0,0,0,2,0),
      mk("p7",  0,0,2,1, 44,58, 1,1,2,0,78, 1,0,0,1,0),
      mk("p8",  0,0,1,0, 42,55, 3,2,1,0,90, 1,0,0,1,0),
      mk("p9",  0,0,2,1, 34,46, 1,1,2,0,90, 1,0,0,2,0),
      mk("p10", 0,0,3,1, 14,22, 0,0,1,0,90, 0,0,2,0,0),
      mk("p11", 0,0,2,0, 16,24, 0,0,2,0,90, 0,0,0,1,0),
      mk("p12", 0,0,1,0, 10,17, 0,0,1,0,45, 0,0,1,0,0),
    ]},
  { id:"g5", date:"2026-02-08", opponent:"Metro SC",  location:"Home", formation:"4-3-3",
    ourScore:4, theirScore:2, status:"completed", stats:[
      mk("p1",  0,0,0,0, 25,33, 0,1,0,4,90, 0,0,0,1,2),
      mk("p2",  0,1,1,0, 46,53, 5,3,0,0,90, 2,2,0,0,0),
      mk("p3",  0,0,0,0, 49,55, 6,4,0,0,90, 0,4,0,0,0),
      mk("p4",  0,0,0,0, 42,49, 4,4,0,0,90, 0,5,0,0,0),
      mk("p5",  0,0,0,0, 45,52, 4,3,1,0,90, 1,2,0,0,0),
      mk("p6",  1,1,5,4, 58,66, 3,2,0,0,90, 2,0,0,0,0),
      mk("p7",  0,2,3,2, 63,71, 2,2,1,0,90, 4,0,0,0,0),
      mk("p8",  1,0,4,3, 62,70, 4,3,0,0,90, 2,0,0,0,0),
      mk("p9",  0,0,2,1, 48,57, 3,2,1,0,90, 2,0,0,0,0),
      mk("p10", 2,0,8,5, 26,33, 1,0,0,0,90, 1,0,0,0,0),
      mk("p11", 0,0,3,2, 24,31, 1,0,1,0,90, 2,0,0,0,0),
      mk("p12", 0,0,2,1, 18,25, 0,0,0,0,72, 1,0,1,0,0),
    ]},
  { id:"g6", date:"2026-02-01", opponent:"Rapids",    location:"Home", formation:"4-3-3",
    ourScore:2, theirScore:1, status:"completed", stats:[
      mk("p1",  0,0,0,0, 26,34, 0,2,0,5,90, 0,0,0,0,1),
      mk("p2",  0,0,0,0, 42,50, 4,3,1,0,90, 1,2,0,0,0),
      mk("p3",  1,0,2,1, 45,52, 5,3,0,0,90, 0,3,0,0,0),
      mk("p4",  0,0,0,0, 39,46, 4,4,0,0,90, 0,4,0,0,0),
      mk("p5",  0,0,0,0, 43,50, 3,3,1,0,90, 0,2,0,0,0),
      mk("p6",  0,1,3,2, 53,62, 3,2,1,0,90, 2,0,0,1,0),
      mk("p7",  0,0,2,1, 58,67, 2,1,2,0,90, 2,0,0,0,0),
      mk("p8",  1,1,4,3, 59,68, 4,3,0,0,90, 3,0,0,0,0),
      mk("p9",  0,0,1,1, 44,54, 3,2,1,0,90, 1,0,0,1,0),
      mk("p10", 0,0,5,3, 22,30, 1,0,1,0,90, 1,0,1,0,0),
      mk("p11", 0,0,3,2, 22,29, 1,1,0,0,82, 2,0,0,0,0),
      mk("p12", 0,0,2,1, 16,23, 0,0,0,0,60, 0,0,0,0,0),
    ]},
  { id:"g7", date:"2026-01-25", opponent:"FC Atlas",  location:"Away", formation:"4-4-2",
    ourScore:2, theirScore:2, status:"completed", stats:[
      mk("p1",  0,0,0,0, 23,31, 0,1,0,6,90, 0,0,0,1,2),
      mk("p2",  0,0,0,0, 38,47, 3,2,2,0,90, 0,1,0,1,0),
      mk("p3",  0,0,0,0, 41,50, 4,3,1,0,90, 0,4,0,0,0),
      mk("p4",  0,0,0,0, 36,45, 3,3,2,0,90, 0,3,0,1,0),
      mk("p5",  0,0,0,0, 39,48, 3,2,2,0,90, 0,1,0,0,0),
      mk("p6",  1,0,4,2, 50,60, 2,2,1,0,90, 1,0,0,1,0),
      mk("p7",  0,1,3,2, 55,64, 2,1,1,0,90, 3,0,0,0,0),
      mk("p8",  0,0,2,1, 54,63, 3,2,0,0,90, 2,0,0,0,0),
      mk("p9",  0,0,1,0, 40,51, 2,1,2,0,90, 1,0,0,2,0),
      mk("p10", 1,0,5,3, 20,27, 1,0,1,0,90, 1,0,1,0,0),
      mk("p11", 0,0,3,2, 21,28, 0,0,1,0,90, 1,0,0,0,0),
      mk("p12", 0,0,1,0, 13,19, 0,0,0,0,60, 0,0,0,1,0),
    ]},
];

// ═══════════════════════════════════════════════════════════════════════════════
// RATING ENGINE
// Spec: Match Rating = 6.0 + Attack + Possession + Defensive + Bonus − Errors
// Caps: Attack ≤ 2.5 | Possession ≤ 1.5 | Defensive ≤ 2.0 | Bonus ≤ 1.0 | Errors ≥ −3.0
// Scale: 9–10 Dominant | 8–8.9 Excellent | 7–7.9 Strong | 6–6.9 Solid | 5–5.9 Below Par | <5 Poor
// ═══════════════════════════════════════════════════════════════════════════════
function calcRating(s, position, cleanSheet = false) {
  if (!s) return { rating:6.0, label:"Solid", coachNote:"No data.", breakdown:{attack:0,possession:0,defensive:0,bonus:0,errors:0} };

  const pa  = s.passesAttempted    || 0;
  const pc  = s.passesCompleted    || 0;
  const pct = pa > 0 ? pc / pa : 0;   // 0–1 pass completion rate
  const kp  = s.keyPasses          || 0;
  const aw  = s.aerialDuelsWon     || 0;
  const bcm = s.bigChancesMissed   || 0;
  const dt  = s.dangerousTurnovers || 0;
  const gc  = s.goalsConceded      || 0;

  let attack = 0, possession = 0, defensive = 0, bonus = 0, errors = 0;

  // ─────────────────────────────────────────────────────────────────────────
  // GOALKEEPER
  // Shot-Stopping → attack bucket | Distribution → possession | Command → defensive
  // ─────────────────────────────────────────────────────────────────────────
  if (position === "GK") {
    // Shot-Stopping
    attack += s.saves * 0.35;
    attack -= gc * 0.40;
    // Distribution
    possession += pc * 0.02;
    if      (pct > 0.85) possession += 0.20;
    else if (pct > 0.75) possession += 0.10;
    possession -= dt * 0.25;
    // Command (interceptions used as cross-claim / sweep proxy)
    defensive += s.interceptions * 0.20;
    // Bonus
    if (cleanSheet) bonus += 0.75;
    // Errors (-0.50 per major handling mistake — mapped via fouls field)
    errors -= s.fouls * 0.50;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CENTER BACK
  // ─────────────────────────────────────────────────────────────────────────
  else if (position === "CB") {
    // Defending
    defensive += s.tackles       * 0.25;
    defensive += s.interceptions * 0.20;
    // Aerial / Recovery
    defensive += aw * 0.20;
    // Possession
    possession += pc * 0.015;
    if      (pct > 0.88) possession += 0.25;
    else if (pct > 0.80) possession += 0.15;
    possession -= dt * 0.20;
    // Bonus
    if (cleanSheet) bonus += 0.50;
    bonus += s.assists * 0.40;
    bonus += s.goals   * 0.75;
    // Errors
    errors -= s.fouls * 0.15;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FULLBACK / WINGBACK
  // ─────────────────────────────────────────────────────────────────────────
  else if (position === "FB") {
    // Defending
    defensive += s.tackles       * 0.25;
    defensive += s.interceptions * 0.20;
    // Possession
    possession += pc * 0.015;
    if      (pct > 0.85) possession += 0.20;
    else if (pct > 0.78) possession += 0.12;
    possession -= dt * 0.20;
    // Attacking Support
    attack += kp           * 0.20;
    attack += s.assists    * 0.40;
    attack += s.shotsOnTarget * 0.10;
    // Bonus
    if (cleanSheet) bonus += 0.25;
    bonus += s.goals * 0.75;
    // Errors (-0.50 beaten badly → mapped via fouls; -1.00 error leading to goal not separately tracked)
    errors -= s.fouls * 0.15;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DEFENSIVE MIDFIELDER
  // ─────────────────────────────────────────────────────────────────────────
  else if (position === "DM") {
    // Ball Winning
    defensive += s.tackles       * 0.25;
    defensive += s.interceptions * 0.20;
    // Possession Control
    possession += pc * 0.015;
    if      (pct > 0.90) possession += 0.30;
    else if (pct > 0.82) possession += 0.20;
    possession -= dt   * 0.20;
    errors     -= s.fouls * 0.10;   // careless foul in bad area
    // Progression (key pass covers line-breaking / switches)
    attack += kp * 0.20;
    // Bonus
    bonus += s.assists * 0.40;
    bonus += s.goals   * 0.60;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CENTRAL / ATTACKING MIDFIELDER
  // ─────────────────────────────────────────────────────────────────────────
  else if (position === "CM") {
    // Creation
    attack += kp              * 0.25;
    attack += s.assists       * 0.40;
    attack += s.shotsOnTarget * 0.20;
    attack += s.goals         * 0.75;
    // Possession
    possession += pc * 0.015;
    if      (pct > 0.88) possession += 0.25;
    else if (pct > 0.80) possession += 0.15;
    possession -= dt * 0.20;
    // Defensive Work
    defensive += s.tackles       * 0.15;
    defensive += s.interceptions * 0.15;
    // Errors (repeated giveaways / turnovers)
    errors -= dt    * 0.25;   // -0.75 / 3 turnovers ≈ the spec's "turnover leading to major chance"
    errors -= s.fouls * 0.10;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WINGER
  // ─────────────────────────────────────────────────────────────────────────
  else if (position === "W") {
    // Attacking Output
    attack += s.goals         * 0.75;
    attack += s.assists       * 0.40;
    attack += kp              * 0.25;
    attack += s.shotsOnTarget * 0.15;
    // Efficiency (pass completion tiers)
    possession += pc * 0.01;
    if      (pct > 0.85) possession += 0.25;
    else if (pct > 0.75) possession += 0.15;
    possession -= dt * 0.20;
    // Defensive Effort
    defensive += s.tackles       * 0.10;
    defensive += s.interceptions * 0.10;
    errors -= dt  * 0.10;   // repeated poor decisions killing attacks
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STRIKER
  // ─────────────────────────────────────────────────────────────────────────
  else if (position === "ST") {
    // Finishing
    attack += s.goals         * 1.00;
    attack += s.shotsOnTarget * 0.20;
    // Link Play
    attack += s.assists * 0.20;
    attack += kp        * 0.20;         // key pass = big chance created proxy
    possession += pc * 0.015;
    if (pct > 0.75) possession += 0.15;
    // Errors
    errors -= dt      * 0.20;   // repeated dispossession
    errors -= s.fouls * 0.10;
  }

  // ─── APPLY CAPS ──────────────────────────────────────────────────────────
  attack     = Math.min(attack,     2.5);
  possession = Math.min(possession, 1.5);
  defensive  = Math.min(defensive,  2.0);
  bonus      = Math.min(bonus,      1.0);
  errors     = Math.max(errors,    -3.0);

  const raw    = 6.0 + attack + possession + defensive + bonus + errors;
  const rating = Math.min(10.0, Math.max(1.0, Math.round(raw * 10) / 10));

  // ─── LABEL ───────────────────────────────────────────────────────────────
  const label =
    rating >= 9.0 ? "Dominant"  :
    rating >= 8.0 ? "Excellent" :
    rating >= 7.0 ? "Strong"    :
    rating >= 6.0 ? "Solid"     :
    rating >= 5.0 ? "Below Par" : "Poor";

  // ─── COACH NOTE (mirrors spec output format) ──────────────────────────────
  // e.g. "Strong defensive performance, excellent passing security, limited attacking impact.
  //       Improvement area: reduce dangerous giveaways under pressure."
  const strengths = [], concerns = [];

  if (defensive >= 1.0)      strengths.push("strong defensive performance");
  else if (defensive >= 0.5) strengths.push("decent defensive contribution");

  if (possession >= 1.0)      strengths.push("excellent passing security");
  else if (possession >= 0.5) strengths.push("solid ball retention");
  else if (possession < 0.1 && pa > 15) concerns.push("passing security needs work");

  if (attack >= 1.5)      strengths.push("excellent attacking contribution");
  else if (attack >= 0.8) strengths.push("positive attacking presence");
  else if (attack <= 0.2 && ["W","ST","CM","FB"].includes(position))
    concerns.push("limited attacking impact this match");

  if (cleanSheet && ["GK","CB","FB"].includes(position)) strengths.push("clean sheet kept");

  if (dt >= 2)        concerns.push("reduce dangerous giveaways under pressure");
  if (errors <= -0.5) concerns.push("cut out costly mistakes");

  if (strengths.length === 0 && concerns.length === 0)
    strengths.push("met positional requirements at an acceptable level");

  const mainLine    = strengths.length ? capitalise(strengths.join(", ")) + "." : "";
  const improveLine = concerns.length  ? `Improvement area: ${concerns.join("; ")}.` : "";
  const coachNote   = [mainLine, improveLine].filter(Boolean).join(" ");

  return {
    rating,
    label,
    coachNote,
    breakdown: {
      attack:     round2(attack),
      possession: round2(possession),
      defensive:  round2(defensive),
      bonus:      round2(bonus),
      errors:     round2(errors),
    },
  };
}

function round2(n) { return Math.round(n * 100) / 100; }
function capitalise(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const isCS      = (game, pid) => ["GK","CB","FB"].includes(primaryPos(PLAYERS.find(p=>p.id===pid))) && game.theirScore === 0;
const rColor    = r => r>=8.5?"#ff6b00":r>=7.5?"#ff8c00":r>=6.5?"#ffb300":r>=5.5?"#ff4500":"#cc1100";

function getHistory(pid, games) {
  const player = PLAYERS.find(p=>p.id===pid);
  return games.filter(g=>g.status==="completed").map(g=>{
    const st = g.stats.find(s=>s.playerId===pid); if (!st) return null;
    const res = calcRating(st, primaryPos(player), isCS(g,pid));
    return {...st,...res,date:g.date,opponent:g.opponent,gameId:g.id};
  }).filter(Boolean);
}

function formTrend(pid, games){
  // Compare last 3 games avg vs previous 3 games avg
  const hist = getHistory(pid, games);
  if(hist.length < 2) return null;
  const last3 = hist.slice(0,3);
  const prev3 = hist.slice(3,6);
  const lastAvg = last3.reduce((a,h)=>a+h.rating,0)/last3.length;
  if(prev3.length===0) return null;
  const prevAvg = prev3.reduce((a,h)=>a+h.rating,0)/prev3.length;
  const diff = lastAvg - prevAvg;
  if(diff > 0.3)  return "up";
  if(diff < -0.3) return "down";
  return "flat";
}

function avgRating(pid, games) {
  const h = getHistory(pid, games); if (!h.length) return 0;
  return Math.round((h.reduce((a,x)=>a+x.rating,0)/h.length)*10)/10;
}

function teamSum(games) {
  const d=games.filter(g=>g.status==="completed");
  const w=d.filter(g=>g.ourScore>g.theirScore).length;
  const dr=d.filter(g=>g.ourScore===g.theirScore).length;
  const l=d.filter(g=>g.ourScore<g.theirScore).length;
  return {played:d.length,wins:w,draws:dr,losses:l,
    goalsFor:d.reduce((a,g)=>a+g.ourScore,0),
    goalsAgainst:d.reduce((a,g)=>a+g.theirScore,0),
    points:w*3+dr};
}

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
function Tag({children,color}){
  return <span style={{background:color+"22",color,border:`1px solid ${color}44`,borderRadius:4,padding:"2px 8px",fontSize:11,fontWeight:700,letterSpacing:.8,whiteSpace:"nowrap"}}>{children}</span>;
}
function Badge({label,value,icon:Icon,accent}){
  return(
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",display:"flex",flexDirection:"column",gap:5,flex:1,minWidth:86}}>
      <div style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:1,textTransform:"uppercase",display:"flex",alignItems:"center",gap:4}}>
        {Icon&&<Icon size={11}/>}{label}
      </div>
      <div style={{color:accent||C.text,fontSize:26,fontWeight:900,fontFamily:"'Oswald',sans-serif",lineHeight:1}}>{value}</div>
    </div>
  );
}
function RBar({value}){
  const col=rColor(value),pct=((value-1)/9)*100;
  return(
    <div style={{background:"#2a1000",borderRadius:99,height:7,overflow:"hidden"}}>
      <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${col}88,${col})`,borderRadius:99,transition:"width .6s"}}/>
    </div>
  );
}

// Breakdown bars — the 5 score categories
function BreakdownBars({breakdown}){
  const cats=[
    {k:"attack",    label:"Attack",    max:2.5,col:"#ef5350"},
    {k:"possession",label:"Possession",max:1.5,col:"#ff8c00"},
    {k:"defensive", label:"Defence",   max:2.0,col:"#42a5f5"},
    {k:"bonus",     label:"Bonus",     max:1.0,col:"#00e676"},
    {k:"errors",    label:"Errors",    max:1.0,col:"#ffa726",neg:true},
  ];
  return(
    <div style={{display:"flex",flexDirection:"column",gap:7}}>
      {cats.map(cat=>{
        const val=breakdown[cat.k]||0,abs=Math.abs(val),pct=Math.min((abs/cat.max)*100,100);
        const barCol=cat.neg&&val<0?`linear-gradient(90deg,${cat.col}88,${cat.col})`
                    :!cat.neg?`linear-gradient(90deg,${cat.col}88,${cat.col})`:"transparent";
        return(
          <div key={cat.k} style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:C.muted,fontSize:10,fontWeight:600,width:64,flexShrink:0}}>{cat.label}</span>
            <div style={{background:"#2a1000",borderRadius:99,height:6,flex:1,overflow:"hidden"}}>
              <div style={{width:`${pct}%`,height:"100%",background:barCol,borderRadius:99}}/>
            </div>
            <span style={{color:cat.neg&&val<0?C.danger:C.text,fontSize:10,fontWeight:700,width:38,textAlign:"right"}}>
              {val>0?`+${val.toFixed(2)}`:val.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function DashboardView({games,setView,teamName}){
  const ts=teamSum(games);
  const done=games.filter(g=>g.status==="completed");

  const top=useMemo(()=>
    PLAYERS.map(p=>({...p,avg:avgRating(p.id,games)})).sort((a,b)=>b.avg-a.avg).slice(0,5)
  ,[games]);

  const trend=useMemo(()=>done.slice(0,6).reverse().map(g=>({
    name:`vs ${g.opponent.split(" ")[0]}`,goalsFor:g.ourScore,goalsAgainst:g.theirScore,
  })),[done]);

  const scorers=useMemo(()=>{
    const acc={};
    done.forEach(g=>g.stats.forEach(s=>{acc[s.playerId]=(acc[s.playerId]||0)+s.goals;}));
    return Object.entries(acc).map(([pid,g])=>({name:PLAYERS.find(p=>p.id===pid)?.name?.split(" ")[1]||pid,goals:g})).sort((a,b)=>b.goals-a.goals).slice(0,6);
  },[done]);

  const insights=useMemo(()=>{
    const gf=ts.goalsFor/(ts.played||1),ga=ts.goalsAgainst/(ts.played||1);
    const list=[];
    if(gf>=2.5) list.push({t:"positive",txt:`Strong attack averaging ${gf.toFixed(1)} goals per game`});
    else list.push({t:"warning",txt:`Attack underperforming — only ${gf.toFixed(1)} goals/game`});
    if(ga<=1.2) list.push({t:"positive",txt:`Solid defence — conceding just ${ga.toFixed(1)}/game`});
    else list.push({t:"negative",txt:`Defence leaking ${ga.toFixed(1)} goals per game — needs work`});
    const under=top.find(p=>p.avg<6.5);
    if(under) list.push({t:"warning",txt:`${under.name} averaging below 6.5 — flag for training`});
    if(top[0]?.avg>=7.5) list.push({t:"positive",txt:`${top[0].name} is most consistent this season (${top[0].avg})`});
    return list;
  },[ts,top]);

  return(
    <div style={{padding:20,maxWidth:920,margin:"0 auto"}}>
      <div style={{marginBottom:22}}>
        <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2}}>SEASON OVERVIEW</div>
        <h1 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:30,fontWeight:800,lineHeight:1.1,marginTop:4}}>Marion FC Dashboard</h1>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
        <Badge label="Wins"       value={ts.wins}          accent={C.accent}/>
        <Badge label="Draws"      value={ts.draws}         accent={C.warning}/>
        <Badge label="Losses"     value={ts.losses}        accent={C.danger}/>
        <Badge label="Goals For"  value={ts.goalsFor}     icon={Target} accent={C.accent2}/>
        <Badge label="Goals Agst" value={ts.goalsAgainst}  accent={C.muted}/>
      </div>
      <div className="resp-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px"}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>GOALS TREND</div>
          <ResponsiveContainer width="100%" height={145}>
            <AreaChart data={trend} margin={{top:4,right:4,left:-22,bottom:0}}>
              <defs>
                <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff6b00" stopOpacity={.4}/><stop offset="100%" stopColor="#ff6b00" stopOpacity={0}/></linearGradient>
                <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff2200" stopOpacity={.4}/><stop offset="100%" stopColor="#ff2200" stopOpacity={0}/></linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12}}/>
              <Area type="monotone" dataKey="goalsFor"     stroke={C.accent} fill="url(#gf)" strokeWidth={2} name="Scored"/>
              <Area type="monotone" dataKey="goalsAgainst" stroke={C.danger} fill="url(#ga)" strokeWidth={2} name="Conceded"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px"}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>TOP SCORERS</div>
          <ResponsiveContainer width="100%" height={145}>
            <BarChart data={scorers} layout="vertical" margin={{top:0,right:4,left:4,bottom:0}}>
              <XAxis type="number" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="name" tick={{fill:C.text,fontSize:11}} axisLine={false} tickLine={false} width={70}/>
              <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12}}/>
              <Bar dataKey="goals" fill={C.accent} radius={[0,4,4,0]} name="Goals"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="resp-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1}}>TOP PERFORMERS</div>
            <button onClick={()=>setView("players")} style={{color:C.accent,background:"none",border:"none",cursor:"pointer",fontSize:11,fontWeight:700}}>See all →</button>
          </div>
          {top.map((p,i)=>(
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <span style={{color:C.muted,fontSize:12,fontWeight:700,width:18,textAlign:"center"}}>{i+1}</span>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{color:C.text,fontSize:13,fontWeight:600}}>{p.name}</span>
                    <Tag color={posColor(p.position)}>{p.position}</Tag>
                  </div>
                  <span style={{color:rColor(p.avg),fontWeight:900,fontFamily:"'Oswald',sans-serif",fontSize:16}}>{p.avg.toFixed(1)}</span>
                </div>
                <RBar value={p.avg}/>
              </div>
            </div>
          ))}
        </div>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:14,display:"flex",alignItems:"center",gap:6}}>
            <Activity size={12}/>COACHING INSIGHTS
          </div>
          {insights.map((ins,i)=>{
            const ic=ins.t==="positive"?C.accent:ins.t==="negative"?C.danger:C.warning;
            return(
              <div key={i} style={{background:ic+"11",border:`1px solid ${ic}33`,borderRadius:10,padding:"10px 12px",display:"flex",gap:8,marginBottom:8}}>
                {ins.t==="positive"?<Check size={13} color={ic} style={{marginTop:2,flexShrink:0}}/>:<AlertTriangle size={13} color={ic} style={{marginTop:2,flexShrink:0}}/>}
                <span style={{color:C.text,fontSize:13,lineHeight:1.4}}>{ins.txt}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── SPREADSHEET PARSER ───────────────────────────────────────────────────────
const SHEET_STAT_MAP = [
  "goals","assists","shots","shotsOnTarget","keyPasses",
  "passesCompleted","passesAttempted","tackles","interceptions",
  "aerialDuelsWon","fouls","dangerousTurnovers","bigChancesMissed",
  "minutesPlayed","saves","goalsConceded",
];

function parseGameSpreadsheet(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type:"binary" });
        const ws1 = wb.Sheets["Game Info"];
        if (!ws1) throw new Error("Missing 'Game Info' sheet");
        const infoRows = XLSX.utils.sheet_to_json(ws1, { header:1, defval:"" });
        const getInfo = (i) => { const v=(infoRows[i]||[])[1]; return (v!==undefined&&v!=="") ? String(v).trim() : null; };
        const opponent   = getInfo(3) || "Unknown";
        const date       = getInfo(4) || new Date().toISOString().split("T")[0];
        const location   = getInfo(5) || "Home";
        const formation  = getInfo(6) || "4-3-3";
        const ourScore   = parseInt(getInfo(7)) || 0;
        const theirScore = parseInt(getInfo(8)) || 0;
        const ws2 = wb.Sheets["Player Stats"];
        if (!ws2) throw new Error("Missing 'Player Stats' sheet");
        const statRows = XLSX.utils.sheet_to_json(ws2, { header:1, defval:0 });
        const stats = [];
        for (let ri = 3; ri <= 14; ri++) {
          const row = statRows[ri]; if (!row) continue;
          const playerNum  = parseInt(row[0]) || 0;
          const playerName = String(row[1] || "").trim();
          const player = PLAYERS.find(p => p.number === playerNum || p.name.toLowerCase() === playerName.toLowerCase());
          if (!player) continue;
          const statObj = { playerId: player.id };
          SHEET_STAT_MAP.forEach((key, i) => {
            const raw = row[i + 3];
            statObj[key] = (raw === "—" || raw === "" || raw === undefined) ? 0 : (parseInt(raw) || 0);
          });
          stats.push(statObj);
        }
        if (stats.length === 0) throw new Error("No player stats found — check the Player Stats sheet");
        resolve({ id:`g${Date.now()}`, opponent, date, location, formation, ourScore, theirScore, status:"completed", stats });
      } catch(err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsBinaryString(file);
  });
}

// ─── GAMES VIEW ───────────────────────────────────────────────────────────────
// ─── PLAYER MODAL ────────────────────────────────────────────────────────────
function PlayerModal({player, onSave, onDelete, onClose}){
  const isNew = !player.id;
  const initPositions = (()=>{
    const p = player.position || player.positions;
    if(Array.isArray(p)&&p.length) return p;
    if(typeof p==="string"&&p) return [p];
    return [];
  })();

  const [form, setForm] = useState({
    id:        player.id       || ("p"+Date.now()),
    name:      player.name     || "",
    number:    player.number   ?? "",
    positions: initPositions,
    captain:   player.captain  || false,
    email:     player.email    || "",
    availability: player.availability || "available",
    availNote:    player.availNote    || "",
    returnDate:   player.returnDate   || "",
    gradYear:     player.gradYear     || "",
    height:       player.height       || "",
    weight:       player.weight       || "",
    gpa:          player.gpa          || "",
    highlightsUrl:    player.highlightsUrl    || "",
    recruitingStatus: player.recruitingStatus || "open",
    recruitingSchools: player.recruitingSchools || [],
    coachScoutNotes:   player.coachScoutNotes  || "",
    videoLinks:        player.videoLinks        || [],
    playerBio:         player.playerBio         || "",
    initialTab:        player.initialTab        || "info",
  });
  const [err, setErr] = useState("");
  const [activeTab, setActiveTab] = useState(player.initialTab||"info");
  const [addingSchool, setAddingSchool] = useState(false);
  const [newSchool, setNewSchool] = useState({school:"",division:"D1",contact:"",status:"identified",notes:""});

  const POSITIONS = ["GK","CB","FB","DM","CM","W","AM","ST"];
  const primaryColor = posColor(form.positions[0]||"CM");

  function togglePos(p){
    setForm(f=>({...f, positions: f.positions.includes(p) ? f.positions.filter(x=>x!==p) : [...f.positions,p]}));
  }

  function addSchool(){
    if(!newSchool.school.trim()) return;
    setForm(f=>({...f, recruitingSchools:[...f.recruitingSchools,{...newSchool,id:"s"+Date.now()}]}));
    setNewSchool({school:"",division:"D1",contact:"",status:"identified",notes:""});
    setAddingSchool(false);
  }

  function removeSchool(id){
    setForm(f=>({...f, recruitingSchools:f.recruitingSchools.filter(s=>s.id!==id)}));
  }

  function save(){
    if(!form.name.trim()){ setErr("Name is required"); return; }
    onSave({
      ...form,
      number: parseInt(form.number)||0,
      position: form.positions,
      positions: form.positions,
    });
  }

  const iStyle = (extra={})=>({
    width:"100%", padding:"9px 12px", background:C.bg,
    border:"1px solid "+C.border, borderRadius:7,
    color:C.text, fontSize:13, outline:"none",
    fontFamily:"'Outfit',sans-serif", boxSizing:"border-box", ...extra
  });

  return(
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:1000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:16,
        width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto",padding:24}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:800}}>
            {isNew?"Add Player":"Edit Player"}
          </h2>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20}}>×</button>
        </div>

        {/* Tabs */}
        {!isNew&&(
          <div style={{display:"flex",gap:0,marginBottom:20,borderBottom:"1px solid "+C.border}}>
            {[{t:"info",l:"Player Info"},{t:"recruiting",l:"Recruiting"}].map(item=>(
              <button key={item.t} onClick={()=>setActiveTab(item.t)}
                style={{padding:"8px 16px",background:"none",border:"none",
                  borderBottom:"2px solid "+(activeTab===item.t?C.accent:"transparent"),
                  color:activeTab===item.t?C.accent:C.muted,cursor:"pointer",
                  fontWeight:700,fontSize:13,marginBottom:-1}}>
                {item.l}
              </button>
            ))}
          </div>
        )}

        {(isNew||activeTab==="info")&&(
          <>
            {/* Jersey preview */}
            <div style={{display:"flex",justifyContent:"center",marginBottom:18}}>
              <div style={{width:64,height:64,borderRadius:14,background:primaryColor+"22",
                border:"3px solid "+primaryColor+"55",display:"flex",alignItems:"center",
                justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:900,
                color:primaryColor,fontSize:28}}>
                {form.number||"#"}
              </div>
            </div>

            <div style={{marginBottom:12}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>NAME</label>
              <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                placeholder="Full name" autoFocus style={iStyle()}/>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <div>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>JERSEY #</label>
                <input type="number" value={form.number} onChange={e=>setForm(f=>({...f,number:e.target.value}))}
                  placeholder="9" style={iStyle()}/>
              </div>
              <div>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>EMAIL</label>
                <input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}
                  placeholder="player@email.com" style={iStyle()}/>
              </div>
            </div>

            <div style={{marginBottom:12}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:8}}>POSITIONS</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {POSITIONS.map(p=>(
                  <button key={p} onClick={()=>togglePos(p)}
                    style={{padding:"6px 12px",borderRadius:7,cursor:"pointer",fontSize:12,fontWeight:700,
                      background:form.positions.includes(p)?posColor(p)+"22":"transparent",
                      border:"1px solid "+(form.positions.includes(p)?posColor(p):C.border),
                      color:form.positions.includes(p)?posColor(p):C.muted}}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div style={{marginBottom:12}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:8}}>AVAILABILITY</label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[["available","Available"],["injured","Injured"],["doubtful","Doubtful"],["suspended","Suspended"]].map(([k,l])=>(
                  <button key={k} onClick={()=>setForm(f=>({...f,availability:k}))}
                    style={{padding:"6px 12px",borderRadius:7,cursor:"pointer",fontSize:12,fontWeight:700,
                      background:form.availability===k?C.accent+"22":"transparent",
                      border:"1px solid "+(form.availability===k?C.accent:C.border),
                      color:form.availability===k?C.accent:C.muted}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div style={{marginBottom:12}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                <input type="checkbox" checked={form.captain}
                  onChange={e=>setForm(f=>({...f,captain:e.target.checked}))}
                  style={{width:16,height:16,accentColor:C.accent}}/>
                <span style={{color:C.text,fontSize:13,fontWeight:600}}>Team Captain</span>
              </label>
            </div>

            {err&&<div style={{color:C.danger,fontSize:12,marginBottom:10,fontWeight:600}}>{err}</div>}
          </>
        )}

        {!isNew&&activeTab==="recruiting"&&(
          <RecruitingTab
            form={form}
            setForm={setForm}
            addingSchool={addingSchool}
            setAddingSchool={setAddingSchool}
            newSchool={newSchool}
            setNewSchool={setNewSchool}
            addSchool={addSchool}
            removeSchool={removeSchool}
          />
        )}

        {/* Actions */}
        <div style={{display:"flex",gap:10,marginTop:20}}>
          {!isNew&&(
            <button onClick={()=>onDelete&&onDelete()}
              style={{padding:"10px 14px",background:C.surface,border:"1px solid "+C.border,
                borderRadius:9,color:C.danger,cursor:"pointer",fontSize:13,fontWeight:700}}>
              Delete
            </button>
          )}
          <button onClick={onClose}
            style={{flex:1,padding:"11px",background:C.surface,border:"1px solid "+C.border,
              borderRadius:9,color:C.muted,cursor:"pointer",fontSize:14}}>
            Cancel
          </button>
          <button onClick={save}
            style={{flex:2,padding:"11px",background:C.accent,border:"none",borderRadius:9,
              color:"#000",fontWeight:900,fontSize:15,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
            {isNew?"Add Player":"Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── ROSTER VIEW ─────────────────────────────────────────────────────────────
function RosterView({players, setPlayers, teamName, teams, activeTeamId, onSwitchTeam, games, practices}){
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [sel, setSel]                     = useState(null);
  const [msg, setMsg]                     = useState(null);
  const [importing, setImporting]         = useState(false);
  const fileRef = useRef(null);

  const posGroups = ["GK","CB","FB","DM","CM","W","AM","ST"];
  const grouped = posGroups.map(pos=>({
    pos, players: (players||[]).filter(p=>primaryPos(p)===pos)
  })).filter(g=>g.players.length>0);
  const ungrouped = (players||[]).filter(p=>!posGroups.includes(primaryPos(p)));

  function savePlayer(updated){
    if(players.find(p=>p.id===updated.id)){
      setPlayers(prev=>prev.map(p=>p.id===updated.id?updated:p));
    } else {
      setPlayers(prev=>[...prev,updated]);
    }
    setEditingPlayer(null);
  }

  function deletePlayer(id){
    setPlayers(prev=>prev.filter(p=>p.id!==id));
    setSel(null);
  }

  const selPlayer = sel ? (players||[]).find(p=>p.id===sel) : null;

  return(
    <div style={{padding:20,maxWidth:920,margin:"0 auto"}}>
      {editingPlayer&&(
        <PlayerModal
          player={editingPlayer}
          onSave={savePlayer}
          onDelete={()=>deletePlayer(editingPlayer.id)}
          onClose={()=>setEditingPlayer(null)}
        />
      )}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:26,fontWeight:700,margin:0}}>Squad</h2>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setEditingPlayer({id:"",name:"",number:"",positions:[],captain:false,email:"",availability:"available"})}
            style={{display:"flex",alignItems:"center",gap:7,padding:"9px 16px",background:C.accent,border:"none",borderRadius:9,color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
            + Add Player
          </button>
        </div>
      </div>

      {(players||[]).length===0?(
        <div style={{textAlign:"center",padding:"60px 0",color:C.muted}}>
          <div style={{fontSize:36,marginBottom:12}}>👥</div>
          <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>No players yet</div>
          <div style={{fontSize:13}}>Add players to build your roster</div>
        </div>
      ):(
        <div>
          {[...grouped, ungrouped.length>0?{pos:"Other",players:ungrouped}:null].filter(Boolean).map(group=>(
            <div key={group.pos} style={{marginBottom:24}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:2,marginBottom:10}}>{group.pos}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
                {group.players.map(player=>{
                  const pc = posColor(primaryPos(player));
                  const playerGames = (games||[]).filter(g=>(g.stats||[]).some(s=>s.playerId===player.id));
                  const avg = playerGames.length>0
                    ? (playerGames.map(g=>{
                        const s=(g.stats||[]).find(x=>x.playerId===player.id);
                        if(!s) return null;
                        return calcRating(s,primaryPos(player),g.theirScore===0).rating;
                      }).filter(r=>r!==null).reduce((a,b,_,arr)=>a+b/arr.length,0)).toFixed(1)
                    : null;
                  return(
                    <div key={player.id}
                      onClick={()=>setSel(sel===player.id?null:player.id)}
                      className="card-hover"
                      style={{background:C.card,border:`1px solid ${sel===player.id?C.accent:C.border}`,borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"all .12s"}}>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <div style={{width:44,height:44,borderRadius:10,flexShrink:0,
                          background:pc+"22",border:`2px solid ${pc}44`,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontFamily:"'Oswald',sans-serif",fontWeight:900,color:pc,fontSize:20}}>
                          {player.number}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{color:C.text,fontWeight:700,fontSize:14,display:"flex",alignItems:"center",gap:6}}>
                            {player.name}
                            {player.captain&&<span style={{color:C.accent,fontSize:10,fontWeight:700}}>©</span>}
                          </div>
                          <div style={{color:C.muted,fontSize:11,marginTop:2}}>{allPos(player).join(" · ")}</div>
                        </div>
                        {avg&&<div style={{color:rColor(parseFloat(avg)),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:18}}>{avg}</div>}
                      </div>
                      {sel===player.id&&(
                        <div style={{display:"flex",gap:8,marginTop:12,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                          <button onClick={e=>{e.stopPropagation();setEditingPlayer({...player});}}
                            style={{flex:1,padding:"7px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,color:C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>
                            Edit
                          </button>
                          <button onClick={e=>{e.stopPropagation();setEditingPlayer({...player,initialTab:"recruiting"});}}
                            style={{flex:1,padding:"7px",background:"#7c3aed18",border:"1px solid #7c3aed44",borderRadius:7,color:"#7c3aed",cursor:"pointer",fontSize:12,fontWeight:700}}>
                            ★ Recruit
                          </button>
                          <button onClick={e=>{e.stopPropagation();if(window.confirm("Remove "+player.name+"?")) deletePlayer(player.id);}}
                            style={{padding:"7px 10px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,color:C.muted,cursor:"pointer",fontSize:12}}>
                            🗑
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ANALYTICS VIEW ───────────────────────────────────────────────────────────
function AnalyticsView({games, roster, practices, isPro, onUpgrade}){
  if(!isPro) return <ProGate isPro={isPro} onUpgrade={onUpgrade} feature="Season analytics and reports">{null}</ProGate>;

  const done = (games||[]).filter(g=>g.status==="completed");
  const wins   = done.filter(g=>g.ourScore>g.theirScore).length;
  const draws  = done.filter(g=>g.ourScore===g.theirScore).length;
  const losses = done.filter(g=>g.ourScore<g.theirScore).length;
  const goalsFor     = done.reduce((a,g)=>a+(g.ourScore||0),0);
  const goalsAgainst = done.reduce((a,g)=>a+(g.theirScore||0),0);
  const gamesWithPoss = done.filter(g=>g.possession&&(g.possession.home||g.possession.away));
  const avgPoss = gamesWithPoss.length>0
    ? Math.round(gamesWithPoss.reduce((a,g)=>{
        const total=g.possession.home+g.possession.away;
        return a+(total>0?g.possession.home/total*100:50);
      },0)/gamesWithPoss.length)
    : null;

  const topPlayers = (roster||[]).map(p=>{
    const pg = done.filter(g=>(g.stats||[]).some(s=>s.playerId===p.id));
    if(!pg.length) return null;
    const ratings = pg.map(g=>{
      const s=(g.stats||[]).find(x=>x.playerId===p.id);
      if(!s) return null;
      return calcRating(s,primaryPos(p),g.theirScore===0).rating;
    }).filter(r=>r!==null);
    const goals = pg.flatMap(g=>(g.stats||[]).filter(s=>s.playerId===p.id)).reduce((a,s)=>a+(s.goals||0),0);
    const assists = pg.flatMap(g=>(g.stats||[]).filter(s=>s.playerId===p.id)).reduce((a,s)=>a+(s.assists||0),0);
    const avg = ratings.length ? ratings.reduce((a,b)=>a+b,0)/ratings.length : 0;
    return {player:p, avg, goals, assists, gp:pg.length};
  }).filter(Boolean).sort((a,b)=>b.avg-a.avg).slice(0,10);

  const chartData = done.slice(-10).map((g,i)=>({
    name:`G${i+1}`,for:g.ourScore,against:g.theirScore,
    opp:g.opponent
  }));

  return(
    <div style={{padding:20,maxWidth:920,margin:"0 auto"}}>
      <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:26,fontWeight:700,marginBottom:20}}>Analytics</h2>

      {/* Season record */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12,marginBottom:24}}>
        {[
          {l:"Wins",v:wins,c:C.accent},{l:"Draws",v:draws,c:C.warning},{l:"Losses",v:losses,c:C.danger},
          {l:"Goals For",v:goalsFor,c:C.accent},{l:"Goals Against",v:goalsAgainst,c:C.muted},
          {l:"Games Played",v:done.length,c:C.muted},
          ...(avgPoss!==null?[{l:"Avg Possession",v:avgPoss+"%",c:C.accent}]:[]),
        ].map(item=>(
          <div key={item.l} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 18px",textAlign:"center"}}>
            <div style={{color:item.c,fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:28,lineHeight:1}}>{item.v}</div>
            <div style={{color:C.muted,fontSize:11,marginTop:4,fontWeight:600}}>{item.l}</div>
          </div>
        ))}
      </div>

      {/* Score chart */}
      {chartData.length>0&&(
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"18px 20px",marginBottom:20}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:2,marginBottom:14}}>LAST {chartData.length} GAMES</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} barGap={2}>
              <XAxis dataKey="name" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12}}/>
              <Bar dataKey="for" name="Goals For" fill={C.accent} radius={[4,4,0,0]}/>
              <Bar dataKey="against" name="Goals Against" fill={C.danger+"99"} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top players */}
      {topPlayers.length>0&&(
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"18px 20px"}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:2,marginBottom:14}}>TOP PERFORMERS</div>
          {topPlayers.map((p,i)=>(
            <div key={p.player.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:i<topPlayers.length-1?`1px solid ${C.border}`:"none"}}>
              <div style={{color:C.muted,fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:14,width:20,textAlign:"right"}}>{i+1}</div>
              <div style={{flex:1}}>
                <div style={{color:C.text,fontWeight:700,fontSize:14}}>{p.player.name}</div>
                <div style={{color:C.muted,fontSize:11,marginTop:2}}>{primaryPos(p.player)} · {p.gp} games</div>
              </div>
              <div style={{display:"flex",gap:16,alignItems:"center"}}>
                <div style={{textAlign:"center"}}>
                  <div style={{color:C.accent,fontWeight:700,fontSize:15}}>{p.goals}</div>
                  <div style={{color:C.muted,fontSize:9,fontWeight:600}}>G</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{color:C.accent,fontWeight:700,fontSize:15}}>{p.assists}</div>
                  <div style={{color:C.muted,fontSize:9,fontWeight:600}}>A</div>
                </div>
                <div style={{textAlign:"right",minWidth:40}}>
                  <div style={{color:rColor(p.avg),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:18}}>{p.avg.toFixed(1)}</div>
                  <div style={{color:C.muted,fontSize:9,fontWeight:600}}>AVG</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {done.length===0&&(
        <div style={{textAlign:"center",padding:"60px 0",color:C.muted}}>
          <div style={{fontSize:36,marginBottom:12}}>📊</div>
          <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>No data yet</div>
          <div style={{fontSize:13}}>Log some games to see analytics</div>
        </div>
      )}
    </div>
  );
}


function GamesView({games,setGames,teamName:activeTeamName,roster:activeRoster,teams,activeTeamId,onSwitchTeam,opponents,onViewOpponent,setOpponents}){
  const [sel,setSel]=useState(null);
  const [expanded,setExpanded]=useState(null);
  const [importing,setImporting]=useState(false);
  const [importMsg,setImportMsg]=useState(null);
  const [sending,setSending]=useState(false);
  const [sendMsg,setSendMsg]=useState(null);
  const [showQuick,setShowQuick]=useState(false);
  const [editGame,setEditGame]=useState(null); // game object being edited
  const [quickForm,setQuickForm]=useState({opponent:"",date:new Date().toISOString().split("T")[0],location:"Home",ourScore:"",theirScore:"",coachNotes:""});
  const [addStatsFor,setAddStatsFor]=useState(null);
  const [editStats,setEditStats]=useState(null); // {game, stat} being edited
  const fileRef=useRef(null);
  const statsFileRef=useRef(null);

  function saveQuickGame(){
    if(!quickForm.opponent||quickForm.ourScore===""||quickForm.theirScore==="") return;
    const game={
      id:`g${Date.now()}`,
      opponent:quickForm.opponent,
      date:quickForm.date,
      location:quickForm.location,
      formation:"",
      ourScore:parseInt(quickForm.ourScore)||0,
      theirScore:parseInt(quickForm.theirScore)||0,
      status:"completed",
      entryType:"quick",
      coachNotes:quickForm.coachNotes||"",
      stats:[],
      createdAt:new Date().toISOString(),
    };
    setGames(prev=>[game,...prev]);
    // Auto-create opponent record if it doesn't exist
    if(setOpponents && quickForm.opponent.trim()){
      setOpponents(prev=>{
        const exists = prev.find(o=>o.name.toLowerCase()===quickForm.opponent.trim().toLowerCase());
        if(exists) return prev;
        return [...prev,{
          id:`opp${Date.now()}`,name:quickForm.opponent.trim(),
          formation:"",keyPlayers:"",scoutNotes:"",setPieceNotes:"",
          oppPlayers:{},
          tendencies:{pressing:"",buildUp:"",attackShape:"",defShape:"",weaknesses:""},
          setPieces:{cornersAtk:"",cornersDef:"",freeKicksAtk:"",freeKicksDef:"",throwInsAtk:"",throwInsDef:""},
          counterPlan:{howWeAttack:"",howWeDefend:"",keyMatchups:"",focusPoints:""},
          createdAt:new Date().toISOString(),
        }];
      });
    }
    setShowQuick(false);
    setQuickForm({opponent:"",date:new Date().toISOString().split("T")[0],location:"Home",ourScore:"",theirScore:"",coachNotes:""});
  }

  async function sendReports(game, roster, teamName, allGames){
    const playersWithEmail = roster.filter(p=>p.email&&p.email.trim());
    if(!playersWithEmail.length){
      setSendMsg({type:"err", text:"No players have email addresses. Add them in the Roster tab."});
      return;
    }
    setSending(true); setSendMsg(null);
    let sent=0, failed=0, skipped=0;
    const failedNames=[];
    for(const player of playersWithEmail){
      const st = (game.stats||[]).find(s=>s.playerId===player.id);
      if(!st){ skipped++; continue; }
      const cs  = isCS(game, player.id);
      const {rating, label, coachNote, breakdown} = calcRating(st, primaryPos(player), cs);
      const seasonAvg   = avgRating(player.id, allGames||[game]);
      const gamesPlayed = (allGames||[game]).filter(g=>g.status==="completed"&&(g.stats||[]).find(s=>s.playerId===player.id)).length;
      const passAtt  = (st.passesCompleted||0)+(st.passesIncomplete||st.passesAttempted||0);
      const passAccStr = passAtt>0 ? `${Math.round((st.passesCompleted/passAtt)*100)}%` : "N/A";
      const isGK = allPos(player).includes("GK");
      const fmt = n => (typeof n==="number"&&n>=0) ? `+${n}` : String(n||0);
      try{
        await sendPlayerEmail({
          to_email:      player.email.trim(),
          to_name:       player.name,
          player_name:   player.name,
          team_name:     teamName||"Your Team",
          game_opponent: game.opponent||"",
          game_date:     game.date||"",
          game_location: game.location||"",
          rating:        rating.toFixed(1),
          rating_label:  label,
          attack:        fmt(breakdown.attack),
          possession:    fmt(breakdown.possession),
          defensive:     fmt(breakdown.defensive),
          bonus:         fmt(breakdown.bonus),
          errors:        fmt(breakdown.errors),
          stat_goals:       String(st.goals||0),
          stat_assists:     String(st.assists||0),
          stat_shots:       String(st.shots||0),
          stat_shots_ot:    String(st.shotsOnTarget||0),
          stat_key_passes:  String(st.keyPasses||0),
          stat_pass_comp:   String(st.passesCompleted||0),
          stat_pass_att:    String(passAtt),
          stat_pass_acc:    passAccStr,
          stat_tackles:     String(st.tackles||0),
          stat_ints:        String(st.interceptions||0),
          stat_aerials:     String(st.aerialDuelsWon||0),
          stat_fouls:       String(st.fouls||0),
          stat_turns:       String(st.dangerousTurnovers||0),
          stat_saves:       String(st.saves||0),
          stat_conceded:    String(st.goalsConceded||0),
          stat_minutes:     String(st.minutesPlayed||90),
          stat_is_gk:       isGK ? "true" : "false",
          team_possession:  game.possession&&(game.possession.home+game.possession.away)>0
            ? Math.round(game.possession.home/(game.possession.home+game.possession.away)*100)+"%"
            : "N/A",
          coach_note:    coachNote||"",
          season_avg:    seasonAvg.toFixed(1),
          games_played:  String(gamesPlayed),
        });
        sent++;
      }catch(e){
        console.error("Email failed for", player.name, e.message);
        failedNames.push(player.name);
        failed++;
      }
      await new Promise(r=>setTimeout(r,400));
    }
    setSending(false);
    if(failed===0 && sent>0){
      setSendMsg({type:"ok", text:`✓ Reports sent to ${sent} player${sent!==1?"s":""}${skipped>0?` (${skipped} had no stats this game)`:""}`});
    } else if(sent===0 && skipped===playersWithEmail.length){
      setSendMsg({type:"err", text:"No stats found for any player — upload stats for this game first, then send reports."});
    } else if(failed>0){
      setSendMsg({type:"err", text:`Sent ${sent}, failed for: ${failedNames.join(", ")}. Check EmailJS template_xlcc4wg is set up correctly.`});
    } else {
      setSendMsg({type:"err", text:"Nothing sent — no players had stats in this game."});
    }
  }

  async function handleImport(e){
    const file=e.target.files?.[0]; if(!file)return;
    setImporting(true);setImportMsg(null);
    try{
      const game=await parseGameSpreadsheet(file);
      setGames(prev=>[game,...prev]);
      setImportMsg({type:"ok",text:`✓ Imported vs ${game.opponent} — ${game.stats.length} players loaded`});
    }catch(err){
      setImportMsg({type:"err",text:`✗ ${err.message}`});
    }
    setImporting(false);
    e.target.value="";
  }

  async function handleImportForGame(e, gameId){
    const file = e.target.files?.[0]; if(!file) return;
    setImporting(true); setImportMsg(null);
    try{
      const imported = await parseGameSpreadsheet(file);
      // Merge the stats into the existing quick-score game
      setGames(prev=>prev.map(g=>g.id===gameId
        ? {...g,
            stats: imported.stats,
            formation: imported.formation || g.formation,
            entryType: "full", // upgraded from quick
          }
        : g
      ));
      setImportMsg({type:"ok", text:`✓ Stats added — ${imported.stats.length} players loaded`});
    }catch(err){
      setImportMsg({type:"err", text:`✗ ${err.message}`});
    }
    setImporting(false);
    e.target.value="";
  }

  if(sel){
    const game=games.find(g=>g.id===sel); if(!game)return null;
    const res=game.ourScore>game.theirScore?"W":game.ourScore<game.theirScore?"L":"D";
    const rc=res==="W"?C.accent:res==="L"?C.danger:C.warning;
    const rows=game.stats.map(s=>{
      const p=PLAYERS.find(x=>x.id===s.playerId);
      const cs=isCS(game,s.playerId);
      return {...s,player:p,...calcRating(s,primaryPos(p),cs)};
    }).sort((a,b)=>b.rating-a.rating);
    const tSh=game.stats.reduce((a,s)=>a+s.shots,0);
    const tSoT=game.stats.reduce((a,s)=>a+s.shotsOnTarget,0);
    const tPC=game.stats.reduce((a,s)=>a+s.passesCompleted,0);
    const tPA=game.stats.reduce((a,s)=>a+s.passesAttempted,0);
    const pacc=tPA>0?Math.round((tPC/tPA)*100):0;
    const squadAvg=Math.round((rows.reduce((a,r)=>a+r.rating,0)/rows.length)*10)/10;

    return(
      <div style={{padding:20,maxWidth:920,margin:"0 auto"}}>
        {/* Hidden file input for stat upload in detail view */}
        <input type="file" accept=".xlsx,.xls" style={{display:"none"}}
          ref={el=>{ if(el) el._detailRef=true; }}
          id="detail-stats-upload"
          onChange={e=>{ handleImportForGame(e, game.id); }}/>
        <div style={{display:"flex",gap:10,marginBottom:20,alignItems:"center"}}>
          <button onClick={()=>{setSel(null);setExpanded(null);}} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",color:C.text,cursor:"pointer",fontSize:13}}>← Back</button>
          <div style={{flex:1}}/>
          <button onClick={()=>setEditGame(game)}
            style={{display:"flex",alignItems:"center",gap:6,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,
              padding:"8px 14px",color:C.muted,cursor:"pointer",fontWeight:700,fontSize:12}}>
            <Pencil size={13}/> Edit
          </button>
          {(game.stats||[]).length>0&&(
            <button onClick={()=>setEditStats({gameId:game.id,stats:JSON.parse(JSON.stringify(game.stats))})}
              style={{display:"flex",alignItems:"center",gap:6,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,
                padding:"8px 14px",color:C.muted,cursor:"pointer",fontWeight:700,fontSize:12}}>
              <Pencil size={13}/> Edit Stats
            </button>
          )}
          <button onClick={()=>window.open(window.location.origin+window.location.pathname+"#/report/"+game.id,"_blank")}
            style={{background:C.accent+"22",border:`1px solid ${C.accent}44`,borderRadius:8,
              padding:"8px 14px",color:C.accent,cursor:"pointer",fontWeight:700,fontSize:12}}>
            {game.status==="completed"?"⎘ Share Report":"⎘ Share Preview"}
          </button>
        </div>

        {/* Quick score banner — prompt to add stats */}
        {game.entryType==="quick"&&(
          <div style={{background:C.accent+"15",border:`1px solid ${C.accent}44`,borderRadius:12,
            padding:"14px 18px",marginBottom:16}}>
            <div style={{color:C.accent,fontWeight:700,fontSize:13,marginBottom:2}}>No Stats Recorded</div>
            <div style={{color:C.muted,fontSize:12,marginBottom:12}}>Enter stats manually or upload a spreadsheet.</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button onClick={()=>{
                // Pre-populate editStats with roster players at zero
                const blankStats=(activeRoster||[]).map(p=>({
                  playerId:p.id,goals:0,assists:0,shots:0,shotsOnTarget:0,
                  keyPasses:0,passesCompleted:0,passesAttempted:0,passesIncomplete:0,
                  tackles:0,interceptions:0,aerialDuelsWon:0,fouls:0,
                  dangerousTurnovers:0,saves:0,goalsConceded:0,minutesPlayed:90
                }));
                setEditStats({gameId:game.id,stats:blankStats});
              }}
                style={{display:"flex",alignItems:"center",gap:7,padding:"9px 16px",
                  background:C.accent,border:"none",borderRadius:9,color:"#000",
                  fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
                ✏ Enter Stats Manually
              </button>
              <button onClick={()=>{document.getElementById("detail-stats-upload")?.click();}}
                style={{display:"flex",alignItems:"center",gap:7,padding:"9px 14px",
                  background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,
                  color:C.muted,fontWeight:700,fontSize:13,cursor:"pointer"}}>
                <Upload size={13}/> Upload Spreadsheet
              </button>
            </div>
          </div>
        )}

        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:"20px 24px",marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
            <div>
              <div style={{color:C.muted,fontSize:12,fontWeight:600,letterSpacing:1}}>{game.date} · {game.location} · {game.formation}</div>
              <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:28,fontWeight:800,margin:"6px 0"}}>vs {game.opponent}</h2>
              <Tag color={rc}>{res==="W"?"VICTORY":res==="L"?"DEFEAT":"DRAW"}</Tag>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:52,fontWeight:900,lineHeight:1}}>{game.ourScore} <span style={{color:C.muted,fontSize:32}}>–</span> {game.theirScore}</div>
              <div style={{color:C.muted,fontSize:12,marginTop:4}}>Squad avg: <span style={{color:rColor(squadAvg),fontWeight:700}}>{squadAvg}</span></div>
            </div>
          </div>
          {game.coachNotes&&(
              <div style={{marginTop:16,padding:"10px 14px",background:C.surface,borderRadius:9,borderLeft:`3px solid ${C.accent}`}}>
                <div style={{color:C.accent,fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:4}}>COACH NOTES</div>
                <div style={{color:C.text+"cc",fontSize:13,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{game.coachNotes}</div>
              </div>
            )}
          <div style={{display:"flex",gap:14,marginTop:16,flexWrap:"wrap"}}>
            {[["Shots",tSh],["On Target",tSoT],["Pass Acc.",`${pacc}%`],["Passes",tPC],...(game.possession&&(game.possession.home||game.possession.away)?[["Poss %",Math.round((game.possession.home/(game.possession.home+game.possession.away))*100)+"%"]]:[] )].map(([l,v])=>(
              <div key={l} style={{background:C.bg,borderRadius:8,padding:"8px 14px"}}>
                <div style={{color:C.text+"66",fontSize:10,fontWeight:600}}>{l}</div>
                <div style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:20,fontWeight:700}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Send Reports */}
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
          <button onClick={()=>sendReports(game,activeRoster||PLAYERS,activeTeamName,games)} disabled={sending}
            style={{background:"#42a5f522",border:"1px solid #42a5f544",borderRadius:8,padding:"8px 14px",
              color:"#42a5f5",cursor:"pointer",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:6}}>
            {sending?<><RefreshCw size={12} style={{animation:"spin 1s linear infinite"}}/>Sending…</>:<>✉ Send Match Reports</>}
          </button>
        </div>
        {sendMsg&&(
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            background:sendMsg.type==="ok"?C.accent+"15":C.danger+"15",
            border:`1px solid ${sendMsg.type==="ok"?C.accent:C.danger}44`,
            borderRadius:8,padding:"10px 14px",marginBottom:14}}>
            <span style={{color:sendMsg.type==="ok"?C.accent:C.danger,fontWeight:600,fontSize:13}}>{sendMsg.text}</span>
            <button onClick={()=>setSendMsg(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer"}}><X size={13}/></button>
          </div>
        )}

        {/* Ratings */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:16}}>PLAYER RATINGS — CLICK TO EXPAND BREAKDOWN</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {rows.map((row,i)=>{
              const open=expanded===row.playerId;
              return(
                <div key={row.playerId}>
                  <div onClick={()=>setExpanded(open?null:row.playerId)}
                    style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:i===0?"#ff6b0010":C.surface,borderRadius:10,cursor:"pointer",border:i===0?"1px solid #ff6b0033":`1px solid ${C.border}`,transition:"all .15s"}}>
                    {i===0?<Award size={15} color="#ffb300"/>:<span style={{color:C.muted,fontSize:13,fontWeight:700,width:20,textAlign:"center"}}>{i+1}</span>}
                    <div style={{width:32,height:32,borderRadius:8,background:posColor(primaryPos(row.player))+"22",border:`1.5px solid ${posColor(primaryPos(row.player))}44`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:700,color:posColor(primaryPos(row.player)),fontSize:13,flexShrink:0}}>{row.player?.number}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <span style={{color:C.text,fontWeight:700,fontSize:14}}>{row.player?.name}</span>
                          {allPos(row.player).map(pos=><Tag key={pos} color={posColor(pos)}>{pos}</Tag>)}
                          <span style={{color:C.muted,fontSize:11}}>{row.goals}G {row.assists}A {row.tackles}T {row.keyPasses||0}KP</span>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                          <span style={{color:rColor(row.rating),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:22}}>{row.rating.toFixed(1)}</span>
                          <span style={{color:rColor(row.rating),fontSize:11,fontWeight:700}}>{row.label}</span>
                          <span style={{color:C.muted,fontSize:11}}>{open?"▲":"▼"}</span>
                        </div>
                      </div>
                      <RBar value={row.rating}/>
                    </div>
                  </div>
                  {open&&(
                    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderTop:"none",borderRadius:"0 0 10px 10px",padding:"14px 16px 14px 60px"}}>
                      <div className="resp-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                        <div>
                          <div style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:1,marginBottom:10}}>SCORE BREAKDOWN (base 6.0)</div>
                          <BreakdownBars breakdown={row.breakdown}/>
                          <div style={{color:C.muted,fontSize:10,marginTop:8}}>
                            Total: 6.0 + {row.breakdown.attack>0?`+${row.breakdown.attack}`:row.breakdown.attack} + {row.breakdown.possession>0?`+${row.breakdown.possession}`:row.breakdown.possession} + {row.breakdown.defensive>0?`+${row.breakdown.defensive}`:row.breakdown.defensive} + {row.breakdown.bonus>0?`+${row.breakdown.bonus}`:row.breakdown.bonus} {row.breakdown.errors} = <strong style={{color:rColor(row.rating)}}>{row.rating.toFixed(1)}</strong>
                          </div>
                        </div>
                        <div>
                          <div style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:1,marginBottom:8}}>COACH NOTE</div>
                          <p style={{color:C.text,fontSize:13,lineHeight:1.6}}>{row.coachNote}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Embedded template — base64-encoded xlsx, no server required
  const TEMPLATE_B64 = "UEsDBBQACAgIALCNclwAAAAAAAAAAAAAAAAaAAAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHO9kstqwzAQRff5CjH7WLb7oBTL2ZRCtm36AUIeWya2JEbTR/6+alMaB4LpwnQl5kpz70Ez1eZjHMQbUuy9U1BkOQh0xje96xS87B7Xd7CpV9UTDprTk2j7EEXqcVGBZQ73UkZjcdQx8wFdumk9jZpTSZ0M2ux1h7LM81tJUw+ozzzFtlFA26YAsTsE/Iu3b9ve4IM3ryM6vhAhOfViMtTUISv4Lo9ikSUzkJcZyiUZIh8GjCeIYz0Xf7Vk/LunfbSIfCL4lRLc1zH7F9f/DFPOwdwsOhirCZtnprTp0/lM5R+YVSXP9r/+BFBLBwiyzuVs6QAAADYDAABQSwMEFAAICAgAsI1yXAAAAAAAAAAAAAAAAA8AAAB4bC93b3JrYm9vay54bWyNU9uO2jAQfe9XWH6HXLgUEGFFA+ki9bJatrvPTjIhLo4d2ebWqv/eiUO2VK2qPsT2XHzmHM9kfneuBDmCNlzJiAZ9nxKQmcq53EX0y1PSm1BiLJM5E0pCRC9g6N3izfyk9D5Vak/wvjQRLa2tZ55nshIqZvqqBomRQumKWTT1zjO1BpabEsBWwgt9f+xVjEvaIsz0/2CoouAZrFR2qEDaFkSDYBbZm5LXhi7mBRfw3AoirK4/sQppx0xk1Fu80n7QJGXZ/lAnmB3RggkDKLRUp8/pV8gsKmJCUJIzC8HUH3Ypv0Eoi5lYBp2N45nDyfyKN6ZDvFeaf1PSMrHNtBIiolYfrtWQqOXZ3yLb5qGeWGo65/mFy1ydIootutycT+74wnNbYgPHg8mw890D35U2opNgGlJiWfrYPFRERz5eK7g21hVxKAyVHAHrNRYK8m4UuZ51O5HuQd/jSjayUA1bdG9yLO5GxWL0yA1PBZLWM44BvckHDegtwINgF9BkixfMDUb4D4yhI9axwVfLsI3cgsb8WB0kKgkaaRqKjypHiCUyusZfe3y1VyAsQ6193/eDBhfO9oOxbr9OpFB4/mMqBU81tHPoRpKSg+YR/f52HI7jyTjshctg0AuC9aj3bjAc9ZJ1kmAD4lU8TX7geDrUGX5xy99Yjf/aIxTbC47IOaLrcwZi6Th5mNaujprXjdbiJ1BLBwhQsmNIEgIAALcDAABQSwMEFAAICAgAsI1yXAAAAAAAAAAAAAAAABMAAAB4bC90aGVtZS90aGVtZTEueG1szVfBctsgEL33KxjuCZIsObIndg5JPT10pjNN+gEIIYkGIQ3QpP77IrAlFDmu0zqd+oBhebxdHuxiX9/8rDl4olKxRqxgeBlAQAVpcibKFfz2sLlIIVAaixzzRtAV3FIFb9YfrvFSV7SmwCwXaolXsNK6XSKkiDFjddm0VJi5opE11mYoS5RL/Gxoa46iIJijGjMBd+vlKeubomCE3jXkR02FdiSScqxN6KpirYJA4NrE+MUCwUMXIFzvQ/3IabdOdQbC5T2x8fsrLDZ/DLsvJcvslkvwhPkKBvYD0foa9QCup7jCfna4HSB/jCa4sIgXV3nPFzm+KY5SSmjY81kAJsTsYuo7LtIw23N6INedcpMgCeIx3uOfTfCLLMuSxQg/G/DxBJ8G8xhHI3w84JNp/JmZmY/wyYCfT7W+WszjMd6CKs7E48ET7E+mhxQN/3QQnhp4uj/wAYW8m+PWC/3aParx90ZuDMAerrmkAuhtSwtMDO4W15lkGIKWaVJtcM341gQJAamwVFSbK9I5x0uKvVXORNQLE3rhrGbimGfOjOvzeR6cIV8QK0/tDxjn93rL6WdlA1MNZ/nGGO3Awnr528p0oWXsZ9zIX1RKPPTVjrZUoG1Ut6MjvKYiMKGdLfFSe+ysVD7hrAOeSjq7Oo00dIXlRNYwOcaKPBXMdQW4q+DhPHIugCKY07w/Xs04/UqJBtyevrattG3Wtc7LSOK/kFtVOKc7vcPTpEl/r4zHupidT3CfNj6D4sGfKY6mOcPFeASeTYhJlJjsxa0piSbZTbdujVMlSggwL82jTrTbVyuVvsOqcluzqbR/WsTAFyVxF/z5CGdpeB5C9FIAWhRGz1csw9DMOZKDs+cHo0ORZeXmPy2A8YkFMH5LqYr3pWqcTot3ydLo6A78LG2xrkDXmDvHJOHuqe7S7KHZ56Z7ELr8vHA1qEvSndEkaph63jqqf19NB5nTE8/ujYLO3knQ5ICeyRnkRNP8QqOfH2jyH2BvWf8CUEsHCDuh3wr0AgAAAg0AAFBLAwQUAAgICACwjXJcAAAAAAAAAAAAAAAADQAAAHhsL3N0eWxlcy54bWztXN+P2jgQfr+/Isr7NU5CApyAimU3p3s5Ve1WOul0D4EYiJrYyPG20L/+7Di/IDZNdinLVma1CpnxzDf+PDZ2ltnJ+32aGF8hyWKMpqb9DpgGRCscxWgzNT8/Br+PTCOjIYrCBCM4NQ8wM9/Pfptk9JDAT1sIqcE8oGxqbind/WFZ2WoL0zB7h3cQMc0akzSk7JZsrGxHYBhl3ChNLAcA30rDGJmzCXpKg5Rmxgo/ITo1nUpkiMtfEYvNH5iGcLfAEQvlT4ggCRPTkjb2lI2tAm02WWPUAPVMIZlNsu/G1zBhXmzefoUTTAzKusX85BIUplC0WIRJvCQxF67DNE4OQuzkdtuQZIwf4SpHFu5PQMCxyzmJRZxNh+DGzJdCQckT5LrKm18TRjbLqRkEANyPhw9dQXpxdoQzmPvB3LsQjqp7dgv2wXl4CIKrw16UVRVsm2T3fry4WG/P4FyFVe/nshrLYUevk7mvxHEblvV36A2vPmGCYDwCnde6C/b2grC3twy90mAOnLkXXH/GXBT2DI49d4E3uDqrvn9358+vzupVYCUzJvBc7/oLwoVg8wvfwcZJUu1gh6YQzCa7kFJIUMBujOL942HHtq+IbeKFm7zdD1pvSHiwHa+7QYaTOOJRbBZHn6v3tifcLE8Ucxs4YnfZ8PlCNNu2711XgmbP2cyaXxqtcnqKVoVxUTQwF4Rdg8na6SlaNaBStPzCsnOJScSOls1jnRAZURxuMAqTz7upuQ6TDJqV6B5/Q6VwNkngmjIYEm+2/ErxjkeDKcUpe1Pa8ECE5+chGPlxlk3gbX4cVazGFm9axNLRIm+bh93RgLUs+9fRQjSWc1G8YUOxgknyifv7Z12PB2Bu9+v2GRvlN4C9ZeNYvBWeiptwt0sOAeZO8jVPCO7yJkeieRJvUApPGn4gmMIVzR855OLZJCwbGltM4u/MNV/yNsWpnT+hoPGKi0R3TYPCPf2IaSi8sJi+kXD3yITVcMcoyoGZLtuSGH15xEFcqRlNuyoMI8GrLzAqg9zGETNttLT26xOmQM2T/VyeijhPiWqKm0yVCft2gnF0MIpgnj23dDA6GB2MDkYH85xgBu4tfVIO7JuKZnBT0Ti3FM34lYOxmtt3sZlv7uNHz93H79ft0JsBvTD2t7apP6JtUNPmdKDtpeeg85ytmACSJmWl5AxlAul6jHk1Y65mrAtjoF+OyaamnLJfemb6ijyzXyPP+DOhG88yT5Flmi85X0O9jvVkbHRLM/JNMDbWc7IXX3bPj0qdYs3NRZdlTO/7i0yz9WLWlzJHU9aXMrembKAp60TZQGdZX8puauv/NijzNWV9KWscmDxNWSfK9ImpN2U3dWR6E5Q5jSOArynrRJne/femzNETsy9lrs6yvpSp/h6nKft5z7EVz39+qYeM3o8J0ymmYszWlMkps4rvaDS+eV19X8M3G1KD14FMzb95rXLSIG35FCc0RuLOahsscJqGZXt+zm8YuEoD41/wX2XkHxn5UqMnQiBaHSqb4ZHN4JzNEdboyG4os/sACR+uymR8ZCKqDWoyiy/Esysfuj2MFsUt2SyPaxXyF7c+1YiXXKOyAYD/yjVcp8JRRaCy4XK5ZqTsDwAjlaYq5Gh7U9lw+UiJI9csAP9R4chtxuwl7+l47Lq+r2J0sZBp6kLIU43vA6DyVlYxtnvq+3KcBXvJceoSne6jrc6Q83kgZ/R8hqjGVJ2JZVF0mwNVbFwj5y0viR3LR1vFqNDJcVS5I3QyTV3Dfqqp6ztlsalmsFpTlv62crSqAWxFUJWCtyLw+Y8838pSoHbGl5WVLZuqNq012lVll2w2yvujnqcue8lHoVGLd7J+W+W6btX/Y2T2P1BLBwij53cleAUAAKhEAABQSwMEFAAICAgAsI1yXAAAAAAAAAAAAAAAABgAAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWzNmE1v2zgQhu/7KwQd9hRH35KdtV00SbMtkG6KddoCe2Mk2iZCiSpJ23F+/Q5JSZYl21sURrAXWxySMw/fIUWR43cvObXWmAvCiontXbq2hYuUZaRYTOyvj3eDoW0JiYoMUVbgib3Fwn43/W28YfxZLDGWFjgoxMReSlleOY5IlzhH4pKVuICaOeM5klDkC0eUHKNMd8qp47tu7OSIFLbxcMV/xgebz0mKb1m6ynEhjROOKZKAL5akFLW3l+yn/GUcbWCoNU8L8dbUNP68sOcvJylngs3lZcryCq0/ypEz2hvnC/d/zZMXwVDXRGXKr53l6c+MMkf8eVUOwHcJSj0RSuRWD9iejrX/L9yaEyox/8wySPIcUYGhrkQLPMPya6nr5SP7Aoa62pmOnarzdJwRyIciszieT+z33tW1l6gmusU3gjei9WyJJdvcAeCKIlH708Y/OcnuSYH3rX+zzQ2jH0ENmKgTW/JVVfEPBtlqAyeLJTDe47lsekv0NMMUpxJn7X4PK0khymybPzHaOMjwHK2oVAwQjvHavgbkiV0oQSm4ZKUKcYMpVQO1rVS1/QT+49C2XhnLZymiIJPnuq3yX7p716oEvUdbttK6VLVqbT0x9qxMyq+r0qRHoQQukVqHFYVtIbCu8Y5mVzZdLfGjSskuY8px+7nOzZ2eM5DsSglQ4TvJ5HJiDy/jZBQPk6hRCXLyESvFARqsr5CJulxpz4zI93iNKbTWMG0beDdjc/aCT8cgqNC/SlqKSqGSVzlNV0KyvKIy6VmSLMPFwbA6Zo5egBH+SaH/hdyq9CihjRt/qKQ5bzy/iucfiBfEOhVmmOZlgySajjnbWFwjmqhGkSaQkjZILqMegWldq28ge1S9ocGIVTQ1Z4QOCn0FWNdTd+ysFV/V4rpuoaCBsQH1T4D63mVyblJfc/gtUq9DWrfokgYnSM+vaKApAj2pNFbLsIcVnsq0e2aqUEOELfX8jnqmRdRqETQt9rijt+SOetxhhzvqcUeHueO35I573HGHO+5xJ4e5k7fkTnrcww530uMeHeYeviX3sMftdV9kwx645x0mH70l+ahP3l2aoz75kbXpndo+/Oj824fZHeI2WneBNm26L0Dv5BYSnhvVbA9JGzXqopo2w3ab+IjSp3aV88MHffikCx/04YdH4E/tPeeHD/vwoy582IP33SPwpzag88NHPXi/++FRtdmD94/An9qFzg8f9+GDLnzchw+PwJ/airz/ercc+2I+Tp90P6XaFkPmtL6gc8wX+uwjwOeqkOqV2bK2Dqeqf9fuX137h+zB1XVwyO4pRwc9eUl9/nV2SHBKBshviJLM3FfUjL7drbIQpWxzTVHx3KiGOWd8Zs4SIGoJOpaYI6nOqU9YbjAuzOH2lrPylm12SVDGD6r3ZyxE6wSvKz4V5Ur2KsyZUX2hyG0JdkqEBMq5ObN7099/rJj84yPL8cX7Ddqa4thp6uuWvjpMNM9jZ3+Y/9dhJ6eHHQ6CQXARDsKBD78+lLyLYBBBKYJn/5fF6BhgwpScFPKhNLNliZG6lttdjSx6lyWNZYabd8WScfLKConoDS4k5q3D7RpzSdJ+hWOufj4jviAQmOobFVcf6LhZyaYA6dAnxycmYZXrx6W+pFENIs8bep7rB7HvuyFIOmdMHq5ymqumVWmVCPI7I69Yf4WJ1l2KvoKqjuJeVWzuIGxLuXjgOnoG8+BxiYsHGCFMGE5ggFrTiV0yLjkiEqgpSp/fF9n3JZG7OZBx1Lo/SmHh3rBcXTYKdQVU7Al6WxL1OejulNxZUlYSXB+bjSp3WgArI/M5qF3IO8LFLlRjfsiyD+vdO3Q6Zllm7r5girSe4dF4NObmuR0Mis1N7fRfUEsHCBENWx99BQAA7RUAAFBLAwQUAAgICACwjXJcAAAAAAAAAAAAAAAAGAAAAHhsL3dvcmtzaGVldHMvc2hlZXQyLnhtbL2cW5OiShLH3/dTGD7tPpxREPES6onT2ngD8TKzJ2LfaClbYhBYwL59+i1uCkVJZmy0vsxo8uOfWVn1B226evDnx8muvRE/sFxnWBd+NOs14uxd03Jeh/VfP5U/uvVaEBqOadiuQ4b1TxLU/xz9Y/Du+r+DIyFhjQo4wbB+DEOv32gE+yM5GcEP1yMOPXJw/ZMR0rf+ayPwfGKY8UknuyE2m3LjZFhOPVHo+xgN93Cw9mTi7s8n4oSJiE9sI6TlB0fLCzK1DxOlZ/rGOx1qVk+uxEly5KInSCW9k7X33cA9hD/27iktrTzKXqNXGOeHL/5/SkKbDvXNimZKzMROe8woT4b/++z9QbU92qkXy7bCz3jA9dEg1l/7tYNlh8TXXJNO8sGwA0KPecYr2ZHwlxcfD3+6axrIDjdGg0Z68mhgWnQ+ospqPjkM638J/Z0gR0hM/Nsi70HudS04uu8KLfBsG0GmFwenvmWqlkOK0a37PnbtGe0GXajDeuif0wP/IbRtWcC3Xo+0RpUcwsvZofGyIzbZh8QsKOrn0KZpdp+nF9e+KJjkYJztMCqC5nP9LP5Gax7WnaijNtV0vSjHmNh2NNJ6bR+xc5pAluq1L9c97faGTfskNJu596v4dDYadVQ1Pt1z3Jj0aGSuF9f9HYUi3WY8Fw6pfew8OnfDeqte+7y+LBQ0oTUY+9B6o9KRYV/cMHRP26g3sZPDaAJ994s48fTEzYnmzYvpVCqTuI7x+j4pqBb8N53pGzJpxrzOpEJnwtVJiudUJFVUJN1W4hQFD65xWbf519l6VmKfUYOki4cunL8tMzwO690fcqcndzvty8Ki63hGohLoPNPoF1292ft0bbrJulTJG7EpHReTj1H1ZDk0CslHA7oGg/jfaDXahhfkFvz+HNCxp1UlK/pomSZxuGnjnCfjg9ZI/7ec+P8g/IxWdLQ2E5l21JnvTSem6UROOlH8/nytNF+Lk09ofn8+Kc0n8fJJ35+vneZr8/LdoZ9ymk9+UD87ab7Og/rZTfN1H9RPoZkm7PESyndIeDE8z/F3GWLmeYFn+ntMopC5XuDa/h5jzHwvcI1/j3nMnChwrd+9Q8bMi8KjzChkbhS4drzD5UboZRlv+7GR3IaTLxBGaIwGvvte8+NbaJI3uWNfUkW3/pZcqiBhs88GSZGlqkpDoyOOckWfaIL4qkHPDWj0bSS2B423qLwUecqQRhoYs4EJG3hmAwobmLKBGRuYs4EFG1iyAZUNaGxgxQZ0NrBmAxs2sGUDu1ygQefwMpFi1UQ2v3kixbiIdDHH81aKjEuRSRoRcvMvCMX5f+YwolxkFB7TKTJTHtMtMjMe0ysycw7TahaZBY9hxrXkMWKRUXlMq8hoPEYqMisew/hM5zFMn9c8hunzhscwfd7yGKbPOw4jXftcWOmtqpXe+hF9rfnWxd5KShPzpTHT+8RjmOkd8xhmeic8hpneZx7DTK/CY5jpnfIYZnpnPIaZ3jmPYaZ3wWHajI2WPIbps8pjmD5rPIbp84rHMH3WeQzT5zWPYfq84TFMn7cp08ozTJ93PKbHt4hUYRGx8/0WkZLSpLg0J7myMw5JEClXvMwsgHGq0s4zjMwkZeRcJkbmGUYUGJnCyAxG5jCygJEljKgwosHICkZ0GFnDyAZGtinSuY3sKpGCIdoPNkQ7qaybq4y5TD21y4Zg7xipSv4Ds8zeMdqwIWBEgZEpjMxgZA4jCxhZwogKIxqMrGBEh5E1jGxgZJsgYjO/Gph71q6aKVhCfrAl5LIl2C9/ctkSDDKWOZZgbrgTGbYEjCgwMoWRGYzMYWQBI0sYUWFEg5EVjOgwsoaRDYxsZYQlqpmCJToPtkSnbAlmLT91ypZgPjuOOwhLdGBLwIgCI1MYmcHIHEYWMLKEERVGNBhZwYgOI2sY2cDItoOwRDVTsET3wZboli3BfOJ56pYtwXxVGncRH5y6sCVgRIGRKYzMYGQOIwsYWcKICiMajKxgRIeRNYxsYGTbRViimilYovdgS/SS0oTcCJn1/tQrW4L5Ccw4Vcn/FKLDNGrSgy0BIwqMTGFkBiNzGFnAyBJGVBjRYGQFIzqMrGFkAyPbHsIS1UzBEtET4Yd6IkrImkJgBvmUQnlbdJifJ40zoYIvmO/hkxSqNAaCURDMFMHMEMwcwSwQzBLBqAhGQzArBKMjmDWC2SCYbbY4Km0CQEWfVD1uvYtPhLJPJNYmQtkmLdYmAsYmAsImMKMgmCmCmSGYOYJZIJglglERjIZgVghGRzBrBLNBMNtscVTbpBoq2qTqYfZdbCKWbdJhbSKWbSKxNhE5NmmzNhERNoEZBcFMEcwMwcwRzALBLBGMimA0BLNCMDqCWSOYDYLZZouj2ibVUNEmVU/C72KT5BGk2MqNssfapFW2iczaJNUpQB3WJi2ETWBGQTBTBDNDMHMEs0AwSwSjIhgNwawQjI5g1ghmg2C22eKotkk1VLTJo5+GCxLnywn7PFwoPxDvsD/GyoSqbyeIR+IIRkEwUwQzQzBzBLNAMEsEoyIYDcGsEIyOYNYIZoNgttniqPZJNVT0yaMfkgvt8u1ELPmk/Jy8w/5sKxOqvp8gnpQjGAXBTBHMDMHMEcwCwSwRjIpgNASzQjA6glkjmA2C2QqY5+YAVPSJ/GifJI8w879um4bE/O9KdZusLUrnTbLzrg071Iy9ccm4+6X9cyL1qVn+NWgcuBZBKDxL/eebCgpGQZH6yk2FKUZhKvWnNxVmGIWZ1J/dVJhjFOZSf35TYYFRWEj9xU2FJUZhKfWXNxVUjIIq9dWbChpGQZP62k2FFUZhJfVXNxV0jIIu9fWbCmuMwlrqr28qbDAKG6m/uamwzRQ6NxS2Ev/EHXTirnxickFr5PaDnIj/Gu80DeiF6OxQIaGei+a2T8dbD674aOD5lhPqXrzVvXYkRrRHP7hc+15LO6cvkR25XA2Prm99uU5o2GPihMTP7Yt5I35o7csHGsk+cM3wXy2a2I63Vzfjy6+fXGiTN6HrRYOpJTtt45fHeMd2BLQFoSsITbEli2JToh08uG7IP9S47Ds/ezXP8Ii/s75Isgsut6863o+e7uIR0reXzbX1WiSh+3F20313fh6Jo9MR0vuBb9EBxn8wYFj3XD/0DSukVdvG/vdfjvn30QovW9xrpm/kNpPv6TyM3VP0lwdolx3XKTR04lnRFpDmtZPXyN71rGhm4klNuqLEDaiZ1uFAu+2EiuUH11SXsG6az2/XW9xo4JpmshGero7ca/oyUUzCl9f5ZPTt5c82jP4HUEsHCEWMG8anCQAA+kEAAFBLAwQUAAgICACwjXJcAAAAAAAAAAAAAAAAFAAAAHhsL3NoYXJlZFN0cmluZ3MueG1slVfNbts4EL7vUwy0lxaoY6c/i25hu3BkO3ETNdlKhbFHRp5IRChSS1Jxfetl+wBFD4t9l32ZPMkOaQcpFuhiFCBILM9wht9830dq/PZTo+AOrZNGT5Ljo1ECqEuzkbqaJB+L5eB1As4LvRHKaJwkO3TJ2+lPY+c8UKp2k6T2vn0zHLqyxka4I9Oipm9ujG2Ep4+2GrrWoti4GtE3avh8NPpl2AipEyhNpz2VHVGVTss/Okz3T14fJ9Oxk9NxrPLGtaKk4rSMQ3uHyfT+738AUiPKevUb5J4Kwf3nb3AqGoQ81BkP/XQ8DCv8zypLqRRIDUgA7OBGotrANSqzfQa+Rk3tNa1Cj+ETXCmxQ3so5tg1LtuWgNO8YDyqjiCVfgfLlJUwFx5Zgb/TzyDLBvM5K/zClMITJVjBZ4ZQNxZmW7Hj4R65wV0+gvJy8GLwggd4R0MqjeXhcmqEonGG+A0roahR9i9QGl3ihlni7HINxSV8zBdQnK1yKBbZ1cWsWLCSc48tHPeiv6A/kfwOjCauS7cX0krfmB5Mj5WfM0EBb36gKiCzIQ/y9NSKbTAf+obcBJDUDm2M5/fD48zp+QMAT3Jxh+4Z7MeWHsb2FIRFqGVVK/r1uIluY7QKrhHQo/bCbirKukVs+3T4khdKbcUSVA8jRF2rjNiA9GGE/7HCL1/jBPf/rZrWWA/5ownzm3vF1QSItoVtwKIUquwU+RKNz9Mx4kB03gS90zcEWOfoYdxKa5wMLhDgayiFVesHzv89j9i6BOGcdMyEwnjKcLVhxuchMgpK2IqJ+RU1RFMraVIBOihrQQRk1utKCnU3nYI2LtNjVyEBhPfYtNzdPVbzorxVzHKHDcog7xJbz3TEGVpJbRIcSqGuaIUt8/BYmo50XMk7Os4F93w6I5EPrHS3MTGk8XaXKhT2YWigje9zsGRSdx4jY1rpyeqe/DqCCRDCCioS81Ouk0VbCpqIXAVHzsHr4PvcKvofXX5oVqzkn3nz38v0Pe2HF3+wCP5Ry+NTD93n/RVf8BV/jju44sv1oJ/0cDHlzfWQNNvrm3vP2asa1kzwVw+Spmkxh7AX9bxDxS+z1zPtv5Geu5W5IMuwpnNQdFab8LbDyjuRFaQHMWeSMOwn5Mh1Xkq8dMD9X3+enve4VD7cTnokvou3giz4CyrFdAWe9wmrjIMPZJiWd5IvT3gH/udvzJOsgRMrNgp5Jp/yyp8LCe9MrR2ToJmwJTFtjdfXPHJKrAzkQnvDY+U8473BSdEQe5HXdcpb9L0RNdmVRx51Fp7UQ0Mx5pa3tzXPOBR+gsJYy70ZFaywDztqNutsW/MIlBPAa6m4xCgWs4xe64rZRf4YP3TOT/8FUEsHCM/RyKP/AwAAhREAAFBLAwQUAAgICACwjXJcAAAAAAAAAAAAAAAACwAAAF9yZWxzLy5yZWxzrZLBTsMwDIbve4oq9zXdQAihprtMSLshNB7AJG4btYmjxIPy9kQTEgyNssOOcX5//mKl3kxuLN4wJkteiVVZiQK9JmN9p8TL/nF5LzbNon7GEThHUm9DKnKPT0r0zOFByqR7dJBKCujzTUvRAedj7GQAPUCHcl1VdzL+ZIjmhFnsjBJxZ1ai2H8EvIRNbWs1bkkfHHo+M+JXIpMhdshKTKN8pzi8Eg1lhgp53mV9ucvf75QOGQwwSE0RlyHm7sgW07eOIf2Uy+mYmBO6ueZycGL0Bs28EoQwZ3R7TSN9SEzunxUdM19Ki1qe/MvmE1BLBwiFmjSa7gAAAM4CAABQSwMEFAAICAgAsI1yXAAAAAAAAAAAAAAAABEAAABkb2NQcm9wcy9jb3JlLnhtbJ1Sy07DMBC88xWR74mTlBYUNakEqCcqIbUViJtxtqkhdizbbZq/x3aa8OqJ2+7MePbl+eLE6+AISrNG5CiJYhSAoE3JRJWj7WYZ3qJAGyJKUjcCctSBRoviak5lRhsFT6qRoAwDHVgjoTMqc7Q3RmYYa7oHTnRkFcKSu0ZxYmyqKiwJ/SAV4DSOZ5iDISUxBDvDUI6O6GxZ0tFSHlTtDUqKoQYOwmicRAn+0hpQXF984JlvSs5MJ+GidCBH9UmzUdi2bdROvNT2n+CX1ePajxoy4VZFARXzcyMZVUAMlIE1yPpyA/M8uX/YLFGRxuksjCdhcrtJbrLraZZOX+f413tn2MeNKtxCZXeqnWoEnaAETRWTxt6y8OQPwOY1EdXBLr4AEW7XXjJC7qQ10WZlj79jUN511uMCNnTGz9i/RxsMfGUFR+b+YBH7omPqutaHt3egph9pTGxsmKmhh4fwz78sPgFQSwcI2HRjEWMBAADjAgAAUEsDBBQACAgIALCNclwAAAAAAAAAAAAAAAAQAAAAZG9jUHJvcHMvYXBwLnhtbJ2QwW7CMAyG73uKKuLaJkQdQygN2jTthLQdOrRblSUuZGqTqHFRefsF0IDzfLJ/W5/tX6ynvssOMETrXUXmBSMZOO2NdbuKfNZv+ZJkEZUzqvMOKnKESNbyQXwMPsCAFmKWCC5WZI8YVpRGvYdexSK1Xeq0fugVpnLYUd+2VsOr12MPDilnbEFhQnAGTB6uQHIhrg74X6jx+nRf3NbHkHhS1NCHTiFIQW9p7VF1te1BsiRfC/EcQme1wuSI3NjvAd7PKygvC148FXy2sW6cmq/lolmU2d1Ek374AY205Gz2MtrO5FzQe9yJvb2YLeePBUtxHvjTBL35Kn8BUEsHCF6WAY/7AAAAnAEAAFBLAwQUAAgICACwjXJcAAAAAAAAAAAAAAAAEwAAAGRvY1Byb3BzL2N1c3RvbS54bWydzrEKwjAUheHdpwjZ21QHkdK0izg7VPeQ3rYBc2/ITYt9eyOC7o6HHz5O0z39Q6wQ2RFquS8rKQAtDQ4nLW/9pThJwcngYB6EoOUGLLt211wjBYjJAYssIGs5pxRqpdjO4A2XOWMuI0VvUp5xUjSOzsKZ7OIBkzpU1VHZhRP5Inw5+fHqNf1LDmTf7/jebyF7baN+Z9sXUEsHCOHWAICXAAAA8QAAAFBLAwQUAAgICACwjXJcAAAAAAAAAAAAAAAAEwAAAFtDb250ZW50X1R5cGVzXS54bWzFVUtPwzAMvu9XVL2iNtsOCKFuO/A4wiTGGYXEbcPaJIqzsf173BamMfag6gSXRo39PewmbjJZlUWwBIfK6FE4iPthAFoYqXQ2Cp9n99FVOBn3ktnaAgaUq3EU5t7ba8ZQ5FByjI0FTZHUuJJ7enUZs1zMeQZs2O9fMmG0B+0jX3GE4+QWUr4ofHC3ou1Gl+BhcNPkVVKjkFtbKME9hVkVZXtxDgo8AlxqueMu+nQWE7LOwVxZvDisYHW2I6DKqrJqfz/izcJ+SB0gzCO12ykJwZQ7/8BLSmCrgr1UxbB34+avxsxjshSfubwDwtuS7dRMmioB0ohFSZAYrQMuMQfwZL5e45IrfULf0zGC5jno7KGmOSGIfl0AnrvcmvQXra4ByOqle73fTWz4W/oY/pMPzLkD+eQdjZuzf5Bt7mM+mov3F5eNnE6dsUgj0UH7cr/0KnRkiQicV8fP3EaRqDv3F6ohJ0G21RYL9KbsLN/Q/BTvJaz+PY0/AFBLBwi4kJ2ieQEAAM0GAABQSwECFAAUAAgICACwjXJcss7lbOkAAAA2AwAAGgAAAAAAAAAAAAAAAAAAAAAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHNQSwECFAAUAAgICACwjXJcULJjSBICAAC3AwAADwAAAAAAAAAAAAAAAAAxAQAAeGwvd29ya2Jvb2sueG1sUEsBAhQAFAAICAgAsI1yXDuh3wr0AgAAAg0AABMAAAAAAAAAAAAAAAAAgAMAAHhsL3RoZW1lL3RoZW1lMS54bWxQSwECFAAUAAgICACwjXJco+d3JXgFAACoRAAADQAAAAAAAAAAAAAAAAC1BgAAeGwvc3R5bGVzLnhtbFBLAQIUABQACAgIALCNclwRDVsffQUAAO0VAAAYAAAAAAAAAAAAAAAAAGgMAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWxQSwECFAAUAAgICACwjXJcRYwbxqcJAAD6QQAAGAAAAAAAAAAAAAAAAAArEgAAeGwvd29ya3NoZWV0cy9zaGVldDIueG1sUEsBAhQAFAAICAgAsI1yXM/RyKP/AwAAhREAABQAAAAAAAAAAAAAAAAAGBwAAHhsL3NoYXJlZFN0cmluZ3MueG1sUEsBAhQAFAAICAgAsI1yXIWaNJruAAAAzgIAAAsAAAAAAAAAAAAAAAAAWSAAAF9yZWxzLy5yZWxzUEsBAhQAFAAICAgAsI1yXNh0YxFjAQAA4wIAABEAAAAAAAAAAAAAAAAAgCEAAGRvY1Byb3BzL2NvcmUueG1sUEsBAhQAFAAICAgAsI1yXF6WAY/7AAAAnAEAABAAAAAAAAAAAAAAAAAAIiMAAGRvY1Byb3BzL2FwcC54bWxQSwECFAAUAAgICACwjXJc4dYAgJcAAADxAAAAEwAAAAAAAAAAAAAAAABbJAAAZG9jUHJvcHMvY3VzdG9tLnhtbFBLAQIUABQACAgIALCNcly4kJ2ieQEAAM0GAAATAAAAAAAAAAAAAAAAADMlAABbQ29udGVudF9UeXBlc10ueG1sUEsFBgAAAAAMAAwABwMAAO0mAAAAAA==";
  function downloadTemplate(){
    const bytes=atob(TEMPLATE_B64);
    const arr=new Uint8Array(bytes.length);
    for(let i=0;i<bytes.length;i++) arr[i]=bytes.charCodeAt(i);
    const blob=new Blob([arr],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download="CoachIQ_Stats_Template.xlsx"; a.click();
    URL.revokeObjectURL(url);
  }

  return(
    <div style={{padding:20,maxWidth:920,margin:"0 auto"}}>

      {/* ── EDIT STATS MODAL (also needed in detail view) ── */}
      {editStats&&<EditStatsModal
        editStats={editStats}
        setEditStats={setEditStats}
        games={games}
        setGames={setGames}
        roster={activeRoster||[]}
      />}

      {/* ── EDIT GAME MODAL ── */}
      {editGame&&(
        <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,width:"100%",maxWidth:420,padding:28}}>
            <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2,marginBottom:4}}>EDIT GAME</div>
            <h3 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:800,marginBottom:20}}>vs {editGame.opponent}</h3>

            <div style={{marginBottom:14}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>OPPONENT</label>
              <input value={editGame.opponent} onChange={e=>setEditGame(g=>({...g,opponent:e.target.value}))}
                style={{width:"100%",padding:"11px 14px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,color:C.text,fontSize:14,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}/>
            </div>

            <div style={{marginBottom:14}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>DATE</label>
              <input type="date" value={editGame.date} onChange={e=>setEditGame(g=>({...g,date:e.target.value}))}
                style={{width:"100%",padding:"11px 14px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,color:C.text,fontSize:14,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}/>
            </div>

            <div style={{marginBottom:14}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>LOCATION</label>
              <div style={{display:"flex",gap:8}}>
                {["Home","Away"].map(l=>(
                  <button key={l} onClick={()=>setEditGame(g=>({...g,location:l}))}
                    style={{flex:1,padding:"10px",background:editGame.location===l?C.accent+"22":C.surface,
                      border:`1px solid ${editGame.location===l?C.accent:C.border}`,borderRadius:9,
                      color:editGame.location===l?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:13}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>FORMATION</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {["4-3-3","4-4-2","4-2-3-1","3-5-2","5-3-2"].map(f=>(
                  <button key={f} onClick={()=>setEditGame(g=>({...g,formation:f}))}
                    style={{padding:"7px 12px",background:editGame.formation===f?C.accent+"22":C.surface,
                      border:`1px solid ${editGame.formation===f?C.accent:C.border}`,borderRadius:8,
                      color:editGame.formation===f?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:12}}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div style={{marginBottom:24}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>SCORE</label>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{flex:1,textAlign:"center"}}>
                  <div style={{color:C.muted,fontSize:10,marginBottom:4}}>US</div>
                  <input type="number" min="0" max="30" value={editGame.ourScore}
                    onChange={e=>setEditGame(g=>({...g,ourScore:parseInt(e.target.value)||0}))}
                    style={{width:"100%",padding:"14px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,
                      color:C.text,fontSize:28,fontWeight:900,textAlign:"center",outline:"none",
                      fontFamily:"'Oswald',sans-serif",boxSizing:"border-box"}}/>
                </div>
                <div style={{color:C.muted,fontSize:24,fontWeight:900,fontFamily:"'Oswald',sans-serif",marginTop:16}}>—</div>
                <div style={{flex:1,textAlign:"center"}}>
                  <div style={{color:C.muted,fontSize:10,marginBottom:4}}>THEM</div>
                  <input type="number" min="0" max="30" value={editGame.theirScore}
                    onChange={e=>setEditGame(g=>({...g,theirScore:parseInt(e.target.value)||0}))}
                    style={{width:"100%",padding:"14px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,
                      color:C.text,fontSize:28,fontWeight:900,textAlign:"center",outline:"none",
                      fontFamily:"'Oswald',sans-serif",boxSizing:"border-box"}}/>
                </div>
              </div>
            </div>

            <div style={{marginBottom:20}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>COACH NOTES <span style={{color:C.muted,fontWeight:400,fontSize:10}}>(optional)</span></label>
              <textarea value={editGame.coachNotes||""} onChange={e=>setEditGame(g=>({...g,coachNotes:e.target.value}))}
                placeholder="Key observations, tactical notes, standout moments..."
                rows={3}
                style={{width:"100%",padding:"10px 14px",background:C.bg,border:`1px solid ${C.border}`,
                  borderRadius:9,color:C.text,fontSize:13,outline:"none",
                  fontFamily:"'Outfit',sans-serif",boxSizing:"border-box",resize:"vertical",lineHeight:1.5}}/>
            </div>

            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setEditGame(null)}
                style={{flex:1,padding:"12px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.muted,cursor:"pointer",fontSize:14}}>
                Cancel
              </button>
              <button onClick={()=>{
                  setGames(prev=>prev.map(g=>g.id===editGame.id?{...g,...editGame}:g));
                  setEditGame(null);
                }}
                style={{flex:2,padding:"12px",background:C.accent,border:"none",borderRadius:10,
                  color:"#000",fontWeight:900,fontSize:15,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
                Save Changes →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT STATS MODAL ── */}
      {editStats&&<EditStatsModal
        editStats={editStats}
        setEditStats={setEditStats}
        games={games}
        setGames={setGames}
        roster={activeRoster||[]}
      />}

      {/* ── QUICK SCORE MODAL ── */}
      {showQuick&&(
        <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,width:"100%",maxWidth:420,padding:28}}>
            <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2,marginBottom:4}}>QUICK SCORE</div>
            <h3 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:800,marginBottom:20}}>Log a Result</h3>

            <div style={{marginBottom:14,position:"relative"}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>OPPONENT</label>
              <input value={quickForm.opponent} onChange={e=>setQuickForm(f=>({...f,opponent:e.target.value}))}
                placeholder="e.g. City FC" autoFocus
                style={{width:"100%",padding:"11px 14px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,color:C.text,fontSize:14,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}/>
              {quickForm.opponent.length>1&&(()=>{
                const matches=(opponents||[]).filter(o=>o.name&&o.name.toLowerCase().includes(quickForm.opponent.toLowerCase()));
                if(!matches.length) return null;
                return(
                  <div style={{position:"absolute",top:"100%",left:0,right:0,background:C.card,border:`1px solid ${C.border}`,borderRadius:9,zIndex:10,overflow:"hidden",marginTop:2}}>
                    {matches.slice(0,5).map(o=>(
                      <div key={o.id} onMouseDown={()=>setQuickForm(f=>({...f,opponent:o.name}))}
                        style={{padding:"10px 14px",cursor:"pointer",color:C.text,fontSize:13,borderBottom:`1px solid ${C.border}`}}
                        onMouseEnter={e=>e.currentTarget.style.background=C.surface}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        {o.name}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div style={{marginBottom:14}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>DATE</label>
              <input type="date" value={quickForm.date} onChange={e=>setQuickForm(f=>({...f,date:e.target.value}))}
                style={{width:"100%",padding:"11px 14px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,color:C.text,fontSize:14,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}/>
            </div>

            <div style={{marginBottom:14}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>LOCATION</label>
              <div style={{display:"flex",gap:8}}>
                {["Home","Away"].map(l=>(
                  <button key={l} onClick={()=>setQuickForm(f=>({...f,location:l}))}
                    style={{flex:1,padding:"10px",background:quickForm.location===l?C.accent+"22":C.surface,
                      border:`1px solid ${quickForm.location===l?C.accent:C.border}`,borderRadius:9,
                      color:quickForm.location===l?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:13}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div style={{marginBottom:24}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>SCORE</label>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{flex:1,textAlign:"center"}}>
                  <div style={{color:C.muted,fontSize:10,marginBottom:4}}>US</div>
                  <input type="number" min="0" max="30" value={quickForm.ourScore}
                    onChange={e=>setQuickForm(f=>({...f,ourScore:e.target.value}))}
                    style={{width:"100%",padding:"14px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,
                      color:C.text,fontSize:28,fontWeight:900,textAlign:"center",outline:"none",
                      fontFamily:"'Oswald',sans-serif",boxSizing:"border-box"}}/>
                </div>
                <div style={{color:C.muted,fontSize:24,fontWeight:900,fontFamily:"'Oswald',sans-serif",marginTop:16}}>—</div>
                <div style={{flex:1,textAlign:"center"}}>
                  <div style={{color:C.muted,fontSize:10,marginBottom:4}}>THEM</div>
                  <input type="number" min="0" max="30" value={quickForm.theirScore}
                    onChange={e=>setQuickForm(f=>({...f,theirScore:e.target.value}))}
                    style={{width:"100%",padding:"14px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,
                      color:C.text,fontSize:28,fontWeight:900,textAlign:"center",outline:"none",
                      fontFamily:"'Oswald',sans-serif",boxSizing:"border-box"}}/>
                </div>
              </div>
            </div>

            <div style={{marginBottom:20}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>COACH NOTES <span style={{color:C.muted,fontWeight:400,fontSize:10}}>(optional)</span></label>
              <textarea value={quickForm.coachNotes} onChange={e=>setQuickForm(f=>({...f,coachNotes:e.target.value}))}
                placeholder="Key observations, tactical notes, standout moments..."
                rows={3}
                style={{width:"100%",padding:"10px 14px",background:C.bg,border:`1px solid ${C.border}`,
                  borderRadius:9,color:C.text,fontSize:13,outline:"none",
                  fontFamily:"'Outfit',sans-serif",boxSizing:"border-box",resize:"vertical",lineHeight:1.5}}/>
            </div>

            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setShowQuick(false)}
                style={{flex:1,padding:"12px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.muted,cursor:"pointer",fontSize:14}}>
                Cancel
              </button>
              <button onClick={saveQuickGame}
                disabled={!quickForm.opponent||quickForm.ourScore===""|quickForm.theirScore===""}
                style={{flex:2,padding:"12px",background:quickForm.opponent&&quickForm.ourScore!==""&&quickForm.theirScore!==""?C.accent:C.surface,
                  border:"none",borderRadius:10,color:quickForm.opponent&&quickForm.ourScore!==""&&quickForm.theirScore!==""?"#000":C.muted,
                  fontWeight:900,fontSize:15,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
                Save Result →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header row with title + import toolbar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:20}}>
        <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:26,fontWeight:700,margin:0}}>Season Games</h2>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={()=>setShowQuick(true)}
            style={{display:"flex",alignItems:"center",gap:7,padding:"9px 16px",
              background:C.accent,border:"none",borderRadius:9,color:"#000",
              fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
            + Quick Score
          </button>
          {/* Download Template — embedded xlsx, no server needed */}
          <button onClick={downloadTemplate}
            style={{display:"flex",alignItems:"center",gap:7,padding:"9px 16px",background:C.card,
              border:`1px solid ${C.border}`,borderRadius:9,color:C.muted,textDecoration:"none",
              fontWeight:700,fontSize:13,cursor:"pointer"}}>
            <Download size={14}/> Template
          </button>
          {/* Import button */}
          <button onClick={()=>fileRef.current?.click()} disabled={importing}
            style={{display:"flex",alignItems:"center",gap:7,padding:"9px 16px",
              background:importing?C.card:C.accent+"22",border:`1px solid ${C.accent}44`,
              borderRadius:9,color:C.accent,fontWeight:700,fontSize:13,cursor:"pointer"}}>
            {importing?<><RefreshCw size={14} style={{animation:"spin 1s linear infinite"}}/>Importing…</>
                      :<><Upload size={14}/>Import Spreadsheet</>}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls"
            onChange={e=>{
              if(addStatsFor){
                handleImportForGame(e, addStatsFor);
                setAddStatsFor(null);
              } else {
                handleImport(e);
              }
            }} style={{display:"none"}}/>
        </div>
      </div>

      {/* Import feedback banner */}
      {importMsg&&(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          background:importMsg.type==="ok"?C.accent+"15":C.danger+"15",
          border:`1px solid ${importMsg.type==="ok"?C.accent:C.danger}44`,
          borderRadius:10,padding:"12px 16px",marginBottom:16}}>
          <span style={{color:importMsg.type==="ok"?C.accent:C.danger,fontWeight:600,fontSize:13}}>{importMsg.text}</span>
          <button onClick={()=>setImportMsg(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:2}}><X size={14}/></button>
        </div>
      )}

      {/* How to use the template — collapsible hint */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 18px",marginBottom:18}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <FileSpreadsheet size={14} color={C.accent}/>
          <span style={{color:C.text,fontSize:13,fontWeight:600}}>Spreadsheet Import</span>
          <span style={{color:C.muted,fontSize:12,marginLeft:4}}>— Download the template, fill in game info + player stats, then import</span>
        </div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {games.filter(g=>g.status==="completed").map(game=>{
          const r=game.ourScore>game.theirScore?"W":game.ourScore<game.theirScore?"L":"D";
          const rc=r==="W"?C.accent:r==="L"?C.danger:C.warning;
          return(
            <div key={game.id}
              style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 20px",display:"flex",alignItems:"center",gap:16,transition:"all .15s"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
              onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
              <div onClick={()=>setSel(game.id)} style={{width:40,height:40,borderRadius:10,background:rc+"22",border:`2px solid ${rc}44`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:900,color:rc,fontSize:20,flexShrink:0,cursor:"pointer"}}>{r}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div onClick={()=>setSel(game.id)} style={{color:C.text,fontWeight:700,fontSize:15,cursor:"pointer"}}>vs {game.opponent}</div>
                  {(opponents||[]).find(o=>o.name===game.opponent)&&(
                    <button onClick={e=>{e.stopPropagation();onViewOpponent&&onViewOpponent(game.opponent);}}
                      title="View opponent profile"
                      style={{background:"none",border:`1px solid ${C.border}`,borderRadius:5,
                        padding:"2px 7px",color:C.muted,fontSize:10,cursor:"pointer",fontWeight:700}}>
                      Scout →
                    </button>
                  )}
                </div>
                <div style={{color:C.muted,fontSize:12,marginTop:2,display:"flex",gap:12}}>
                  <span style={{display:"flex",alignItems:"center",gap:4}}><Calendar size={11}/>{game.date}</span>
                  <span style={{display:"flex",alignItems:"center",gap:4}}><MapPin size={11}/>{game.location}</span>
                  <span>{game.formation}</span>
                </div>
              {game.coachNotes&&(
                <div style={{color:C.muted,fontSize:11,marginTop:3,
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"340px",
                  fontStyle:"italic"}}>
                  📝 {game.coachNotes}
                </div>
              )}
              </div>
              {game.entryType==="quick"&&(
                <button onClick={e=>{
                    e.stopPropagation();
                    const blank=(activeRoster||[]).map(p=>({
                      playerId:p.id,goals:0,assists:0,shots:0,shotsOnTarget:0,
                      keyPasses:0,passesCompleted:0,passesAttempted:0,passesIncomplete:0,
                      tackles:0,interceptions:0,aerialDuelsWon:0,fouls:0,
                      dangerousTurnovers:0,saves:0,goalsConceded:0,minutesPlayed:90
                    }));
                    setEditStats({gameId:game.id,stats:blank});
                  }}
                  title="Enter player stats for this game"
                  style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",
                    background:C.accent+"22",border:`1px solid ${C.accent}44`,borderRadius:7,
                    color:C.accent,fontWeight:700,fontSize:11,cursor:"pointer",flexShrink:0}}>
                  ✏ Add Stats
                </button>
              )}
              <div onClick={()=>setSel(game.id)} style={{color:C.text,fontSize:22,fontWeight:900,fontFamily:"'Oswald',sans-serif",cursor:"pointer"}}>{game.ourScore} – {game.theirScore}</div>
              <ChevronRight onClick={()=>setSel(game.id)} size={16} color={C.muted} style={{cursor:"pointer"}}/>
              {(game.stats||[]).length>0&&(
                <button
                  onClick={e=>{e.stopPropagation();setEditStats({gameId:game.id,stats:JSON.parse(JSON.stringify(game.stats))});}}
                  style={{padding:"6px 8px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,
                    color:C.muted,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",gap:4,fontSize:11,fontWeight:700,transition:"all .15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="#42a5f5";e.currentTarget.style.color="#42a5f5";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.muted;}}
                  title="Edit player stats">
                  <Pencil size={11}/> Stats
                </button>
              )}
              <button
                onClick={e=>{e.stopPropagation();setEditGame(game);}}
                style={{padding:"6px 8px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,
                  color:C.muted,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",transition:"all .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.color=C.accent;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.muted;}}
                title="Edit game">
                <Pencil size={14}/>
              </button>
              <button
                onClick={e=>{e.stopPropagation();if(window.confirm(`Delete game vs ${game.opponent}?`)){setGames(prev=>prev.filter(g=>g.id!==game.id));}}}
                style={{padding:"6px 8px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,
                  color:C.muted,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",transition:"all .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=C.danger;e.currentTarget.style.color=C.danger;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.muted;}}
                title="Delete game">
                <Trash2 size={14}/>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── LIVE TRACK ───────────────────────────────────────────────────────────────

function LiveTrackView({games,setGames,isPro,onUpgrade,roster,userId,teamId,userName,joinSessionId,onClearJoin}){
  if(!isPro) return <ProGate isPro={isPro} onUpgrade={onUpgrade} feature="Live game tracking and player ratings">{null}</ProGate>;

  const PLAYERS = roster||[];

  // ── Core state ─────────────────────────────────────────────────────────────
  const [live,       setLive]       = useState(null);
  const [stats,      setStats]      = useState({});
  const [min,        setMin]        = useState(0);
  const [autoMin,    setAutoMin]    = useState(false);
  const [events,     setEvents]     = useState([]);   // match feed
  const [form,       setForm]       = useState({opponent:"",location:"Home",formation:"4-3-3",date:new Date().toISOString().split("T")[0]});
  const [activeStat, setActiveStat] = useState(null);
  const [benched,    setBenched]    = useState(new Set());
  const [playerMins, setPlayerMins] = useState({});
  const [halfTime,   setHalfTime]   = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [flash,      setFlash]      = useState(null);
  const [subLog,     setSubLog]     = useState([]);

  // ── Realtime state ─────────────────────────────────────────────────────────
  const [sessionId,    setSessionId]    = useState(null);
  const [rtStatus,     setRtStatus]     = useState("disconnected"); // connected|disconnected|error
  const [role,         setRole]         = useState(null); // null=not picked yet
  const [connectedUsers, setConnectedUsers] = useState([]); // [{name,role}]
  const [isHost,       setIsHost]       = useState(false);
  const [lobby,        setLobby]        = useState(false); // waiting for kickoff
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [oppScorer,    setOppScorer]    = useState(false); // show opp scorer input
  const [oppScorerName,setOppScorerName]= useState("");
  const [gameNote,     setGameNote]     = useState("");
  const [showNoteInput,setShowNoteInput]= useState(false);

  // ── Possession state ───────────────────────────────────────────────────────
  const [possession, setPossession] = useState({home:0, away:0, current:null, lastTs:null}); // lastTs = Date.now()

  const timerRef = useRef(null);
  const sessionIdRef = useRef(null);

  // ── Stat groups ────────────────────────────────────────────────────────────
  const ROLES = [
    {k:"head",    label:"Head Coach",    desc:"Full access — all stats, score, subs, end game",    color:C.accent,
     stats:["goals","assists","shots","shotsOnTarget","keyPasses","passesCompleted","passesIncomplete","tackles","interceptions","aerialDuelsWon","fouls","dangerousTurnovers","saves","goalsConceded"]},
    {k:"attack",  label:"Attack Analyst",desc:"Goals, assists, shots, key passes",                color:"#ef4444",
     stats:["goals","assists","shots","shotsOnTarget","keyPasses"]},
    {k:"defence", label:"Defence Analyst",desc:"Tackles, interceptions, fouls, turnovers",        color:"#3b82f6",
     stats:["tackles","interceptions","aerialDuelsWon","fouls","dangerousTurnovers"]},
    {k:"possession",label:"Possession Tracker",desc:"Possession timing + passing stats",          color:"#27a560",
     stats:["passesCompleted","passesIncomplete","keyPasses"]},
  ];

  const STAT_GROUPS_LIVE = [
    {group:"Attack",    color:"#ff6b00", stats:[{k:"goals",label:"Goal"},{k:"assists",label:"Assist"},{k:"shots",label:"Shot"},{k:"shotsOnTarget",label:"On Target"},{k:"keyPasses",label:"Key Pass"}]},
    {group:"Passing",   color:"#66bb6a", stats:[{k:"passesCompleted",label:"Pass ✓"},{k:"passesIncomplete",label:"Pass ✗"},{k:"keyPasses",label:"Key Pass"}]},
    {group:"Defence",   color:"#42a5f5", stats:[{k:"tackles",label:"Tackle"},{k:"interceptions",label:"Int"},{k:"aerialDuelsWon",label:"Aerial"}]},
    {group:"Discipline",color:"#ffa502", stats:[{k:"fouls",label:"Foul"},{k:"dangerousTurnovers",label:"Bad Turn"}]},
    {group:"GK",        color:"#ffb300", stats:[{k:"saves",label:"Save",gkOnly:true},{k:"goalsConceded",label:"Conceded",gkOnly:true}]},
  ];

  const STAT_BTNS = STAT_GROUPS_LIVE.flatMap(g=>g.stats.map(s=>({...s,color:g.color})));

  function roleStats(r){
    if(!r) return STAT_BTNS;
    const roleObj = ROLES.find(x=>x.k===r);
    if(!roleObj) return STAT_BTNS;
    return STAT_BTNS.filter(b=>roleObj.stats.includes(b.k));
  }

  // ── Auto minute ticker ─────────────────────────────────────────────────────
  useEffect(()=>{
    if(autoMin&&live&&!halfTime&&!lobby){
      timerRef.current=setInterval(()=>setMin(function(m){
        if(m>=7200){setAutoMin(false);return 7200;}
        return m+1;
      }),1000);
    } else { clearInterval(timerRef.current); }
    return ()=>clearInterval(timerRef.current);
  },[autoMin,live,halfTime]);

  // ── Join session from notification ─────────────────────────────────────────
  useEffect(()=>{
    if(!joinSessionId) return;
    handleJoinSession(joinSessionId);
    onClearJoin&&onClearJoin();
  },[joinSessionId]);

  // Format seconds to MM:SS
  function formatSecs(s){
    var m=Math.floor(s/60);
    var sec=s%60;
    return m+"'"+String(sec).padStart(2,"0")+'"';
  }

  // ── Realtime event handler ─────────────────────────────────────────────────
  function applyRemoteEvent(event, payload){
    switch(event){
      case "stat":
        setStats(prev=>{
          const s={...prev[payload.pid]};
          s[payload.stat]=(s[payload.stat]||0)+payload.delta;
          if(payload.stat==="passesCompleted"||payload.stat==="passesIncomplete"){
            s.passesAttempted=(s.passesCompleted||0)+(s.passesIncomplete||0);
          }
          return {...prev,[payload.pid]:s};
        });
        if(payload.stat==="goals"){
          addFeedEvent("⚽ GOAL — "+(PLAYERS.find(p=>p.id===payload.pid)?.name||"Player")+" ("+payload.min+"')");
          setLive(g=>g?{...g,ourScore:g.ourScore+1}:g);
        }
        setFlash({pid:payload.pid,key:payload.stat});
        setTimeout(()=>setFlash(null),400);
        break;
      case "opp_goal":
        setLive(g=>g?{...g,theirScore:g.theirScore+1}:g);
        addFeedEvent("🔵 OPP GOAL"+(payload.scorer?" — "+payload.scorer:"")+" ("+payload.min+"')");
        break;
      case "sub_on":
        setBenched(prev=>{const n=new Set(prev);n.delete(payload.pid);return n;});
        setPlayerMins(pm=>({...pm,[payload.pid]:{...pm[payload.pid],startMin:payload.min}}));
        addFeedEvent("↑ SUB ON — "+(PLAYERS.find(p=>p.id===payload.pid)?.name||"Player")+" ("+payload.min+"')");
        break;
      case "sub_off":
        setBenched(prev=>{const n=new Set(prev);n.add(payload.pid);return n;});
        setPlayerMins(pm=>{
          const start=pm[payload.pid]?.startMin||0;
          return {...pm,[payload.pid]:{startMin:null,totalMins:(pm[payload.pid]?.totalMins||0)+(payload.min-start)}};
        });
        addFeedEvent("↓ SUB OFF — "+(PLAYERS.find(p=>p.id===payload.pid)?.name||"Player")+" ("+payload.min+"')");
        break;
      case "half_time":
        setMin(45);setAutoMin(false);setHalfTime(true);
        addFeedEvent("── Half Time ──");
        break;
      case "second_half":
        setHalfTime(false);setMin(45);
        addFeedEvent("── 2nd Half ──");
        break;
      case "possession":
        // Remote device started possession - sync their timestamp
        setPossession(function(p){
          var now2 = Date.now();
          var updated = Object.assign({},p);
          if(p.current&&p.lastTs){
            var elapsed3 = Math.round((now2-p.lastTs)/1000);
            updated[p.current] = p[p.current] + elapsed3;
          }
          updated.current = payload.team;
          updated.lastTs = payload.ts || now2;
          return updated;
        });
        break;
      case "possession_end":
        setPossession(function(p){
          if(!p.current) return Object.assign({},p,{current:null,lastTs:null});
          var elapsed4 = payload.elapsed || (p.lastTs ? Math.round((Date.now()-p.lastTs)/1000) : 0);
          var u = Object.assign({},p);
          u[p.current] = p[p.current] + elapsed4;
          u.current = null; u.lastTs = null;
          return u;
        });
        break;
      case "note":
        addFeedEvent("📝 "+payload.min+"' — "+payload.text+" ("+payload.author+")");
        break;
      case "user_joined":
        setConnectedUsers(prev=>{
          if(prev.find(u=>u.name===payload.name)) return prev;
          return [...prev,{name:payload.name,role:payload.role}];
        });
        addFeedEvent("👋 "+payload.name+" joined as "+payload.role);
        break;
      case "user_left":
        setConnectedUsers(prev=>prev.filter(u=>u.name!==payload.name));
        break;
      case "min_update":
        setMin(payload.min);
        break;
      default: break;
    }
  }

  function addFeedEvent(text){
    setEvents(ev=>[{id:Date.now(),text},...ev.slice(0,49)]);
  }

  // ── Broadcast + apply locally ──────────────────────────────────────────────
  function kickOff(){
    setLobby(false);
    setAutoMin(true);
    broadcastEvent("kickoff",{min:0});
    addFeedEvent("🔴 KICK OFF!");
  }

  function broadcastEvent(event, payload){
    realtimeManager.broadcast(event, payload);
    // Also apply locally (self:false so not echoed back)
    applyRemoteEvent(event, payload);
  }

  // ── Stat logging ───────────────────────────────────────────────────────────
  function syncPassAtt(s){ return {...s,passesAttempted:(s.passesCompleted||0)+(s.passesIncomplete||0)}; }

  function logStat(pid){
    if(!activeStat) return;
    broadcastEvent("stat",{pid,stat:activeStat,delta:1,min});
  }

  // ── Score ──────────────────────────────────────────────────────────────────
  function logOppGoal(){
    broadcastEvent("opp_goal",{min,scorer:oppScorerName.trim()||null});
    setOppScorer(false); setOppScorerName("");
  }

  // ── Substitution ──────────────────────────────────────────────────────────
  function toggleBench(pid, e){
    e&&e.stopPropagation();
    const isBenched = benched.has(pid);
    broadcastEvent(isBenched?"sub_on":"sub_off",{pid,min});
  }

  // ── Possession ─────────────────────────────────────────────────────────────
  function togglePossession(team){
    var now = Date.now();
    if(possession.current===team){
      // End current possession
      var elapsed = possession.lastTs ? Math.round((now - possession.lastTs)/1000) : 0;
      setPossession(function(p){
        return {home:p.home+(p.current==="home"?elapsed:0),away:p.away+(p.current==="away"?elapsed:0),current:null,lastTs:null};
      });
      broadcastEvent("possession_end",{min,elapsed,team:possession.current});
    } else {
      // Close previous if any
      if(possession.current){
        var elapsed2 = possession.lastTs ? Math.round((now - possession.lastTs)/1000) : 0;
        setPossession(function(p){
          return {home:p.home+(p.current==="home"?elapsed2:0),away:p.away+(p.current==="away"?elapsed2:0),current:team,lastTs:now};
        });
      } else {
        setPossession(function(p){ return {...p,current:team,lastTs:now}; });
      }
      broadcastEvent("possession",{team,min,ts:now});
    }
  }

  function possessionPct(){
    // Add live running time for current team
    var extraHome = (possession.current==="home"&&possession.lastTs) ? Math.round((Date.now()-possession.lastTs)/1000) : 0;
    var extraAway = (possession.current==="away"&&possession.lastTs) ? Math.round((Date.now()-possession.lastTs)/1000) : 0;
    var h = possession.home + extraHome;
    var a = possession.away + extraAway;
    var total = h + a;
    if(!total) return {home:50,away:50};
    return {home:Math.round(h/total*100),away:100-Math.round(h/total*100)};
  }

  // ── Half / End ─────────────────────────────────────────────────────────────
  function doHalfTime(){
    broadcastEvent("half_time",{min:min});
    setPlayerMins(pm=>{
      const u={...pm};
      PLAYERS.forEach(p=>{
        if(!benched.has(p.id)){
          const start=u[p.id]?.startMin??0;
          u[p.id]={startMin:min,totalMins:(u[p.id]?.totalMins||0)+(min-start)};
        }
      });
      return u;
    });
    setMin(2700); setAutoMin(false); setHalfTime(true); // 45*60 = 2700 secs
  }

  function startSecondHalf(){
    broadcastEvent("second_half",{min:min});
    setPlayerMins(pm=>{
      const u={...pm};
      PLAYERS.forEach(p=>{ if(!benched.has(p.id)) u[p.id]={...u[p.id],startMin:min}; });
      return u;
    });
    setHalfTime(false);
  }

  function endGame(){
    if(!isHost){addFeedEvent("Only the head coach can end the game.");return;}
    const finalMins={};
    PLAYERS.forEach(p=>{
      const pm=playerMins[p.id]||{};
      finalMins[p.id]=benched.has(p.id)?pm.totalMins||0:(pm.totalMins||0)+(min-(pm.startMin??0));
    });
    const sa=PLAYERS.map(p=>({playerId:p.id,...(stats[p.id]||{}),minutesPlayed:finalMins[p.id]||0}));
    const finalPoss={home:possession.home,away:possession.away};
    setGames(prev=>[{...live,status:"completed",stats:sa,possession:finalPoss},...prev]);
    // Clean up session
    supabase.from("live_sessions").update({status:"ended"}).eq("id",sessionIdRef.current);
    realtimeManager.broadcast("game_ended",{sessionId:sessionIdRef.current});
    realtimeManager.disconnect();
    setLive(null);setEndConfirm(false);setAutoMin(false);setSessionId(null);setRole(null);setIsHost(false);
    setPossession({home:0,away:0,current:null,lastMin:null});
    addFeedEvent("── Game Ended ──");
  }

  // ── Session management ─────────────────────────────────────────────────────
  async function startGame(){
    if(!form.opponent) return;
    const sid = "live_"+Date.now();
    sessionIdRef.current = sid;
    const init={};
    const initMins={};
    PLAYERS.forEach(p=>{
      init[p.id]={playerId:p.id,goals:0,assists:0,shots:0,shotsOnTarget:0,keyPasses:0,
        passesCompleted:0,passesAttempted:0,passesIncomplete:0,tackles:0,
        interceptions:0,aerialDuelsWon:0,dangerousTurnovers:0,fouls:0,saves:0,goalsConceded:0,minutesPlayed:0};
      initMins[p.id]={startMin:0,totalMins:0};
    });
    const gameData={id:`g${Date.now()}`,...form,ourScore:0,theirScore:0,status:"live"};

    // Save session to Supabase
    await supabase.from("live_sessions").insert({
      id:sid, team_id:teamId, user_id:userId,
      game_setup:gameData, status:"active"
    });

    // Notify teammates via team channel
    realtimeManager.broadcast("game_started",{
      sessionId:sid, opponent:form.opponent,
      coachName:userName, userId, teamId
    });

    // Connect to game channel
    realtimeManager.connect("game_"+sid, applyRemoteEvent, setRtStatus);

    setLive(gameData); setStats(init); setMin(0); setAutoMin(false); setEvents([]);
    setBenched(new Set()); setSubLog([]); setPlayerMins(initMins);
    setHalfTime(false); setActiveStat(null); setSessionId(sid); setIsHost(true);
    setRole("head"); setConnectedUsers([{name:userName,role:"Head Coach"}]);
    setPossession({home:0,away:0,current:null,lastMin:null});
    setLobby(true); // wait in lobby until kickoff
  }

  async function handleJoinSession(sid){
    // Fetch existing session
    const {data} = await supabase.from("live_sessions").select("*").eq("id",sid);
    if(!data||!data[0]) return;
    const setup = data[0].game_setup;

    // Fetch events so far
    const {data:evData} = await supabase.from("live_events").select("*").eq("session_id",sid).order("id",{ascending:true});
    // Reconstruct state from events
    const initStats={};
    const initMins={};
    PLAYERS.forEach(p=>{
      initStats[p.id]={playerId:p.id,goals:0,assists:0,shots:0,shotsOnTarget:0,keyPasses:0,
        passesCompleted:0,passesAttempted:0,passesIncomplete:0,tackles:0,
        interceptions:0,aerialDuelsWon:0,dangerousTurnovers:0,fouls:0,saves:0,goalsConceded:0,minutesPlayed:0};
      initMins[p.id]={startMin:0,totalMins:0};
    });
    var curMin=0;
    (evData||[]).forEach(function(row){
      applyRemoteEvent(row.event_type, row.payload);
      if(row.payload?.min) curMin=Math.max(curMin,row.payload.min);
    });

    sessionIdRef.current = sid;
    setLive(setup); setStats(initStats); setMin(curMin); setEvents([]);
    setBenched(new Set()); setPlayerMins(initMins); setHalfTime(false);
    setSessionId(sid); setIsHost(false);
    setPossession({home:0,away:0,current:null,lastMin:null});
    setShowRolePicker(true); // prompt role selection
    realtimeManager.connect("game_"+sid, applyRemoteEvent, setRtStatus);
  }

  function confirmRole(r){
    setRole(r);
    setShowRolePicker(false);
    broadcastEvent("user_joined",{name:userName, role:ROLES.find(x=>x.k===r)?.label||r});
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SETUP SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if(!live) return(
    <div style={{padding:24,maxWidth:520,margin:"0 auto"}}>
      <div style={{marginBottom:20}}>
        <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2}}>LIVE TRACKER</div>
        <h1 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:28,fontWeight:800,marginTop:4}}>New Game</h1>
      </div>

      {/* Opponent */}
      <div style={{marginBottom:12}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>OPPONENT</label>
        <input value={form.opponent} onChange={e=>setForm(f=>({...f,opponent:e.target.value}))}
          placeholder="e.g. City FC" autoFocus
          style={{width:"100%",padding:"12px 14px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,color:C.text,fontSize:15,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}/>
      </div>
      {/* Date */}
      <div style={{marginBottom:12}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>DATE</label>
        <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}
          style={{width:"100%",padding:"12px 14px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,color:C.text,fontSize:15,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}/>
      </div>
      {/* Location */}
      <div style={{marginBottom:12}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>LOCATION</label>
        <div style={{display:"flex",gap:8}}>
          {["Home","Away"].map(l=>(
            <button key={l} onClick={()=>setForm(f=>({...f,location:l}))}
              style={{flex:1,padding:"10px",background:form.location===l?C.accent+"22":C.card,border:`1px solid ${form.location===l?C.accent:C.border}`,borderRadius:9,color:form.location===l?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:13}}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {/* Formation */}
      <div style={{marginBottom:24}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>FORMATION</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {["4-3-3","4-4-2","4-2-3-1","3-5-2","5-3-2"].map(f=>(
            <button key={f} onClick={()=>setForm(g=>({...g,formation:f}))}
              style={{padding:"8px 14px",background:form.formation===f?C.accent+"22":C.card,border:`1px solid ${form.formation===f?C.accent:C.border}`,borderRadius:9,color:form.formation===f?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:13}}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <button onClick={startGame} disabled={!form.opponent}
        style={{width:"100%",padding:"15px",background:form.opponent?C.accent:"#2a1000",border:"none",borderRadius:11,color:form.opponent?"#000":C.muted,fontWeight:900,fontSize:16,cursor:form.opponent?"pointer":"default",fontFamily:"'Oswald',sans-serif",letterSpacing:1}}>
        🔴 KICK OFF →
      </button>

      {/* Join active session */}
      <JoinActiveSession teamId={teamId} onJoin={handleJoinSession} userId={userId}/>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ROLE PICKER (for joining assistants)
  // ─────────────────────────────────────────────────────────────────────────
  if(showRolePicker) return(
    <div style={{padding:24,maxWidth:480,margin:"0 auto"}}>
      <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2,marginBottom:4}}>LIVE GAME</div>
      <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:24,fontWeight:800,marginBottom:6}}>
        vs {live.opponent}
      </h2>
      <div style={{color:C.muted,fontSize:13,marginBottom:24}}>Choose your tracking role for this session</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {ROLES.map(r=>(
          <button key={r.k} onClick={()=>confirmRole(r.k)}
            style={{padding:"14px 18px",background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
              cursor:"pointer",textAlign:"left",transition:"all .12s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=r.color;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;}}>
            <div style={{color:r.color,fontWeight:800,fontSize:14,fontFamily:"'Oswald',sans-serif",marginBottom:2}}>{r.label}</div>
            <div style={{color:C.muted,fontSize:12}}>{r.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // LIVE SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  const activeStat_def = STAT_BTNS.find(b=>b.k===activeStat);
  const myStats = roleStats(role);
  const activePlayers = PLAYERS.filter(p=>!benched.has(p.id));
  const benchPlayers  = PLAYERS.filter(p=>benched.has(p.id));
  const pct = possessionPct();

  return(
    <div style={{height:"calc(100vh - 56px)",display:"flex",flexDirection:"column",overflow:"hidden",userSelect:"none"}}>

      {/* ── TOP BAR: score + time + possession ── */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"8px 12px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>

        {/* Minute */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:3}}>
            <button onClick={()=>setMin(m=>Math.max(0,m-1))} style={{width:20,height:20,borderRadius:4,background:C.border,border:"none",color:C.text,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
            <span style={{color:C.text,fontWeight:900,fontFamily:"'Oswald',sans-serif",fontSize:22,minWidth:52,textAlign:"center"}}>{lobby?"PRE":formatSecs(min)}</span>
            <button onClick={()=>setMin(m=>Math.min(m+1,120))} style={{width:20,height:20,borderRadius:4,background:C.accent+"33",border:`1px solid ${C.accent}44`,color:C.accent,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900}}>+</button>
          </div>
          <button onClick={()=>setAutoMin(a=>!a)}
            style={{padding:"2px 7px",borderRadius:4,border:`1px solid ${autoMin?C.accent:C.border}`,
              background:autoMin?C.accent+"22":"transparent",color:autoMin?C.accent:C.muted,fontSize:9,fontWeight:700,cursor:"pointer"}}>
            {autoMin?"⏱ ON":"⏱ OFF"}
          </button>
        </div>

        {/* Score */}
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:1}}>vs {live.opponent.toUpperCase()}</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <span style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:28,fontWeight:900,lineHeight:1}}>{live.ourScore}</span>
            <span style={{color:C.muted,fontSize:16}}>–</span>
            <span style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:28,fontWeight:900,lineHeight:1}}>{live.theirScore}</span>
          </div>
        </div>

        {/* Possession mini bar - recalculates live */}
        {(()=>{var livePct=possessionPct();return(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,flexShrink:0,minWidth:90}}>
          <div style={{color:C.muted,fontSize:9,fontWeight:700,letterSpacing:1}}>POSSESSION</div>
          <div style={{width:90,height:8,background:C.border,borderRadius:4,overflow:"hidden",position:"relative"}}>
            <div style={{position:"absolute",left:0,top:0,bottom:0,width:livePct.home+"%",background:C.accent,transition:"width .5s",borderRadius:4}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",width:90}}>
            <span style={{color:C.accent,fontSize:9,fontWeight:700}}>{livePct.home}%</span>
            <span style={{color:"#42a5f5",fontSize:9,fontWeight:700}}>{livePct.away}%</span>
          </div>
        </div>
        );})()}

        {/* Share join link */}
        {isHost&&sessionId&&(
          <button onClick={()=>{
            var link=window.location.origin+window.location.pathname+"#/live/"+sessionId;
            navigator.clipboard?.writeText(link).then(()=>alert("Join link copied! Share with your assistants.")).catch(()=>alert(link));
          }}
            style={{padding:"4px 10px",background:C.accent+"22",border:"1px solid "+C.accent+"44",
              borderRadius:6,color:C.accent,fontSize:10,fontWeight:700,cursor:"pointer",flexShrink:0}}>
            ⎘ Share Link
          </button>
        )}

        {/* RT status + connected users */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:rtStatus==="connected"?"#27a560":"#ef4444"}}/>
            <span style={{color:C.muted,fontSize:9,fontWeight:700}}>{connectedUsers.length} ONLINE</span>
          </div>
          <div style={{display:"flex",gap:3}}>
            {connectedUsers.slice(0,3).map(function(u,i){return(
              <div key={i} title={u.name}
                style={{width:18,height:18,borderRadius:"50%",background:C.accent+"33",
                border:`1px solid ${C.accent}55`,display:"flex",alignItems:"center",
                justifyContent:"center",color:C.accent,fontSize:8,fontWeight:900}}>
                {u.name[0].toUpperCase()}
              </div>
            );})}
          </div>
        </div>

        {/* Controls */}
        <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
          <div style={{display:"flex",gap:4}}>
            <button onClick={()=>setOppScorer(true)}
              style={{padding:"5px 8px",background:C.danger+"22",border:`1px solid ${C.danger}44`,borderRadius:5,color:C.danger,cursor:"pointer",fontWeight:700,fontSize:10}}>
              +OPP
            </button>
            {isHost&&(!halfTime
              ?<button onClick={doHalfTime}
                  style={{padding:"5px 8px",background:"#1a1400",border:`1px solid ${C.warning}44`,borderRadius:5,color:C.warning,cursor:"pointer",fontWeight:700,fontSize:10}}>HT</button>
              :<button onClick={startSecondHalf}
                  style={{padding:"5px 8px",background:C.accent+"22",border:`1px solid ${C.accent}44`,borderRadius:5,color:C.accent,cursor:"pointer",fontWeight:700,fontSize:10}}>2nd</button>
            )}
          </div>
          {isHost&&<button onClick={()=>setEndConfirm(true)}
            style={{padding:"4px 8px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:5,color:C.muted,cursor:"pointer",fontWeight:700,fontSize:10}}>End</button>}
        </div>
      </div>

      {/* Opp scorer input */}
      {oppScorer&&(
        <div style={{background:C.danger+"18",borderBottom:`1px solid ${C.danger}33`,padding:"8px 12px",display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
          <span style={{color:C.danger,fontWeight:700,fontSize:12}}>Opp goal scorer:</span>
          <input value={oppScorerName} onChange={e=>setOppScorerName(e.target.value)}
            placeholder="Name (optional)" autoFocus
            onKeyDown={e=>e.key==="Enter"&&logOppGoal()}
            style={{flex:1,padding:"5px 10px",background:C.bg,border:`1px solid ${C.danger}44`,borderRadius:6,color:C.text,fontSize:12,outline:"none",fontFamily:"'Outfit',sans-serif"}}/>
          <button onClick={logOppGoal} style={{padding:"5px 12px",background:C.danger,border:"none",borderRadius:6,color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>Log Goal</button>
          <button onClick={()=>{setOppScorer(false);setOppScorerName("");}} style={{padding:"5px 8px",background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,fontSize:11,cursor:"pointer"}}>✕</button>
        </div>
      )}

      {/* ── LOBBY BANNER ── */}
      {lobby&&(
        <div style={{background:"#1a0800",borderBottom:`1px solid ${C.accent}44`,
          padding:"10px 14px",display:"flex",alignItems:"center",
          justifyContent:"space-between",gap:12,flexShrink:0}}>
          <div>
            <div style={{color:C.accent,fontWeight:800,fontSize:13,fontFamily:"'Oswald',sans-serif"}}>
              PRE-GAME LOBBY
            </div>
            <div style={{color:C.muted,fontSize:11,marginTop:1}}>
              {connectedUsers.length} coach{connectedUsers.length!==1?"es":""} connected — waiting for kickoff
            </div>
          </div>
          {isHost&&(
            <button onClick={kickOff}
              style={{padding:"10px 22px",background:C.accent,border:"none",borderRadius:9,
                color:"#000",fontWeight:900,fontSize:15,cursor:"pointer",
                fontFamily:"'Oswald',sans-serif",letterSpacing:.5,flexShrink:0,
                animation:"pulse 1.5s infinite"}}>
              🔴 KICK OFF
            </button>
          )}
          {!isHost&&(
            <div style={{color:C.muted,fontSize:12,fontStyle:"italic"}}>
              Waiting for coach to kick off…
            </div>
          )}
        </div>
      )}

      {/* Half time / end banners */}
      {halfTime&&(
        <div style={{background:C.surface,borderBottom:`1px solid ${C.warning}44`,padding:"7px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <span style={{color:C.warning,fontWeight:700,fontSize:13}}>── Half Time ──</span>
          {isHost&&<button onClick={startSecondHalf}
            style={{padding:"5px 14px",background:C.accent,border:"none",borderRadius:7,color:"#000",fontWeight:800,fontSize:12,cursor:"pointer"}}>
            Start 2nd Half →
          </button>}
        </div>
      )}
      {endConfirm&&(
        <div style={{background:C.surface,borderBottom:`1px solid ${C.danger}44`,padding:"8px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexShrink:0}}>
          <span style={{color:C.text,fontSize:13}}>Save and end game?</span>
          <div style={{display:"flex",gap:8}}>
            <button onClick={endGame} style={{padding:"6px 14px",background:C.accent,border:"none",borderRadius:7,color:"#000",fontWeight:800,fontSize:13,cursor:"pointer"}}>Save & End</button>
            <button onClick={()=>setEndConfirm(false)} style={{padding:"6px 12px",background:C.card,border:`1px solid ${C.border}`,borderRadius:7,color:C.muted,fontWeight:700,fontSize:12,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── POSSESSION BUTTONS ── */}
      <div style={{background:"#0a0a0a",borderBottom:`1px solid ${C.border}`,padding:"10px 12px",display:"flex",gap:10,alignItems:"stretch",flexShrink:0}}>
        <button onClick={()=>togglePossession("home")}
          style={{flex:1,padding:"16px 8px",borderRadius:12,cursor:"pointer",fontWeight:900,
            fontSize:16,fontFamily:"'Oswald',sans-serif",letterSpacing:1,
            background:possession.current==="home"?C.accent:"#1a1000",
            border:`3px solid ${possession.current==="home"?C.accent:C.border}`,
            color:possession.current==="home"?"#000":C.muted,
            transition:"all .15s",
            boxShadow:possession.current==="home"?`0 0 20px ${C.accent}66`:"none",
            display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
          <span style={{fontSize:22}}>🟠</span>
          <span>HOME</span>
          {possession.current==="home"&&<div style={{width:8,height:8,borderRadius:"50%",background:"#000",animation:"pulse 1s infinite"}}/>}
        </button>
        <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
          <button onClick={()=>setShowNoteInput(s=>!s)}
            style={{flex:1,padding:"8px 12px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:11,
              background:C.card,border:`1px solid ${C.border}`,color:C.muted,minWidth:44}}>
            📝
          </button>
          {(()=>{var lp=possessionPct();return(
            <div style={{textAlign:"center",padding:"4px 0"}}>
              <div style={{color:C.accent,fontSize:11,fontWeight:800}}>{lp.home}%</div>
              <div style={{width:44,height:4,background:C.border,borderRadius:2,margin:"3px 0",overflow:"hidden"}}>
                <div style={{height:"100%",background:C.accent,width:lp.home+"%",transition:"width .5s"}}/>
              </div>
              <div style={{color:"#42a5f5",fontSize:11,fontWeight:800}}>{lp.away}%</div>
            </div>
          );})()}
        </div>
        <button onClick={()=>togglePossession("away")}
          style={{flex:1,padding:"16px 8px",borderRadius:12,cursor:"pointer",fontWeight:900,
            fontSize:16,fontFamily:"'Oswald',sans-serif",letterSpacing:1,
            background:possession.current==="away"?"#42a5f5":"#0a1a2a",
            border:`3px solid ${possession.current==="away"?"#42a5f5":C.border}`,
            color:possession.current==="away"?"#000":C.muted,
            transition:"all .15s",
            boxShadow:possession.current==="away"?"0 0 20px #42a5f566":"none",
            display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
          <span style={{fontSize:22}}>🔵</span>
          <span>AWAY</span>
          {possession.current==="away"&&<div style={{width:8,height:8,borderRadius:"50%",background:"#fff",animation:"pulse 1s infinite"}}/>}
        </button>
      </div>

      {/* Note input */}
      {showNoteInput&&(
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"7px 12px",display:"flex",gap:8,flexShrink:0}}>
          <input value={gameNote} onChange={e=>setGameNote(e.target.value)}
            placeholder={`Note at ${min}' (e.g. their #9 getting in behind...)`}
            onKeyDown={e=>{if(e.key==="Enter"&&gameNote.trim()){broadcastEvent("note",{text:gameNote.trim(),min,author:userName});setGameNote("");setShowNoteInput(false);}}}
            style={{flex:1,padding:"5px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12,outline:"none",fontFamily:"'Outfit',sans-serif"}}/>
          <button onClick={()=>{if(gameNote.trim()){broadcastEvent("note",{text:gameNote.trim(),min,author:userName});setGameNote("");setShowNoteInput(false);}}}
            style={{padding:"5px 12px",background:C.accent,border:"none",borderRadius:6,color:"#000",fontWeight:700,fontSize:12,cursor:"pointer"}}>Add</button>
        </div>
      )}

      {/* ── STAT SELECTOR ── */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"7px 10px",display:"flex",gap:8,overflowX:"auto",flexShrink:0,alignItems:"flex-start",WebkitOverflowScrolling:"touch"}}>
        {STAT_GROUPS_LIVE.map(group=>{
          const visibleStats = group.stats.filter(b=>{
            if(!myStats.find(s=>s.k===b.k)) return false;
            return !b.gkOnly||PLAYERS.some(p=>allPos(p).includes("GK")&&!benched.has(p.id));
          });
          if(!visibleStats.length) return null;
          return(
            <div key={group.group} style={{display:"flex",flexDirection:"column",gap:3,flexShrink:0}}>
              <div style={{color:group.color,fontSize:9,fontWeight:700,letterSpacing:1}}>{group.group}</div>
              <div style={{display:"flex",gap:3}}>
                {visibleStats.map(btn=>{
                  const active=activeStat===btn.k;
                  return(
                    <button key={btn.k} onClick={()=>setActiveStat(active?null:btn.k)}
                      style={{padding:"6px 10px",borderRadius:7,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap",
                        background:active?group.color+"33":C.card,
                        border:`2px solid ${active?group.color:C.border}`,
                        color:active?group.color:C.muted,fontWeight:700,fontSize:11,
                        boxShadow:active?`0 0 8px ${group.color}44`:"none",transition:"all .1s"}}>
                      {btn.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Active stat prompt */}
      <div style={{background:activeStat_def?activeStat_def.color+"18":C.bg,
        borderBottom:`1px solid ${activeStat_def?activeStat_def.color+"33":C.border}`,
        padding:"5px 12px",flexShrink:0,minHeight:28,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        {activeStat_def
          ?<span style={{color:activeStat_def.color,fontWeight:700,fontSize:12}}>{activeStat_def.label} — tap a player</span>
          :<span style={{color:C.muted,fontSize:11}}>Select a stat above, then tap a player</span>}
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{color:C.muted,fontSize:10,background:C.card,padding:"2px 6px",borderRadius:4,fontWeight:700}}>
            {ROLES.find(r=>r.k===role)?.label||"No role"}
          </span>
        </div>
      </div>

      {/* ── MAIN CONTENT: players + feed ── */}
      <div style={{flex:1,display:"flex",overflow:"hidden",minHeight:0}}>

        {/* Player grid */}
        <div style={{flex:1,overflowY:"auto",padding:"10px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(88px,1fr))",gap:7,marginBottom:benched.size>0?14:0}}>
            {activePlayers.map(player=>{
              const s=stats[player.id]||{};
              const cs=live.theirScore===0;
              const {rating}=calcRating({...s,minutesPlayed:min},primaryPos(player),cs);
              const rc=rColor(rating);
              const pc=posColor(primaryPos(player));
              const isFlashing=flash?.pid===player.id;
              const canLog=!!activeStat&&!!myStats.find(b=>b.k===activeStat)&&
                !(STAT_BTNS.find(b=>b.k===activeStat)?.gkOnly&&!allPos(player).includes("GK"));
              const minsOnPitch=(()=>{
                const pm=playerMins[player.id];
                if(!pm) return 0;
                return (pm.totalMins||0)+(min-(pm.startMin??0));
              })();
              return(
                <div key={player.id}
                  style={{borderRadius:10,padding:"7px 5px 5px",display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                    position:"relative",transition:"all .1s",
                    background:isFlashing?(activeStat_def?.color||C.accent)+"44":activeStat&&canLog?C.surface:C.card,
                    border:`2px solid ${isFlashing?(activeStat_def?.color||C.accent):activeStat&&canLog?(activeStat_def?.color||C.accent)+"44":C.border}`,
                    transform:isFlashing?"scale(0.95)":"scale(1)",
                    opacity:canLog||!activeStat?1:0.35}}>
                  <button onClick={e=>toggleBench(player.id,e)} title="Move to bench"
                    style={{position:"absolute",top:3,right:3,width:16,height:16,borderRadius:3,
                      background:"#2a1000",border:`1px solid ${C.border}`,color:C.muted,
                      cursor:"pointer",fontSize:9,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}>↓</button>
                  <div onClick={()=>canLog&&logStat(player.id)}
                    style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,cursor:canLog?"pointer":"default",width:"100%"}}>
                    <div style={{width:42,height:42,borderRadius:9,background:pc+"22",border:`2px solid ${pc}55`,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontFamily:"'Oswald',sans-serif",fontWeight:900,color:pc,fontSize:20}}>
                      {player.number}
                    </div>
                    <div style={{color:C.text,fontWeight:700,fontSize:10,textAlign:"center",maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {player.name.split(" ")[0]}
                    </div>
                    <div style={{color:rc,fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:14,lineHeight:1}}>
                      {rating.toFixed(1)}
                    </div>
                    {activeStat&&(
                      <div style={{color:activeStat_def?.color||C.accent,fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:16,lineHeight:1}}>
                        {s[activeStat]||0}
                      </div>
                    )}
                    <div style={{color:C.muted,fontSize:9}}>{ minsOnPitch + "'" }</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bench */}
          {benchPlayers.length>0&&(
            <div>
              <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:6,paddingLeft:2}}>BENCH</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {benchPlayers.map(player=>(
                  <div key={player.id}
                    onClick={()=>toggleBench(player.id,null)}
                    style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",
                      background:C.card,border:`1px solid ${C.border}`,borderRadius:8,cursor:"pointer"}}>
                    <div style={{width:24,height:24,borderRadius:5,background:posColor(primaryPos(player))+"22",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      color:posColor(primaryPos(player)),fontWeight:900,fontSize:12}}>
                      {player.number}
                    </div>
                    <span style={{color:C.muted,fontSize:11,fontWeight:600}}>{player.name.split(" ")[0]}</span>
                    <span style={{color:C.accent,fontSize:10,fontWeight:700}}>↑</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Match feed sidebar */}
        <div style={{width:170,borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
          <div style={{padding:"7px 10px",borderBottom:`1px solid ${C.border}`,color:C.muted,fontSize:9,fontWeight:700,letterSpacing:1,flexShrink:0}}>
            MATCH FEED
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"6px 8px"}}>
            {events.length===0&&<div style={{color:C.muted,fontSize:11,textAlign:"center",padding:"20px 0",fontStyle:"italic"}}>Events will appear here</div>}
            {events.map(ev=>(
              <div key={ev.id} style={{color:C.muted,fontSize:11,lineHeight:1.5,marginBottom:4,borderBottom:`1px solid ${C.border}`,paddingBottom:4}}>
                {ev.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveTrackerMock(){
  const STATS=[["Pass","✓"],["Key Pass","🔑"],["Tackle","🛡"],["Goal","⚽"],["Assist","🅰"],["Shot on Target","🎯"]];
  const PLAYERS=[{n:9,name:"Rodriguez",pos:"ST",col:"#ff5a1f"},{n:10,name:"Mitchell",pos:"CM",col:"#66bb6a"},
    {n:4,name:"Thompson",pos:"CB",col:"#42a5f5"},{n:1,name:"Patel",pos:"GK",col:"#ffb300"}];
  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        {STATS.map(([label,icon])=>(
          <div key={label} style={{background:"#111",border:"1px solid #1e2419",borderRadius:8,
            padding:"8px 12px",fontSize:12,color:"#c8bfb0",cursor:"pointer",display:"flex",gap:6,
            alignItems:"center",fontWeight:600}}>
            <span>{icon}</span>{label}
          </div>
        ))}
      </div>
      <div style={{fontSize:10,letterSpacing:1.5,color:"#6b6458",fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Select Player</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
        {PLAYERS.map(p=>(
          <div key={p.n} style={{background:"#111",border:`1.5px solid ${p.col}33`,borderRadius:10,
            padding:"12px 8px",textAlign:"center",cursor:"pointer",transition:"all .15s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=p.col}
            onMouseLeave={e=>e.currentTarget.style.borderColor=p.col+"33"}>
            <div style={{width:36,height:36,borderRadius:8,background:p.col+"22",
              border:`2px solid ${p.col}55`,display:"flex",alignItems:"center",justifyContent:"center",
              fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:p.col,margin:"0 auto 6px"}}>{p.n}</div>
            <div style={{fontSize:11,color:"#f5f0e8",fontWeight:600}}>{p.name}</div>
            <div style={{fontSize:10,color:"#6b6458"}}>{p.pos}</div>
          </div>
        ))}
      </div>
      <div style={{marginTop:14,padding:"10px 14px",background:"#111",border:"1px solid #1e2419",
        borderRadius:9,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:12,color:"#6b6458"}}>Last: <span style={{color:"#ff5a1f",fontWeight:700}}>⚽ Goal — Rodriguez (34')</span></div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:"#f5f0e8"}}>34<span style={{fontSize:13,color:"#6b6458"}}>'</span></div>
      </div>
    </div>
  );
}

function RatingsMock(){
  const PLAYERS=[
    {n:9,name:"Rodriguez",pos:"ST",col:"#ff5a1f",rating:8.7,w:90},
    {n:10,name:"Mitchell",pos:"CM",col:"#66bb6a",rating:8.1,w:80},
    {n:4,name:"Thompson",pos:"CB",col:"#42a5f5",rating:7.4,w:72},
    {n:7,name:"Garcia",pos:"W",col:"#66bb6a",rating:7.1,w:68},
    {n:1,name:"Patel",pos:"GK",col:"#ffb300",rating:7.0,w:65},
  ];
  const rCol=r=>r>=8?"#ff5a1f":r>=7?"#ffb300":"#c8bfb0";
  return(
    <div>
      <div style={{display:"flex",gap:12,marginBottom:16}}>
        {[["3","Goals For","#ff5a1f"],["1","Against","#e03030"],["84%","Pass Acc","#66bb6a"]].map(([v,l,c])=>(
          <div key={l} style={{flex:1,background:"#111",border:"1px solid #1e2419",borderRadius:9,padding:"12px 10px",textAlign:"center"}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:c,lineHeight:1}}>{v}</div>
            <div style={{fontSize:10,color:"#6b6458",marginTop:3,letterSpacing:.5}}>{l}</div>
          </div>
        ))}
      </div>
      {PLAYERS.map(p=>(
        <div key={p.n} style={{display:"flex",alignItems:"center",gap:10,
          padding:"8px 10px",background:"#111",border:"1px solid #1e2419",borderRadius:8,marginBottom:6}}>
          <div style={{width:28,height:28,borderRadius:6,background:p.col+"22",
            border:`1.5px solid ${p.col}44`,display:"flex",alignItems:"center",justifyContent:"center",
            fontFamily:"'Bebas Neue',sans-serif",fontSize:14,color:p.col,flexShrink:0}}>{p.n}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:"#f5f0e8",marginBottom:4}}>{p.name}</div>
            <div style={{height:3,background:"#1e2419",borderRadius:99,overflow:"hidden"}}>
              <div style={{width:`${p.w}%`,height:"100%",background:rCol(p.rating),borderRadius:99}}/>
            </div>
          </div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:rCol(p.rating),flexShrink:0}}>{p.rating}</div>
        </div>
      ))}
    </div>
  );
}

function TryoutMock(){
  const CANDS=[
    {name:"James H.",pos:"CM",scores:{T:8,A:7,Tac:8,At:9,P:7},status:"varsity"},
    {name:"Marcus L.",pos:"ST",scores:{T:9,A:8,Tac:7,At:8,P:9},status:"varsity"},
    {name:"Devon R.",pos:"CB",scores:{T:6,A:8,Tac:7,At:7,P:6},status:"jv"},
    {name:"Tyler B.",pos:"W",scores:{T:5,A:7,Tac:5,At:6,P:5},status:"cut"},
  ];
  const avg=c=>Object.values(c.scores).reduce((a,b)=>a+b,0)/5;
  const sCol={varsity:"#ff5a1f",jv:"#ffb300",cut:"#e03030",prospect:"#6b6458"};
  return(
    <div>
      <div style={{fontSize:10,letterSpacing:1.5,color:"#6b6458",fontWeight:700,textTransform:"uppercase",marginBottom:10}}>
        Candidates — Ranked by Score
      </div>
      {[...CANDS].sort((a,b)=>avg(b)-avg(a)).map((c,i)=>(
        <div key={c.name} style={{display:"flex",alignItems:"center",gap:10,
          padding:"9px 12px",background:"#111",border:"1px solid #1e2419",borderRadius:9,marginBottom:6}}>
          <div style={{color:"#6b6458",fontFamily:"'Bebas Neue',sans-serif",fontSize:16,width:18,textAlign:"center"}}>{i+1}</div>
          <div style={{width:28,height:28,borderRadius:6,background:"rgba(255,90,31,.15)",
            border:"1.5px solid rgba(255,90,31,.3)",display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:11,fontWeight:700,color:"#ff5a1f",flexShrink:0}}>{c.pos}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:"#f5f0e8"}}>{c.name}</div>
            <div style={{display:"flex",gap:3,marginTop:4}}>
              {Object.values(c.scores).map((s,i)=>(
                <div key={i} style={{width:18,height:18,borderRadius:4,fontSize:9,fontWeight:700,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  background:s>=8?"rgba(255,90,31,.2)":s>=6?"rgba(255,179,0,.15)":C.surface,
                  color:s>=8?"#ff5a1f":s>=6?"#ffb300":"#6b6458"}}>{s}</div>
              ))}
            </div>
          </div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,
            color:sCol[c.status]||"#6b6458",flexShrink:0}}>{avg(c).toFixed(1)}</div>
          <div style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:4,
            background:sCol[c.status]+"22",color:sCol[c.status],letterSpacing:.5,flexShrink:0}}>
            {c.status.toUpperCase()}
          </div>
        </div>
      ))}
    </div>
  );
}

function GamePlanMock(){
  const ZONES=[
    {label:"GK",col:"#ffb300",players:[{n:1,name:"Patel"}]},
    {label:"DEF",col:"#42a5f5",players:[{n:2,name:"Adams"},{n:4,name:"Thompson"},{n:5,name:"Chen"},{n:3,name:"Park"}]},
    {label:"MID",col:"#66bb6a",players:[{n:8,name:"Williams"},{n:6,name:"Davis"},{n:10,name:"Mitchell"}]},
    {label:"FWD",col:"#ff5a1f",players:[{n:11,name:"Garcia"},{n:7,name:"Kim"},{n:9,name:"Rodriguez"}]},
  ];
  return(
    <div>
      <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center"}}>
        <div style={{fontSize:11,color:"#6b6458",fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Formation</div>
        {["4-3-3","4-4-2","4-2-3-1"].map(f=>(
          <div key={f} style={{padding:"4px 10px",background:f==="4-3-3"?"rgba(255,90,31,.15)":"#111",
            border:`1px solid ${f==="4-3-3"?"#ff5a1f":"#1e2419"}`,borderRadius:6,
            fontSize:12,fontWeight:700,color:f==="4-3-3"?"#ff5a1f":"#6b6458",cursor:"pointer"}}>{f}</div>
        ))}
      </div>
      <div style={{background:"#080a06",borderRadius:12,padding:12,border:"1px solid #1e2419"}}>
        {[...ZONES].reverse().map(zone=>(
          <div key={zone.label} style={{marginBottom:8}}>
            <div style={{fontSize:9,letterSpacing:1.5,color:zone.col,fontWeight:700,
              textTransform:"uppercase",marginBottom:6,opacity:.7}}>{zone.label}</div>
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              {zone.players.map(p=>(
                <div key={p.n} style={{textAlign:"center",minWidth:52}}>
                  <div style={{width:40,height:40,borderRadius:9,background:zone.col+"22",
                    border:`2px solid ${zone.col}44`,display:"flex",alignItems:"center",justifyContent:"center",
                    fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:zone.col,margin:"0 auto 4px"}}>{p.n}</div>
                  <div style={{fontSize:10,color:"#c8bfb0",fontWeight:600}}>{p.name.split("")[0]}. {p.name.slice(p.name.indexOf(" ")+1)||p.name}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function FaqItem({q,a}){
  const [open,setOpen]=useState(false);
  return(
    <div style={{borderBottom:"1px solid #1e2419",overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>!o)}
        style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"20px 0",cursor:"pointer",fontSize:16,fontWeight:600,
          color:open?"#ff5a1f":"#f5f0e8",userSelect:"none",transition:"color .2s"}}>
        {q}
        <span style={{color:"#ff5a1f",fontSize:22,transition:"transform .2s",
          transform:open?"rotate(45deg)":"none",flexShrink:0,marginLeft:16}}>+</span>
      </div>
      <div style={{maxHeight:open?300:0,overflow:"hidden",
        transition:"max-height .35s ease",fontSize:15,color:"#6b6458",lineHeight:1.75,
        paddingBottom:open?18:0}}>
        {a}
      </div>
    </div>
  );
}

function LpReveal(){
  useEffect(()=>{
    const els=document.querySelectorAll(".lp-reveal");
    const obs=new IntersectionObserver(entries=>{
      entries.forEach(e=>{ if(e.isIntersecting) e.target.classList.add("lp-vis"); });
    },{threshold:0.1});
    els.forEach(el=>obs.observe(el));
    return ()=>obs.disconnect();
  },[]);
  return null;
}

function LandingPage({onAuth}){
  const [showAuth,setShowAuth]=useState(false);
  const [authMode,setAuthMode]=useState("login");

  const openSignup=()=>{setAuthMode("signup");setShowAuth(true);};
  const openLogin =()=>{setAuthMode("login"); setShowAuth(true);};

  const FEATS=[
    ["⚡","Live Game Tracker","Log stats in real time. Goals, assists, passes, tackles — one tap from your phone."],
    ["⭐","Player Ratings","Position-weighted ratings calculated automatically after every game."],
    ["📋","Tryout Manager","Score candidates, build lineups, move players straight to Varsity or JV roster."],
    ["🗺","Game Plans","Formation lineups, sub plans, and opponent notes before game day."],
    ["🏋","Practice Planner","Warmup / Main Work / Cooldown blocks. Drill library. Attendance tracking."],
    ["📅","Season Calendar","Every game, practice and tournament in one place."],
    ["🎯","Opponent Database","Scouting file on every team — formation, key players, H2H record."],
    ["🏆","Season Report","Top scorer, most improved, highest rated. One-click PDF."],
    ["📧","Player Report Emails","Send individual match reports to players after every game. One click, professional format."],
  ];
  const FAQS=[
    ["Do I need special equipment?","Just your phone. Open the app in your browser during the game and tap. No download required."],
    ["How are ratings calculated?","A position-weighted formula — goals, assists, passing accuracy, defensive actions and clean sheets all factor in based on the player's position."],
    ["Can I manage Varsity and JV separately?","Yes. Each team has its own roster, games and stats. The tryout module moves players to the right roster when you close tryouts."],
    ["Can players see their own stats?","Yes. Set a PIN per player and share a link. They enter their PIN and see their season stats, rating trend and recent games — no account needed."],
    ["Is my data safe?","All data is stored securely in the cloud. Only you can see it. We never delete anything if you cancel."],
  ];

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        .lp-root{margin:0;font-family:"DM Sans",sans-serif;background:#060606;color:#f5f0e8;overflow-x:hidden;}
        @keyframes lpUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        .lp-reveal{opacity:0;transform:translateY(28px);transition:opacity .6s ease,transform .6s ease;}
        .lp-reveal.lp-vis{opacity:1;transform:translateY(0);}
        .lp-feat:hover{background:#151810!important;}
        .lp-btn-pri{background:#ff5a1f;color:#000;border:none;padding:16px 40px;border-radius:8px;font-weight:700;font-size:16px;cursor:pointer;font-family:"DM Sans",sans-serif;box-shadow:0 0 40px rgba(255,90,31,.3);transition:all .2s;}
        .lp-btn-pri:hover{background:#ff8c42;}
        .lp-btn-sec{background:transparent;color:#f5f0e8;border:1.5px solid rgba(255,255,255,.2);padding:16px 36px;border-radius:8px;font-weight:600;font-size:16px;cursor:pointer;font-family:"DM Sans",sans-serif;text-decoration:none;display:inline-block;transition:all .2s;}
        .lp-btn-sec:hover{border-color:#f5f0e8;}
        .lp-nav-link{color:#c8bfb0;text-decoration:none;font-size:14px;font-weight:500;transition:color .2s;}
        .lp-nav-link:hover{color:#f5f0e8;}
        @media(max-width:768px){
          .lp-grid-2{grid-template-columns:1fr!important;}
          .lp-nav-links{display:none!important;}
          .lp-hero-btns{flex-direction:column;align-items:center;}
          .lp-proof{gap:24px!important;}
          .lp-who-grid{grid-template-columns:1fr!important;}
          .lp-demo-layout{grid-template-columns:1fr!important;}
        }
        @keyframes lpSlideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        @keyframes lpPulse{0%,100%{opacity:1}50%{opacity:.5}}
        .lp-tab-btn{transition:all .2s;}
        .lp-tab-btn.active{background:rgba(255,90,31,.15)!important;border-color:#ff5a1f!important;color:#ff5a1f!important;}
        .lp-tab-btn:not(.active):hover{background:rgba(255,255,255,.04)!important;}
      `}</style>

      <div className="lp-root">
        {/* NAV */}
        <nav style={{position:"fixed",top:0,left:0,right:0,zIndex:100,
          display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"16px 40px",background:"rgba(6,6,6,.9)",backdropFilter:"blur(12px)",
          borderBottom:"1px solid rgba(255,255,255,.06)"}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:2,color:"#f5f0e8"}}>
            COACH<span style={{color:"#ff5a1f"}}>IQ</span>
          </div>
          <div className="lp-nav-links" style={{display:"flex",gap:28,alignItems:"center"}}>
            <a href="#lp-features" className="lp-nav-link">Features</a>
            <a href="#lp-pricing"  className="lp-nav-link">Pricing</a>
            <a href="#lp-faq"      className="lp-nav-link">FAQ</a>
            <button onClick={openLogin}
              style={{background:"transparent",color:"#c8bfb0",border:"1.5px solid rgba(255,255,255,.2)",
                padding:"8px 18px",borderRadius:6,fontWeight:600,fontSize:13,cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif",transition:"all .2s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#f5f0e8";e.currentTarget.style.color="#f5f0e8";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color="#c8bfb0";}}>
              Sign In
            </button>
            <button onClick={openSignup} className="lp-btn-pri" style={{padding:"9px 22px",fontSize:13,boxShadow:"none"}}>
              Start Free
            </button>
          </div>
        </nav>

        {/* HERO */}
        <section style={{position:"relative",minHeight:"100vh",display:"flex",
          flexDirection:"column",alignItems:"center",justifyContent:"center",
          textAlign:"center",padding:"120px 24px 80px",overflow:"hidden"}}>
          <div style={{position:"absolute",inset:0,zIndex:0,
            background:"radial-gradient(ellipse 140% 80% at 50% 120%,#0d2a12 0%,transparent 65%)"}}/>
          <div style={{position:"relative",zIndex:1,width:"100%"}}>

            <div style={{display:"inline-flex",alignItems:"center",gap:8,
              background:"rgba(255,90,31,.12)",border:"1px solid rgba(255,90,31,.3)",
              color:"#ff5a1f",padding:"6px 16px",borderRadius:99,
              fontSize:12,fontWeight:600,letterSpacing:"1.5px",textTransform:"uppercase",
              marginBottom:28,animation:"lpUp .6s ease both"}}>
              ⚽ Built for High School Soccer Coaches
            </div>
            <h1 style={{fontFamily:"'Bebas Neue',sans-serif",
              fontSize:"clamp(64px,10vw,130px)",lineHeight:.92,letterSpacing:2,
              color:"#f5f0e8",animation:"lpUp .7s .1s ease both",margin:"0 0 24px"}}>
              Coach Smarter.<br/><span style={{color:"#ff5a1f"}}>Win More.</span>
            </h1>
            <p style={{maxWidth:540,fontSize:18,color:"#c8bfb0",lineHeight:1.65,
              margin:"0 auto 44px",animation:"lpUp .7s .2s ease both"}}>
              Live game tracking, player ratings, game plans, tryout management and season analytics —
              <strong style={{color:"#f5f0e8"}}> everything you need</strong> to run a professional program,
              without the pro-team price tag.
            </p>
            <div className="lp-hero-btns" style={{display:"flex",gap:14,justifyContent:"center",
              flexWrap:"wrap",animation:"lpUp .7s .3s ease both"}}>
              <button onClick={openSignup} className="lp-btn-pri">Start Free →</button>
              <a href="#lp-features" className="lp-btn-sec">See What's Inside</a>
            </div>
            <div className="lp-proof" style={{display:"flex",gap:40,justifyContent:"center",
              flexWrap:"wrap",marginTop:64,paddingTop:48,
              borderTop:"1px solid rgba(255,255,255,.07)",animation:"lpUp .7s .4s ease both"}}>
              {[["$0","To get started"],["2 min","Setup time"],["11+","Features built in"],["100%","Built for HS coaches"]].map(([n,l])=>(
                <div key={l} style={{textAlign:"center"}}>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:48,lineHeight:1,color:"#ff5a1f"}}>{n}</div>
                  <div style={{fontSize:13,color:"#6b6458",fontWeight:500,marginTop:4}}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </section>


        {/* WHO IT'S FOR */}
        <section style={{padding:"90px 24px",background:"#060606"}}>
          <div style={{maxWidth:1060,margin:"0 auto"}}>
            <div className="lp-reveal" style={{textAlign:"center",marginBottom:52}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:"2.5px",textTransform:"uppercase",color:"#ff5a1f",marginBottom:14}}>Who It's For</div>
              <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(40px,5vw,68px)",lineHeight:1,color:"#f5f0e8",margin:"0 0 16px"}}>
                Sound Familiar?
              </h2>
              <p style={{fontSize:17,color:"#c8bfb0",maxWidth:500,margin:"0 auto",lineHeight:1.7}}>
                CoachIQ was built by talking to coaches exactly like you.
              </p>
            </div>
            <div className="lp-reveal lp-who-grid" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20}}>
              {[
                {emoji:"📱",title:"You track everything in a notes app",body:"After every game you open your phone notes and try to remember what happened. Half of it is gone by the time you write it down.",fix:"Log stats in real time during the match. Nothing gets lost."},
                {emoji:"📊",title:"Your analytics is a gut feeling",body:"You know who your best player is but you cannot prove it. Come tryout time, you are making decisions you cannot back up with data.",fix:"Position-weighted ratings calculated automatically after every game."},
                {emoji:"⏰",title:"Tryouts take weeks to recover from",body:"Paper forms, sticky notes, 30 conversations you cannot quite remember. You spend more time on admin than coaching.",fix:"Score every candidate, build lineups, submit to rosters in one flow."},
                {emoji:"💸",title:"Pro tools are built for pro budgets",body:"Hudl costs $800+ per year. You are a high school coach spending your own money. The math does not work.",fix:"CoachIQ starts free. Pro is $9.99 per month — less than one referee fee."},
                {emoji:"🗓",title:"Game day prep is a scramble",body:"You are texting the formation to players at 6am, writing notes on your hand, hoping you remember the sub plan.",fix:"Game plans with formation builder, sub triggers, and opponent notes — all in one place."},
                {emoji:"😤",title:"Your players do not know how they are doing",body:"Players only find out they are not performing when they get dropped. No feedback loop, no improvement incentive.",fix:"Email individual match reports after every game. Players see their own ratings."},
              ].map(({emoji,title,body,fix})=>(
                <div key={title} className="lp-reveal"
                  style={{background:"#0d0d0d",border:"1px solid #1e2419",borderRadius:14,padding:28,
                    display:"flex",flexDirection:"column",gap:16}}>
                  <div style={{fontSize:32}}>{emoji}</div>
                  <div>
                    <div style={{fontSize:15,fontWeight:700,color:"#f5f0e8",marginBottom:8,lineHeight:1.4}}>{title}</div>
                    <div style={{fontSize:13,color:"#6b6458",lineHeight:1.7}}>{body}</div>
                  </div>
                  <div style={{marginTop:"auto",paddingTop:14,borderTop:"1px solid #1e2419",
                    display:"flex",gap:8,alignItems:"flex-start"}}>
                    <span style={{color:"#ff5a1f",fontWeight:700,fontSize:13,flexShrink:0}}>✓</span>
                    <span style={{fontSize:13,color:"#c8bfb0",lineHeight:1.6}}>{fix}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURE SHOWCASE */}
        <section style={{padding:"90px 24px",background:"#0a1a0d"}}>
          <div style={{maxWidth:1060,margin:"0 auto"}}>
            <div className="lp-reveal" style={{textAlign:"center",marginBottom:52}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:"2.5px",textTransform:"uppercase",color:"#ff5a1f",marginBottom:14}}>See It In Action</div>
              <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(40px,5vw,68px)",lineHeight:1,color:"#f5f0e8",margin:"0 0 16px"}}>
                Built for the Sideline
              </h2>
              <p style={{fontSize:17,color:"#c8bfb0",maxWidth:480,margin:"0 auto",lineHeight:1.7}}>
                Every screen designed to be used one-handed on a phone during a real game.
              </p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:16,marginTop:32}}>
              {[
                {icon:"📊",title:"Live Stat Tracking",desc:"Log goals, assists, passes and more in real time from the sideline"},
                {icon:"⚡",title:"Player Ratings",desc:"Automatic 1–10 ratings calculated from every stat after each game"},
                {icon:"📋",title:"Game Plans",desc:"Build and share tactical game plans with your squad before kick off"},
                {icon:"🎯",title:"Opponent Scouting",desc:"Track tendencies, set pieces and key players for every opponent"},
                {icon:"📈",title:"Season Analytics",desc:"Charts and trends across the full season to guide your decisions"},
                {icon:"🏃",title:"Practice Builder",desc:"Plan sessions with drill canvas, timings and attendance tracking"},
              ].map(function(f){return(
                <div key={f.title} style={{background:C.surface,border:"1px solid C.border",borderRadius:14,padding:"20px 18px"}}>
                  <div style={{fontSize:28,marginBottom:10}}>{f.icon}</div>
                  <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:16,color:"#f5f0e8",marginBottom:6}}>{f.title}</div>
                  <div style={{fontSize:13,color:"#a09080",lineHeight:1.6}}>{f.desc}</div>
                </div>
              );})}
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="lp-features" style={{padding:"100px 24px",background:"#0a1a0d"}}>
          <div style={{maxWidth:1100,margin:"0 auto"}}>
            <div className="lp-reveal" style={{textAlign:"center",marginBottom:52}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:"2.5px",textTransform:"uppercase",color:"#ff5a1f",marginBottom:14}}>Features</div>
              <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(40px,5vw,68px)",lineHeight:1,color:"#f5f0e8",margin:"0 0 16px"}}>Everything You Need, Nothing You Don't</h2>
              <p style={{fontSize:17,color:"#c8bfb0",maxWidth:500,margin:"0 auto",lineHeight:1.7}}>Built specifically for the one-person show that is a high school soccer coach.</p>
            </div>
            <div className="lp-reveal" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",
              gap:2,border:"2px solid #1e2419",borderRadius:16,overflow:"hidden"}}>
              {FEATS.map(([icon,name,desc])=>(
                <div key={name} className="lp-feat"
                  style={{background:"#111309",padding:"28px 24px",borderRight:"2px solid #1e2419",borderBottom:"2px solid #1e2419",transition:"background .2s"}}>
                  <div style={{width:44,height:44,borderRadius:10,marginBottom:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,background:"rgba(255,90,31,.1)",border:"1px solid rgba(255,90,31,.2)"}}>{icon}</div>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:19,letterSpacing:.5,color:"#f5f0e8",marginBottom:7}}>{name}</div>
                  <div style={{fontSize:13,color:"#6b6458",lineHeight:1.65}}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="lp-pricing" style={{padding:"100px 24px",background:"#060606"}}>
          <div style={{maxWidth:840,margin:"0 auto"}}>
            <div className="lp-reveal" style={{textAlign:"center",marginBottom:48}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:"2.5px",textTransform:"uppercase",color:"#ff5a1f",marginBottom:14}}>Pricing</div>
              <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(40px,5vw,68px)",lineHeight:1,color:"#f5f0e8",margin:"0 0 16px"}}>Less Than One Referee Fee</h2>
              <p style={{fontSize:17,color:"#c8bfb0",maxWidth:440,margin:"0 auto",lineHeight:1.7}}>Start free. Upgrade when you're ready. No contracts.</p>
            </div>
            <div className="lp-reveal" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
              {/* Free */}
              <div style={{background:"#111309",border:"1px solid #1e2419",borderRadius:14,padding:28}}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:"#6b6458",marginBottom:8}}>Free</div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:56,lineHeight:1,color:"#f5f0e8",marginBottom:4}}>
                  <span style={{fontSize:20,color:"#c8bfb0",verticalAlign:"super"}}>$</span>0
                </div>
                <div style={{fontSize:13,color:"#6b6458",marginBottom:20}}>forever</div>
                {["1 team · 15 players","Game score logging","Roster management","Calendar"].map(f=>(
                  <div key={f} style={{display:"flex",gap:10,padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.04)",fontSize:13,color:"#c8bfb0"}}>
                    <span style={{color:"#ff5a1f",fontWeight:700}}>✓</span>{f}
                  </div>
                ))}
                <button onClick={openSignup}
                  style={{display:"block",width:"100%",marginTop:20,padding:"11px",background:"transparent",
                    border:"1.5px solid rgba(255,255,255,.2)",borderRadius:8,color:"#f5f0e8",fontWeight:700,
                    fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor="#f5f0e8"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  Get Started Free
                </button>
              </div>
              {/* Pro */}
              <div style={{background:"#111309",border:"1px solid #ff5a1f",borderRadius:14,padding:28,
                boxShadow:"0 0 40px rgba(255,90,31,.12)",position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:12,right:-24,background:"#ff5a1f",color:"#000",
                  fontSize:9,fontWeight:800,letterSpacing:1.5,padding:"4px 30px",transform:"rotate(45deg)"}}>POPULAR</div>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:"#ff5a1f",marginBottom:8}}>Pro</div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:56,lineHeight:1,color:"#f5f0e8",marginBottom:4}}>
                  <span style={{fontSize:20,color:"#c8bfb0",verticalAlign:"super"}}>$</span>9<span style={{fontSize:20}}>99</span>
                </div>
                <div style={{fontSize:13,color:"#6b6458",marginBottom:20}}>per month</div>
                {["Up to 4 teams","Live stat tracking","Player ratings & reports","Game plans + share links",
                  "Opponent intelligence","Match reports & PDFs","AI match analysis","Practice & drill canvas"].map(f=>(
                  <div key={f} style={{display:"flex",gap:10,padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.04)",fontSize:13,color:"#c8bfb0"}}>
                    <span style={{color:"#ff5a1f",fontWeight:700}}>✓</span>{f}
                  </div>
                ))}
                <button onClick={openSignup} className="lp-btn-pri"
                  style={{display:"block",width:"100%",marginTop:20,padding:"11px",fontSize:13,textAlign:"center"}}>
                  Start Pro →
                </button>
              </div>
              {/* Elite */}
              <div style={{background:"#0d0a1a",border:"1px solid #7c3aed",borderRadius:14,padding:28,
                boxShadow:"0 0 40px rgba(124,58,237,.12)",position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:12,right:-24,background:"#7c3aed",color:"#fff",
                  fontSize:9,fontWeight:800,letterSpacing:1.5,padding:"4px 30px",transform:"rotate(45deg)"}}>BEST VALUE</div>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:"#7c3aed",marginBottom:8}}>Elite</div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:56,lineHeight:1,color:"#f5f0e8",marginBottom:4}}>
                  <span style={{fontSize:20,color:"#c8bfb0",verticalAlign:"super"}}>$</span>19<span style={{fontSize:20}}>99</span>
                </div>
                <div style={{fontSize:13,color:"#6b6458",marginBottom:20}}>per month</div>
                {["Everything in Pro","Unlimited teams","Multi-team analytics","Full season export PDF",
                  "Custom school branding","Priority AI analysis"].map(f=>(
                  <div key={f} style={{display:"flex",gap:10,padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.04)",fontSize:13,color:"#c8bfb0"}}>
                    <span style={{color:"#7c3aed",fontWeight:700}}>✓</span>{f}
                  </div>
                ))}
                <button onClick={openSignup}
                  style={{display:"block",width:"100%",marginTop:20,padding:"11px",background:"#7c3aed",
                    border:"none",borderRadius:8,color:"#fff",fontWeight:700,
                    fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                  Start Elite →
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="lp-faq" style={{padding:"100px 24px",background:"#0a1a0d"}}>
          <div style={{maxWidth:700,margin:"0 auto"}}>
            <div className="lp-reveal" style={{textAlign:"center",marginBottom:48}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:"2.5px",textTransform:"uppercase",color:"#ff5a1f",marginBottom:14}}>FAQ</div>
              <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(40px,5vw,68px)",lineHeight:1,color:"#f5f0e8",margin:0}}>Questions</h2>
            </div>
            <div className="lp-reveal">
              {FAQS.map(([q,a],i)=><FaqItem key={i} q={q} a={a}/>)}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{padding:"100px 24px",background:"#060606",textAlign:"center",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
            width:700,height:350,borderRadius:"50%",
            background:"radial-gradient(ellipse,rgba(255,90,31,.07) 0%,transparent 70%)",pointerEvents:"none"}}/>
          <div className="lp-reveal" style={{position:"relative",zIndex:1}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:"2.5px",textTransform:"uppercase",color:"#ff5a1f",marginBottom:14}}>Get Started Today</div>
            <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(48px,6vw,84px)",lineHeight:1,color:"#f5f0e8",margin:"0 0 20px"}}>
              Your Program Deserves Better Tools
            </h2>
            <p style={{fontSize:18,color:"#c8bfb0",maxWidth:440,margin:"0 auto 40px",lineHeight:1.7}}>Free to start, no credit card required.</p>
            <button onClick={openSignup} className="lp-btn-pri" style={{fontSize:18,padding:"18px 52px"}}>
              Start Free — No Card Needed →
            </button>
            <p style={{fontSize:13,color:"#6b6458",marginTop:16}}>2-minute setup · Works on any device · Your data stays yours</p>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{padding:"28px 48px",borderTop:"1px solid #1e2419",
          display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:2,color:"#f5f0e8"}}>
            COACH<span style={{color:"#ff5a1f"}}>IQ</span>
          </div>
          <div style={{fontSize:13,color:"#6b6458"}}>© 2026 CoachIQ. Built for high school coaches.</div>
          <button onClick={openLogin}
            style={{background:"none",border:"none",color:"#ff5a1f",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>
            Sign In →
          </button>
        </footer>
      </div>

      {/* AUTH MODAL */}
      {showAuth&&(
        <div style={{position:"fixed",inset:0,background:"#000000e0",zIndex:2000,
          display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{position:"relative",width:"100%",maxWidth:420}}>
            <button onClick={()=>setShowAuth(false)}
              style={{position:"absolute",top:-44,right:0,background:"none",border:"none",
                color:"#c8bfb0",cursor:"pointer",fontSize:26,lineHeight:1}}>✕</button>
            <AuthView onAuth={onAuth} defaultMode={authMode}/>
          </div>
        </div>
      )}

      <LpReveal/>
    </>
  );
}

// ─── AUTH VIEWS ───────────────────────────────────────────────────────────────
function AuthView({ onAuth, defaultMode="login" }) {
  const [mode, setMode]       = useState(defaultMode); // login | signup | reset
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [msg, setMsg]         = useState("");

  const iS = {
    width:"100%", padding:"12px 16px",
    background:"#181818", border:"1px solid #3a1a00",
    borderRadius:10, color:C.text, fontSize:15,
    outline:"none", fontFamily:"'Outfit',sans-serif",
    boxSizing:"border-box",
  };

  async function handleSubmit() {
    if (!email.trim() || (!password && mode !== "reset")) return;
    setLoading(true); setError(""); setMsg("");
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) { setError(error.message); }
        else if (data?.access_token || data?.user) { onAuth(data); }
        else { setError("Login failed — check your credentials."); }
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) { setError(error.message); }
        else { setMsg("Account created! Check your email to confirm, then log in."); setMode("login"); }
      } else if (mode === "reset") {
        await supabase.auth.resetPasswordForEmail(email.trim());
        setMsg("Password reset email sent. Check your inbox.");
      }
    } catch(e) {
      setError("Connection error — check your internet and try again.");
    }
    setLoading(false);
  }

  return (
    <div style={{minHeight:"100vh",background:"#080808",display:"flex",alignItems:"center",justifyContent:"center",
      backgroundImage:"radial-gradient(ellipse at 50% 0%, #ff6b0018 0%, transparent 60%)",
      fontFamily:"'Outfit',sans-serif",padding:20}}>
      <div style={{width:"100%",maxWidth:420}}>

        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:36}}>
          <AppLogo size={64} glow={true}/>
          <div style={{color:"#ffffff",fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:28,
            letterSpacing:1,marginTop:14}}>
            COACH<span style={{color:"#ff6b00"}}>IQ</span>
          </div>
          <div style={{color:"#7a4a2a",fontSize:14,marginTop:4}}>Soccer Analytics</div>
        </div>

        {/* Card */}
        <div style={{background:"#141414",border:"1px solid #3a1a00",borderRadius:16,padding:32}}>
          <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontWeight:800,fontSize:22,marginBottom:24}}>
            {mode==="login"?"Sign In":mode==="signup"?"Create Account":"Reset Password"}
          </h2>

          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
              placeholder="Email address" style={iS}/>

            {mode!=="reset"&&(
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
                placeholder="Password" style={iS}/>
            )}
          </div>

          {error&&<div style={{color:"#ff4444",fontSize:13,marginTop:12,fontWeight:600}}>{error}</div>}
          {msg&&<div style={{color:"#66bb6a",fontSize:13,marginTop:12,fontWeight:600}}>{msg}</div>}

          <button onClick={handleSubmit} disabled={loading}
            style={{width:"100%",marginTop:20,padding:"13px",
              background:loading?"#2a1000":"#ff6b00",
              border:"none",borderRadius:10,color:"#000",
              fontWeight:900,fontSize:16,cursor:loading?"default":"pointer",
              fontFamily:"'Oswald',sans-serif",letterSpacing:1,transition:"all .2s"}}>
            {loading?"..."
              :mode==="login"?"SIGN IN →"
              :mode==="signup"?"CREATE ACCOUNT →"
              :"SEND RESET EMAIL →"}
          </button>

          {/* Mode switcher */}
          <div style={{marginTop:20,display:"flex",flexDirection:"column",gap:8,alignItems:"center"}}>
            {mode==="login"&&(<>
              <button onClick={()=>{setMode("signup");setError("");setMsg("");}}
                style={{background:"none",border:"none",color:"#ff6b00",cursor:"pointer",fontSize:13,fontWeight:600}}>
                No account? Sign up free
              </button>
              <button onClick={()=>{setMode("reset");setError("");setMsg("");}}
                style={{background:"none",border:"none",color:"#7a4a2a",cursor:"pointer",fontSize:12}}>
                Forgot password?
              </button>
            </>)}
            {mode!=="login"&&(
              <button onClick={()=>{setMode("login");setError("");setMsg("");}}
                style={{background:"none",border:"none",color:"#ff6b00",cursor:"pointer",fontSize:13,fontWeight:600}}>
                ← Back to sign in
              </button>
            )}
          </div>
        </div>

        <div style={{textAlign:"center",marginTop:20,color:"#3a1a00",fontSize:11}}>
          CoachIQ · Soccer Analytics
        </div>
      </div>
    </div>
  );
}


export default function CoachIQStats(){
  const [view,          setView]          = useState("home");

  const SIDEBAR_GROUPS = [
    { label:"MATCH", items:[
      {id:"home",     icon:LayoutDashboard, label:"Home"},
      {id:"games",    icon:Trophy,          label:"Games"},
      {id:"live",     icon:Radio,           label:"Live",    pro:true},
      {id:"calendar", icon:CalendarDays,    label:"Calendar"},
      {id:"opponents",icon:Target,          label:"Opponents",pro:true},
    ]},
    { label:"SQUAD", items:[
      {id:"roster",   icon:Users,           label:"Squad"},
      {id:"tryouts",  icon:UserPlus,        label:"Tryouts"},
    ]},
    { label:"PLANNING", items:[
      {id:"gameplan", icon:BookOpen,        label:"Game Plan",pro:true},
      {id:"practice", icon:Dumbbell,        label:"Practice"},
    ]},
    { label:"INSIGHTS", items:[
      {id:"analytics",icon:BarChart2,       label:"Analytics",pro:true},
    ]},
    { label:"ACCOUNT", items:[
      {id:"settings", icon:Settings,        label:"Settings"},
    ]},
  ];

  const NAV = SIDEBAR_GROUPS.flatMap(function(g){ return g.items; });

  const [session,       setSession]       = useState(()=>supabase.auth.getSession().data.session);
  const [authLoading,   setAuthLoading]   = useState(!supabase.auth.getSession().data.session);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [theme,         setTheme]         = useLocalStorage("coachiq_theme","dark");
  Object.assign(C, THEMES[theme] || THEMES.dark);

  // ── Auth session check on mount ───────────────────────────────────────────
  useEffect(()=>{
    const s = supabase.auth.getSession().data.session;
    setSession(s);
    setAuthLoading(false);
    // Ensure proper mobile viewport
    let meta = document.querySelector('meta[name=viewport]');
    if(!meta){ meta=document.createElement('meta'); meta.name='viewport'; document.head.appendChild(meta); }
    meta.content='width=device-width, initial-scale=1, maximum-scale=1';
  },[]);

  // ── Supabase data state ───────────────────────────────────────────────────
  const [teams,       setTeamsState]    = useState([]);
  const [activeTeamId,setActiveTeamId]  = useState(null);
  const [roster,      setRosterState]   = useState([]);
  const [games,       setGamesState]    = useState([]);
  const [gamePlans,   setGamePlansState]= useState([]);
  const [practices,   setPracticesState]= useState([]);
  const [drills,      setDrillsState]   = useState([]);
  const [templates,   setTemplatesState]= useState([]);
  const [schedule,    setScheduleState] = useState([]);
  const [tryouts,     setTryoutsState]  = useState([]);
  const [opponents,   setOpponentsState] = useState([]);
  const [dataLoading, setDataLoading]   = useState(false);
  const [saveStatus,  setSaveStatus]    = useState(null); // null | "saving" | "saved" | "error"
  const [isPro,       setIsPro]         = useState(false);
  const [isElite,     setIsElite]       = useState(false);
  const [showUpgrade, setShowUpgrade]   = useState(false);
  const [upgrading,   setUpgrading]     = useState(false);
  const [upgradingElite, setUpgradingElite] = useState(false);
  const [pendingOpp,    setPendingOpp]    = useState(null);
  const [liveNotif,    setLiveNotif]    = useState(null); // {sessionId, opponent, coachName, teamId}
  const [liveJoinId,   setLiveJoinId]   = useState(null); // session to join
  const [brandName,   setBrandName]     = useState("");
  const [brandLogo,   setBrandLogo]     = useState(null);
  const saveTimerRef = useRef(null);
  const [onboarded,   setOnboarded]     = useState(true);
  const hasLoadedOnce = useRef(false);
  const [saveQueue,   setSaveQueue]     = useState({});

  // Post-checkout redirect check — must be before any returns
  useEffect(()=>{
    const params = new URLSearchParams(window.location.search);
    if(params.get("upgraded")==="true"){
      setIsPro(true);
      window.history.replaceState({},"",window.location.pathname);
    }
  },[]);


  PLAYERS = roster;

  const userId = session?.user?.id;
  const safeTeamId = activeTeamId;

  // Re-check subscription when app resumes from background
  useEffect(()=>{
    async function checkSub(){
      if(!userId) return;
      try{
        const {data:subData} = await supabase.from("teams").select("subscription_status",{filter:{user_id:userId}});
        const statuses = (subData||[]).map(t=>t.subscription_status);
        setIsElite(statuses.some(s=>s==="elite"));
        setIsPro(statuses.some(s=>s==="elite"||s==="pro"));
      }catch(e){}
    }
    function onVisible(){ if(document.visibilityState==="visible") checkSub(); }
    document.addEventListener("visibilitychange", onVisible);
    return ()=>document.removeEventListener("visibilitychange", onVisible);
  },[userId]);
  const activeTeam = teams.find(t=>t.id===activeTeamId) || teams[0];

  // ── Load all data when session exists ─────────────────────────────────────
  useEffect(()=>{
    if(!userId) return;
    loadAllData();
  },[userId]);

  async function loadAllData(){
    setDataLoading(true);
    try{
      const {data:allTeams} = await supabase.from("teams").select("*");
      const myTeams = (allTeams||[])
        .filter(t=>String(t.user_id)===String(userId))
        .map(t=>({id:t.id,name:t.name,type:t.type||'other',supaId:t.id,subscription_status:t.subscription_status||'free'}));

      // Only create default team if we got a real empty result (not null/error)
      if(Array.isArray(allTeams) && myTeams.length===0){
        const {data:newTeam} = await supabase.from("teams").insert({name:"My Team",type:"varsity",user_id:userId}).select();
        if(newTeam?.[0]){
          myTeams.push({id:newTeam[0].id,name:newTeam[0].name,type:newTeam[0].type||'varsity',supaId:newTeam[0].id});
        }
      }
      setTeamsState(myTeams);
      hasLoadedOnce.current = true;
      const tid = myTeams[0]?.id;
      // Check subscription - pro or elite follows user account
      try{
        const {data:subData} = await supabase.from("teams").select("id,subscription_status",{filter:{user_id:userId}});
        const statuses = (subData||[]).map(t=>t.subscription_status);
        const isEliteUser = statuses.some(s=>s==="elite");
        const isProUser   = isEliteUser || statuses.some(s=>s==="pro");
        setIsElite(isEliteUser);
        setIsPro(isProUser);

      }catch(e){
        const statuses = myTeams.map(t=>t.subscription_status);
        setIsElite(statuses.some(s=>s==="elite"));
        setIsPro(statuses.some(s=>s==="pro"||s==="elite"));
      }
      setActiveTeamId(tid);

      if(tid){
        await loadTeamData(tid);
      }
    }catch(e){
      console.error("Load error",e);
    }
    setDataLoading(false);
  }

  async function loadTeamData(tid){
    if(!tid||!userId) return;
    try{
      const [r,g,gp,pr,dr,tp,sc,tr,op] = await Promise.all([
        supabase.from("rosters").select("*",{filter:{team_id:tid}}),
        supabase.from("games").select("*",{filter:{team_id:tid}}),
        supabase.from("game_plans").select("*",{filter:{team_id:tid}}),
        supabase.from("practices").select("*",{filter:{team_id:tid}}),
        supabase.from("drills").select("*",{filter:{team_id:tid}}),
        supabase.from("session_templates").select("*",{filter:{team_id:tid}}),
        supabase.from("schedule").select("*",{filter:{team_id:tid}}),
        supabase.from("tryouts").select("*",{filter:{team_id:tid}}),
        supabase.from("opponents").select("*",{filter:{team_id:tid}}),
      ]);
      setRosterState((r.data?.[0]?.players) || []);
      setGamesState((g.data||[]).map(x=>x.data).sort((a,b)=>b.createdAt?.localeCompare(a.createdAt||"")||0));
      setGamePlansState((gp.data||[]).map(x=>x.data));
      setPracticesState((pr.data||[]).map(x=>x.data));
      setDrillsState((dr.data?.[0]?.data) || []);
      setTemplatesState((tp.data?.[0]?.data) || []);
      setScheduleState((sc.data||[]).map(x=>x.data));
      setTryoutsState((tr.data||[]).map(x=>x.data));
      setOpponentsState((op.data||[]).map(x=>x.data));
    }catch(e){ console.error("loadTeamData error:",e); }
  }


  // ── Save status helpers ───────────────────────────────────────────────────
  function startSave(){ setSaveStatus("saving"); }
  function endSave(err){
    if(err){
      const msg = err?.message||String(err)||"unknown error";
      console.error("Save error:",msg);
      setSaveStatus({type:"error",message:msg});
    } else {
      setSaveStatus("saved");
    }
    if(saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if(!err) saveTimerRef.current = setTimeout(()=>setSaveStatus(null), 2000); // errors stay until dismissed
  }

  // ── Data save helpers — write to Supabase ─────────────────────────────────
  async function setRoster(val){
    const resolved = typeof val==="function" ? val(roster) : val;
    setRosterState(resolved);
    startSave();
    console.log("setRoster saving, teamId:", safeTeamId, "userId:", userId, "players:", resolved.length);
    const {data, error} = await supabase.from("rosters").upsert(
      {team_id:safeTeamId,user_id:userId,players:resolved,updated_at:new Date().toISOString()},
      {onConflict:"team_id"}
    );
    console.log("setRoster result:", {data, error});
    endSave(error);
  }

  // Add a player directly to a specific team's roster (used by tryout flow)
  async function addPlayerToTeam(teamId, newPlayer){
    if(!teamId || !newPlayer) return;
    // Fetch that team's current roster from Supabase
    const {data} = await supabase.from("rosters").select("*",{filter:{team_id:teamId}});
    const currentPlayers = data?.[0]?.players || [];
    // Don't add duplicates
    const already = currentPlayers.find(p=>
      p.name.trim().toLowerCase()===newPlayer.name.trim().toLowerCase()
    );
    if(already) return;
    const updated = [...currentPlayers, newPlayer];
    startSave();
    const {error:e2} = await supabase.from("rosters").upsert(
      {team_id:teamId, user_id:userId, players:updated, updated_at:new Date().toISOString()},
      {onConflict:"team_id"}
    );
    endSave(e2);
    if(teamId===safeTeamId){ setRosterState(updated); }
  }

  async function setGames(val){
    const resolved = typeof val==="function" ? val(games) : val;
    setGamesState(resolved);
    startSave();
    try{
      const tid = safeTeamId || activeTeamId;
      const uid = userId;

      // Find added games (in resolved but not in current games)
      const added = resolved.filter(g=>!games.find(x=>x.id===g.id));
      // Find removed games (in current games but not in resolved)
      const removed = games.filter(g=>!resolved.find(x=>x.id===g.id));
      // Find updated games (same id, different content)
      const updated = resolved.filter(g=>{
        const old = games.find(x=>x.id===g.id);
        return old && JSON.stringify(old)!==JSON.stringify(g);
      });

      for(const g of added){
        const {error:e} = await supabase.from("games").insert({team_id:tid,user_id:uid,data:g});
        if(e) throw new Error("Insert failed: "+e.message);
      }
      for(const g of removed){
        const {error:e} = await supabase.from("games").delete().eq("team_id",tid).eq("data->>id",g.id);
        if(e){
          // Fallback: delete by team and rebuild
          await supabase.from("games").delete().eq("team_id",tid);
          if(resolved.length) await supabase.from("games").insert(resolved.map(x=>({team_id:tid,user_id:uid,data:x})));
          break;
        }
      }
      for(const g of updated){
        const {error:e} = await supabase.from("games").delete().eq("team_id",tid).eq("data->>id",g.id);
        if(!e) await supabase.from("games").insert({team_id:tid,user_id:uid,data:g});
      }
      endSave(null);
    }catch(e){ endSave(e); console.error("setGames error:",e); }
  }

  async function setGamePlans(val){
    const resolved = typeof val==="function" ? val(gamePlans) : val;
    setGamePlansState(resolved);
    startSave();
    try{
      const {error:e1} = await supabase.from("game_plans").delete().eq("team_id",safeTeamId);
      if(e1) throw new Error(e1.message);
      if(resolved.length){
        const {error:e2} = await supabase.from("game_plans").insert(resolved.map(p=>({team_id:safeTeamId,user_id:userId,data:p})));
        if(e2) throw new Error(e2.message);
      }
      endSave(null);
    }catch(e){ endSave(e); console.error("setGamePlans error:",e); }
  }

  async function setPractices(val){
    const resolved = typeof val==="function" ? val(practices) : val;
    setPracticesState(resolved);
    startSave();
    try{
      const {error:e1} = await supabase.from("practices").delete().eq("team_id",safeTeamId);
      if(e1) throw new Error(e1.message);
      if(resolved.length){
        const {error:e2} = await supabase.from("practices").insert(resolved.map(p=>({team_id:safeTeamId,user_id:userId,data:p})));
        if(e2) throw new Error(e2.message);
      }
      endSave(null);
    }catch(e){ endSave(e); console.error("setPractices error:",e); }
  }

  async function setDrills(val){
    const resolved = typeof val==="function" ? val(drills) : val;
    setDrillsState(resolved);
    startSave();
    const {error} = await supabase.from("drills").upsert(
      {team_id:safeTeamId,user_id:userId,data:resolved,updated_at:new Date().toISOString()},
      {onConflict:"team_id"}
    );
    endSave(error);
  }

  async function setTemplates(val){
    const resolved = typeof val==="function" ? val(templates) : val;
    setTemplatesState(resolved);
    startSave();
    const {error} = await supabase.from("session_templates").upsert(
      {team_id:safeTeamId,user_id:userId,data:resolved,updated_at:new Date().toISOString()},
      {onConflict:"team_id"}
    );
    endSave(error);
  }

  async function setSchedule(val){
    const resolved = typeof val==="function" ? val(schedule) : val;
    setScheduleState(resolved);
    startSave();
    try{
      const {error:e1} = await supabase.from("schedule").delete().eq("team_id",safeTeamId);
      if(e1) throw new Error(e1.message);
      if(resolved.length){
        const {error:e2} = await supabase.from("schedule").insert(resolved.map(e=>({team_id:safeTeamId,user_id:userId,data:e})));
        if(e2) throw new Error(e2.message);
      }
      endSave(null);
    }catch(e){ endSave(e); console.error("setSchedule error:",e); }
  }

  async function setTryouts(val){
    const resolved = typeof val==="function" ? val(tryouts) : val;
    setTryoutsState(resolved);
    startSave();
    try{
      const {error:e1} = await supabase.from("tryouts").delete().eq("team_id",safeTeamId);
      if(e1) throw new Error(e1.message);
      if(resolved.length){
        const {error:e2} = await supabase.from("tryouts").insert(resolved.map(t=>({team_id:safeTeamId,user_id:userId,data:t})));
        if(e2) throw new Error(e2.message);
      }
      endSave(null);
    }catch(e){ endSave(e); console.error("setTryouts error:",e); }
  }

  async function setOpponents(val){
    const resolved = typeof val==="function" ? val(opponents) : val;
    setOpponentsState(resolved);
    startSave();
    try{
      const {error:e1} = await supabase.from("opponents").delete().eq("team_id",safeTeamId);
      if(e1) throw new Error(e1.message);
      if(resolved.length){
        const {error:e2} = await supabase.from("opponents").insert(resolved.map(o=>({team_id:safeTeamId,user_id:userId,data:o})));
        if(e2) throw new Error(e2.message);
      }
      endSave(null);
    }catch(e){ endSave(e); console.error("setOpponents error:",e); }
  }

  // ── Team management ───────────────────────────────────────────────────────
  async function addTeam(name, type='other'){
    if(isPro && !isElite && teams.length>=4){
      alert("Pro plan includes up to 4 teams. Upgrade to Elite for unlimited teams.");
      return;
    }
    if(!isPro && teams.length>=1){
      alert("Free plan includes 1 team. Upgrade to Pro to add more teams.");
      return;
    }
    const {data} = await supabase.from("teams").insert({name,type,user_id:userId});
    const newTeam = data?.[0];
    if(!newTeam) return;
    setTeamsState(prev=>[...prev,{id:newTeam.id,name:newTeam.name,type:newTeam.type||type}]);
    setActiveTeamId(newTeam.id);
    setRosterState([]);
    setGamesState([]); setGamePlansState([]); setPracticesState([]);
    setDrillsState([]); setTemplatesState([]); setScheduleState([]); setTryoutsState([]); setOpponentsState([]);
    setView("home");
  }

  async function manageSubscription(){
    try{
      const user = session?.user;
      if(!user) return;
      const res = await fetch("/api/create-portal",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({userId:user.id}),
      });
      const {url,error} = await res.json();
      if(error) throw new Error(error);
      window.location.href = url;
    }catch(e){
      alert("Could not open billing portal: "+e.message);
    }
  }

  async function handleUpgradeElite(){
    setUpgradingElite(true);
    try{
      const user = session?.user;
      if(!user) throw new Error("Not logged in");
      const res = await fetch("/api/create-checkout",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({userId:user.id,email:user.email,teamId:safeTeamId,tier:"elite"}),
      });
      const {url,error} = await res.json();
      if(error) throw new Error(error);
      window.location.href = url;
    }catch(e){
      alert("Could not start checkout: "+e.message);
      setUpgradingElite(false);
    }
  }

  async function handleUpgrade(){
    setUpgrading(true);
    try{
      const user = session?.user;
      if(!user) throw new Error("Not logged in");
      const res = await fetch("/api/create-checkout",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({userId:user.id,email:user.email,teamId:safeTeamId}),
      });
      const {url,error} = await res.json();
      if(error) throw new Error(error);
      window.location.href = url;
    }catch(e){
      alert("Could not start checkout: "+e.message);
      setUpgrading(false);
    }
  }

  async function switchTeam(id){
    setActiveTeamId(id);
    setView("home");
    setDataLoading(true);
    try{
      await loadTeamData(id);
    }catch(e){
      console.error("switchTeam error:",e);
    }finally{
      setDataLoading(false);
    }
  }

  async function renameTeam(id,name,type){
    setTeamsState(prev=>prev.map(t=>t.id===id?{...t,name,type:type||t.type}:t));
    await supabase.from("teams").update({name,...(type?{type}:{})}).eq("id",id);
  }

  async function deleteTeam(id){
    const remaining = teams.filter(t=>t.id!==id);
    setTeamsState(remaining);
    await supabase.from("teams").delete().eq("id",id);
    if(activeTeamId===id){
      const nextId = remaining[0]?.id;
      setActiveTeamId(nextId);
      if(nextId) await loadTeamData(nextId);
    }
  }

  // ── Auth handlers ─────────────────────────────────────────────────────────
  function handleAuth(data){
    setSession(data);
  }

  async function handleSignOut(){
    await supabase.auth.signOut();
    setSession(null);
    setIsPro(false);
    setIsElite(false);
    setBrandName("");
    setBrandLogo(null);
    setTeamsState([]); setGamesState([]); setRosterState([]);
  }

  // ── Show auth screen if not logged in ────────────────────────────────────
  // Public routes — render before auth check
  if(window.location.hash.startsWith("#/player/"))   return <PlayerPortalPage/>;
  if(window.location.hash.startsWith("#/live/"))      return <LiveJoinPage/>;
  if(window.location.hash.startsWith("#/schedule/")) return <PublicSchedulePage/>;
  if(window.location.hash.startsWith("#/plan/"))   return <GamePlanSharePage/>;
  if(window.location.hash.startsWith("#/report/")) return <MatchReportPage/>;

  if(authLoading) return(
    <div style={{minHeight:"100vh",background:"#080808",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#ff6b00",fontSize:14}}>Loading…</div>
    </div>
  );

  if(!session) return <LandingPage onAuth={handleAuth}/>;

  // ── Show onboarding if first time ────────────────────────────────────────
  const showOnboarding = !dataLoading && hasLoadedOnce.current && teams.length===1 && roster.length===0 && games.length===0 && gamePlans.length===0;

  // ── Show loading spinner while data loads ─────────────────────────────────
  if(dataLoading) return(
    <div style={{minHeight:"100vh",background:"#080808",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <AppLogo size={60} glow={true}/>
      <div style={{color:"#ff6b00",fontSize:14,fontFamily:"'Outfit',sans-serif"}}>Loading your data…</div>
    </div>
  );

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700;800;900&family=Outfit:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};color:${C.text};font-family:'Outfit',sans-serif;} html{background:${C.bg};}
        ::-webkit-scrollbar{width:5px;height:5px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#ff6b0055;border-radius:3px;}
        input,select,textarea{font-family:'Outfit',sans-serif;}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .sidebar-item:hover{background:#ff6b0018 !important;}
        .card-hover:hover{border-color:#ff6b0055 !important;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}

        /* ── MOBILE ONLY — desktop 100% unaffected ── */
        @media(max-width:768px){
          /* Show hamburger */
          .mobile-nav{display:flex !important;}
          /* Hide desktop sidebar */
          .desktop-sidebar{display:none !important;}
          /* Hide email in top bar */
          .hide-mobile{display:none !important;}
          /* Hide date, theme toggle, suggest on mobile */
          .topbar-date{display:none !important;}
          .topbar-theme{display:none !important;}
          .topbar-suggest{display:none !important;}
          /* Hide save status text on mobile */
          .save-status-bar{display:none !important;}
          /* Grids collapse to single column */
          .resp-grid{grid-template-columns:1fr !important;}
          .resp-grid-2{grid-template-columns:1fr !important;}
          .resp-grid-sidebar{grid-template-columns:1fr !important;}
          .resp-grid-actions{grid-template-columns:1fr 1fr !important;}
          /* Live tracker stack */
          .live-grid{grid-template-columns:1fr !important;}
          .live-sub-grid{grid-template-columns:1fr 1fr !important;}
          /* Practice stack */
          .practice-grid{grid-template-columns:1fr !important;}
          .practice-section-header{flex-wrap:wrap !important;}
          /* Drill card notes full width */
          .drill-card-row{flex-wrap:wrap !important;}
          /* Modals full screen */
          .modal-inner{
            max-width:100% !important;
            max-height:90vh !important;
            border-radius:16px 16px 0 0 !important;
            overflow-y:auto !important;
          }
          .modal-outer{align-items:flex-end !important;padding:0 !important;}
          /* Drill canvas bottom sheet */
          .drill-canvas-inner{
            max-width:100% !important;
            border-radius:16px 16px 0 0 !important;
          }
          /* Reduce main content padding */
          .mobile-page-pad{padding:12px !important;}
          /* Top bar compact */
          .topbar-pro-badge{font-size:10px !important;padding:4px 8px !important;}
        }
      `}</style>
      {/* ── FEEDBACK MODAL ── */}


      {/* ── UPGRADE MODAL ── */}
      {showUpgrade&&(
        <div className="modal-outer" style={{position:"fixed",inset:0,background:"#000000dd",zIndex:2000,
          display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div className="modal-inner" style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:24,
            width:"100%",maxWidth:440,overflow:"hidden"}}>
            <div style={{background:"linear-gradient(135deg,#0d0400,#2a0800)",padding:"28px 28px 24px",
              textAlign:"center",position:"relative"}}>
              <button onClick={()=>setShowUpgrade(false)}
                style={{position:"absolute",top:16,right:16,background:"none",border:"none",
                  color:"#ffffff66",cursor:"pointer",fontSize:20}}>&#x2715;</button>
              <div style={{color:C.accent,fontSize:13,fontWeight:800,letterSpacing:2,marginBottom:8}}>COACHIQ PRO</div>
              <div style={{color:"#fff",fontFamily:"'Oswald',sans-serif",fontSize:42,fontWeight:900,lineHeight:1}}>
                $9.99<span style={{fontSize:18,fontWeight:400,color:"#ffffff88"}}>/mo</span>
              </div>
              <div style={{color:"#ffffff66",fontSize:13,marginTop:8}}>Cancel anytime · Secured by Stripe</div>
            </div>
            <div style={{padding:"20px 24px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                {/* Pro Card */}
                <div style={{border:`1.5px solid ${C.accent}44`,borderRadius:12,padding:"14px 16px",background:C.surface}}>
                  <div style={{color:C.accent,fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:18,marginBottom:2}}>PRO</div>
                  <div style={{color:C.text,fontSize:22,fontWeight:900,fontFamily:"'Oswald',sans-serif",marginBottom:12}}>$9.99<span style={{fontSize:12,fontWeight:400,color:C.muted}}>/mo</span></div>
                  {["Live tracking & ratings","Game plans & share links","Opponent database","Match reports & PDFs","AI match analysis","Up to 4 teams","Practice & attendance","Season analytics"].map(function(f){return(
                    <div key={f} style={{display:"flex",gap:7,alignItems:"flex-start",marginBottom:7}}>
                      <span style={{color:C.accent,fontSize:11,fontWeight:800,flexShrink:0,marginTop:1}}>✓</span>
                      <span style={{color:C.muted,fontSize:11,lineHeight:1.4}}>{f}</span>
                    </div>
                  );})}
                  <button onClick={handleUpgrade} disabled={upgrading}
                    style={{width:"100%",marginTop:12,padding:"10px",background:upgrading?C.surface:C.accent,
                      border:"none",borderRadius:9,color:upgrading?C.muted:"#000",fontWeight:800,
                      fontSize:13,cursor:upgrading?"default":"pointer",fontFamily:"'Oswald',sans-serif"}}>
                    {upgrading?"Redirecting...":"Get Pro"}
                  </button>
                </div>
                {/* Elite Card */}
                <div style={{border:"1.5px solid #7c3aed",borderRadius:12,padding:"14px 16px",background:"#7c3aed11",position:"relative"}}>
                  <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",
                    background:"#7c3aed",borderRadius:20,padding:"2px 12px",
                    fontSize:10,fontWeight:800,color:"#fff",whiteSpace:"nowrap"}}>BEST VALUE</div>
                  <div style={{color:"#7c3aed",fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:18,marginBottom:2}}>ELITE</div>
                  <div style={{color:C.text,fontSize:22,fontWeight:900,fontFamily:"'Oswald',sans-serif",marginBottom:12}}>$19.99<span style={{fontSize:12,fontWeight:400,color:C.muted}}>/mo</span></div>
                  {["Everything in Pro","Unlimited teams","Multi-team analytics","Full season export PDF","Custom school branding","Priority AI analysis"].map(function(f){return(
                    <div key={f} style={{display:"flex",gap:7,alignItems:"flex-start",marginBottom:7}}>
                      <span style={{color:"#7c3aed",fontSize:11,fontWeight:800,flexShrink:0,marginTop:1}}>✓</span>
                      <span style={{color:C.muted,fontSize:11,lineHeight:1.4}}>{f}</span>
                    </div>
                  );})}
                  <button onClick={handleUpgradeElite} disabled={upgradingElite}
                    style={{width:"100%",marginTop:12,padding:"10px",background:upgradingElite?"transparent":"#7c3aed",
                      border:"none",borderRadius:9,color:upgradingElite?C.muted:"#fff",fontWeight:800,
                      fontSize:13,cursor:upgradingElite?"default":"pointer",fontFamily:"'Oswald',sans-serif"}}>
                    {upgradingElite?"Redirecting...":"Get Elite"}
                  </button>
                </div>
              </div>
              <div style={{textAlign:"center",color:C.muted,fontSize:11}}>
                No hidden fees · Cancel anytime · Secured by Stripe
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{minHeight:"100vh",background:C.bg,display:"flex",transition:"background .3s"}}>

        {/* ═══ MOBILE SIDEBAR OVERLAY ════════════════════════════════════ */}
        {mobileSidebarOpen&&(
          <>
            <div className="sidebar-overlay" onClick={()=>setMobileSidebarOpen(false)}/>
            <div style={{position:"fixed",top:0,left:0,height:"100vh",width:240,
              background:C.sidebar,borderRight:`1px solid ${C.sidebarBorder}`,
              display:"flex",flexDirection:"column",zIndex:200,overflowY:"auto"}}>
              {/* Mobile close button */}
              <div style={{display:"flex",justifyContent:"flex-end",padding:"12px 14px"}}>
                <button onClick={()=>setMobileSidebarOpen(false)}
                  style={{background:"none",border:"none",color:"#ffffff88",cursor:"pointer",fontSize:20}}>✕</button>
              </div>
              {/* Team switcher */}
              <div style={{padding:"8px 16px 12px",borderBottom:`1px solid ${C.sidebarBorder}`}}>
                <div style={{color:"#ffffff88",fontSize:9,fontWeight:700,letterSpacing:1.5,marginBottom:8}}>TEAM</div>
                {teams.length>1?(
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {teams.map(t=>(
                      <button key={t.id}
                        onClick={()=>{switchTeam(t.id);setMobileSidebarOpen(false);}}
                        style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
                          borderRadius:8,border:`1.5px solid ${t.id===safeTeamId?C.accent:"C.border"}`,
                          background:t.id===safeTeamId?C.accent+"22":"transparent",
                          color:t.id===safeTeamId?C.accent:"#ffffffaa",
                          cursor:"pointer",fontSize:13,fontWeight:t.id===safeTeamId?700:500,
                          width:"100%",textAlign:"left"}}>
                        <div style={{width:8,height:8,borderRadius:"50%",
                          background:t.id===safeTeamId?C.accent:C.border,flexShrink:0}}/>
                        {t.name}
                        {t.id===safeTeamId&&<span style={{marginLeft:"auto",fontSize:10,opacity:.7}}>✓</span>}
                      </button>
                    ))}
                  </div>
                ):(
                  <div style={{color:"#ffffff",fontWeight:700,fontSize:14}}>{activeTeam?.name||"My Team"}</div>
                )}
              </div>
              {/* Nav */}
              <nav style={{flex:1,padding:"8px 0"}}>
                {SIDEBAR_GROUPS.map(group=>(
                  <div key={group.label}>
                    <div style={{color:"#5a3020",fontSize:9,fontWeight:700,letterSpacing:2,padding:"10px 16px 4px",textTransform:"uppercase"}}>{group.label}</div>
                    {group.items.map(item=>{
                      const Icon=item.icon;
                      const active=view===item.id;
                      return(
                        <button key={item.id}
                          onClick={()=>{setView(item.id);setMobileSidebarOpen(false);}}
                          style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 16px",
                            background:active?"#ff6b0018":"transparent",border:"none",
                            borderLeft:active?`3px solid ${C.accent}`:"3px solid transparent",
                            color:active?C.accent:"#ffffffaa",cursor:"pointer",fontWeight:active?700:500,fontSize:14}}>
                          <Icon size={16}/><span>{item.label}</span>
                          {item.id==="live"&&<span style={{width:6,height:6,borderRadius:"50%",background:C.danger,animation:"pulse 2s infinite",marginLeft:2}}/>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </nav>
              {/* Mobile bottom actions */}
              <div style={{borderTop:`1px solid ${C.sidebarBorder}`,padding:"12px 16px",display:"flex",flexDirection:"column",gap:8}}>
                <button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                    background:"transparent",border:`1px solid C.border`,borderRadius:8,
                    color:"#ffffffaa",cursor:"pointer",fontSize:13,fontWeight:600,width:"100%"}}>
                  {theme==="dark"?"☀ Light Mode":"☾ Dark Mode"}
                </button>
                
                <button onClick={handleSignOut}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                    background:"transparent",border:`1px solid rgba(255,90,31,.3)`,borderRadius:8,
                    color:"#ff6b00",cursor:"pointer",fontSize:13,fontWeight:700,width:"100%"}}>
                  Sign Out
                </button>
              </div>
            </div>
          </>
        )}

        {/* ═══ SIDEBAR (desktop) ══════════════════════════════════════════ */}
        <div className="desktop-sidebar" style={{
          width: sidebarCollapsed ? 60 : 220,
          flexShrink:0,
          background:C.sidebar,
          borderRight:`1px solid ${C.sidebarBorder}`,
          display:"flex",flexDirection:"column",
          position:"sticky",top:0,height:"100vh",
          transition:"width .2s ease",
          overflow:"hidden",
          zIndex:50,
        }}>
          {/* Logo + collapse toggle */}
          <div style={{padding:"0 10px",borderBottom:`1px solid ${C.sidebarBorder}`,display:"flex",alignItems:"center",justifyContent:"space-between",height:64,flexShrink:0}}>
            {sidebarCollapsed ? (
              /* Collapsed: just the M logo, click to expand */
              <button onClick={()=>setSidebarCollapsed(false)}
                style={{background:"none",border:"none",cursor:"pointer",padding:0,margin:"0 auto",display:"flex"}}>
                <AppLogo size={38} glow={true}/>
              </button>
            ) : (
              <>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <AppLogo size={38} glow={true}/>
                  <div>
                    <div style={{color:"#ffffff",fontFamily:"'Oswald',sans-serif",fontWeight:800,fontSize:13,letterSpacing:1,whiteSpace:"nowrap",textTransform:"uppercase"}}>
                      COACH<span style={{color:C.accent}}>IQ</span>
                    </div>
                  </div>
                </div>
                {/* Collapse button — always visible when expanded */}
                <button onClick={()=>setSidebarCollapsed(true)}
                  style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,
                    color:C.muted,cursor:"pointer",padding:"5px 7px",flexShrink:0,
                    display:"flex",alignItems:"center",justifyContent:"center"}}
                  title="Collapse sidebar">
                  <ChevronDown size={14} style={{transform:"rotate(90deg)"}}/>
                </button>
              </>
            )}
          </div>

          {/* Team switcher — full when expanded, icon button when collapsed */}
          <div style={{borderBottom:`1px solid ${C.sidebarBorder}`,padding: sidebarCollapsed?"8px 10px":"12px 14px",flexShrink:0}}>
            {sidebarCollapsed ? (
              /* Collapsed: show active team initial as a clickable button */
              <div style={{position:"relative"}}>
                <button
                  onClick={()=>setSidebarCollapsed(false)}
                  title={`Team: ${teams.find(t=>t.id===safeTeamId)?.name||"Team"} — expand to switch`}
                  style={{width:40,height:40,borderRadius:9,margin:"0 auto",display:"flex",
                    alignItems:"center",justifyContent:"center",cursor:"pointer",
                    background:C.accent+"22",border:`1px solid ${C.accent}44`,
                    fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:16,color:C.accent}}>
                  {(teams.find(t=>t.id===safeTeamId)?.name||"T")[0].toUpperCase()}
                </button>
              </div>
            ) : (
              <>
                <div style={{color:C.muted,fontSize:9,fontWeight:700,letterSpacing:1.5,marginBottom:8}}>TEAM</div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {teams.map(t=>(
                    <button key={t.id} onClick={()=>switchTeam(t.id)}
                      style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",
                        borderRadius:7,border:`1.5px solid ${t.id===safeTeamId?C.accent:"C.border"}`,
                        background:t.id===safeTeamId?C.accent+"22":"transparent",
                        color:t.id===safeTeamId?C.accent:"#ffffffaa",
                        cursor:"pointer",fontSize:12,fontWeight:t.id===safeTeamId?700:500,
                        width:"100%",textAlign:"left"}}>
                      <div style={{width:7,height:7,borderRadius:"50%",flexShrink:0,
                        background:t.id===safeTeamId?C.accent:C.border}}/>
                      {t.name}
                      {t.id===safeTeamId&&<span style={{marginLeft:"auto",fontSize:10}}>✓</span>}
                    </button>
                  ))}
                  <button onClick={addTeam}
                    style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",
                      borderRadius:7,border:`1px solid C.border`,
                      background:"transparent",color:"rgba(255,255,255,.4)",
                      cursor:"pointer",fontSize:11,width:"100%"}}>
                    + Add Team
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Nav groups */}
          <nav style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
            {SIDEBAR_GROUPS.map(group=>(
              <div key={group.label} style={{marginBottom:4}}>
                {!sidebarCollapsed&&(
                  <div style={{color:"#5a3020",fontSize:9,fontWeight:700,letterSpacing:2,
                    padding:"12px 16px 4px",textTransform:"uppercase"}}>{group.label}</div>
                )}
                {group.items.map(item=>{
                  const Icon=item.icon;
                  const active=view===item.id;
                  return(
                    <button key={item.id}
                      className="sidebar-item"
                      onClick={()=>setView(item.id)}
                      title={sidebarCollapsed?item.label:undefined}
                      style={{
                        display:"flex",alignItems:"center",position:"relative",
                        gap:sidebarCollapsed?0:10,
                        width:"100%",padding: sidebarCollapsed?"12px 0":"9px 16px",
                        justifyContent: sidebarCollapsed?"center":"flex-start",
                        background: active?"#ff6b0018":"transparent",
                        border:"none",
                        borderLeft: active?`3px solid ${C.accent}`:"3px solid transparent",
                        color: active?C.accent:C.muted,
                        cursor:"pointer",fontWeight:active?700:500,fontSize:13,
                        transition:"all .12s",textAlign:"left",
                      }}>
                      <Icon size={16} style={{flexShrink:0}}/>
                      {!sidebarCollapsed&&(
                        <span style={{whiteSpace:"nowrap",flex:1}}>{item.label}</span>
                      )}
                      {item.id==="live"&&!sidebarCollapsed&&(
                        <span style={{width:6,height:6,borderRadius:"50%",background:C.danger,animation:"pulse 2s infinite",flexShrink:0}}/>
                      )}
                      {item.id==="live"&&sidebarCollapsed&&(
                        <span style={{position:"absolute",top:8,right:8,width:6,height:6,borderRadius:"50%",background:C.danger,animation:"pulse 2s infinite"}}/>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Season record at bottom */}
          {!sidebarCollapsed&&(()=>{
            const ts=teamSum(games);
            return(
              <div style={{padding:"12px 16px",borderTop:`1px solid ${C.sidebarBorder}`}}>
                <div style={{color:"#ffffff88",fontSize:9,fontWeight:700,letterSpacing:1.5,marginBottom:8}}>THIS SEASON</div>
                <div style={{display:"flex",gap:10}}>
                  {[["W",ts.wins,C.accent],["D",ts.draws,C.warning],["L",ts.losses,C.danger]].map(([l,v,c])=>(
                    <div key={l} style={{flex:1,textAlign:"center"}}>
                      <div style={{color:c,fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:18,lineHeight:1}}>{v}</div>
                      <div style={{color:"#ffffff66",fontSize:10,fontWeight:600}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* ═══ MAIN CONTENT ══════════════════════════════════════════════ */}
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"}}>

          {/* Top bar — slim, no nav */}
          <div style={{height:52,background:C.topbar,borderBottom:`1px solid ${C.border}`,
            display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"0 14px",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              {/* Hamburger — mobile only */}
              <button className="mobile-nav"
                onClick={()=>setMobileSidebarOpen(true)}
                style={{background:"none",border:"none",color:C.text,cursor:"pointer",padding:6,
                  display:"none",alignItems:"center",justifyContent:"center"}}>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  <div style={{width:20,height:2,background:C.text,borderRadius:1}}/>
                  <div style={{width:20,height:2,background:C.text,borderRadius:1}}/>
                  <div style={{width:14,height:2,background:C.text,borderRadius:1}}/>
                </div>
              </button>
            <div style={{color:C.muted,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
              <span>{activeTeam?.name}</span>
              <span style={{color:C.border}}>·</span>
              <span style={{color:C.text}}>{NAV.find(n=>n.id===view)?.label||"Home"}</span>
              {session?.user?.email&&<span style={{color:C.muted,fontSize:10,marginLeft:4}} className="hide-mobile">({session.user.email})</span>}
            </div>
            </div>
            {/* Save status indicator */}
            {saveStatus&&(
              <div className="save-status-bar" style={{display:"flex",alignItems:"center",gap:6,
                padding:saveStatus?.type==="error"?"8px 14px":"4px 12px",
                borderRadius:saveStatus?.type==="error"?10:20,
                fontSize:12,fontWeight:600,transition:"all .3s",maxWidth:saveStatus?.type==="error"?"400px":"none",
                background:saveStatus==="saving"?C.surface:saveStatus==="saved"?C.accent+"22":C.danger+"22",
                border:`1px solid ${saveStatus==="saving"?C.border:saveStatus==="saved"?C.accent:C.danger}`,
                color:saveStatus==="saving"?C.muted:saveStatus==="saved"?C.accent:C.danger}}>
                {saveStatus==="saving"&&(
                  <div style={{width:8,height:8,borderRadius:"50%",border:`2px solid ${C.muted}`,
                    borderTopColor:"transparent",animation:"spin .6s linear infinite"}}/>
                )}
                {saveStatus==="saved"&&<span>✓</span>}
                {(saveStatus?.type==="error")&&<span>⚠</span>}
                <span style={{flex:1,wordBreak:"break-word"}}>
                  {saveStatus==="saving"?"Saving…":saveStatus==="saved"?"Saved":`Error: ${saveStatus?.message||"unknown"}`}
                </span>
                {saveStatus?.type==="error"&&(
                  <button onClick={()=>setSaveStatus(null)}
                    style={{background:"none",border:"none",color:C.danger,cursor:"pointer",
                      fontSize:16,padding:"0 0 0 8px",lineHeight:1,flexShrink:0}}>✕</button>
                )}
              </div>
            )}

            {/* Right side: date + theme + sign out */}
            <div className="topbar-right" style={{display:"flex",alignItems:"center",gap:10}}>
              <span className="topbar-date" style={{color:C.muted,fontSize:11}}>{new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</span>
              <button className="topbar-theme"
                onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}
                title={theme==="dark"?"Switch to Light Mode":"Switch to Dark Mode"}
                style={{display:"flex",alignItems:"center",gap:6,padding:"5px 11px",
                  background:theme==="light"?"#1a0d05":"#f5f0eb",
                  border:`1px solid ${C.border}`,borderRadius:8,cursor:"pointer",
                  color:theme==="light"?"#ff9500":"#1a0d00",fontWeight:700,fontSize:11,
                  transition:"all .2s"}}>
                {theme==="dark" ? "☀ Light" : "☾ Dark"}
              </button>
              
              {isPro
                ? <button onClick={manageSubscription}
                    title="Manage or cancel your subscription"
                    style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",
                      background:isElite?"#7c3aed22":C.accent+"22",
                      border:`1px solid ${isElite?"#7c3aed44":C.accent+"44"}`,borderRadius:20,
                      color:isElite?"#7c3aed":C.accent,fontSize:11,fontWeight:800,cursor:"pointer",letterSpacing:.5}}>
                    {isElite?"⚡ ELITE":"★ PRO"}
                  </button>
                : <button onClick={()=>setShowUpgrade(true)}
                    style={{display:"flex",alignItems:"center",gap:5,padding:"6px 14px",
                      background:C.accent,border:"none",borderRadius:20,
                      color:"#000",fontSize:11,fontWeight:800,cursor:"pointer",
                      fontFamily:"'Oswald',sans-serif",letterSpacing:.5}}>
                    ↑ UPGRADE
                  </button>
              }
              <button onClick={handleSignOut}
                title="Sign out"
                style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",
                  background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,
                  color:C.muted,cursor:"pointer",fontWeight:600,fontSize:11,transition:"all .2s"}}>
                Sign Out
              </button>
            </div>
          </div>

          {/* Page content */}
          <div className="main-content-inner" style={{flex:1,overflowY:"auto",background:C.bg}}>
            {view==="home"      &&<HomeView      games={games} gamePlans={gamePlans} practices={practices} roster={roster} setView={setView} teamName={activeTeam?.name} schedule={schedule}/> }
            {showOnboarding&&<OnboardingWizard teamName={activeTeam?.name} onComplete={(name,player)=>{
              if(name&&name!==activeTeam?.name) renameTeam(safeTeamId,name);
              if(player) setRoster(prev=>[...prev,player]);
              // onboarding dismissed - data now exists so it won't show again
            }}/>}
            {view==="games"     &&<GamesView     games={games} setGames={setGames} teamName={activeTeam?.name} roster={roster} teams={teams} activeTeamId={safeTeamId} onSwitchTeam={switchTeam} opponents={opponents} setOpponents={setOpponents} onViewOpponent={(name)=>{setPendingOpp(name);setView("opponents");}} />}
            {view==="live"      &&<LiveTrackView games={games} setGames={setGames} isPro={isPro} onUpgrade={()=>setShowUpgrade(true)} roster={roster} userId={userId} teamId={safeTeamId} userName={session?.user?.email?.split("@")[0]||"Coach"} joinSessionId={liveJoinId} onClearJoin={()=>setLiveJoinId(null)}/>}
            {view==="analytics" &&<AnalyticsView games={games} roster={roster} practices={practices} isPro={isPro} onUpgrade={()=>setShowUpgrade(true)}/>}
            {view==="settings"  &&<SettingsView isPro={isPro} isElite={isElite} brandName={brandName} setBrandName={setBrandName} brandLogo={brandLogo} setBrandLogo={setBrandLogo} onUpgrade={()=>setShowUpgrade(true)} onManage={manageSubscription} userId={userId} safeTeamId={safeTeamId}/>}
            {view==="roster"    &&<RosterView    players={roster} setPlayers={setRoster} teamName={activeTeam?.name} teams={teams} activeTeamId={safeTeamId} onSwitchTeam={switchTeam} games={games} practices={practices}/>}
            {view==="gameplan"  &&<GamePlanView  gamePlans={gamePlans} setGamePlans={setGamePlans} games={games} roster={roster} opponents={opponents} setOpponents={setOpponents}/>}
            {view==="practice"  &&<PracticeView  practices={practices} setPractices={setPractices} gamePlans={gamePlans} roster={roster} drills={drills} setDrills={setDrills} templates={templates} setTemplates={setTemplates}/>}
            {view==="calendar"  &&<CalendarView  schedule={schedule} setSchedule={setSchedule} games={games} practices={practices} setView={setView} teamName={activeTeam?.name} activeTeamId={safeTeamId}/>}
            {view==="tryouts"   &&<TryoutsView   tryouts={tryouts} setTryouts={setTryouts} roster={roster} setRoster={setRoster} teams={teams} activeTeamId={safeTeamId} onSwitchTeam={switchTeam} addPlayerToTeam={addPlayerToTeam}/>}
            {view==="opponents" &&<OpponentsView  opponents={opponents} setOpponents={setOpponents} games={games} gamePlans={gamePlans} isPro={isPro} onUpgrade={()=>setShowUpgrade(true)} pendingOpp={pendingOpp} onClearPendingOpp={()=>setPendingOpp(null)}/>}
            {/* redirect old dashboard id */}

          </div>
        </div>
      </div>
    </>
  );
}



// ─── GAME PLAN VIEW ───────────────────────────────────────────────────────────
// ─── HOME VIEW ────────────────────────────────────────────────────────────────
function HomeView({games, gamePlans, practices, roster, setView, teamName, schedule}){
  const ts   = teamSum(games);
  const done = games.filter(g=>g.status==="completed");
  const today = new Date().toISOString().split("T")[0];
  const upcoming = [...gamePlans].sort((a,b)=>a.date.localeCompare(b.date)).find(gp=>gp.date>=today);
  const recent = done.slice(0,3);
  const topPlayers = useMemo(()=>
    roster.map(p=>({...p,avg:avgRating(p.id,games)})).sort((a,b)=>b.avg-a.avg).slice(0,3)
  ,[games,roster]);
  const lastPractice = practices[0];
  const unavailable = roster.filter(p=>p.availability&&p.availability!=="available");
  const form5 = done.slice(0,5).map(g=>g.ourScore>g.theirScore?"W":g.ourScore<g.theirScore?"L":"D");

  // Analytics highlights
  const teamAvgRating = useMemo(()=>{
    const allRatings = done.flatMap(g=>(g.stats||[]).map(s=>s.rating).filter(Boolean));
    if(!allRatings.length) return null;
    return (allRatings.reduce((a,b)=>a+b,0)/allRatings.length).toFixed(1);
  },[done]);
  const goalsScored    = done.reduce((a,g)=>a+(g.ourScore||0),0);
  const goalsConceded  = done.reduce((a,g)=>a+(g.theirScore||0),0);
  const topScorer      = useMemo(()=>{
    const tally={};
    done.forEach(g=>(g.stats||[]).forEach(s=>{if(s.goals>0) tally[s.playerId]=(tally[s.playerId]||0)+s.goals;}));
    const best=Object.entries(tally).sort((a,b)=>b[1]-a[1])[0];
    if(!best) return null;
    const p=roster.find(r=>r.id===best[0]);
    return p?{name:p.name,goals:best[1]}:null;
  },[done,roster]);

  // Upcoming schedule — next 3 events (games + practices combined)
  const upcomingEvents = useMemo(()=>{
    const events = [];
    games.filter(g=>g.status!=="completed"&&g.date>=today).forEach(g=>
      events.push({type:"game",date:g.date,label:"vs "+g.opponent,sub:g.location,color:C.accent}));
    practices.filter(p=>p.date&&p.date>=today).forEach(p=>
      events.push({type:"practice",date:p.date,label:p.title||"Practice",sub:p.duration?p.duration+" min":"",color:"#66bb6a"}));
    return events.sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4);
  },[games,practices,today]);
  const FOCUS_COLS={"Mixed":C.accent,"Attacking":"#ff6b00","Defending":"#42a5f5","Transition":"#7c6af5","Set Pieces":"#ffb300","Fitness":"#ef5350","Technical":"#66bb6a"};
  const QUICK=[
    {label:"Start Live Game",icon:Radio,  color:"#ff6b00",view:"live",    desc:"Track stats in real time"},
    {label:"New Game Plan",  icon:BookOpen,color:"#ffb300",view:"gameplan",desc:"Prepare for your next match"},
    {label:"Log Practice",   icon:Dumbbell,color:"#66bb6a",view:"practice",desc:"Record today's session"},
    {label:"View Squad",     icon:Users,   color:"#42a5f5",view:"roster",  desc:"Player profiles and ratings"},
  ];
  return(
    <div style={{padding:24,maxWidth:1000,margin:"0 auto"}}>
      {/* Hero */}
      <div style={{background:"linear-gradient(135deg,#0d0400,#1a0600)",border:"1px solid #3a1a00",borderRadius:18,padding:"28px 32px",marginBottom:22,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",right:-20,top:-20,width:200,height:200,borderRadius:"50%",background:"radial-gradient(circle,#ff6b0012,transparent)"}}/>
        <div style={{color:"#ffffff88",fontSize:11,fontWeight:600,letterSpacing:2,marginBottom:6}}>WELCOME BACK</div>
        <h1 style={{color:"#ffffff",fontFamily:"'Oswald',sans-serif",fontSize:34,fontWeight:900,lineHeight:1.1,marginBottom:18}}>
          {teamName||"Your Team"}
        </h1>
        <div style={{display:"flex",gap:28,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div>
            <div style={{color:"#ffffff",fontFamily:"'Oswald',sans-serif",fontSize:44,fontWeight:900,lineHeight:1}}>
              {ts.wins}<span style={{color:"#ffffff88",fontSize:22}}>-{ts.draws}-{ts.losses}</span>
            </div>
            <div style={{color:"#ffffff88",fontSize:12,fontWeight:600,marginTop:2}}>W-D-L · {ts.played} played</div>
          </div>
          {form5.length>0&&(
            <div>
              <div style={{display:"flex",gap:5,marginBottom:4}}>
                {form5.map((r,i)=>{const c=r==="W"?C.accent:r==="L"?C.danger:C.warning;return(
                  <div key={i} style={{width:30,height:30,borderRadius:7,background:c+"25",border:`1.5px solid ${c}`,display:"flex",alignItems:"center",justifyContent:"center",color:c,fontWeight:900,fontSize:12}}>{r}</div>
                );})}
              </div>
              <div style={{color:"#ffffff88",fontSize:12,fontWeight:600}}>Last {form5.length} results</div>
            </div>
          )}
        </div>
      </div>

      {/* Availability alert */}
      {unavailable.length>0&&(
        <div style={{background:C.danger+"15",border:`1px solid ${C.danger}33`,borderRadius:12,
          padding:"12px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
          <AlertTriangle size={18} color={C.danger}/>
          <div style={{flex:1}}>
            <span style={{color:C.danger,fontWeight:700,fontSize:13}}>{unavailable.length} player{unavailable.length!==1?"s":""} unavailable: </span>
            <span style={{color:C.muted,fontSize:13}}>{unavailable.map(p=>`${p.name.split(" ")[1]||p.name} (${p.availability})`).join(", ")}</span>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="resp-grid-actions" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:22}}>
        {QUICK.map(a=>{const Icon=a.icon;return(
          <button key={a.view} onClick={()=>setView(a.view)}
            style={{background:C.card,border:`1px solid ${a.color}22`,borderRadius:13,padding:"16px 18px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:14,transition:"all .15s",position:"relative"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=a.color+"77";e.currentTarget.style.background=C.surface;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=a.color+"22";e.currentTarget.style.background=C.card;}}>
            <div style={{width:40,height:40,borderRadius:10,background:a.color+"22",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <Icon size={19} color={a.color}/>
            </div>
            <div style={{minWidth:0}}>
              <div style={{color:C.text,fontWeight:700,fontSize:13,marginBottom:2}}>{a.label}</div>
              <div style={{color:C.muted,fontSize:11}}>{a.desc}</div>
            </div>
          </button>
        );})}
      </div>

      {/* ── Analytics highlights strip ── */}
      {done.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
          {[
            {label:"Goals Scored",   value:goalsScored,   color:C.accent},
            {label:"Goals Conceded", value:goalsConceded,  color:C.danger},
            {label:"Team Avg Rating",value:teamAvgRating||"—", color:teamAvgRating?rColor(parseFloat(teamAvgRating)):C.muted},
            {label:"Top Scorer",     value:topScorer?topScorer.name.split(" ").pop()+" ("+topScorer.goals+")":"—", color:"#ffb300"},
          ].map(({label,value,color})=>(
            <div key={label} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}>
              <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:6}}>{label.toUpperCase()}</div>
              <div style={{color,fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:900,lineHeight:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Upcoming events ── */}
      {upcomingEvents.length>0&&(
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1}}>UPCOMING</div>
            <button onClick={()=>setView("calendar")} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:11,fontWeight:700}}>Calendar →</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {upcomingEvents.map((evt,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 10px",
                background:C.surface,borderRadius:9,border:`1px solid ${evt.color}22`}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:evt.color,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{color:C.text,fontWeight:600,fontSize:13}}>{evt.label}</div>
                  {evt.sub&&<div style={{color:C.muted,fontSize:11}}>{evt.sub}</div>}
                </div>
                <div style={{color:C.muted,fontSize:12,fontWeight:600,flexShrink:0}}>{evt.date}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="resp-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* Upcoming game plan */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1}}>NEXT GAME PLAN</div>
            <button onClick={()=>setView("gameplan")} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:11,fontWeight:700}}>View all →</button>
          </div>
          {upcoming ? (
            <div>
              {/* Opponent + meta */}
              <div style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:800,marginBottom:6,
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                vs {upcoming.opponent}
              </div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
                <span style={{display:"flex",alignItems:"center",gap:4,color:C.muted,fontSize:12}}>
                  <Calendar size={11}/>{upcoming.date}
                </span>
                {upcoming.location&&<span style={{color:C.muted,fontSize:12}}>{upcoming.location}</span>}
                {upcoming.formation&&<span style={{color:C.muted,fontSize:12}}>{upcoming.formation}</span>}
              </div>

              {/* Lineup preview — safe guard against missing lineup */}
              {(()=>{
                const lineup = upcoming.lineup || {};
                const allSlots = Object.values(lineup).flat();
                const assigned = allSlots.filter(Boolean);
                const total    = allSlots.length;
                if(total === 0) return(
                  <div style={{color:C.muted,fontSize:12,fontStyle:"italic"}}>Lineup not set yet</div>
                );
                return(
                  <div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
                      {assigned.slice(0,10).map(pid=>{
                        const p=roster.find(r=>r.id===pid);
                        if(!p) return null;
                        const pc=posColor(primaryPos(p));
                        return(
                          <div key={pid} style={{width:30,height:30,borderRadius:7,
                            background:pc+"22",border:`1.5px solid ${pc}44`,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontFamily:"'Oswald',sans-serif",fontWeight:700,color:pc,fontSize:12}}>
                            {p.number}
                          </div>
                        );
                      })}
                      {assigned.length>10&&(
                        <div style={{width:30,height:30,borderRadius:7,background:C.surface,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          color:C.muted,fontSize:10,fontWeight:700}}>
                          +{assigned.length-10}
                        </div>
                      )}
                    </div>
                    <div style={{display:"flex",gap:14,color:C.muted,fontSize:12}}>
                      <span style={{color:assigned.length===total?C.accent:C.warning,fontWeight:600}}>
                        {assigned.length}/{total} set
                      </span>
                      {(upcoming.subs||[]).length>0&&(
                        <span>{(upcoming.subs||[]).length} sub{(upcoming.subs||[]).length!==1?"s":""} planned</span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div style={{textAlign:"center",padding:"24px 0"}}>
              <BookOpen size={28} style={{color:C.muted,opacity:.3,marginBottom:10}}/>
              <div style={{color:C.muted,fontSize:13,marginBottom:12}}>No upcoming game plan</div>
              <button onClick={()=>setView("gameplan")}
                style={{padding:"7px 16px",background:C.accent+"22",border:`1px solid ${C.accent}44`,
                  borderRadius:8,color:C.accent,cursor:"pointer",fontWeight:700,fontSize:12}}>
                Create one →
              </button>
            </div>
          )}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* Top performers */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1}}>TOP PERFORMERS</div>
              <button onClick={()=>setView("roster")} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:11,fontWeight:700}}>All →</button>
            </div>
            {topPlayers.map((p,i)=>(
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:i<2?10:0}}>
                <div style={{width:32,height:32,borderRadius:7,background:posColor(primaryPos(p))+"22",border:`1.5px solid ${posColor(primaryPos(p))}44`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:700,color:posColor(primaryPos(p)),fontSize:14,flexShrink:0}}>{p.number}</div>
                <div style={{flex:1}}>
                  <div style={{color:C.text,fontWeight:600,fontSize:13}}>{p.name}</div>
                  <div style={{height:4,background:C.border,borderRadius:99,marginTop:4,overflow:"hidden"}}>
                    <div style={{width:`${Math.min(((p.avg-5)/5)*100,100)}%`,height:"100%",background:rColor(p.avg),borderRadius:99}}/>
                  </div>
                </div>
                <span style={{color:rColor(p.avg),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:18}}>{p.avg.toFixed(1)}</span>
              </div>
            ))}
          </div>

          {/* Recent results */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1}}>RECENT RESULTS</div>
              <button onClick={()=>setView("games")} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:11,fontWeight:700}}>All →</button>
            </div>
            {recent.length===0
              ?<div style={{color:C.muted,fontSize:13,fontStyle:"italic"}}>No games yet</div>
              :recent.map(g=>{const r=g.ourScore>g.theirScore?"W":g.ourScore<g.theirScore?"L":"D";const rc=r==="W"?C.accent:r==="L"?C.danger:C.warning;return(
                <div key={g.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,padding:"7px 10px",background:C.surface,borderRadius:8}}>
                  <div style={{width:24,height:24,borderRadius:6,background:rc+"22",border:`1.5px solid ${rc}44`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:900,color:rc,fontSize:11,flexShrink:0}}>{r}</div>
                  <span style={{color:C.text,fontSize:13,flex:1}}>vs {g.opponent}</span>
                  <span style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:14}}>{g.ourScore}–{g.theirScore}</span>
                </div>
              );})}
          </div>

          {/* Last practice */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1}}>LAST PRACTICE</div>
              <button onClick={()=>setView("practice")} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:11,fontWeight:700}}>Log →</button>
            </div>
            {lastPractice?(
              <div>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                  <Tag color={FOCUS_COLS[lastPractice.focus]||C.accent}>{lastPractice.focus}</Tag>
                  <span style={{color:C.muted,fontSize:12}}>{lastPractice.date} · {lastPractice.duration}min</span>
                </div>
                {lastPractice.plan&&<div style={{color:C.muted,fontSize:12,lineHeight:1.5}}>{lastPractice.plan.slice(0,90)}{lastPractice.plan.length>90?"…":""}</div>}
              </div>
            ):<div style={{color:C.muted,fontSize:13,fontStyle:"italic"}}>No sessions logged yet</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function GamePlanView({gamePlans, setGamePlans, games, roster, opponents, setOpponents}){
  const [sel,setSel]       = useState(null);
  const [creating,setCreating] = useState(false);
  const [picking,setPicking]   = useState(null); // {zone,idx} for lineup slot picker
  const [gpTab,setGpTab]        = useState("gameplan");
  const [shareLink,setShareLink]  = useState(null);
  const [oppSuggestions,setOppSuggestions] = useState([]);
  const [showSuggestions,setShowSuggestions] = useState(false); // shows share modal with link
  const [form,setForm]     = useState({opponent:"",date:new Date().toISOString().split("T")[0],location:"Home",formation:"4-3-3"});

  async function shareGamePlan(){
    if(!sel) return;
    var plan = gamePlans.find(function(p){return p.id===sel;});
    if(!plan) return;
    var sid = plan.shareId;
    if(!sid){
      sid = "s"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
      setGamePlans(function(prev){return prev.map(function(p){return p.id===sel?Object.assign({},p,{shareId:sid}):p;});});
      var updated = gamePlans.map(function(p){return p.id===sel?Object.assign({},p,{shareId:sid}):p;});
      try{
        await supabase.from("game_plans").delete().eq("team_id",safeTeamId);
        if(updated.length) await supabase.from("game_plans").insert(updated.map(function(g){return {team_id:safeTeamId,user_id:userId,data:g};}));
      }catch(e){ console.error("shareId save failed",e); }
    }
    setShareLink(window.location.origin+window.location.pathname+"#/plan/"+sid);
  }

  async function viewGamePlan(){
    if(!sel) return;
    var plan = gamePlans.find(function(p){return p.id===sel;});
    if(!plan) return;
    var sid = plan.shareId;
    if(!sid){
      sid = "s"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
      setGamePlans(function(prev){return prev.map(function(p){return p.id===sel?Object.assign({},p,{shareId:sid}):p;});});
      var updated = gamePlans.map(function(p){return p.id===sel?Object.assign({},p,{shareId:sid}):p;});
      try{
        await supabase.from("game_plans").delete().eq("team_id",safeTeamId);
        if(updated.length) await supabase.from("game_plans").insert(updated.map(function(g){return {team_id:safeTeamId,user_id:userId,data:g};}));
      }catch(e){ console.error("shareId save failed",e); }
    }
    window.open(window.location.origin+window.location.pathname+"#/plan/"+sid,"_blank");
  }

  const SLOTS = {
    "4-3-3":  {GK:1,DEF:4,MID:3,FWD:3},
    "4-4-2":  {GK:1,DEF:4,MID:4,FWD:2},
    "4-2-3-1":{GK:1,DEF:4,MID:5,FWD:1},
    "3-5-2":  {GK:1,DEF:3,MID:5,FWD:2},
    "5-3-2":  {GK:1,DEF:5,MID:3,FWD:2},
  };

  function createPlan(){
    if(!form.opponent) return;
    const slots = SLOTS[form.formation]||SLOTS["4-3-3"];
    const lineup = {
      GK:  Array(slots.GK ).fill(null),
      DEF: Array(slots.DEF).fill(null),
      MID: Array(slots.MID).fill(null),
      FWD: Array(slots.FWD).fill(null),
    };
    const plan = {
      id:`gp${Date.now()}`, ...form,
      shareId:`s${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`,
      lineup, subs:[], oppNotes:{threats:"",setPieces:"",pressing:"",notes:""},
      instructions:"", createdAt: new Date().toISOString()
    };
    setGamePlans(prev=>[plan,...prev]);
    setSel(plan.id); setCreating(false);
  }

  if(creating) return(
    <div style={{padding:24,maxWidth:500,margin:"0 auto"}}>
      <button onClick={()=>setCreating(false)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",color:C.text,cursor:"pointer",marginBottom:20,fontSize:13}}>← Back</button>
      <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:2,marginBottom:4}}>GAME PLAN</div>
      <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:26,fontWeight:800,marginBottom:22}}>New Game Plan</h2>
      {/* Opponent with autocomplete */}
      <div style={{marginBottom:14,position:"relative"}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>OPPONENT</label>
        <input value={form.opponent}
          onChange={e=>{
            const val=e.target.value;
            setForm(f=>({...f,opponent:val}));
            if(val.trim().length>0){
              const matches=(opponents||[]).filter(o=>o.name&&o.name.toLowerCase().includes(val.toLowerCase()));
              setOppSuggestions(matches);
              setShowSuggestions(matches.length>0);
            } else {
              setShowSuggestions(false);
            }
          }}
          onBlur={()=>setTimeout(()=>setShowSuggestions(false),150)}
          placeholder="Type opponent name..."
          style={{width:"100%",padding:"11px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:9,color:C.text,fontSize:14,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}/>
        {showSuggestions&&(
          <div style={{position:"absolute",top:"100%",left:0,right:0,background:C.card,
            border:`1px solid ${C.accent}44`,borderRadius:9,zIndex:100,
            boxShadow:"0 8px 24px #00000066",overflow:"hidden",marginTop:4}}>
            {oppSuggestions.map(o=>(
              <div key={o.id||o.name}
                onMouseDown={()=>{setForm(f=>({...f,opponent:o.name}));setShowSuggestions(false);}}
                style={{padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",
                  gap:10,borderBottom:`1px solid ${C.border}`}}
                onMouseEnter={e=>e.currentTarget.style.background=C.accent+"11"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{flex:1}}>
                  <div style={{color:C.text,fontWeight:600,fontSize:13}}>{o.name}</div>
                  {o.formation&&<div style={{color:C.muted,fontSize:11}}>{o.formation} · scouted</div>}
                </div>
                {o.formation&&<span style={{fontSize:10,fontWeight:700,padding:"2px 7px",
                  borderRadius:4,background:C.accent+"22",color:C.accent}}>SCOUTED</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Date */}
      <div style={{marginBottom:14}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>DATE</label>
        <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}
          style={{width:"100%",padding:"11px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:9,color:C.text,fontSize:14,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}/>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>LOCATION</label>
        <div style={{display:"flex",gap:8}}>
          {["Home","Away"].map(l=><button key={l} onClick={()=>setForm(f=>({...f,location:l}))} style={{flex:1,padding:"10px",background:form.location===l?C.accent+"22":C.card,border:`1px solid ${form.location===l?C.accent:C.border}`,borderRadius:9,color:form.location===l?C.accent:C.muted,cursor:"pointer",fontWeight:700}}>{l}</button>)}
        </div>
      </div>
      <div style={{marginBottom:24}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>FORMATION</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {["4-3-3","4-4-2","4-2-3-1","3-5-2","5-3-2"].map(f=><button key={f} onClick={()=>setForm(g=>({...g,formation:f}))} style={{padding:"9px 14px",background:form.formation===f?C.accent+"22":C.card,border:`1px solid ${form.formation===f?C.accent:C.border}`,borderRadius:9,color:form.formation===f?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:13}}>{f}</button>)}
        </div>
      </div>
      <button onClick={createPlan} disabled={!form.opponent}
        style={{width:"100%",padding:"14px",background:form.opponent?C.accent:"#2a1000",border:"none",borderRadius:10,color:form.opponent?"#000":C.muted,fontWeight:900,fontSize:16,cursor:form.opponent?"pointer":"default",fontFamily:"'Oswald',sans-serif",letterSpacing:1}}>
        CREATE PLAN →
      </button>
    </div>
  );

  if(sel){
    const plan = gamePlans.find(p=>p.id===sel);
    if(!plan) return null;

    function updatePlan(updater){
      setGamePlans(prev=>prev.map(p=>p.id===sel?{...p,...updater(p)}:p));
    }

    const usedIds = Object.values(plan.lineup).flat().filter(Boolean);
    const benchRoster = roster.filter(p=>!usedIds.includes(p.id));

    function assignSlot(zone,idx,pid){
      updatePlan(p=>{
        const lineup={...p.lineup,[zone]:[...p.lineup[zone]]};
        // If player already in another slot, clear it
        Object.keys(lineup).forEach(z=>{ lineup[z]=lineup[z].map(id=>id===pid?null:id); });
        lineup[zone][idx]=pid||null;
        return {lineup};
      });
    }

    function addSub(){
      updatePlan(p=>({subs:[...p.subs,{id:`s${Date.now()}`,minute:"60-70",playerOn:null,playerOff:null,condition:"Regardless"}]}));
    }
    function updateSub(id,key,val){
      updatePlan(p=>({subs:p.subs.map(s=>s.id===id?{...s,[key]:val}:s)}));
    }
    function removeSub(id){
      updatePlan(p=>({subs:p.subs.filter(s=>s.id!==id)}));
    }

    const ZONES=[["GK","Goalkeeper"],["DEF","Defenders"],["MID","Midfielders"],["FWD","Forwards"]];
    const ZONE_COL={"GK":"#ffb300","DEF":"#42a5f5","MID":"#66bb6a","FWD":"#ff6b00"};

    // Find matching opponent record
    const linkedOpp = (opponents||[]).find(o=>
      o.name?.trim().toLowerCase()===plan.opponent?.trim().toLowerCase()
    );
    function updateScout(field, val){
      if(linkedOpp){
        setOpponents(prev=>prev.map(o=>o.name?.trim().toLowerCase()===plan.opponent?.trim().toLowerCase()
          ? {...o,[field]:val} : o
        ));
      } else {
        // Create new opponent record linked to this opponent name
        const newOpp = {
          id:`opp${Date.now()}`, name:plan.opponent,
          formation:"", keyPlayers:"", setPieceNotes:"", scoutNotes:"",
          [field]:val
        };
        setOpponents(prev=>[...prev, newOpp]);
      }
    }
    const scout = linkedOpp || {formation:"",keyPlayers:"",setPieceNotes:"",scoutNotes:"",oppPlayers:{},tendencies:{},setPieces:{},counterPlan:{}};

    return(
      <div style={{padding:20,maxWidth:900,margin:"0 auto"}}>
        {/* Async handlers extracted to avoid Babel async-in-JSX-prop error */}
        {(function(){
          window._gpShareFn = shareGamePlan;
          window._gpViewFn  = viewGamePlan;
          return null;
        })()}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <button onClick={()=>setSel(null)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",color:C.text,cursor:"pointer",fontSize:13}}>← Back</button>
          <div style={{flex:1}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1}}>{plan.date} · {plan.location} · {plan.formation}</div>
            <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:24,fontWeight:800}}>vs {plan.opponent}</h2>
          </div>
          <button onClick={shareGamePlan}
            style={{background:C.accent+"22",border:`1px solid ${C.accent}44`,borderRadius:8,
              padding:"8px 14px",color:C.accent,cursor:"pointer",fontWeight:700,fontSize:12}}>
            ⎘ Share
          </button>
          <button onClick={viewGamePlan}
            style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,
              padding:"8px 12px",color:C.muted,cursor:"pointer",fontSize:12,fontWeight:600}}>
            ⬡ View / Print
          </button>
          <button onClick={()=>{if(window.confirm("Delete this game plan?"))setGamePlans(prev=>prev.filter(p=>p.id!==sel));setSel(null);}}
            style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",color:C.muted,cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13}}>
            <Trash2 size={13}/>Delete
          </button>
        </div>

{/* ── SHARE LINK MODAL ── */}
        {shareLink&&(
          <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:1000,
            display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,
              padding:28,width:"100%",maxWidth:480}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <h3 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:18,fontWeight:800}}>Share Game Plan</h3>
                <button onClick={()=>setShareLink(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20}}>✕</button>
              </div>
              <p style={{color:C.muted,fontSize:13,marginBottom:14,lineHeight:1.6}}>
                Anyone with this link can view the game plan — no login required.
              </p>
              <div style={{display:"flex",gap:8,alignItems:"center",
                background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,padding:"10px 14px",marginBottom:14}}>
                <span style={{flex:1,color:C.text,fontSize:12,fontFamily:"'DM Mono',monospace",
                  wordBreak:"break-all",lineHeight:1.5}}>{shareLink}</span>
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>{
                  navigator.clipboard?.writeText(shareLink)
                    .then(()=>{
                      const btn=document.getElementById("gp-copy-btn");
                      if(btn){btn.textContent="✓ Copied!";setTimeout(()=>{btn.textContent="Copy Link";},2000);}
                    })
                    .catch(()=>{});
                }}
                  id="gp-copy-btn"
                  style={{flex:1,padding:"11px",background:C.accent,border:"none",borderRadius:9,
                    color:"#000",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
                  Copy Link
                </button>
                <button onClick={()=>{window.open(shareLink,"_blank");setShareLink(null);}}
                  style={{flex:1,padding:"11px",background:C.surface,border:`1px solid ${C.border}`,
                    borderRadius:9,color:C.muted,fontWeight:600,fontSize:13,cursor:"pointer"}}>
                  Open in New Tab
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB BAR ── */}
        <div style={{display:"flex",gap:4,marginBottom:20,background:C.surface,borderRadius:10,padding:4,border:`1px solid ${C.border}`}}>
          {[
            {key:"gameplan", label:"Game Plan"},
            {key:"scout",    label:"Scout Report", badge: linkedOpp?"✓":null},
          ].map(tab=>(
            <button key={tab.key} onClick={()=>setGpTab(tab.key)}
              style={{flex:1,padding:"9px 12px",borderRadius:7,border:"none",cursor:"pointer",
                fontWeight:700,fontSize:13,fontFamily:"'Outfit',sans-serif",
                background:gpTab===tab.key?C.accent+"22":"transparent",
                color:gpTab===tab.key?C.accent:C.muted,
                transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              {tab.label}
              {tab.badge&&<span style={{fontSize:10,background:C.accent+"33",color:C.accent,
                padding:"1px 5px",borderRadius:4,fontWeight:700}}>{tab.badge}</span>}
            </button>
          ))}
        </div>

        {/* Picker overlay */}
        {picking&&(
          <div style={{position:"fixed",inset:0,background:"#000000bb",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:22,width:"100%",maxWidth:400,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <h3 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:18,fontWeight:700}}>Select Player</h3>
                <button onClick={()=>setPicking(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer"}}><X size={18}/></button>
              </div>
              <div style={{overflowY:"auto",flex:1}}>
                <div onClick={()=>{assignSlot(picking.zone,picking.idx,null);setPicking(null);}}
                  style={{padding:"10px 14px",borderRadius:9,marginBottom:6,cursor:"pointer",background:C.surface,border:`1px solid ${C.border}`,color:C.muted,fontSize:13,fontWeight:600}}>
                  — Clear slot
                </div>
                {roster.map(p=>{
                  const inUse = usedIds.includes(p.id) && plan.lineup[picking.zone]?.[picking.idx]!==p.id;
                  return(
                    <div key={p.id} onClick={()=>{assignSlot(picking.zone,picking.idx,p.id);setPicking(null);}}
                      style={{padding:"10px 14px",borderRadius:9,marginBottom:6,cursor:"pointer",
                        background:inUse?C.surface:C.bg,border:`1px solid ${inUse?C.border:posColor(primaryPos(p))+"44"}`,
                        opacity:inUse?.5:1,display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:30,height:30,borderRadius:7,background:posColor(primaryPos(p))+"22",border:`1.5px solid ${posColor(primaryPos(p))}44`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:700,color:posColor(primaryPos(p)),fontSize:14,flexShrink:0}}>{p.number}</div>
                      <div style={{flex:1}}>
                        <div style={{color:C.text,fontWeight:700,fontSize:13}}>{p.name}</div>
                        <div style={{display:"flex",gap:4,marginTop:2}}>
                          {allPos(p).map(pos=><span key={pos} style={{background:posColor(pos)+"22",color:posColor(pos),border:`1px solid ${posColor(pos)}44`,borderRadius:3,padding:"0 5px",fontSize:9,fontWeight:700}}>{pos}</span>)}
                        </div>
                      </div>
                      {inUse&&<span style={{color:C.muted,fontSize:10}}>In use</span>}
                      {p.availability&&p.availability!=="available"&&!inUse&&<AvailBadge status={p.availability}/>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── GAME PLAN TAB ─────────────────────────────────── */}
        {gpTab==="gameplan"&&<div className="resp-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>

          {/* ── Lineup builder ─────────────────────────────────────── */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:14}}>STARTING XI</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {ZONES.map(([zone,label])=>(
                <div key={zone}>
                  <div style={{color:ZONE_COL[zone],fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:6}}>{label.toUpperCase()}</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {(plan.lineup[zone]||[]).map((pid,idx)=>{
                      const p = pid ? roster.find(r=>r.id===pid) : null;
                      return(
                        <div key={idx} onClick={()=>setPicking({zone,idx})}
                          style={{flex:"1 1 80px",minWidth:70,padding:"8px 6px",borderRadius:9,cursor:"pointer",
                            background:p?ZONE_COL[zone]+"11":C.surface,
                            border:`1.5px solid ${p?ZONE_COL[zone]+"55":C.border}`,
                            display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                            transition:"all .12s"}}
                          onMouseEnter={e=>e.currentTarget.style.borderColor=ZONE_COL[zone]}
                          onMouseLeave={e=>e.currentTarget.style.borderColor=p?ZONE_COL[zone]+"66":C.border}>
                          {p ? <>
                            <div style={{width:32,height:32,borderRadius:7,background:posColor(primaryPos(p))+"22",border:`2px solid ${posColor(primaryPos(p))}44`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:900,color:posColor(primaryPos(p)),fontSize:16}}>{p.number}</div>
                            <div style={{color:C.text,fontSize:10,fontWeight:700,textAlign:"center",lineHeight:1.2}}>{p.name.split(" ")[1]||p.name}</div>
                          </> : <>
                            <div style={{width:32,height:32,borderRadius:7,background:C.border,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:18}}>+</div>
                            <div style={{color:C.muted,fontSize:10}}>Empty</div>
                          </>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Bench */}
            <div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${C.border}`}}>
              <div style={{color:C.warning,fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:8}}>BENCH</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {benchRoster.length===0
                  ? <span style={{color:C.muted,fontSize:12}}>All players assigned</span>
                  : benchRoster.map(p=>(
                    <div key={p.id} style={{padding:"5px 8px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,display:"flex",alignItems:"center",gap:5}}>
                      <div style={{width:22,height:22,borderRadius:5,background:posColor(primaryPos(p))+"22",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:700,color:posColor(primaryPos(p)),fontSize:11}}>{p.number}</div>
                      <span style={{color:C.muted,fontSize:11}}>{p.name.split(" ")[1]||p.name}</span>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>

          {/* ── Right column ──────────────────────────────────────── */}
          <div style={{display:"flex",flexDirection:"column",gap:14}}>

            {/* Sub plan */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1}}>SUBSTITUTION PLAN</div>
                <button onClick={addSub} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",background:C.accent+"22",border:`1px solid ${C.accent}44`,borderRadius:7,color:C.accent,fontWeight:700,fontSize:12,cursor:"pointer"}}>
                  <Plus size={12}/>Add Sub
                </button>
              </div>
              {plan.subs.length===0
                ? <div style={{color:C.muted,fontSize:13,fontStyle:"italic"}}>No substitutions planned yet</div>
                : plan.subs.map(sub=>(
                  <div key={sub.id} style={{background:C.bg,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:8}}>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      {/* Minute window */}
                      <select value={sub.minute} onChange={e=>updateSub(sub.id,"minute",e.target.value)}
                        style={{padding:"5px 8px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,color:C.text,fontSize:12,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>
                        {["45-55","55-65","60-70","65-75","70-80","75-85","80-90"].map(m=><option key={m} value={m}>{m}'</option>)}
                      </select>
                      {/* Condition */}
                      <select value={sub.condition} onChange={e=>updateSub(sub.id,"condition",e.target.value)}
                        style={{padding:"5px 8px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,color:C.text,fontSize:12,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>
                        {["Regardless","If Winning","If Drawing","If Losing","If Chasing"].map(c=><option key={c}>{c}</option>)}
                      </select>
                      <button onClick={()=>removeSub(sub.id)} style={{marginLeft:"auto",background:"none",border:"none",color:C.muted,cursor:"pointer"}}><X size={13}/></button>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <span style={{color:C.accent,fontSize:12,fontWeight:700,flexShrink:0}}>ON →</span>
                      <select value={sub.playerOn||""} onChange={e=>updateSub(sub.id,"playerOn",e.target.value||null)}
                        style={{flex:1,padding:"5px 8px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,color:C.text,fontSize:12,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>
                        <option value="">Select player</option>
                        {roster.map(p=><option key={p.id} value={p.id}>{p.name} #{p.number}</option>)}
                      </select>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <span style={{color:C.danger,fontSize:12,fontWeight:700,flexShrink:0}}>OFF →</span>
                      <select value={sub.playerOff||""} onChange={e=>updateSub(sub.id,"playerOff",e.target.value||null)}
                        style={{flex:1,padding:"5px 8px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,color:C.text,fontSize:12,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>
                        <option value="">Select player</option>
                        {roster.map(p=><option key={p.id} value={p.id}>{p.name} #{p.number}</option>)}
                      </select>
                    </div>
                  </div>
                ))
              }
            </div>

            {/* Opposition notes */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:14}}>OPPOSITION NOTES</div>
              {[["threats","Key Threats"],["setPieces","Set Pieces"],["pressing","Pressing Style"]].map(([key,label])=>(
                <div key={key} style={{marginBottom:10}}>
                  <label style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:.5,display:"block",marginBottom:4}}>{label.toUpperCase()}</label>
                  <input value={plan.oppNotes[key]||""} onChange={e=>updatePlan(p=>({oppNotes:{...p.oppNotes,[key]:e.target.value}}))}
                    placeholder={`e.g. ${key==="threats"?"Fast #9, strong in the air":key==="setPieces"?"Near post corners":"Press high, trigger = GK"}`}
                    style={{width:"100%",padding:"8px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}/>
                </div>
              ))}
              <div style={{marginTop:4}}>
                <label style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:.5,display:"block",marginBottom:4}}>GENERAL NOTES</label>
                <textarea value={plan.oppNotes.notes||""} onChange={e=>updatePlan(p=>({oppNotes:{...p.oppNotes,notes:e.target.value}}))}
                  rows={3} placeholder="Any other intelligence..."
                  style={{width:"100%",padding:"8px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box",resize:"vertical"}}/>
              </div>
            </div>

            {/* Match instructions */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:10}}>MATCH INSTRUCTIONS</div>
              <textarea value={plan.instructions||""} onChange={e=>updatePlan(()=>({instructions:e.target.value}))}
                rows={4} placeholder="Team instructions, tactical focus, set piece routines..."
                style={{width:"100%",padding:"10px 12px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box",resize:"vertical"}}/>
            </div>
          </div>
        </div>}



        {/* ── SCOUT REPORT TAB ────────────────────────────────── */}
        {gpTab==="scout"&&(
          <div>
            {/* Link indicator */}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,
              padding:"10px 14px",borderRadius:9,
              background:linkedOpp?C.accent+"11":C.surface,
              border:`1px solid ${linkedOpp?C.accent+"44":C.border}`}}>
              <div style={{width:8,height:8,borderRadius:"50%",
                background:linkedOpp?C.accent:C.muted,flexShrink:0}}/>
              <div style={{fontSize:12,color:linkedOpp?C.accent:C.muted,fontWeight:600}}>
                {linkedOpp
                  ? `Synced with Opponents database — changes save there too`
                  : `No opponent record yet — adding notes will create one`}
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              {/* Formation */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:12}}>THEIR FORMATION</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {["4-3-3","4-4-2","4-2-3-1","3-5-2","5-3-2","4-5-1","3-4-3"].map(f=>(
                    <button key={f} onClick={()=>updateScout("formation",f)}
                      style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${scout.formation===f?C.accent:C.border}`,
                        background:scout.formation===f?C.accent+"22":C.surface,
                        color:scout.formation===f?C.accent:C.muted,
                        fontWeight:700,fontSize:13,cursor:"pointer"}}>{f}</button>
                  ))}
                </div>
                {scout.formation&&(
                  <div style={{marginTop:10,fontSize:13,color:C.accent,fontWeight:700}}>
                    Selected: {scout.formation}
                  </div>
                )}
              </div>

              {/* Key players */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:8}}>KEY PLAYERS TO WATCH</div>
                <textarea
                  value={scout.keyPlayers||""}
                  onChange={e=>updateScout("keyPlayers",e.target.value)}
                  rows={4}
                  placeholder="#9 — fast, left foot. #10 — dictates play. #4 — aggressive CB..."
                  style={{width:"100%",padding:"10px 12px",background:C.bg,
                    border:`1px solid ${C.border}`,borderRadius:8,color:C.text,
                    fontSize:13,outline:"none",fontFamily:"'Outfit',sans-serif",
                    boxSizing:"border-box",resize:"vertical"}}/>
              </div>

              {/* Set pieces */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:8}}>SET PIECES</div>
                <textarea
                  value={scout.setPieceNotes||""}
                  onChange={e=>updateScout("setPieceNotes",e.target.value)}
                  rows={4}
                  placeholder="Corner routine, free kick takers, throw-in patterns..."
                  style={{width:"100%",padding:"10px 12px",background:C.bg,
                    border:`1px solid ${C.border}`,borderRadius:8,color:C.text,
                    fontSize:13,outline:"none",fontFamily:"'Outfit',sans-serif",
                    boxSizing:"border-box",resize:"vertical"}}/>
              </div>

              {/* Scout notes */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:8}}>GENERAL SCOUT NOTES</div>
                <textarea
                  value={scout.scoutNotes||""}
                  onChange={e=>updateScout("scoutNotes",e.target.value)}
                  rows={3}
                  placeholder="Press high, slow build-up, weak left side..."
                  style={{width:"100%",padding:"10px 12px",background:C.bg,
                    border:`1px solid ${C.border}`,borderRadius:8,color:C.text,
                    fontSize:13,outline:"none",fontFamily:"'Outfit',sans-serif",
                    boxSizing:"border-box",resize:"vertical"}}/>
              </div>
            </div>

            {/* Key threat players from squad */}
            {(()=>{
              const oppPlayers = scout.oppPlayers||{};
              const threats = Object.entries(oppPlayers)
                .flatMap(([pos,players])=>(players||[]).map(p=>({...p,pos})))
                .filter(p=>p.threat&&p.name);
              return threats.length>0?(
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                  <div style={{color:C.danger,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:12}}>THREAT PLAYERS TO WATCH</div>
                  {threats.map((p,i)=>{
                    const threatCol = p.threat==="key"?C.danger:p.threat==="danger"?"#ff5500":C.warning;
                    return(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:10,
                        padding:"8px 10px",background:C.surface,borderRadius:8,marginBottom:6,
                        border:`1px solid ${threatCol}33`}}>
                        <div style={{width:28,height:28,borderRadius:6,flexShrink:0,
                          background:posColor(p.pos)+"22",border:`1.5px solid ${posColor(p.pos)}44`,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontFamily:"'Oswald',sans-serif",fontWeight:800,color:posColor(p.pos),fontSize:11}}>
                          {p.pos}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{color:C.text,fontWeight:600,fontSize:13}}>
                            {p.number&&<span style={{color:C.muted,marginRight:5}}>#{p.number}</span>}{p.name}
                          </div>
                          {p.notes&&<div style={{color:C.muted,fontSize:11,marginTop:2}}>{p.notes}</div>}
                        </div>
                        <div style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,
                          background:threatCol+"22",color:threatCol}}>{p.threat.toUpperCase()}</div>
                      </div>
                    );
                  })}
                </div>
              ):null;
            })()}

            {/* Counter plan summary */}
            {(scout.counterPlan?.howWeAttack||scout.counterPlan?.howWeDefend)&&(
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,gridColumn:"1/-1"}}>
                <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:12}}>OUR GAME PLAN RESPONSE</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  {scout.counterPlan.howWeAttack&&(
                    <div>
                      <div style={{color:C.accent,fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:6}}>HOW WE ATTACK</div>
                      <div style={{color:C.muted,fontSize:13,lineHeight:1.6}}>{scout.counterPlan.howWeAttack}</div>
                    </div>
                  )}
                  {scout.counterPlan.howWeDefend&&(
                    <div>
                      <div style={{color:C.warning,fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:6}}>HOW WE DEFEND</div>
                      <div style={{color:C.muted,fontSize:13,lineHeight:1.6}}>{scout.counterPlan.howWeDefend}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    );
  }

  return(
    <div style={{padding:20,maxWidth:900,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2}}>PREPARATION</div>
          <h1 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:28,fontWeight:800,marginTop:4}}>Game Plans</h1>
        </div>
        <button onClick={()=>setCreating(true)}
          style={{display:"flex",alignItems:"center",gap:8,padding:"10px 18px",background:C.accent,border:"none",borderRadius:10,color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
          <Plus size={15}/>New Plan
        </button>
      </div>

      {gamePlans.length===0
        ? <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"48px 24px",textAlign:"center"}}>
            <BookOpen size={40} style={{color:C.muted,opacity:.3,marginBottom:12}}/>
            <div style={{color:C.text,fontSize:15,fontWeight:600}}>No game plans yet</div>
            <div style={{color:C.muted,fontSize:13,marginTop:6}}>Create a plan before your next match</div>
          </div>
        : <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {gamePlans.map(plan=>{
              const assigned = Object.values(plan.lineup).flat().filter(Boolean).length;
              const total    = Object.values(plan.lineup).flat().length;
              return(
                <div key={plan.id} onClick={()=>setSel(plan.id)}
                  style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,transition:"all .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  <div style={{width:44,height:44,borderRadius:10,background:C.accent+"22",border:`2px solid ${C.accent}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <BookOpen size={20} color={C.accent}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{color:C.text,fontWeight:700,fontSize:15}}>vs {plan.opponent}</div>
                    <div style={{color:C.muted,fontSize:12,marginTop:2,display:"flex",gap:12}}>
                      <span style={{display:"flex",alignItems:"center",gap:4}}><Calendar size={11}/>{plan.date}</span>
                      <span>{plan.location}</span>
                      <span>{plan.formation}</span>
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{color:assigned===total?C.accent:C.warning,fontWeight:700,fontSize:13}}>{assigned}/{total} set</div>
                    <div style={{color:C.muted,fontSize:11}}>{plan.subs.length} subs planned</div>
                  </div>
                  <ChevronRight size={16} color={C.muted}/>
                </div>
              );
            })}
          </div>
      }
    </div>
  );
}

// ─── PRACTICE VIEW ────────────────────────────────────────────────────────────
function PracticeView({practices, setPractices, gamePlans, roster, drills, setDrills, templates, setTemplates}){
  const [sel,setSel]               = useState(null);
  const [creating,setCreating]     = useState(false);
  const [filterTag,setFilterTag]   = useState("All");
  const [selPlayer,setSelPlayer]   = useState("");
  const [noteText,setNoteText]     = useState("");
  const [drillName,setDrillName]   = useState("");
  const [printMode,setPrintMode]   = useState(false);
  const [showTemplates,setShowTemplates] = useState(false);
  const [savingTpl,setSavingTpl]   = useState(false);
  const [tplName,setTplName]       = useState("");
  const [diagramCard, setDiagramCard] = useState(null);

  const FOCUS_TAGS   = ["Mixed","Attacking","Defending","Transition","Set Pieces","Fitness","Technical"];
  const FOCUS_COLORS = {Mixed:C.accent,Attacking:"#ff6b00",Defending:"#42a5f5",Transition:"#7c6af5",
    "Set Pieces":"#ffb300",Fitness:"#ef5350",Technical:"#66bb6a"};
  const INTENSITY    = [{k:"low",label:"Low",color:"#66bb6a"},{k:"medium",label:"Med",color:"#ffb300"},{k:"high",label:"High",color:"#ef5350"}];

  const EMPTY_BLOCKS = () => ({
    warmup:  [],
    main:    [],
    cooldown:[],
  });

  const [form,setForm] = useState({
    date:new Date().toISOString().split("T")[0],
    duration:"60", focus:"Mixed",
    objectives:"", linkedGame:"",
    blocks: EMPTY_BLOCKS(),
  });

  const iS = (extra={}) => ({width:"100%",padding:"9px 12px",background:C.bg,border:`1px solid ${C.border}`,
    borderRadius:8,color:C.text,fontSize:13,outline:"none",fontFamily:"'Outfit',sans-serif",
    boxSizing:"border-box",...extra});

  // ── Drill card helpers ────────────────────────────────────────────────────
  function makeCard(name,extra={}){ return {id:`dc${Date.now()}_${Math.random().toString(36).slice(2)}`,name,duration:"",notes:"",intensity:"medium",diagram:null,...extra}; }

  function addCardToBlock(session_or_form, setter, block, name){
    setter(prev=>{
      if(Array.isArray(prev)){ // setPractices
        return prev.map(p=>p.id===sel?{...p,blocks:{...p.blocks,[block]:[...(p.blocks?.[block]||[]),makeCard(name)]}}:p);
      } else { // setForm
        return {...prev, blocks:{...prev.blocks,[block]:[...(prev.blocks?.[block]||[]),makeCard(name)]}};
      }
    });
  }

  function removeCard(block, cardId){
    setPractices(prev=>prev.map(p=>p.id===sel?{...p,blocks:{...p.blocks,[block]:p.blocks[block].filter(c=>c.id!==cardId)}}:p));
  }

  function updateCard(block, cardId, key, val){
    setPractices(prev=>prev.map(p=>p.id===sel?{
      ...p, blocks:{...p.blocks,[block]:p.blocks[block].map(c=>c.id===cardId?{...c,[key]:val}:c)}
    }:p));
  }

  function moveCard(block, cardId, dir){
    setPractices(prev=>prev.map(p=>{
      if(p.id!==sel) return p;
      const arr=[...p.blocks[block]];
      const i=arr.findIndex(c=>c.id===cardId);
      if(dir===-1&&i===0) return p;
      if(dir===1&&i===arr.length-1) return p;
      [arr[i],arr[i+dir]]=[arr[i+dir],arr[i]];
      return {...p,blocks:{...p.blocks,[block]:arr}};
    }));
  }

  function createSession(sourceBlocks){
    const initAtt={};
    roster.forEach(p=>{ initAtt[p.id]="present"; });
    const session={
      id:`pr${Date.now()}`, ...form,
      blocks: sourceBlocks || form.blocks || EMPTY_BLOCKS(),
      rating:0, attendance:initAtt, playerNotes:[], createdAt:new Date().toISOString()
    };
    setPractices(prev=>[session,...prev]);
    setSel(session.id); setCreating(false);
  }

  // ─── CREATE FORM ───────────────────────────────────────────────────────────
  if(creating) return(
    <div style={{padding:24,maxWidth:560,margin:"0 auto"}}>
      <button onClick={()=>setCreating(false)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",color:C.text,cursor:"pointer",marginBottom:20,fontSize:13}}>← Back</button>
      <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2,marginBottom:4}}>PRACTICE</div>
      <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:26,fontWeight:800,marginBottom:22}}>New Session</h2>

      {/* Templates picker */}
      {(templates||[]).length>0&&(
        <div style={{marginBottom:18}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:8}}>START FROM TEMPLATE</div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {(templates||[]).map(t=>(
              <button key={t.id} onClick={()=>{setForm(f=>({...f,blocks:JSON.parse(JSON.stringify(t.blocks))})); }}
                style={{padding:"7px 14px",background:C.surface,border:`1px solid ${C.accent}44`,borderRadius:8,
                  color:C.accent,cursor:"pointer",fontWeight:700,fontSize:12}}>{t.name}</button>
            ))}
          </div>
        </div>
      )}

      <div className="resp-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        <div>
          <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>DATE</label>
          <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{...iS(),background:C.card}}/>
        </div>
        <div>
          <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>DURATION</label>
          <div style={{display:"flex",gap:4}}>
            {["45","60","75","90"].map(d=>(
              <button key={d} onClick={()=>setForm(f=>({...f,duration:d}))}
                style={{flex:1,padding:"9px 4px",background:form.duration===d?C.accent+"22":C.card,
                  border:`1px solid ${form.duration===d?C.accent:C.border}`,borderRadius:8,
                  color:form.duration===d?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:12}}>{d}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{marginBottom:14}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>FOCUS</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
          {FOCUS_TAGS.map(t=>{const col=FOCUS_COLORS[t];return(
            <button key={t} onClick={()=>setForm(f=>({...f,focus:t}))}
              style={{padding:"7px 13px",background:form.focus===t?col+"22":C.card,border:`1px solid ${form.focus===t?col:C.border}`,borderRadius:8,color:form.focus===t?col:C.muted,cursor:"pointer",fontWeight:700,fontSize:12}}>{t}</button>
          );})}
        </div>
      </div>

      <div style={{marginBottom:14}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>SESSION OBJECTIVES</label>
        <input value={form.objectives} onChange={e=>setForm(f=>({...f,objectives:e.target.value}))}
          placeholder="e.g. Improve defensive shape in transition" style={{...iS(),background:C.card}}/>
      </div>

      <div style={{marginBottom:24}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>LINKED GAME (OPTIONAL)</label>
        <select value={form.linkedGame} onChange={e=>setForm(f=>({...f,linkedGame:e.target.value}))} style={{...iS(),background:C.card}}>
          <option value="">None</option>
          {gamePlans.map(gp=><option key={gp.id} value={gp.id}>vs {gp.opponent} ({gp.date})</option>)}
        </select>
      </div>

      <button onClick={()=>createSession(null)}
        style={{width:"100%",padding:"14px",background:C.accent,border:"none",borderRadius:10,
          color:"#000",fontWeight:900,fontSize:16,cursor:"pointer",fontFamily:"'Oswald',sans-serif",letterSpacing:1}}>
        CREATE SESSION →
      </button>
    </div>
  );

  // ─── SESSION DETAIL ────────────────────────────────────────────────────────
  if(sel){
    const session=practices.find(p=>p.id===sel); if(!session) return null;
    const focusCol=FOCUS_COLORS[session.focus]||C.accent;
    const linked=gamePlans.find(gp=>gp.id===session.linkedGame);
    const att=session.attendance||{};
    const pres=Object.values(att).filter(v=>v==="present").length;
    const abs=Object.values(att).filter(v=>v==="absent").length;
    const inj=Object.values(att).filter(v=>v==="injured").length;
    const blocks=session.blocks||EMPTY_BLOCKS();

    function upd(fn){ setPractices(prev=>prev.map(p=>p.id===sel?{...p,...fn(p)}:p)); }
    function setAtt(pid,status){ upd(s=>({attendance:{...s.attendance,[pid]:status}})); }
    function addNote(){
      if(!selPlayer||!noteText.trim()) return;
      const p=roster.find(r=>r.id===selPlayer);
      upd(s=>({playerNotes:[...s.playerNotes,{id:`n${Date.now()}`,pid:selPlayer,name:p?.name||"",note:noteText.trim()}]}));
      setNoteText(""); setSelPlayer("");
    }
    function saveDrill(){
      if(!drillName.trim()) return;
      if(!(drills||[]).find(d=>d.name.toLowerCase()===drillName.trim().toLowerCase()))
        setDrills(prev=>[...prev,{id:`d${Date.now()}`,name:drillName.trim()}]);
      setDrillName("");
    }
    function saveTemplate(){
      if(!tplName.trim()) return;
      const tpl={id:`t${Date.now()}`,name:tplName.trim(),
        focus:session.focus, objectives:session.objectives||"",
        blocks:JSON.parse(JSON.stringify(blocks))};
      setTemplates(prev=>[tpl,...prev]);
      setTplName(""); setSavingTpl(false);
    }

    const SECTIONS=[
      {key:"warmup",   label:"Warmup",   color:"#66bb6a", icon:"🟢", desc:"Activation, mobility, rondos"},
      {key:"main",     label:"Main Work", color:"#ff6b00", icon:"🟠", desc:"Core drills and tactical work"},
      {key:"cooldown", label:"Cooldown",  color:"#42a5f5", icon:"🔵", desc:"Possession, stretching, debrief"},
    ];

    const totalMins = SECTIONS.flatMap(s=>(blocks[s.key]||[]).map(c=>parseInt(c.duration)||0)).reduce((a,b)=>a+b,0);

    const ATT=[{k:"present",label:"✓",color:C.accent},{k:"absent",label:"✗",color:C.danger},{k:"injured",label:"⚕",color:C.warning}];

    // ── PRINT MODE ─────────────────────────────────────────────────────────
    if(printMode){
      function exportPDF(){
        // Inject a temporary print stylesheet targeting only #practice-print-area
        const styleEl = document.createElement("style");
        styleEl.id = "coachiq-print-style";
        styleEl.innerHTML = `
          @media print {
            body > * { display: none !important; }
            #coachiq-print-portal { display: block !important; position: static !important; }
            #coachiq-print-portal * { visibility: visible; }
            @page { margin: 18mm 14mm; size: A4 portrait; }
          }
        `;
        document.head.appendChild(styleEl);

        // Build a detached print portal with the session content
        let existing = document.getElementById("coachiq-print-portal");
        if(existing) existing.remove();
        const portal = document.createElement("div");
        portal.id = "coachiq-print-portal";
        portal.style.cssText = "display:none;position:absolute;top:0;left:0;width:100%;background:#fff;font-family:'Helvetica Neue',Arial,sans-serif;padding:32px;box-sizing:border-box;";

        // Header
        const headerDiv = document.createElement("div");
        headerDiv.style.cssText = "margin-bottom:28px;padding-bottom:16px;border-bottom:3px solid #ff6b00;";
        headerDiv.innerHTML = `
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#cc4400;text-transform:uppercase;margin-bottom:6px;">
            Training Session &nbsp;·&nbsp; ${session.date} &nbsp;·&nbsp; ${session.duration} mins
          </div>
          <div style="font-size:28px;font-weight:900;color:#1a0d00;font-family:'Arial Black',Arial,sans-serif;margin-bottom:${session.objectives?"6px":"0"};">
            ${session.focus} Session
          </div>
          ${session.objectives ? `<div style="font-size:14px;color:#6b3d1e;">🎯 ${session.objectives}</div>` : ""}
        `;
        portal.appendChild(headerDiv);


        function buildDiagramSVG(diagramData, size=200){
          if(!diagramData) return "";
          let parsed = {};
          try { parsed = JSON.parse(diagramData); } catch(e){ return ""; }
          const elements = Array.isArray(parsed) ? parsed : (parsed.elements||[]);
          const ft = parsed.fieldType || "full";
          const W=520, H=360;
          const scale = size/W;
          const sh = Math.round(H*scale);

          function arrowSVG(el){
            const angle=Math.atan2(el.y2-el.y1,el.x2-el.x1);
            const ax1=el.x2-14*Math.cos(angle-0.4), ay1=el.y2-14*Math.sin(angle-0.4);
            const ax2=el.x2-14*Math.cos(angle+0.4), ay2=el.y2-14*Math.sin(angle+0.4);
            const dash=el.dashed?'stroke-dasharray="6,4"':"";
            return `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="${el.color}" stroke-width="2.5" ${dash}/>
                    <polygon points="${el.x2},${el.y2} ${ax1},${ay1} ${ax2},${ay2}" fill="${el.color}"/>`;
          }

          const pitchLines = ft==="half"
            ? `<rect x="20" y="20" width="${W-40}" height="${H-40}" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>
               <rect x="${W/2-90}" y="${H-80}" width="180" height="60" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>
               <rect x="${W/2-45}" y="${H-48}" width="90" height="28" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>`
            : `<rect x="20" y="20" width="${W-40}" height="${H-40}" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>
               <line x1="20" y1="${H/2}" x2="${W-20}" y2="${H/2}" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>
               <circle cx="${W/2}" cy="${H/2}" r="50" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>
               <rect x="${W/2-90}" y="20" width="180" height="60" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>
               <rect x="${W/2-90}" y="${H-80}" width="180" height="60" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>`;

          const elSVG = elements.map(el=>{
            if(el.type==="dot") return `<circle cx="${el.x}" cy="${el.y}" r="10" fill="${el.color}" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>`;
            if(el.type==="cone") return `<polygon points="${el.x},${el.y-10} ${el.x+8},${el.y+6} ${el.x-8},${el.y+6}" fill="#ff8800"/>`;
            if(el.type==="line") return arrowSVG(el);
            return "";
          }).join("\n");

          return '<svg viewBox="0 0 '+W+' '+H+'" width="'+size+'" height="'+sh+'" style="display:block;border-radius:6px;border:1px solid #444;margin-bottom:6px;">'
            +'<rect width="'+W+'" height="'+H+'" fill="#2d5a1b"/>'
            +pitchLines
            +elSVG
            +'</svg>';
        }

        // Sections
        const SECTION_PRINT = [
          {key:"warmup",   label:"Warmup",    color:"#2d7a3a"},
          {key:"main",     label:"Main Work", color:"#cc4400"},
          {key:"cooldown", label:"Cooldown",  color:"#1a5fa8"},
        ];
        let hasContent = false;
        SECTION_PRINT.forEach(sec => {
          const cards = (blocks[sec.key]||[]);
          if(!cards.length) return;
          hasContent = true;
          const secMins = cards.reduce((a,c)=>a+(parseInt(c.duration)||0),0);

          const secDiv = document.createElement("div");
          secDiv.style.cssText = "margin-bottom:22px;";

          // Section header
          const secHeader = document.createElement("div");
          secHeader.style.cssText = `display:flex;align-items:center;gap:10px;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid ${sec.color}33;`;
          secHeader.innerHTML = `
            <div style="font-size:15px;font-weight:900;color:${sec.color};letter-spacing:1px;text-transform:uppercase;flex:1;">${sec.label}</div>
            ${secMins>0?`<div style="font-size:12px;color:#8a6040;font-weight:600;">${secMins} mins</div>`:""}
          `;
          secDiv.appendChild(secHeader);

          // Drill cards
          cards.forEach((card, idx) => {
            const INTENSITY_COLORS = {low:"#2d7a3a",medium:"#cc8800",high:"#cc2200"};
            const intColor = INTENSITY_COLORS[card.intensity]||"#cc8800";
            const cardDiv = document.createElement("div");
            cardDiv.style.cssText = "display:flex;gap:12px;margin-bottom:8px;padding:10px 14px;background:#fdf8f4;border-radius:8px;border:1px solid #e8d5c0;page-break-inside:avoid;";
            const diagSVG = card.diagram ? buildDiagramSVG(card.diagram, 180) : "";
            cardDiv.style.cssText = card.diagram
              ? "display:flex;gap:12px;margin-bottom:8px;padding:10px 14px;background:#fdf8f4;border-radius:8px;border:1px solid #e8d5c0;page-break-inside:avoid;align-items:flex-start;"
              : "display:flex;gap:12px;margin-bottom:8px;padding:10px 14px;background:#fdf8f4;border-radius:8px;border:1px solid #e8d5c0;page-break-inside:avoid;";
            cardDiv.innerHTML = `
              <div style="min-width:24px;font-size:16px;font-weight:900;color:#cc8800;font-family:'Arial Black',Arial,sans-serif;">${idx+1}</div>
              ${diagSVG ? `<div style="flex-shrink:0;">${diagSVG}</div>` : ""}
              <div style="flex:1;">
                <div style="font-size:14px;font-weight:700;color:#1a0d00;margin-bottom:${card.notes?"3px":"0"};">${card.name||"Unnamed drill"}</div>
                ${card.notes?`<div style="font-size:12px;color:#6b3d1e;line-height:1.6;white-space:pre-wrap;">${card.notes}</div>`:""}
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;">
                ${card.duration?`<div style="font-size:13px;font-weight:700;color:#1a0d00;">${card.duration} min</div>`:""}
                ${card.intensity?`<div style="font-size:10px;font-weight:700;color:${intColor};letter-spacing:1px;text-transform:uppercase;">${card.intensity}</div>`:""}
              </div>
            `;
            secDiv.appendChild(cardDiv);
          });
          portal.appendChild(secDiv);
        });

        if(!hasContent){
          const empty = document.createElement("div");
          empty.style.cssText = "color:#8a6040;font-style:italic;font-size:13px;";
          empty.textContent = "No drills added to this session yet.";
          portal.appendChild(empty);
        }

        // Footer total
        if(totalMins>0){
          const footer = document.createElement("div");
          footer.style.cssText = "margin-top:20px;padding-top:12px;border-top:1px solid #e8d5c0;text-align:right;font-size:12px;color:#8a6040;";
          footer.innerHTML = `Total drill time: <strong style="color:#1a0d00;">${totalMins} mins</strong> / ${session.duration} min session`;
          portal.appendChild(footer);
        }

        document.body.appendChild(portal);

        // Trigger print
        setTimeout(()=>{
          window.print();
          // Cleanup after print dialog closes
          setTimeout(()=>{
            portal.remove();
            styleEl.remove();
          }, 1000);
        }, 100);
      }

      return(
        <div style={{padding:32,maxWidth:720,margin:"0 auto",background:C.bg}}>
          {/* Toolbar — hidden when printing */}
          <div className="no-print" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
            <div>
              <div style={{color:C.accent,fontSize:12,fontWeight:700,letterSpacing:2}}>{session.date} · {session.duration} MINS</div>
              <h1 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:30,fontWeight:900,marginTop:4}}>
                {session.focus} Session
              </h1>
              {session.objectives&&<div style={{color:C.muted,fontSize:14,marginTop:4}}>🎯 {session.objectives}</div>}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={exportPDF}
                style={{display:"flex",alignItems:"center",gap:6,padding:"9px 16px",
                  background:C.accent,border:"none",borderRadius:9,
                  color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
                ⬇ Export PDF
              </button>
              <button onClick={()=>setPrintMode(false)}
                style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",color:C.text,cursor:"pointer",fontSize:13}}>
                ← Back
              </button>
            </div>
          </div>

          {/* Plan content */}
          {SECTIONS.map(sec=>{
            const cards=blocks[sec.key]||[];
            if(!cards.length) return null;
            const secMins=cards.reduce((a,c)=>a+(parseInt(c.duration)||0),0);
            return(
              <div key={sec.key} style={{marginBottom:24}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,
                  borderBottom:`2px solid ${sec.color}44`,paddingBottom:8}}>
                  <span style={{fontSize:18}}>{sec.icon}</span>
                  <div style={{color:sec.color,fontFamily:"'Oswald',sans-serif",fontWeight:800,fontSize:18,letterSpacing:1}}>{sec.label.toUpperCase()}</div>
                  {secMins>0&&<div style={{color:C.muted,fontSize:13,marginLeft:"auto"}}>{secMins} mins</div>}
                </div>
                {cards.map((card,idx)=>(
                  <div key={card.id} style={{display:"flex",gap:14,marginBottom:12,padding:"12px 16px",
                    background:C.card,borderRadius:10,border:`1px solid ${C.border}`}}>
                    <div style={{minWidth:28,color:C.muted,fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:18}}>{idx+1}</div>
                    <div style={{flex:1}}>
                      <div style={{color:C.text,fontWeight:700,fontSize:15,marginBottom:4}}>{card.name}</div>
                      {card.diagram&&(
                        <div style={{marginBottom:6}}>
                          <DiagramPreview data={card.diagram}/>
                        </div>
                      )}
                      {card.notes&&<div style={{color:C.muted,fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{card.notes}</div>}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                      {card.duration&&<div style={{color:C.text,fontWeight:700,fontSize:13}}>{card.duration} min</div>}
                      {card.intensity&&(()=>{const int=INTENSITY.find(x=>x.k===card.intensity);return int?<span style={{color:int.color,fontSize:11,fontWeight:700,letterSpacing:1}}>{int.label.toUpperCase()}</span>:null;})()}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          {totalMins>0&&(
            <div style={{textAlign:"right",color:C.muted,fontSize:13,borderTop:`1px solid ${C.border}`,paddingTop:12}}>
              Total drill time: <strong style={{color:C.text}}>{totalMins} mins</strong> / {session.duration} min session
            </div>
          )}
        </div>
      );
    }

    return(
      <div className="mobile-page-pad" style={{padding:20,maxWidth:980,margin:"0 auto"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
          <button onClick={()=>setSel(null)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",color:C.text,cursor:"pointer",fontSize:13}}>← Back</button>
          <div style={{flex:1}}>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
              <Tag color={focusCol}>{session.focus}</Tag>
              <span style={{color:C.muted,fontSize:12}}>{session.date} · {session.duration} mins</span>
              {linked&&<span style={{color:C.muted,fontSize:12}}>· Prep for vs {linked.opponent}</span>}
              {Object.keys(att).length>0&&<span style={{color:C.accent,fontSize:12,fontWeight:700}}>{pres} present{abs>0?` · ${abs} absent`:""}  {inj>0?` · ${inj} injured`:""}</span>}
            </div>
            <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:800}}>Training Session</h2>
          </div>
          <div style={{display:"flex",gap:7}}>
            <button onClick={()=>setPrintMode(true)}
              style={{display:"flex",alignItems:"center",gap:5,padding:"8px 12px",background:C.surface,
                border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>
              ⛶ View Plan
            </button>
            <button onClick={()=>setSavingTpl(v=>!v)}
              style={{display:"flex",alignItems:"center",gap:5,padding:"8px 12px",background:savingTpl?C.accent+"22":C.surface,
                border:`1px solid ${savingTpl?C.accent:C.border}`,borderRadius:8,color:savingTpl?C.accent:C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>
              ☆ Save as Template
            </button>
            <button onClick={()=>{if(window.confirm("Delete this session?"))setPractices(prev=>prev.filter(p=>p.id!==sel));setSel(null);}}
              style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",color:C.muted,cursor:"pointer",display:"flex",alignItems:"center",gap:5,fontSize:12}}>
              <Trash2 size={13}/>
            </button>
          </div>
        </div>

        {/* Save as template input */}
        {savingTpl&&(
          <div style={{background:C.card,border:`1px solid ${C.accent}44`,borderRadius:12,padding:"14px 18px",marginBottom:14,display:"flex",gap:10,alignItems:"center"}}>
            <input value={tplName} onChange={e=>setTplName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&saveTemplate()}
              placeholder="Template name (e.g. Match Prep, Fitness Day)..."
              style={{...iS(),flex:1}}/>
            <button onClick={saveTemplate} disabled={!tplName.trim()}
              style={{padding:"9px 16px",background:tplName.trim()?C.accent:"transparent",border:`1px solid ${tplName.trim()?C.accent:C.border}`,
                borderRadius:8,color:tplName.trim()?"#000":C.muted,fontWeight:700,fontSize:13,cursor:"pointer",flexShrink:0}}>
              Save
            </button>
          </div>
        )}

        {/* Row 1: Objectives + Rating */}
        <div className="resp-grid" style={{display:"grid",gridTemplateColumns:"1fr 220px",gap:14,marginBottom:14}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:8}}>SESSION OBJECTIVES</div>
            <input value={session.objectives||""} onChange={e=>upd(()=>({objectives:e.target.value}))}
              placeholder="What are you aiming to improve today?" style={iS()}/>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>SESSION RATING</div>
            <div style={{display:"flex",gap:5,justifyContent:"center"}}>
              {[1,2,3,4,5].map(n=>(
                <button key={n} onClick={()=>upd(()=>({rating:n===(session.rating||0)?0:n}))}
                  style={{width:34,height:34,borderRadius:8,fontSize:18,cursor:"pointer",fontWeight:900,transition:"all .12s",
                    border:`2px solid ${(session.rating||0)>=n?C.warning:C.border}`,
                    background:(session.rating||0)>=n?C.warning+"22":"transparent",
                    color:(session.rating||0)>=n?C.warning:C.muted}}>★</button>
              ))}
            </div>
            <div style={{color:C.muted,fontSize:11,textAlign:"center",marginTop:8}}>
              {(session.rating||0)>0?["","Poor","Below Avg","Average","Good","Excellent"][session.rating]:"Not rated"}
            </div>
          </div>
        </div>

        {/* Drill Canvas Modal */}
        {diagramCard&&(()=>{
          const card=(blocks[diagramCard.sec]||[]).find(c=>c.id===diagramCard.cardId);
          if(!card) return null;
          return(
            <DrillCanvas
              diagram={card.diagram||null}
              onSave={data=>{updateCard(diagramCard.sec,diagramCard.cardId,"diagram",data);setDiagramCard(null);}}
              onClose={()=>setDiagramCard(null)}
            />
          );
        })()}

        {/* Row 2: Session blocks + Drill library */}
        <div className="resp-grid-sidebar practice-grid" style={{display:"grid",gridTemplateColumns:"1fr 240px",gap:14,marginBottom:14}}>

          {/* Session plan blocks */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {SECTIONS.map(sec=>{
              const cards=blocks[sec.key]||[];
              const secMins=cards.reduce((a,c)=>a+(parseInt(c.duration)||0),0);
              return(
                <div key={sec.key} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                  {/* Section header */}
                  <div className="practice-section-header" style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                    <span style={{fontSize:16}}>{sec.icon}</span>
                    <div style={{color:sec.color,fontFamily:"'Oswald',sans-serif",fontWeight:800,fontSize:15,letterSpacing:.5}}>{sec.label.toUpperCase()}</div>
                    {secMins>0&&<div style={{color:C.muted,fontSize:11,marginLeft:4}}>{secMins} min</div>}
                    <div style={{flex:1}}/>
                    {/* Add from library quick-pick */}
                    <select defaultValue=""
                      style={{padding:"4px 8px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,color:C.muted,fontSize:11,cursor:"pointer",maxWidth:140}}
                      onChange={e=>{
                        if(!e.target.value) return;
                        const d=(drills||[]).find(x=>x.id===e.target.value);
                        if(!d) return;
                        setPractices(prev=>prev.map(p=>p.id===sel?{...p,blocks:{...p.blocks,[sec.key]:[...(p.blocks?.[sec.key]||[]),makeCard(d.name,{notes:d.notes||"",intensity:d.intensity||"medium",diagram:d.diagram||null})]}}:p));
                        e.target.value="";
                      }}>
                      <option value="">+ From library</option>
                      {(drills||[]).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    {/* Add blank card */}
                    <button onClick={()=>setPractices(prev=>prev.map(p=>p.id===sel?{...p,blocks:{...p.blocks,[sec.key]:[...(p.blocks?.[sec.key]||[]),makeCard("")]}}:p))}
                      style={{padding:"4px 9px",background:sec.color+"22",border:`1px solid ${sec.color}44`,borderRadius:7,color:sec.color,cursor:"pointer",fontWeight:700,fontSize:12}}>+ Add</button>
                  </div>

                  {/* Drill cards */}
                  {cards.length===0
                    ? <div style={{color:C.muted,fontSize:12,fontStyle:"italic",textAlign:"center",padding:"12px 0"}}>{sec.desc}</div>
                    : cards.map((card,idx)=>(
                        <div key={card.id} style={{background:C.surface,borderRadius:10,padding:"10px 12px",marginBottom:8,
                          border:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:8}}>
                          {/* Card top row */}
                          <div style={{display:"flex",gap:8,alignItems:"center"}}>
                            {/* Reorder */}
                            <div style={{display:"flex",flexDirection:"column",gap:1,flexShrink:0}}>
                              <button onClick={()=>moveCard(sec.key,card.id,-1)} disabled={idx===0}
                                style={{background:"none",border:"none",color:idx===0?C.border:C.muted,cursor:idx===0?"default":"pointer",fontSize:10,padding:0,lineHeight:1}}>▲</button>
                              <button onClick={()=>moveCard(sec.key,card.id,1)} disabled={idx===cards.length-1}
                                style={{background:"none",border:"none",color:idx===cards.length-1?C.border:C.muted,cursor:idx===cards.length-1?"default":"pointer",fontSize:10,padding:0,lineHeight:1}}>▼</button>
                            </div>
                            {/* Name */}
                            <input value={card.name} onChange={e=>updateCard(sec.key,card.id,"name",e.target.value)}
                              placeholder="Drill name..."
                              style={{flex:1,padding:"6px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:7,
                                color:C.text,fontSize:13,fontWeight:600,outline:"none",fontFamily:"'Outfit',sans-serif"}}/>
                            {/* Duration */}
                            <input type="number" min="1" max="60" value={card.duration}
                              onChange={e=>updateCard(sec.key,card.id,"duration",e.target.value)}
                              placeholder="min"
                              style={{width:52,padding:"6px 8px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:7,
                                color:C.text,fontSize:12,outline:"none",fontFamily:"'Outfit',sans-serif",textAlign:"center"}}/>
                            <span style={{color:C.muted,fontSize:11,flexShrink:0}}>min</span>
                            {/* Diagram */}
                            <button
                              onClick={()=>setDiagramCard({sec:sec.key,cardId:card.id})}
                              title="Draw drill diagram"
                              style={{background:card.diagram?C.accent+"22":"none",
                                border:`1px solid ${card.diagram?C.accent:C.border}`,
                                borderRadius:6,color:card.diagram?C.accent:C.muted,
                                cursor:"pointer",padding:"2px 6px",flexShrink:0,fontSize:10,fontWeight:700}}>
                              ⬡
                            </button>
                            {/* Save to Library */}
                            <button
                              onClick={()=>{
                                if(!card.name.trim()) return;
                                const exists=(drills||[]).find(d=>d.name.toLowerCase()===card.name.trim().toLowerCase());
                                if(exists){
                                  if(!window.confirm(`"${card.name}" is already in your library. Update it?`)) return;
                                  setDrills(prev=>prev.map(d=>d.name.toLowerCase()===card.name.trim().toLowerCase()
                                    ?{...d,notes:card.notes||"",intensity:card.intensity||"medium",diagram:card.diagram||null}
                                    :d));
                                } else {
                                  setDrills(prev=>[...prev,{
                                    id:`d${Date.now()}`,
                                    name:card.name.trim(),
                                    notes:card.notes||"",
                                    intensity:card.intensity||"medium",
                                    diagram:card.diagram||null,
                                  }]);
                                }
                                alert(`"${card.name}" saved to library!`);
                              }}
                              title="Save to drill library"
                              style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,
                                color:C.muted,cursor:"pointer",padding:"2px 6px",flexShrink:0,fontSize:10,fontWeight:700}}>
                              ★
                            </button>
                            {/* Delete */}
                            <button onClick={()=>removeCard(sec.key,card.id)}
                              style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:2,flexShrink:0}}><X size={13}/></button>
                          </div>
                          {/* Notes + intensity */}
                          <div className="drill-card-row" style={{display:"flex",gap:8,alignItems:"center"}}>
                            <textarea value={card.notes||""} onChange={e=>updateCard(sec.key,card.id,"notes",e.target.value)}
                              placeholder="Notes, coaching points, setup..."
                              rows={2}
                              style={{flex:1,padding:"5px 10px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:7,
                                color:C.muted,fontSize:12,outline:"none",fontFamily:"'Outfit',sans-serif",
                                resize:"vertical",lineHeight:1.5}}/>
                            {/* Intensity */}
                            <div style={{display:"flex",gap:4,flexShrink:0}}>
                              {INTENSITY.map(int=>(
                                <button key={int.k} onClick={()=>updateCard(sec.key,card.id,"intensity",int.k)}
                                  title={int.label}
                                  style={{padding:"3px 7px",borderRadius:5,fontSize:10,fontWeight:700,cursor:"pointer",transition:"all .1s",
                                    border:`1.5px solid ${card.intensity===int.k?int.color:C.border}`,
                                    background:card.intensity===int.k?int.color+"22":"transparent",
                                    color:card.intensity===int.k?int.color:C.muted}}>
                                  {int.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))
                  }
                </div>
              );
            })}
          </div>

          {/* Right sidebar: Drill library + Attendance */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>

            {/* Drill Library */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:10}}>DRILL LIBRARY</div>
              <div style={{display:"flex",gap:5,marginBottom:8}}>
                <input value={drillName} onChange={e=>setDrillName(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&saveDrill()}
                  placeholder="Save a drill..." style={iS({fontSize:11,padding:"6px 9px"})}/>
                <button onClick={saveDrill} disabled={!drillName.trim()}
                  style={{padding:"6px 9px",background:drillName.trim()?C.accent+"22":C.surface,
                    border:`1px solid ${drillName.trim()?C.accent:C.border}`,borderRadius:7,
                    color:drillName.trim()?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:12,flexShrink:0}}>+</button>
              </div>
              <div style={{maxHeight:180,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
                {(drills||[]).length===0
                  ? <div style={{color:C.muted,fontSize:11,fontStyle:"italic"}}>No drills saved yet</div>
                  : (drills||[]).map(d=>(
                    <div key={d.id} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 8px",
                      background:C.surface,borderRadius:7,border:`1px solid ${C.border}`}}>
                      <span style={{flex:1,color:C.text,fontSize:11,fontWeight:600}}>{d.name}</span>
                      <button onClick={()=>setDrills(prev=>prev.filter(x=>x.id!==d.id))}
                        style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:1}}><X size={10}/></button>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Attendance */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16,flex:1}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:10}}>
                ATTENDANCE <span style={{color:C.accent,fontWeight:700}}>{pres}</span>/{Object.keys(att).length}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:360,overflowY:"auto"}}>
                {roster.map(p=>{
                  const status=att[p.id]||"present";
                  const pc=posColor(primaryPos(p));
                  return(
                    <div key={p.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",background:C.surface,borderRadius:7,
                      border:`1px solid ${status==="present"?C.accent+"22":status==="injured"?C.warning+"22":C.danger+"22"}`}}>
                      <div style={{width:24,height:24,borderRadius:5,flexShrink:0,background:pc+"22",border:`1.5px solid ${pc}44`,
                        display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:700,color:pc,fontSize:11}}>
                        {p.number}
                      </div>
                      <span style={{flex:1,color:C.text,fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {p.name.split(" ")[1]||p.name}
                      </span>
                      <div style={{display:"flex",gap:2}}>
                        {ATT.map(opt=>(
                          <button key={opt.k} onClick={()=>setAtt(p.id,opt.k)}
                            style={{width:24,height:22,borderRadius:5,fontSize:11,fontWeight:700,cursor:"pointer",transition:"all .1s",
                              border:`1.5px solid ${status===opt.k?opt.color:C.border}`,
                              background:status===opt.k?opt.color+"22":"transparent",
                              color:status===opt.k?opt.color:C.muted}}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Player notes */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:10}}>PLAYER NOTES</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <select value={selPlayer} onChange={e=>setSelPlayer(e.target.value)} style={iS({padding:"7px 10px",fontSize:12})}>
                  <option value="">Select player...</option>
                  {roster.map(p=><option key={p.id} value={p.id}>{p.name} #{p.number}</option>)}
                </select>
                <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} rows={2}
                  placeholder="Coaching note..." style={iS({resize:"vertical",fontSize:12})}/>
                <button onClick={addNote} disabled={!selPlayer||!noteText.trim()}
                  style={{padding:"7px",background:selPlayer&&noteText.trim()?C.accent:"transparent",
                    border:`1px solid ${selPlayer&&noteText.trim()?C.accent:C.border}`,borderRadius:7,
                    color:selPlayer&&noteText.trim()?"#000":C.muted,fontWeight:700,fontSize:12,cursor:"pointer"}}>
                  Add Note
                </button>
                {session.playerNotes.map(note=>{
                  const p=roster.find(r=>r.id===note.pid);
                  return(
                    <div key={note.id} style={{background:C.surface,borderRadius:8,padding:"8px 10px",display:"flex",gap:7}}>
                      <div style={{width:22,height:22,borderRadius:5,flexShrink:0,background:posColor(primaryPos(p))+"22",
                        border:`1.5px solid ${posColor(primaryPos(p))}44`,display:"flex",alignItems:"center",justifyContent:"center",
                        fontFamily:"'Oswald',sans-serif",fontWeight:700,color:posColor(primaryPos(p)),fontSize:10}}>
                        {p?.number||"?"}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:C.text,fontWeight:700,fontSize:11,marginBottom:1}}>{note.name}</div>
                        <div style={{color:C.muted,fontSize:11,lineHeight:1.5}}>{note.note}</div>
                      </div>
                      <button onClick={()=>upd(s=>({playerNotes:s.playerNotes.filter(n=>n.id!==note.id)}))}
                        style={{background:"none",border:"none",color:C.muted,cursor:"pointer",flexShrink:0}}><X size={10}/></button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── SESSION LIST ──────────────────────────────────────────────────────────
  const filtered=filterTag==="All"?practices:practices.filter(p=>p.focus===filterTag);

  return(
    <div style={{padding:20,maxWidth:900,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2}}>TRAINING</div>
          <h1 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:28,fontWeight:800,marginTop:4}}>Practice Log</h1>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {(templates||[]).length>0&&(
            <span style={{color:C.muted,fontSize:12}}>{templates.length} template{templates.length!==1?"s":""}</span>
          )}
          <button onClick={()=>setCreating(true)}
            style={{display:"flex",alignItems:"center",gap:8,padding:"10px 18px",background:C.accent,border:"none",borderRadius:10,color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
            <Plus size={15}/>New Session
          </button>
        </div>
      </div>

      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
        {["All",...FOCUS_TAGS].map(t=>{
          const col=t==="All"?C.accent:(FOCUS_COLORS[t]||C.accent);
          return(<button key={t} onClick={()=>setFilterTag(t)}
            style={{padding:"6px 12px",background:filterTag===t?col+"22":C.card,border:`1px solid ${filterTag===t?col:C.border}`,borderRadius:7,color:filterTag===t?col:C.muted,cursor:"pointer",fontWeight:700,fontSize:12}}>{t}</button>);
        })}
      </div>

      {filtered.length===0
        ? <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"48px 24px",textAlign:"center"}}>
            <Dumbbell size={40} style={{color:C.muted,opacity:.3,marginBottom:12}}/>
            <div style={{color:C.text,fontSize:15,fontWeight:600}}>No sessions {filterTag!=="All"?`tagged "${filterTag}"`:""} yet</div>
            <div style={{color:C.muted,fontSize:13,marginTop:6}}>Log your first training session</div>
          </div>
        : <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {filtered.map(session=>{
              const col=FOCUS_COLORS[session.focus]||C.accent;
              const linked=gamePlans.find(gp=>gp.id===session.linkedGame);
              const att=session.attendance||{};
              const pres=Object.values(att).filter(v=>v==="present").length;
              const total=Object.keys(att).length;
              const blocks=session.blocks||{};
              const drillCount=Object.values(blocks).flat().length;
              return(
                <div key={session.id} onClick={()=>setSel(session.id)}
                  style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,transition:"all .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=col}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  <div style={{width:44,height:44,borderRadius:10,background:col+"22",border:`2px solid ${col}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <Dumbbell size={20} color={col}/>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                      <Tag color={col}>{session.focus}</Tag>
                      <span style={{color:C.muted,fontSize:12}}>{session.duration} mins</span>
                      {linked&&<span style={{color:C.muted,fontSize:12}}>· {linked.opponent}</span>}
                    </div>
                    <div style={{color:C.text,fontWeight:700,fontSize:14}}>{session.date}</div>
                    {session.objectives&&<div style={{color:C.muted,fontSize:12,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{session.objectives}</div>}
                  </div>
                  <div style={{textAlign:"right",flexShrink:0,display:"flex",flexDirection:"column",gap:3,alignItems:"flex-end"}}>
                    {(session.rating||0)>0&&<div style={{color:C.warning,fontSize:11}}>{"★".repeat(session.rating)}{"☆".repeat(5-session.rating)}</div>}
                    {total>0&&<div style={{color:C.muted,fontSize:11}}>{pres}/{total} present</div>}
                    {drillCount>0&&<div style={{color:C.muted,fontSize:11}}>{drillCount} drill{drillCount!==1?"s":""}</div>}
                  </div>
                  <ChevronRight size={16} color={C.muted}/>
                </div>
              );
            })}
          </div>
      }
    </div>
  );
}


// ─── CALENDAR VIEW ────────────────────────────────────────────────────────────
// ─── CALENDAR HELPERS ────────────────────────────────────────────────────────
function makeGoogleCalUrl(evt, teamName){
  // Format: YYYYMMDDTHHMMSS
  var d = evt.date.replace(/-/g,"");
  var t = evt.time ? evt.time.replace(":","")+"00" : "090000";
  var start = d+"T"+t;
  // Default 2hr duration
  var endH = evt.time ? String(parseInt(evt.time.split(":")[0])+2).padStart(2,"0")+evt.time.split(":")[1]+"00" : "110000";
  var end = d+"T"+endH;
  var title = encodeURIComponent((evt.type==="game"?"vs "+evt.opponent:evt.title)||evt.title||"Event");
  var loc   = encodeURIComponent(evt.location||"");
  var details = encodeURIComponent((teamName||"CoachIQ")+(evt.notes?" — "+evt.notes:""));
  return "https://calendar.google.com/calendar/render?action=TEMPLATE&text="+title+"&dates="+start+"/"+end+"&location="+loc+"&details="+details;
}

function makeICSContent(events, teamName){
  var lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CoachIQ//Season Schedule//EN",
    "X-WR-CALNAME:"+(teamName||"CoachIQ")+" Season",
    "X-WR-TIMEZONE:America/New_York",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  events.forEach(function(evt){
    var d = (evt.date||"").replace(/-/g,"");
    if(!d) return;
    var t = evt.time ? evt.time.replace(":","")+"00" : "090000";
    var endH = evt.time ? String(parseInt((evt.time||"09:00").split(":")[0])+2).padStart(2,"0")+((evt.time||"09:00").split(":")[1])+"00" : "110000";
    var title = (evt.type==="game"?"vs "+(evt.opponent||""):evt.title||"Event");
    lines.push("BEGIN:VEVENT");
    lines.push("DTSTART:"+d+"T"+t);
    lines.push("DTEND:"+d+"T"+endH);
    lines.push("SUMMARY:"+title);
    if(evt.location) lines.push("LOCATION:"+evt.location);
    if(evt.notes)    lines.push("DESCRIPTION:"+evt.notes);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadICS(events, teamName){
  var content = makeICSContent(events, teamName);
  var blob = new Blob([content], {type:"text/calendar;charset=utf-8"});
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement("a");
  a.href = url;
  a.download = (teamName||"CoachIQ").replace(/\s+/g,"_")+"_Season.ics";
  a.click();
  URL.revokeObjectURL(url);
}


function CalendarView({schedule, setSchedule, games, practices, setView, teamName, activeTeamId}){
  const today = new Date();
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

  // Build all events including auto-imported from games + practices
  const allEvents = useMemo(()=>{
    const evts = [...schedule];
    // Auto-include completed games not already in schedule
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

  // Get days in month
  const daysInMonth = new Date(curYear, curMonth+1, 0).getDate();
  const firstDay    = new Date(curYear, curMonth, 1).getDay(); // 0=Sun
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  function eventsOnDay(d){
    const dateStr = `${curYear}-${String(curMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    return allEvents.filter(e=>e.date===dateStr);
  }

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

  function deleteEvent(id){
    setSchedule(prev=>prev.filter(e=>e.id!==id));
  }

  function openAdd(dateStr){
    setSelDay(dateStr);
    setForm({type:"game",title:"",date:dateStr,time:"",location:"",opponent:"",notes:""});
    setEditEvt(null);
    setShowForm(true);
  }

  function openEdit(evt){
    if(evt.auto) return; // can't edit auto-imported
    setForm({type:evt.type,title:evt.title,date:evt.date,time:evt.time||"",
      location:evt.location||"",opponent:evt.opponent||"",notes:evt.notes||""});
    setEditEvt(evt.id);
    setShowForm(true);
  }

  const iStyle = (extra={}) => ({padding:"9px 12px",background:C.bg,border:`1px solid ${C.border}`,
    borderRadius:8,color:C.text,fontSize:13,outline:"none",fontFamily:"'Outfit',sans-serif",
    boxSizing:"border-box",width:"100%",...extra});

  // Upcoming events (next 30 days)
  const upcoming = useMemo(()=>{
    const todayStr = today.toISOString().split("T")[0];
    const limitStr = new Date(today.getTime()+30*86400000).toISOString().split("T")[0];
    return allEvents.filter(e=>e.date>=todayStr&&e.date<=limitStr).sort((a,b)=>a.date.localeCompare(b.date));
  },[allEvents]);

  return(
    <div style={{padding:20,maxWidth:1100,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2}}>SEASON</div>
          <h1 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:28,fontWeight:800,marginTop:4}}>Calendar</h1>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <button onClick={()=>downloadICS(allEvents, teamName)}
            title="Download season as Apple/Outlook calendar file"
            style={{display:"flex",alignItems:"center",gap:6,padding:"9px 14px",
              background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,
              color:C.muted,cursor:"pointer",fontWeight:700,fontSize:12}}>
            ⬇ Export .ics
          </button>
          <button onClick={()=>{
            const link=window.location.origin+window.location.pathname+"#/schedule/"+activeTeamId;
            navigator.clipboard?.writeText(link).then(()=>alert("Schedule link copied!")).catch(()=>alert(link));
          }}
            title="Share a public link to your season schedule"
            style={{display:"flex",alignItems:"center",gap:6,padding:"9px 14px",
              background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,
              color:C.muted,cursor:"pointer",fontWeight:700,fontSize:12}}>
            ⎘ Share Schedule
          </button>
          <button onClick={()=>openAdd(today.toISOString().split("T")[0])}
            style={{display:"flex",alignItems:"center",gap:8,padding:"10px 18px",background:C.accent,
              border:"none",borderRadius:10,color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",
              fontFamily:"'Oswald',sans-serif"}}>
            <Plus size={15}/>Add Event
          </button>
        </div>
      </div>

      {/* Add/Edit form modal */}
      {showForm&&(
        <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:28,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <h3 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:20,fontWeight:800}}>{editEvt?"Edit Event":"Add Event"}</h3>
              <button onClick={()=>{setShowForm(false);setEditEvt(null);}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer"}}><X size={18}/></button>
            </div>

            {/* Type */}
            <div style={{marginBottom:14}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>TYPE</label>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                {EVENT_TYPES.map(t=>(
                  <button key={t.k} onClick={()=>setForm(f=>({...f,type:t.k}))}
                    style={{padding:"7px 14px",background:form.type===t.k?t.color+"22":C.surface,
                      border:`1px solid ${form.type===t.k?t.color:C.border}`,borderRadius:8,
                      color:form.type===t.k?t.color:C.muted,cursor:"pointer",fontWeight:700,fontSize:12}}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div style={{marginBottom:12}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>
                {form.type==="game"?"OPPONENT":"TITLE"}
              </label>
              <input value={form.type==="game"?form.opponent:form.title}
                onChange={e=>setForm(f=>form.type==="game"?{...f,opponent:e.target.value,title:`vs ${e.target.value}`}:{...f,title:e.target.value})}
                placeholder={form.type==="game"?"e.g. Lincoln High":"e.g. Team Meeting"}
                style={iStyle()}/>
            </div>

            {/* Date + Time */}
            <div className="resp-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <div>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>DATE</label>
                <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={iStyle()}/>
              </div>
              <div>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>TIME</label>
                <input type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))} style={iStyle()}/>
              </div>
            </div>

            {/* Location */}
            <div style={{marginBottom:12}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>LOCATION</label>
              <input value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))}
                placeholder="e.g. Home Field / Away" style={iStyle()}/>
            </div>

            {/* Notes */}
            <div style={{marginBottom:20}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>NOTES</label>
              <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2}
                placeholder="Bus time, uniform, field notes..." style={iStyle({resize:"vertical"})}/>
            </div>

            <div style={{display:"flex",gap:10}}>
              <button onClick={saveEvent} disabled={!form.date}
                style={{flex:1,padding:"11px",background:form.date?C.accent:"#2a1000",border:"none",borderRadius:9,
                  color:form.date?"#000":C.muted,fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
                {editEvt?"Save Changes":"Add Event"}
              </button>
              {editEvt&&(
                <button onClick={()=>{deleteEvent(editEvt);setShowForm(false);setEditEvt(null);}}
                  style={{padding:"11px 16px",background:"#2a0800",border:`1px solid ${C.danger}44`,
                    borderRadius:9,color:C.danger,fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                  <Trash2 size={14}/>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="resp-grid-sidebar" style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:16}}>
        {/* Calendar grid */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden"}}>
          {/* Month nav */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:`1px solid ${C.border}`}}>
            <button onClick={()=>{if(curMonth===0){setCurMonth(11);setCurYear(y=>y-1);}else setCurMonth(m=>m-1);}}
              style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:6,borderRadius:7,display:"flex",alignItems:"center"}}>
              <ChevronDown size={16} style={{transform:"rotate(90deg)"}}/>
            </button>
            <div style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontWeight:800,fontSize:20}}>
              {MONTHS[curMonth]} {curYear}
            </div>
            <button onClick={()=>{if(curMonth===11){setCurMonth(0);setCurYear(y=>y+1);}else setCurMonth(m=>m+1);}}
              style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:6,borderRadius:7,display:"flex",alignItems:"center"}}>
              <ChevronDown size={16} style={{transform:"rotate(-90deg)"}}/>
            </button>
          </div>

          {/* Day headers */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:`1px solid ${C.border}`}}>
            {DAYS.map(d=>(
              <div key={d} style={{textAlign:"center",padding:"8px 0",color:C.muted,fontSize:11,fontWeight:700,letterSpacing:.5}}>{d}</div>
            ))}
          </div>

          {/* Calendar cells */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
            {/* Empty cells before first day */}
            {Array(firstDay).fill(null).map((_,i)=>(
              <div key={`empty-${i}`} style={{minHeight:80,borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}/>
            ))}
            {/* Day cells */}
            {Array.from({length:daysInMonth},(_,i)=>i+1).map(d=>{
              const dateStr = `${curYear}-${String(curMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
              const dayEvts = eventsOnDay(d);
              const isToday = d===today.getDate() && curMonth===today.getMonth() && curYear===today.getFullYear();
              const col = (firstDay + d - 1) % 7;
              const isLastCol = col === 6;
              return(
                <div key={d}
                  onClick={()=>openAdd(dateStr)}
                  style={{minHeight:80,padding:"6px 6px 4px",
                    borderRight:isLastCol?"none":`1px solid ${C.border}`,
                    borderBottom:`1px solid ${C.border}`,
                    cursor:"pointer",transition:"background .1s",
                    background:"transparent"}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.surface}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  {/* Day number */}
                  <div style={{
                    width:26,height:26,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
                    marginBottom:4,fontSize:12,fontWeight:isToday?900:500,
                    background:isToday?C.accent:"transparent",
                    color:isToday?"#000":C.text}}>
                    {d}
                  </div>
                  {/* Events */}
                  {dayEvts.slice(0,3).map(evt=>(
                    <div key={evt.id}
                      onClick={e=>{e.stopPropagation();openEdit(evt);}}
                      style={{fontSize:10,fontWeight:700,padding:"2px 5px",borderRadius:4,marginBottom:2,
                        background:typeColor(evt.type)+"22",color:typeColor(evt.type),
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                        cursor:evt.auto?"default":"pointer"}}>
                      {evt.time&&<span style={{opacity:.7,marginRight:3}}>{evt.time.slice(0,5)}</span>}
                      {evt.title||evt.opponent}
                    </div>
                  ))}
                  {dayEvts.length>3&&<div style={{fontSize:9,color:C.muted,fontWeight:700}}>+{dayEvts.length-3} more</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming events sidebar */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,flex:1}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:14}}>NEXT 30 DAYS</div>
            {upcoming.length===0
              ? <div style={{color:C.muted,fontSize:13,fontStyle:"italic"}}>No events upcoming</div>
              : upcoming.map(evt=>{
                  const col=typeColor(evt.type);
                  const d=new Date(evt.date+"T12:00:00");
                  const dayLabel=d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
                  const r=evt.result;
                  return(
                    <div key={evt.id}
                      onClick={()=>!evt.auto&&openEdit(evt)}
                      style={{display:"flex",gap:10,marginBottom:12,cursor:evt.auto?"default":"pointer",
                        padding:"8px 10px",borderRadius:9,background:C.surface,
                        border:`1px solid ${C.border}`,transition:"border .12s"}}
                      onMouseEnter={e=>{if(!evt.auto)e.currentTarget.style.borderColor=col;}}
                      onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                      <div style={{width:4,borderRadius:99,background:col,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:C.text,fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {evt.title||evt.opponent}
                        </div>
                        <div style={{color:C.muted,fontSize:11,marginTop:2}}>{dayLabel}{evt.time&&` · ${evt.time.slice(0,5)}`}</div>
                        {evt.location&&<div style={{color:C.muted,fontSize:11}}>{evt.location}</div>}
                        {r&&<div style={{color:r.our>r.their?C.accent:r.our<r.their?C.danger:C.warning,fontSize:12,fontWeight:700,marginTop:2}}>{r.our}–{r.their}</div>}
                      </div>
                    </div>
                  );
                })
            }
          </div>

          {/* Legend */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:10}}>EVENT TYPES</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {EVENT_TYPES.map(t=>(
                <div key={t.k} style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:10,height:10,borderRadius:3,background:t.color,flexShrink:0}}/>
                  <span style={{color:C.muted,fontSize:12,fontWeight:600}}>{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TRYOUTS VIEW ─────────────────────────────────────────────────────────────
function TryoutsView({tryouts, setTryouts, roster, setRoster, teams, activeTeamId, onSwitchTeam, addPlayerToTeam}){
  const [selTryout,  setSelTryout]  = useState(null);
  const [selCand,    setSelCand]    = useState(null);
  const [activeTab,  setActiveTab]  = useState("candidates"); // candidates | lineups
  const [lineupTeam, setLineupTeam] = useState("varsity");
  const [creating,   setCreating]   = useState(false);
  const [addingCand, setAddingCand] = useState(false);
  const [pickingSlot,setPickingSlot]= useState(null); // {zone,idx}
  const [importMsg,  setImportMsg]  = useState(null);
  const [closeWizard, setCloseWizard] = useState(false); // shows 3-step close+submit wizard
  const fileRef = useRef(null);

  const [tForm, setTForm] = useState({name:"",year:new Date().getFullYear().toString(),teamType:"highschool"});
  const [cForm, setCForm] = useState({name:"",primaryPos:"CM",secondaryPos:"",grade:"9",club:"",notes:""});

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
  const CLUB_STATUS = [
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
  const SLOTS_FOR = f => {
    const m = {"4-3-3":{GK:1,DEF:4,MID:3,FWD:3},"4-4-2":{GK:1,DEF:4,MID:4,FWD:2},
               "4-2-3-1":{GK:1,DEF:4,MID:5,FWD:1},"3-5-2":{GK:1,DEF:3,MID:5,FWD:2},
               "5-3-2":{GK:1,DEF:5,MID:3,FWD:2}};
    return m[f]||m["4-3-3"];
  };
  const ZONES = [{key:"GK",label:"Goalkeeper",color:"#ffb300"},{key:"DEF",label:"Defenders",color:"#42a5f5"},
                 {key:"MID",label:"Midfielders",color:"#66bb6a"},{key:"FWD",label:"Forwards",color:"#ff6b00"}];

  function avgScore(scores){
    const vals=Object.values(scores||{}).filter(v=>v>0);
    return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
  }

  function upd(fn){ setTryouts(prev=>prev.map(t=>t.id===selTryout?{...t,...fn(t)}:t)); }

  function createTryout(){
    if(!tForm.name.trim()) return;
    const t={id:`try${Date.now()}`,name:tForm.name.trim(),year:tForm.year,
      teamType:tForm.teamType||"highschool",status:"open",
      candidates:[],customStats:[],
      lineups:{
        varsity:{formation:"4-3-3",slots:{GK:[null],DEF:[null,null,null,null],MID:[null,null,null],FWD:[null,null,null]}},
        jv:     {formation:"4-3-3",slots:{GK:[null],DEF:[null,null,null,null],MID:[null,null,null],FWD:[null,null,null]}},
        jvb:    {formation:"4-3-3",slots:{GK:[null],DEF:[null,null,null,null],MID:[null,null,null],FWD:[null,null,null]}},
      },
      createdAt:new Date().toISOString()};
    setTryouts(prev=>[t,...prev]);
    setSelTryout(t.id); setCreating(false);
  }

  function addCandidate(){
    if(!cForm.name.trim()) return;
    const tryout = tryouts.find(t=>t.id===selTryout);
    const customStatVals={};
    (tryout?.customStats||[]).forEach(s=>{ customStatVals[s.id]=""; });
    const positions=[cForm.primaryPos,...(cForm.secondaryPos&&cForm.secondaryPos!==cForm.primaryPos?[cForm.secondaryPos]:[])];
    const c={id:`c${Date.now()}`,name:cForm.name.trim(),
      positions, primaryPos:cForm.primaryPos,
      grade:tryout?.teamType==="highschool"?cForm.grade:"",
      club: tryout?.teamType==="club"?cForm.club:"",
      scores:{technical:0,athletic:0,tactical:0,attitude:0,positional:0},
      customStats:customStatVals,
      status:"prospect",notes:cForm.notes,coachNote:""};
    upd(t=>({candidates:[...t.candidates,c]}));
    setCForm({name:"",primaryPos:"CM",secondaryPos:"",grade:"9",club:"",notes:""});
    setAddingCand(false);
    setSelCand(c.id);
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
  function deleteCandidate(candId){
    upd(t=>({candidates:t.candidates.filter(c=>c.id!==candId)}));
    setSelCand(null);
  }

  // ── Custom stat management ───────────────────────────────────────────────
  const [newStatLabel, setNewStatLabel] = useState("");
  const [newStatUnit,  setNewStatUnit]  = useState("");
  function addCustomStat(){
    if(!newStatLabel.trim()) return;
    const stat={id:`st${Date.now()}`,label:newStatLabel.trim(),unit:newStatUnit.trim()};
    upd(t=>({
      customStats:[...(t.customStats||[]),stat],
      candidates:t.candidates.map(c=>({...c,customStats:{...c.customStats,[stat.id]:""}}))
    }));
    setNewStatLabel(""); setNewStatUnit("");
  }
  function removeCustomStat(statId){
    upd(t=>({
      customStats:(t.customStats||[]).filter(s=>s.id!==statId),
      candidates:t.candidates.map(c=>{const cs={...c.customStats};delete cs[statId];return{...c,customStats:cs};})
    }));
  }

  // ── Lineup management ────────────────────────────────────────────────────
  function setLineupFormation(team, formation){
    const slots=SLOTS_FOR(formation);
    const newSlots={};
    Object.entries(slots).forEach(([zone,count])=>{ newSlots[zone]=Array(count).fill(null); });
    upd(t=>({lineups:{...t.lineups,[team]:{formation,slots:newSlots}}}));
  }
  function assignLineupSlot(team,zone,idx,candId){
    upd(t=>{
      const lineup={...t.lineups[team]};
      const slots={...lineup.slots,[zone]:[...lineup.slots[zone]]};
      slots[zone][idx]=candId||null;
      return {lineups:{...t.lineups,[team]:{...lineup,slots}}};
    });
    setPickingSlot(null);
  }

  // ── Mass upload ──────────────────────────────────────────────────────────
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
      const customStatVals={};
      (tryout?.customStats||[]).forEach(s=>{ customStatVals[s.id]=""; });
      const newCands=data.map(r=>{
        const primary=(r[1]?.toString().trim().toUpperCase())||"CM";
        const secondary=(r[2]?.toString().trim().toUpperCase())||"";
        const positions=[primary,...(secondary&&secondary!==primary?[secondary]:[])];
        return{
          id:`c${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name:r[0].toString().trim(),
          positions,primaryPos:primary,
          grade:isHS?(r[3]?.toString().trim()||""):"",
          club:!isHS?(r[3]?.toString().trim()||""):"",
          notes:r[4]?.toString().trim()||"",
          scores:{technical:0,athletic:0,tactical:0,attitude:0,positional:0},
          customStats:{...customStatVals},
          status:"prospect",coachNote:""
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

  // ── ROSTER ADD PROMPT MODAL ─────────────────────────────────────────────────


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
            border:"none",borderRadius:10,color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
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
              <div key={t.id} onClick={()=>{setSelTryout(t.id);setActiveTab("candidates");setSelCand(null);}}
                style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,
                  padding:"16px 20px",marginBottom:10,cursor:"pointer",display:"flex",alignItems:"center",gap:16,transition:"all .15s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                <div style={{width:46,height:46,borderRadius:11,background:C.accent+"22",border:`2px solid ${C.accent}44`,
                  display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
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
  if(closeWizard && selTryout){
    const tryout = tryouts.find(t=>t.id===selTryout);
    if(tryout) return(
      <TryoutCloseWizard
        tryout={tryout}
        teams={teams||[]}
        addPlayerToTeam={addPlayerToTeam}
        onClose={()=>setCloseWizard(false)}
        onDone={()=>{
          // Mark tryout as closed
          setTryouts(prev=>prev.map(t=>t.id===selTryout?{...t,status:"closed"}:t));
          setCloseWizard(false);
        }}
      />
    );
  }

  // ── TRYOUT DETAIL ────────────────────────────────────────────────────────
  const tryout=tryouts.find(t=>t.id===selTryout);
  if(!tryout) return null;
  const STATUS_OPTS=tryout.teamType==="club"?CLUB_STATUS:HS_STATUS;
  const sorted=[...tryout.candidates].sort((a,b)=>avgScore(b.scores)-avgScore(a.scores));
  const selCandObj=selCand?tryout.candidates.find(c=>c.id===selCand):null;
  const customStats=tryout.customStats||[];
  const lineups=tryout.lineups||{};
  const curLineup=lineups[lineupTeam]||{formation:"4-3-3",slots:{GK:[null],DEF:[null,null,null,null],MID:[null,null,null],FWD:[null,null,null]}};

  return(
    <div style={{padding:20,maxWidth:1200,margin:"0 auto"}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        <button onClick={()=>{setSelTryout(null);setSelCand(null);}}
          style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",color:C.text,cursor:"pointer",fontSize:13}}>← Back</button>
        <div style={{flex:1}}>
          <div style={{color:C.muted,fontSize:12}}>{tryout.year} · {tryout.teamType==="club"?"Club":"High School"}</div>
          <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:800}}>{tryout.name}</h2>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>tryout.status==="open"?setCloseWizard(true):setTryouts(prev=>prev.map(t=>t.id===selTryout?{...t,status:"open"}:t))}
            style={{padding:"8px 14px",background:tryout.status==="open"?C.accent+"22":"#2a1000",
              border:`1px solid ${tryout.status==="open"?C.accent:C.border}`,borderRadius:8,
              color:tryout.status==="open"?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:12}}>
            {tryout.status==="open"?"Close & Submit":"Reopen"}
          </button>
          <button onClick={()=>{if(window.confirm("Delete this tryout?"))setTryouts(prev=>prev.filter(t=>t.id!==selTryout));setSelTryout(null);}}
            style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",
              color:C.muted,cursor:"pointer",display:"flex",alignItems:"center",gap:5,fontSize:12}}>
            <Trash2 size={13}/>
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{display:"flex",gap:6,marginBottom:18,borderBottom:`1px solid ${C.border}`,paddingBottom:0}}>
        {[{k:"candidates",label:"Candidates"},
          {k:"lineups",   label:"Lineup Builder"},
          {k:"stats",     label:"Custom Stats"},
        ].map(tab=>(
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
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
            <button onClick={()=>setAddingCand(true)}
              style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",background:C.accent,
                border:"none",borderRadius:8,color:"#000",fontWeight:800,fontSize:13,cursor:"pointer"}}>
              <Plus size={14}/>Add Candidate
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" style={{display:"none"}} onChange={handleImport}/>
            <button onClick={()=>fileRef.current?.click()}
              style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",background:C.surface,
                border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,cursor:"pointer",fontWeight:700,fontSize:13}}>
              <Upload size={14}/>Import Excel
            </button>
            <button onClick={downloadTemplate}
              style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",background:C.surface,
                border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,cursor:"pointer",fontWeight:700,fontSize:13}}>
              <Download size={14}/>Template
            </button>
            {importMsg&&(
              <span style={{color:importMsg.type==="ok"?C.accent:C.danger,fontSize:13,fontWeight:600}}>{importMsg.text}</span>
            )}
          </div>

          {/* Add candidate form */}
          {addingCand&&(
            <div style={{background:C.card,border:`1px solid ${C.accent}44`,borderRadius:14,padding:20,marginBottom:16}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>NEW CANDIDATE</div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <input value={cForm.name} onChange={e=>setCForm(f=>({...f,name:e.target.value}))}
                  placeholder="Full Name *" style={iS()}/>
                {/* Primary position */}
                <div>
                  <label style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:.5,display:"block",marginBottom:4}}>PRIMARY POS</label>
                  <select value={cForm.primaryPos} onChange={e=>setCForm(f=>({...f,primaryPos:e.target.value}))} style={iS()}>
                    {POSITIONS.map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                {/* Secondary position */}
                <div>
                  <label style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:.5,display:"block",marginBottom:4}}>SECONDARY POS</label>
                  <select value={cForm.secondaryPos} onChange={e=>setCForm(f=>({...f,secondaryPos:e.target.value}))} style={iS()}>
                    <option value="">None</option>
                    {POSITIONS.filter(p=>p!==cForm.primaryPos).map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                {/* Grade or Club */}
                {tryout.teamType==="highschool"?(
                  <div>
                    <label style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:.5,display:"block",marginBottom:4}}>GRADE</label>
                    <select value={cForm.grade} onChange={e=>setCForm(f=>({...f,grade:e.target.value}))} style={iS()}>
                      <option value="9">Grade 9</option><option value="10">Grade 10</option>
                      <option value="11">Grade 11</option><option value="12">Grade 12</option>
                    </select>
                  </div>
                ):(
                  <div>
                    <label style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:.5,display:"block",marginBottom:4}}>CLUB/TEAM</label>
                    <input value={cForm.club} onChange={e=>setCForm(f=>({...f,club:e.target.value}))} placeholder="e.g. FC United" style={iS()}/>
                  </div>
                )}
              </div>
              <div style={{marginBottom:12}}>
                <input value={cForm.notes} onChange={e=>setCForm(f=>({...f,notes:e.target.value}))}
                  placeholder="Initial notes (optional)" style={iS()}/>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={addCandidate} disabled={!cForm.name.trim()}
                  style={{padding:"9px 20px",background:cForm.name.trim()?C.accent:"#2a1000",border:"none",borderRadius:9,
                    color:cForm.name.trim()?"#000":C.muted,fontWeight:800,fontSize:14,cursor:"pointer"}}>Add</button>
                <button onClick={()=>setAddingCand(false)}
                  style={{padding:"9px 16px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,color:C.muted,cursor:"pointer",fontSize:13}}>Cancel</button>
              </div>
            </div>
          )}

          <div className="resp-grid-sidebar" style={{display:"grid",gridTemplateColumns:"320px 1fr",gap:16}}>
            {/* Ranked list */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,maxHeight:"calc(100vh - 280px)",overflowY:"auto"}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:14}}>
                CANDIDATES ({tryout.candidates.length})
              </div>
              {sorted.length===0
                ?<div style={{color:C.muted,fontSize:13,fontStyle:"italic"}}>No candidates yet</div>
                :sorted.map((c,rank)=>{
                    const avg=avgScore(c.scores);
                    const sc=STATUS_OPTS.find(s=>s.k===c.status);
                    const isSel=selCand===c.id;
                    const pc=posColor(c.primaryPos||c.positions?.[0]||"CM");
                    const positions=c.positions||[c.primaryPos||"CM"];
                    return(
                      <div key={c.id} onClick={()=>setSelCand(isSel?null:c.id)}
                        style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",
                          borderRadius:10,marginBottom:5,cursor:"pointer",transition:"all .12s",
                          background:isSel?C.accent+"18":C.surface,border:`1px solid ${isSel?C.accent:C.border}`}}>
                        <div style={{width:20,color:C.muted,fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:13,textAlign:"center",flexShrink:0}}>{rank+1}</div>
                        <div style={{width:26,height:26,borderRadius:6,flexShrink:0,background:pc+"22",
                          border:`1.5px solid ${pc}44`,display:"flex",alignItems:"center",justifyContent:"center",
                          fontFamily:"'Oswald',sans-serif",fontWeight:700,color:pc,fontSize:11}}>
                          {positions[0]}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{color:C.text,fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</div>
                          <div style={{color:C.muted,fontSize:10}}>
                            {positions.length>1&&<span style={{marginRight:4}}>{positions.join(" / ")}</span>}
                            {tryout.teamType==="highschool"?(c.grade?`Gr.${c.grade}`:""):(c.club||"")}
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
              <div style={{display:"flex",flexDirection:"column",gap:12,maxHeight:"calc(100vh - 280px)",overflowY:"auto"}}>
                {/* Candidate header */}
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,display:"flex",alignItems:"center",gap:14}}>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    {(selCandObj.positions||[selCandObj.primaryPos||"CM"]).map((pos,i)=>(
                      <div key={pos} style={{width:i===0?52:36,height:i===0?52:36,borderRadius:i===0?12:8,
                        background:posColor(pos)+"22",border:`2px solid ${posColor(pos)}44`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontFamily:"'Oswald',sans-serif",fontWeight:800,color:posColor(pos),fontSize:i===0?18:13,
                        opacity:i===0?1:.7}}>
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
                  <button onClick={()=>deleteCandidate(selCandObj.id)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:4}}><Trash2 size={15}/></button>
                </div>

                {/* Status */}
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                  <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>STATUS</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {STATUS_OPTS.map(opt=>(
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

                {/* Score sliders */}
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
                                color:n<=val?cat.color:C.muted,cursor:"pointer",fontWeight:700,fontSize:11,transition:"all .08s"}}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Custom stats */}
                {customStats.length>0&&(
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                    <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>MEASURABLES</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
                      {customStats.map(stat=>(
                        <div key={stat.id}>
                          <label style={{color:C.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:4}}>
                            {stat.label}{stat.unit&&<span style={{color:C.muted,fontWeight:400}}> ({stat.unit})</span>}
                          </label>
                          <input type="number" step="any"
                            value={selCandObj.customStats?.[stat.id]||""}
                            onChange={e=>updateCustomStat(selCandObj.id,stat.id,e.target.value)}
                            placeholder="—"
                            style={iS({textAlign:"center",fontWeight:700,fontSize:15})}/>
                        </div>
                      ))}
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
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10}}>
                <ClipboardCheck size={40} style={{color:C.muted,opacity:.3}}/>
                <div style={{color:C.muted,fontSize:14}}>Select a candidate to evaluate</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── LINEUP BUILDER TAB ──────────────────────────────────────────── */}
      {activeTab==="lineups"&&(
        <div>
          {/* Picker modal */}
          {pickingSlot&&(
            <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:22,width:"100%",maxWidth:380,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
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
                  {sorted.map(c=>{
                    const pc=posColor(c.primaryPos||c.positions?.[0]||"CM");
                    const positions=c.positions||[c.primaryPos||"CM"];
                    return(
                      <div key={c.id} onClick={()=>assignLineupSlot(lineupTeam,pickingSlot.zone,pickingSlot.idx,c.id)}
                        style={{padding:"9px 12px",borderRadius:8,marginBottom:5,cursor:"pointer",
                          background:"#1a0800",border:`1px solid ${pc}33`,display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:28,height:28,borderRadius:7,background:pc+"22",border:`1.5px solid ${pc}44`,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontFamily:"'Oswald',sans-serif",fontWeight:700,color:pc,fontSize:12,flexShrink:0}}>
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

          {/* Team tabs */}
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

          <div className="resp-grid-sidebar" style={{display:"grid",gridTemplateColumns:"320px 1fr",gap:16}}>
            {/* Formation + slots */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:20}}>
              {/* Formation picker */}
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

              {/* Zone slots */}
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
                            display:"flex",flexDirection:"column",alignItems:"center",gap:4,transition:"all .12s"}}
                          onMouseEnter={e=>e.currentTarget.style.borderColor=zone.color}
                          onMouseLeave={e=>e.currentTarget.style.borderColor=cand?zone.color+"66":C.border}>
                          {cand?<>
                            <div style={{width:34,height:34,borderRadius:8,background:pc+"22",border:`2px solid ${pc}44`,
                              display:"flex",alignItems:"center",justifyContent:"center",
                              fontFamily:"'Oswald',sans-serif",fontWeight:900,color:pc,fontSize:15}}>
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

            {/* Unassigned candidates pool */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>CANDIDATE POOL</div>
              <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:500,overflowY:"auto"}}>
                {sorted.map(c=>{
                  const positions=c.positions||[c.primaryPos||"CM"];
                  const pc=posColor(positions[0]);
                  const inLineup=Object.values(curLineup.slots).flat().includes(c.id);
                  return(
                    <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",
                      background:inLineup?C.accent+"11":C.surface,
                      border:`1px solid ${inLineup?C.accent+"44":C.border}`,
                      borderRadius:8,opacity:inLineup?.7:1}}>
                      <div style={{width:24,height:24,borderRadius:6,flexShrink:0,background:pc+"22",
                        border:`1.5px solid ${pc}44`,display:"flex",alignItems:"center",justifyContent:"center",
                        fontFamily:"'Oswald',sans-serif",fontWeight:700,color:pc,fontSize:10}}>
                        {positions[0]}
                      </div>
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
          <div style={{color:C.muted,fontSize:13,marginBottom:18}}>
            Define measurable stats for this tryout. These appear on every candidate's scoring panel.
          </div>

          {/* Add stat form */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,marginBottom:18}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>ADD MEASURABLE</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:10,alignItems:"flex-end"}}>
              <div>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:5}}>STAT NAME</label>
                <input value={newStatLabel} onChange={e=>setNewStatLabel(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addCustomStat()}
                  placeholder="e.g. Mile Time, 40m Sprint" style={iS()}/>
              </div>
              <div>
                <label style={{color:C.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:5}}>UNIT</label>
                <input value={newStatUnit} onChange={e=>setNewStatUnit(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addCustomStat()}
                  placeholder="e.g. min, sec, inches" style={iS()}/>
              </div>
              <button onClick={addCustomStat} disabled={!newStatLabel.trim()}
                style={{padding:"9px 18px",background:newStatLabel.trim()?C.accent:"#2a1000",border:"none",borderRadius:8,
                  color:newStatLabel.trim()?"#000":C.muted,fontWeight:800,fontSize:14,cursor:"pointer",whiteSpace:"nowrap"}}>
                + Add
              </button>
            </div>
          </div>

          {/* Stat list */}
          {customStats.length===0
            ?<div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"32px 24px",textAlign:"center"}}>
                <div style={{color:C.muted,fontSize:13,fontStyle:"italic"}}>No custom stats defined yet</div>
                <div style={{color:C.muted,fontSize:12,marginTop:6}}>Add stats like Mile Time, Vertical Jump, 40m Sprint above</div>
              </div>
            :<div style={{display:"flex",flexDirection:"column",gap:8}}>
                {customStats.map(stat=>(
                  <div key={stat.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                    padding:"14px 18px",display:"flex",alignItems:"center",gap:14}}>
                    <div style={{flex:1}}>
                      <div style={{color:C.text,fontWeight:700,fontSize:14}}>{stat.label}</div>
                      {stat.unit&&<div style={{color:C.muted,fontSize:12,marginTop:2}}>Unit: {stat.unit}</div>}
                    </div>
                    {/* Show top scores */}
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      {[...tryout.candidates]
                        .filter(c=>c.customStats?.[stat.id]!==undefined&&c.customStats[stat.id]!=="")
                        .sort((a,b)=>parseFloat(a.customStats[stat.id])-parseFloat(b.customStats[stat.id]))
                        .slice(0,3)
                        .map((c,i)=>(
                          <div key={c.id} style={{textAlign:"center"}}>
                            <div style={{color:i===0?C.accent:C.text,fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:15}}>{c.customStats[stat.id]}</div>
                            <div style={{color:C.muted,fontSize:10}}>{c.name.split(" ")[0]}</div>
                          </div>
                        ))
                      }
                    </div>
                    <button onClick={()=>removeCustomStat(stat.id)}
                      style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:4}}>
                      <X size={14}/>
                    </button>
                  </div>
                ))}
              </div>
          }
        </div>
      )}
    </div>
  );
}

// ─── ONBOARDING WIZARD ────────────────────────────────────────────────────────
function OnboardingWizard({teamName, onComplete}){
  const [step, setStep]   = useState(1);
  const [name, setName]   = useState(teamName==="My Team"?"":teamName||"");
  const [player, setPlayer] = useState({name:"",number:"",primaryPos:"CM"});

  const POSITIONS = ["GK","CB","FB","DM","CM","W","ST"];

  const iS = {width:"100%",padding:"12px 16px",background:"#181818",border:"1px solid #3a1a00",
    borderRadius:10,color:C.text,fontSize:15,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"};

  function finish(skipPlayer=false){
    onComplete(name.trim()||teamName, skipPlayer?null:{
      id:`p${Date.now()}`,name:player.name.trim(),
      number:parseInt(player.number)||1,
      position:[player.primaryPos],captain:false,email:""
    });
  }

  return(
    <div style={{position:"fixed",inset:0,background:"#000000ee",zIndex:1000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20,
      fontFamily:"'Outfit',sans-serif"}}>
      <div style={{background:"#141414",border:"1px solid #3a1a00",borderRadius:20,
        padding:40,width:"100%",maxWidth:480,boxShadow:"0 32px 80px #00000099"}}>

        {/* Progress dots */}
        <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:32}}>
          {[1,2,3].map(n=>(
            <div key={n} style={{width:n===step?24:8,height:8,borderRadius:99,
              background:n<=step?"#ff6b00":"#2a1000",transition:"all .3s"}}/>
          ))}
        </div>

        {/* Step 1 — Team name */}
        {step===1&&(
          <div>
            <div style={{textAlign:"center",marginBottom:28}}>
              <AppLogo size={52} glow={true}/>
              <h2 style={{color:"#ffffff",fontFamily:"'Oswald',sans-serif",fontSize:26,fontWeight:900,marginTop:14}}>
                Welcome to CoachIQ
              </h2>
              <p style={{color:"#ffffff66",fontSize:14,marginTop:8,lineHeight:1.6}}>
                Let's get you set up in 2 quick steps.
              </p>
            </div>
            <label style={{color:"#7a4a2a",fontSize:11,fontWeight:700,letterSpacing:1,display:"block",marginBottom:8}}>WHAT'S YOUR TEAM CALLED?</label>
            <input value={name} onChange={e=>setName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&name.trim()&&setStep(2)}
              placeholder="e.g. Marion FC, Lincoln High Varsity..."
              autoFocus style={iS}/>
            <button onClick={()=>setStep(2)} disabled={!name.trim()}
              style={{width:"100%",marginTop:16,padding:"13px",
                background:name.trim()?"#ff6b00":"#2a1000",border:"none",borderRadius:10,
                color:name.trim()?"#000":"#4a2a10",fontWeight:900,fontSize:16,cursor:name.trim()?"pointer":"default",
                fontFamily:"'Oswald',sans-serif",letterSpacing:1}}>
              NEXT →
            </button>
          </div>
        )}

        {/* Step 2 — First player */}
        {step===2&&(
          <div>
            <h2 style={{color:"#ffffff",fontFamily:"'Oswald',sans-serif",fontSize:24,fontWeight:900,marginBottom:8}}>
              Add your first player
            </h2>
            <p style={{color:"#ffffff66",fontSize:14,marginBottom:24,lineHeight:1.6}}>
              You can add the whole squad later from the Roster tab. Just one to get started.
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <label style={{color:"#7a4a2a",fontSize:11,fontWeight:700,letterSpacing:1,display:"block",marginBottom:6}}>PLAYER NAME</label>
                <input value={player.name} onChange={e=>setPlayer(p=>({...p,name:e.target.value}))}
                  placeholder="e.g. James Mitchell" style={iS}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label style={{color:"#7a4a2a",fontSize:11,fontWeight:700,letterSpacing:1,display:"block",marginBottom:6}}>JERSEY #</label>
                  <input type="number" min="1" max="99" value={player.number}
                    onChange={e=>setPlayer(p=>({...p,number:e.target.value}))}
                    placeholder="1–99" style={iS}/>
                </div>
                <div>
                  <label style={{color:"#7a4a2a",fontSize:11,fontWeight:700,letterSpacing:1,display:"block",marginBottom:6}}>POSITION</label>
                  <select value={player.primaryPos} onChange={e=>setPlayer(p=>({...p,primaryPos:e.target.value}))}
                    style={{...iS,background:"#181818"}}>
                    {POSITIONS.map(pos=><option key={pos}>{pos}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <button onClick={()=>finish(false)} disabled={!player.name.trim()||!player.number}
              style={{width:"100%",marginTop:16,padding:"13px",
                background:player.name.trim()&&player.number?"#ff6b00":"#2a1000",border:"none",borderRadius:10,
                color:player.name.trim()&&player.number?"#000":"#4a2a10",
                fontWeight:900,fontSize:16,cursor:player.name.trim()&&player.number?"pointer":"default",
                fontFamily:"'Oswald',sans-serif",letterSpacing:1}}>
              ADD PLAYER →
            </button>
            <button onClick={()=>finish(true)}
              style={{width:"100%",marginTop:8,padding:"11px",background:"transparent",border:"none",
                color:"#ff6b0077",cursor:"pointer",fontSize:13,fontWeight:600}}>
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── OPPONENTS VIEW ───────────────────────────────────────────────────────────

// ─── OPPONENT SQUAD GRID ──────────────────────────────────────────────────────
function OppSquadGrid({positions, oppPlayers, update, updateOppPlayer, getOppPlayer, THREAT_OPTS}){
  const extras = oppPlayers["extra"] || [];

  function removeExtra(idx){
    const updated = extras.filter((_,i)=>i!==idx);
    update("oppPlayers", {...oppPlayers, extra: updated});
  }
  function addExtra(){
    const updated = [...extras, {number:"",name:"",notes:"",threat:"",customPos:""}];
    update("oppPlayers", {...oppPlayers, extra: updated});
  }

  const formationSlots = positions.map((pos,idx)=>({pos, idx, isExtra:false}));
  const extraSlots     = extras.map((_,idx)=>({pos:"extra", idx, isExtra:true}));
  const allSlots       = [...formationSlots, ...extraSlots];

  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
      {allSlots.map(({pos,idx,isExtra})=>{
        const p      = getOppPlayer(pos, idx);
        const threat = THREAT_OPTS.find(t=>t.k===p.threat) || THREAT_OPTS[0];
        return(
          <div key={pos+"-"+idx} style={{background:C.card,
            border:"1.5px solid "+(p.threat ? threat.col+"44" : C.border),
            borderRadius:12,padding:14,transition:"border-color .2s",position:"relative"}}>
            {isExtra&&(
              <button onClick={()=>removeExtra(idx)}
                style={{position:"absolute",top:8,right:8,background:"none",border:"none",
                  color:C.muted,cursor:"pointer",fontSize:14,lineHeight:1}}>✕</button>
            )}
            <div style={{display:"flex",gap:10,marginBottom:10,alignItems:"center"}}>
              {isExtra ? (
                <input value={p.customPos||""}
                  onChange={e=>updateOppPlayer(pos,idx,"customPos",e.target.value)}
                  placeholder="POS" maxLength={4}
                  style={{width:44,height:36,padding:"2px 4px",background:C.surface,
                    border:"1.5px solid "+C.border,borderRadius:8,
                    color:C.accent,fontSize:12,outline:"none",
                    fontFamily:"'Oswald',sans-serif",fontWeight:800,textAlign:"center"}}/>
              ) : (
                <div style={{width:36,height:36,borderRadius:8,flexShrink:0,
                  background:posColor(pos)+"22",border:"1.5px solid "+posColor(pos)+"55",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontFamily:"'Oswald',sans-serif",fontWeight:800,color:posColor(pos),fontSize:13}}>
                  {pos}
                </div>
              )}
              <input value={p.number}
                onChange={e=>updateOppPlayer(pos,idx,"number",e.target.value)}
                placeholder="#" maxLength={3}
                style={{width:40,padding:"5px 6px",background:C.bg,border:"1px solid "+C.border,
                  borderRadius:6,color:C.text,fontSize:13,outline:"none",
                  fontFamily:"'Oswald',sans-serif",fontWeight:700,textAlign:"center"}}/>
              <input value={p.name}
                onChange={e=>updateOppPlayer(pos,idx,"name",e.target.value)}
                placeholder="Player name"
                style={{flex:1,padding:"5px 8px",background:C.bg,border:"1px solid "+C.border,
                  borderRadius:6,color:C.text,fontSize:13,outline:"none",
                  fontFamily:"'Outfit',sans-serif"}}/>
            </div>
            <div style={{display:"flex",gap:5,marginBottom:8}}>
              {THREAT_OPTS.map(t=>(
                <button key={t.k} onClick={()=>updateOppPlayer(pos,idx,"threat",t.k)}
                  style={{flex:1,padding:"4px 0",fontSize:10,fontWeight:700,cursor:"pointer",
                    border:"1px solid "+(p.threat===t.k ? t.col : C.border),borderRadius:5,
                    background:p.threat===t.k ? t.col+"22" : "transparent",
                    color:p.threat===t.k ? t.col : C.muted}}>
                  {t.label}
                </button>
              ))}
            </div>
            <textarea value={p.notes}
              onChange={e=>updateOppPlayer(pos,idx,"notes",e.target.value)}
              rows={2} placeholder="Notes on this player..."
              style={{width:"100%",padding:"6px 8px",background:C.bg,
                border:"1px solid "+C.border,borderRadius:6,color:C.text,
                fontSize:12,outline:"none",fontFamily:"'Outfit',sans-serif",
                boxSizing:"border-box",resize:"none"}}/>
          </div>
        );
      })}

      {/* Add player */}
      <div onClick={addExtra}
        style={{background:"transparent",border:"2px dashed "+C.border,borderRadius:12,
          padding:14,cursor:"pointer",display:"flex",flexDirection:"column",
          alignItems:"center",justifyContent:"center",gap:8,minHeight:120,
          transition:"border-color .2s"}}
        onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
        onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
        <div style={{width:36,height:36,borderRadius:8,background:C.accent+"22",
          display:"flex",alignItems:"center",justifyContent:"center",
          color:C.accent,fontSize:22}}>+</div>
        <div style={{color:C.muted,fontSize:12,fontWeight:600}}>Add Player</div>
      </div>
    </div>
  );
}

function OpponentsView({opponents, setOpponents, games, gamePlans, isPro, onUpgrade, pendingOpp, onClearPendingOpp}){
  if(!isPro) return <ProGate isPro={isPro} onUpgrade={onUpgrade} feature="Opponent intelligence database">{null}</ProGate>;
  const [sel,    setSel]    = useState(null);
  const [adding, setAdding] = useState(false);
  const [newName,setNewName]= useState("");
  const [oppTab, setOppTab] = useState("overview");

  // Auto-select opponent navigated from Games tab
  useEffect(()=>{
    if(!pendingOpp) return;
    const opp = opponents.find(o=>o.name===pendingOpp);
    if(opp){ setSel(opp.id); }
    onClearPendingOpp&&onClearPendingOpp();
  },[pendingOpp]); // overview | squad | setpieces | response

  // Auto-build opponent list from games
  const allOpponentNames = useMemo(()=>{
    const names = new Set(games.map(g=>g.opponent).filter(Boolean));
    opponents.forEach(o=>names.add(o.name));
    return [...names].sort();
  },[games,opponents]);

  function getOrCreate(name){
    const existing = opponents.find(o=>o.name===name);
    if(existing) return existing;
    return {
      id:`opp${Date.now()}`,name,
      formation:"",keyPlayers:"",scoutNotes:"",setPieceNotes:"",
      // New fields
      oppPlayers:{},          // {position: [{number,name,notes,threat}]}
      tendencies:{pressing:"",buildUp:"",attackShape:"",defShape:"",weaknesses:""},
      setPieces:{
        cornersAtk:"",cornersDef:"",
        freeKicksAtk:"",freeKicksDef:"",
        throwInsAtk:"",throwInsDef:"",
      },
      counterPlan:{howWeAttack:"",howWeDefend:"",keyMatchups:"",focusPoints:""},
      createdAt:new Date().toISOString()
    };
  }

  function saveOpponent(opp){
    setOpponents(prev=>{
      const exists = prev.find(o=>o.id===opp.id);
      if(exists) return prev.map(o=>o.id===opp.id?opp:o);
      return [...prev,opp];
    });
  }

  function h2h(name){
    const gs = games.filter(g=>g.opponent===name&&g.status==="completed");
    const w=gs.filter(g=>g.ourScore>g.theirScore).length;
    const d=gs.filter(g=>g.ourScore===g.theirScore).length;
    const l=gs.filter(g=>g.ourScore<g.theirScore).length;
    return {played:gs.length,w,d,l,games:gs};
  }

  function addManual(){
    if(!newName.trim()) return;
    const opp = getOrCreate(newName.trim());
    saveOpponent(opp);
    setSel(opp.id||`opp${Date.now()}`);
    setAdding(false); setNewName("");
  }

  // Detail view
  if(sel){
    const opp = opponents.find(o=>o.id===sel) || getOrCreate(sel);
    const {played,w,d,l,games:oppGames} = h2h(opp.name);
    const plans = gamePlans.filter(p=>p.opponent===opp.name);

    function update(key,val){
      const updated = {...opp,[key]:val};
      saveOpponent(updated);
    }


    // Formation positions map
    const FORMATION_POSITIONS = {
      "4-3-3":  ["GK","RB","CB","CB","LB","CM","CM","CM","RW","ST","LW"],
      "4-4-2":  ["GK","RB","CB","CB","LB","RM","CM","CM","LM","ST","ST"],
      "4-2-3-1":["GK","RB","CB","CB","LB","DM","DM","RAM","CAM","LAM","ST"],
      "3-5-2":  ["GK","CB","CB","CB","RWB","CM","CM","CM","LWB","ST","ST"],
      "5-3-2":  ["GK","RB","CB","CB","CB","LB","CM","CM","CM","ST","ST"],
      "4-1-4-1":["GK","RB","CB","CB","LB","DM","RM","CM","CM","LM","ST"],
      "4-3-2-1":["GK","RB","CB","CB","LB","CM","CM","CM","SS","SS","ST"],
    };
    const positions = FORMATION_POSITIONS[opp.formation] || [];
    const oppPlayers = opp.oppPlayers || {};
    const tendencies = opp.tendencies || {};
    const setPieces  = opp.setPieces  || {};
    const counterPlan= opp.counterPlan|| {};
    const THREAT_OPTS = [{k:"",label:"—",col:C.muted},{k:"watch",label:"Watch",col:C.warning},{k:"danger",label:"Danger",col:"#ff5500"},{k:"key",label:"Key",col:C.danger}];

    function updateOppPlayer(pos, idx, field, val){
      const current = [...(oppPlayers[pos]||[])];
      while(current.length <= idx) current.push({number:"",name:"",notes:"",threat:""});
      current[idx] = {...current[idx],[field]:val};
      update("oppPlayers",{...oppPlayers,[pos]:current});
    }
    function getOppPlayer(pos,idx){
      return (oppPlayers[pos]||[])[idx]||{number:"",name:"",notes:"",threat:""};
    }

    const iS = (extra={})=>({width:"100%",padding:"9px 12px",background:C.bg,border:`1px solid ${C.border}`,
      borderRadius:8,color:C.text,fontSize:13,outline:"none",fontFamily:"'Outfit',sans-serif",
      boxSizing:"border-box",...extra});
    const TA = (rows=3,extra={})=>({...iS({resize:"vertical",...extra}),padding:"9px 12px"});

    return(
      <div style={{padding:20,maxWidth:960,margin:"0 auto"}}>
        {/* Header */}
        {/* Async handlers extracted to avoid Babel async-in-JSX-prop error */}
        {(function(){
          window._gpShareFn = shareGamePlan;
          window._gpViewFn  = viewGamePlan;
          return null;
        })()}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <button onClick={()=>setSel(null)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",color:C.text,cursor:"pointer",fontSize:13}}>← Back</button>
          <div style={{flex:1}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1}}>OPPONENT PROFILE</div>
            <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:26,fontWeight:900}}>{opp.name}</h2>
          </div>
          {played>0&&(
            <div style={{display:"flex",gap:14}}>
              {[["W",w,C.accent],["D",d,C.warning],["L",l,C.danger]].map(([lbl,val,col])=>(
                <div key={lbl} style={{textAlign:"center"}}>
                  <div style={{color:col,fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:24,lineHeight:1}}>{val}</div>
                  <div style={{color:C.muted,fontSize:10,fontWeight:700}}>{lbl}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div style={{display:"flex",gap:4,marginBottom:20,background:C.surface,borderRadius:10,padding:4,border:`1px solid ${C.border}`}}>
          {[
            {key:"overview",  label:"Overview"},
            {key:"squad",     label:"Their Squad", badge:positions.length>0?positions.length:null},
            {key:"setpieces", label:"Set Pieces"},
            {key:"response",  label:"Our Response"},
          ].map(tab=>(
            <button key={tab.key} onClick={()=>setOppTab(tab.key)}
              style={{flex:1,padding:"9px 8px",borderRadius:7,border:"none",cursor:"pointer",
                fontWeight:700,fontSize:12,fontFamily:"'Outfit',sans-serif",
                background:oppTab===tab.key?C.accent+"22":"transparent",
                color:oppTab===tab.key?C.accent:C.muted,
                transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
              {tab.label}
              {tab.badge&&<span style={{fontSize:10,background:C.accent+"33",color:C.accent,padding:"1px 5px",borderRadius:4}}>{tab.badge}</span>}
            </button>
          ))}
        </div>

        {/* ══ OVERVIEW TAB ══════════════════════════════════════════════ */}
        {oppTab==="overview"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {/* Scouting */}
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:14}}>SCOUTING</div>
                <div style={{marginBottom:12}}>
                  <label style={{color:C.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:5}}>TYPICAL FORMATION</label>
                  <select value={opp.formation||""} onChange={e=>update("formation",e.target.value)} style={iS()}>
                    <option value="">Unknown</option>
                    {["4-3-3","4-4-2","4-2-3-1","3-5-2","5-3-2","4-1-4-1","4-3-2-1"].map(f=><option key={f}>{f}</option>)}
                  </select>
                </div>
                {/* Tactical tendencies */}
                {[
                  ["pressing","Pressing Style","e.g. High press from front, triggered by GK"],
                  ["buildUp","Build-up Play","e.g. Short passing out from back, direct long ball"],
                  ["attackShape","Attacking Shape","e.g. Wide and direct, overloads right flank"],
                  ["defShape","Defensive Shape","e.g. Low block 4-4-2, man-mark in midfield"],
                  ["weaknesses","Known Weaknesses","e.g. Slow LB, struggles with high balls in box"],
                ].map(([key,label,ph])=>(
                  <div key={key} style={{marginBottom:10}}>
                    <label style={{color:C.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:4}}>{label.toUpperCase()}</label>
                    <textarea value={tendencies[key]||""} onChange={e=>update("tendencies",{...tendencies,[key]:e.target.value})}
                      rows={2} placeholder={ph} style={iS({resize:"vertical"})}/>
                  </div>
                ))}
                <div style={{marginTop:4}}>
                  <label style={{color:C.muted,fontSize:11,fontWeight:600,display:"block",marginBottom:4}}>GENERAL SCOUT NOTES</label>
                  <textarea value={opp.scoutNotes||""} onChange={e=>update("scoutNotes",e.target.value)} rows={3}
                    placeholder="Playing style, pressing triggers, anything else..." style={iS({resize:"vertical"})}/>
                </div>
              </div>
              {/* Linked game plans */}
              {plans.length>0&&(
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                  <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:12}}>LINKED GAME PLANS</div>
                  {plans.map(p=>(
                    <div key={p.id} style={{padding:"8px 10px",background:C.surface,borderRadius:8,marginBottom:6,
                      display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{color:C.text,fontWeight:600,fontSize:13}}>{p.date} · {p.formation}</div>
                        <div style={{color:C.muted,fontSize:11}}>{p.location}</div>
                      </div>
                      <div style={{fontSize:11,color:C.accent,fontWeight:700}}>{p.location}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Match history */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:14}}>
                MATCH HISTORY {played>0&&`(${played} games)`}
              </div>
              {oppGames.length===0
                ?<div style={{color:C.muted,fontSize:13,fontStyle:"italic"}}>No games recorded yet</div>
                :oppGames.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(g=>{
                  const r=g.ourScore>g.theirScore?"W":g.ourScore<g.theirScore?"L":"D";
                  const rc=r==="W"?C.accent:r==="L"?C.danger:C.warning;
                  // Find top scorer for this game
                  const scorer = (g.stats||[]).filter(s=>s.goals>0)
                    .sort((a,b)=>b.goals-a.goals)[0];
                  const scorerName = scorer
                    ? (()=>{ const p=roster.find(r=>r.id===scorer.playerId); return p?p.name.split(" ").pop()+" ("+scorer.goals+")":null; })()
                    : null;
                  const squadAvg = (g.stats||[]).length
                    ? (g.stats.reduce((a,s)=>a+(s.rating||0),0)/g.stats.length).toFixed(1)
                    : null;
                  return(
                    <div key={g.id} style={{marginBottom:8,padding:"10px 12px",background:C.surface,borderRadius:9,
                      border:`1px solid ${C.border}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:scorerName||squadAvg?6:0}}>
                        <div style={{width:28,height:28,borderRadius:7,background:rc+"22",
                          border:`1.5px solid ${rc}44`,display:"flex",alignItems:"center",justifyContent:"center",
                          fontFamily:"'Oswald',sans-serif",fontWeight:900,color:rc,fontSize:13,flexShrink:0}}>{r}</div>
                        <div style={{flex:1}}>
                          <div style={{color:C.text,fontSize:13,fontWeight:600}}>{g.date} · {g.location}</div>
                          {g.formation&&<div style={{color:C.muted,fontSize:11}}>Formation: {g.formation}</div>}
                        </div>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                          <div style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:18}}>
                            {g.ourScore}–{g.theirScore}
                          </div>
                          <button onClick={()=>window.open(window.location.origin+window.location.pathname+"#/report/"+g.id,"_blank")}
                            style={{background:"none",border:"none",color:C.accent,cursor:"pointer",
                              fontSize:11,fontWeight:700,padding:0}}>
                            Report →
                          </button>
                        </div>
                      </div>
                      {(scorerName||squadAvg)&&(
                        <div style={{display:"flex",gap:12,paddingTop:6,borderTop:`1px solid ${C.border}`}}>
                          {scorerName&&<span style={{color:C.muted,fontSize:11}}>⚽ {scorerName}</span>}
                          {squadAvg&&<span style={{color:C.muted,fontSize:11}}>Avg rating: <span style={{color:rColor(parseFloat(squadAvg)),fontWeight:700}}>{squadAvg}</span></span>}
                        </div>
                      )}
                    </div>
                  );
                })
              }
            </div>
          </div>
        )}

        {/* ══ THEIR SQUAD TAB ════════════════════════════════════════════ */}
        {oppTab==="squad"&&(
          <div>
            {positions.length===0?(
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:32,textAlign:"center"}}>
                <div style={{color:C.muted,fontSize:14,marginBottom:12}}>Set their formation in the Overview tab first</div>
                <button onClick={()=>setOppTab("overview")}
                  style={{padding:"9px 20px",background:C.accent,border:"none",borderRadius:8,
                    color:"#000",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                  Go to Overview →
                </button>
              </div>
            ):(
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,
                  padding:"10px 16px",background:C.card,border:`1px solid ${C.border}`,borderRadius:10}}>
                  <div style={{color:C.muted,fontSize:12,fontWeight:600}}>Formation:</div>
                  <div style={{color:C.accent,fontFamily:"'Oswald',sans-serif",fontSize:18,fontWeight:800}}>{opp.formation}</div>
                  <div style={{color:C.muted,fontSize:12,marginLeft:"auto"}}>{positions.length} positions</div>
                </div>
                <OppSquadGrid
                positions={positions}
                oppPlayers={oppPlayers}
                update={update}
                updateOppPlayer={updateOppPlayer}
                getOppPlayer={getOppPlayer}
                THREAT_OPTS={THREAT_OPTS}
              />
              </div>
            )}
          </div>
        )}

        {/* ══ SET PIECES TAB ═════════════════════════════════════════════ */}
        {oppTab==="setpieces"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
            {[
              {key:"corners",   label:"Corners",    icon:"⌒"},
              {key:"freeKicks", label:"Free Kicks",  icon:"🎯"},
              {key:"throwIns",  label:"Throw-ins",   icon:"↗"},
            ].map(({key,label,icon})=>(
              <div key={key} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                  <span style={{fontSize:18}}>{icon}</span>
                  <div style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:16,fontWeight:800}}>{label}</div>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{color:C.accent,fontSize:10,fontWeight:700,letterSpacing:1,display:"block",marginBottom:5}}>
                    ATTACKING
                  </label>
                  <textarea value={setPieces[`${key}Atk`]||""} rows={3}
                    onChange={e=>update("setPieces",{...setPieces,[`${key}Atk`]:e.target.value})}
                    placeholder={`How they attack ${label.toLowerCase()}...`}
                    style={iS({resize:"vertical"})}/>
                </div>
                <div>
                  <label style={{color:C.warning,fontSize:10,fontWeight:700,letterSpacing:1,display:"block",marginBottom:5}}>
                    HOW WE DEFEND IT
                  </label>
                  <textarea value={setPieces[`${key}Def`]||""} rows={3}
                    onChange={e=>update("setPieces",{...setPieces,[`${key}Def`]:e.target.value})}
                    placeholder={`Our defensive plan for their ${label.toLowerCase()}...`}
                    style={iS({resize:"vertical"})}/>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ OUR RESPONSE TAB ═══════════════════════════════════════════ */}
        {oppTab==="response"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
              <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:14}}>HOW WE ATTACK THEM</div>
              <textarea value={counterPlan.howWeAttack||""}
                onChange={e=>update("counterPlan",{...counterPlan,howWeAttack:e.target.value})}
                rows={5} placeholder="Exploit their weak left back, use width, play in behind their high line..."
                style={iS({resize:"vertical"})}/>
            </div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
              <div style={{color:C.warning,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:14}}>HOW WE DEFEND THEM</div>
              <textarea value={counterPlan.howWeDefend||""}
                onChange={e=>update("counterPlan",{...counterPlan,howWeDefend:e.target.value})}
                rows={5} placeholder="Deny space in behind, double up on their #9, track their #10 from front..."
                style={iS({resize:"vertical"})}/>
            </div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:14}}>KEY MATCHUPS</div>
              <textarea value={counterPlan.keyMatchups||""}
                onChange={e=>update("counterPlan",{...counterPlan,keyMatchups:e.target.value})}
                rows={4} placeholder="Our #10 vs their #6 in midfield battle. Winger to track their RB overlaps..."
                style={iS({resize:"vertical"})}/>
            </div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:14}}>FOCUS POINTS FOR TEAM</div>
              <textarea value={counterPlan.focusPoints||""}
                onChange={e=>update("counterPlan",{...counterPlan,focusPoints:e.target.value})}
                rows={4} placeholder="3-5 key points to communicate to the team in the pre-match talk..."
                style={iS({resize:"vertical"})}/>
            </div>
            {/* Auto-fill game plan button */}
            {plans.length>0&&(
              <div style={{gridColumn:"1/-1",background:C.accent+"11",border:`1px solid ${C.accent}33`,borderRadius:12,padding:16,
                display:"flex",alignItems:"center",gap:12}}>
                <div style={{flex:1}}>
                  <div style={{color:C.accent,fontWeight:700,fontSize:13}}>Push to Game Plans</div>
                  <div style={{color:C.muted,fontSize:12,marginTop:2}}>Copies focus points and matchup notes into the instructions of all linked game plans against {opp.name}</div>
                </div>
                <button onClick={()=>{
                  if(!window.confirm("Copy response notes into all linked game plans?")) return;
                  // This would need setGamePlans — for now show confirmation
                  alert("Notes pushed! Open the game plan to see them in Match Instructions.");
                }}
                  style={{padding:"9px 18px",background:C.accent,border:"none",borderRadius:8,
                    color:"#000",fontWeight:700,fontSize:13,cursor:"pointer",flexShrink:0,fontFamily:"'Oswald',sans-serif"}}>
                  Push Notes →
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    );
  }

  return(
    <div style={{padding:20,maxWidth:900,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2}}>INTELLIGENCE</div>
          <h1 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:28,fontWeight:800,marginTop:4}}>Opponents</h1>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {adding?(
            <div style={{display:"flex",gap:8}}>
              <input value={newName} onChange={e=>setNewName(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&addManual()}
                placeholder="Opponent name..." autoFocus
                style={{padding:"9px 14px",background:C.card,border:`1px solid ${C.accent}44`,borderRadius:9,
                  color:C.text,fontSize:13,outline:"none",fontFamily:"'Outfit',sans-serif"}}/>
              <button onClick={addManual} disabled={!newName.trim()}
                style={{padding:"9px 16px",background:newName.trim()?C.accent:"#2a1000",border:"none",borderRadius:9,
                  color:newName.trim()?"#000":C.muted,fontWeight:800,fontSize:13,cursor:"pointer"}}>Add</button>
              <button onClick={()=>{setAdding(false);setNewName("");}}
                style={{padding:"9px 12px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,color:C.muted,cursor:"pointer",fontSize:13}}>✕</button>
            </div>
          ):(
            <button onClick={()=>setAdding(true)}
              style={{display:"flex",alignItems:"center",gap:8,padding:"10px 18px",background:C.accent,
                border:"none",borderRadius:10,color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
              <Plus size={15}/>Add Opponent
            </button>
          )}
        </div>
      </div>

      {allOpponentNames.length===0
        ?<div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"48px 24px",textAlign:"center"}}>
            <Award size={40} style={{color:C.muted,opacity:.3,marginBottom:12}}/>
            <div style={{color:C.text,fontSize:15,fontWeight:600}}>No opponents yet</div>
            <div style={{color:C.muted,fontSize:13,marginTop:6}}>Opponents appear automatically from your game history</div>
          </div>
        :<div style={{display:"flex",flexDirection:"column",gap:8}}>
            {allOpponentNames.map(name=>{
              const {played,w,d,l} = h2h(name);
              const opp = opponents.find(o=>o.name===name);
              return(
                <div key={name} onClick={()=>{
                  const o=getOrCreate(name);
                  if(!opponents.find(x=>x.id===o.id)) saveOpponent(o);
                  setSel(o.id);
                }}
                  style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,
                    padding:"14px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,transition:"all .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  <div style={{width:44,height:44,borderRadius:11,background:C.accent+"22",
                    border:`2px solid ${C.accent}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <Award size={20} color={C.accent}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{color:C.text,fontWeight:700,fontSize:15,marginBottom:4}}>{name}</div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      {opp?.formation&&<span style={{color:C.muted,fontSize:12}}>{opp.formation}</span>}
                      {played>0&&<span style={{color:C.muted,fontSize:12}}>{played} game{played!==1?"s":""}</span>}
                      {opp?.keyPlayers&&<span style={{color:C.muted,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{opp.keyPlayers.slice(0,40)}{opp.keyPlayers.length>40?"…":""}</span>}
                    </div>
                  </div>
                  {played>0&&(
                    <div style={{display:"flex",gap:10,flexShrink:0}}>
                      {[["W",w,C.accent],["D",d,C.warning],["L",l,C.danger]].map(([lbl,val,col])=>(
                        <div key={lbl} style={{textAlign:"center",minWidth:28}}>
                          <div style={{color:col,fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:18,lineHeight:1}}>{val}</div>
                          <div style={{color:C.muted,fontSize:9,fontWeight:700}}>{lbl}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <ChevronRight size={16} color={C.muted}/>
                </div>
              );
            })}
          </div>
      }
    </div>
  );
}

// ─── PLAYER AVAILABILITY ─────────────────────────────────────────────────────
// Added as fields on each player in the roster: availability, returnDate, availNote
// Rendered in RosterView — we patch it via a helper component used inside PlayerModal

// Availability badge used in roster list and game plan
function AvailBadge({status}){
  const map = {
    available:  {label:"Available",  color:C.accent},
    doubtful:   {label:"Doubtful",   color:C.warning},
    injured:    {label:"Injured",    color:C.danger},
    suspended:  {label:"Suspended",  color:"#7c6af5"},
  };
  const s = map[status||"available"];
  return <Tag color={s.color}>{s.label}</Tag>;
}

// ─── SHAREABLE PLAYER PROFILE ────────────────────────────────────────────────
// Hash-based routing: if URL hash starts with #/player/ show profile
function PlayerProfilePage(){
  const hash = window.location.hash; // e.g. #/player/p3
  const match = hash.match(/^#\/player\/(.+)$/);
  if(!match) return null;

  const playerId = match[1];
  const [pin, setPin]       = useState("");
  const [unlocked,setUnlocked] = useState(false);
  const [profile, setProfile]  = useState(null);
  const [loading, setLoading]  = useState(false);
  const [error,   setError]    = useState("");

  async function loadProfile(){
    setLoading(true); setError("");
    try{
      // Fetch all rosters (public read policy enabled)
      const res = await fetch(
        `https://lfhbkvdfxlawwwxtvwmj.supabase.co/rest/v1/rosters?select=*`,
        {headers:{"apikey":"sb_publishable_Pjg3PkwsTB6iKfsRoGUZqw_MWGH505L"}}
      );
      const data = await res.json();
      // Find the player across all rosters
      let found = null;
      let foundGames = [];
      for(const row of (data||[])){
        const players = row.players||[];
        const p = players.find(pl=>pl.id===playerId);
        if(p){
          found = p;
          // Also try to get games for this team
          try{
            const gr = await fetch(
              `https://lfhbkvdfxlawwwxtvwmj.supabase.co/rest/v1/games?team_id=eq.${row.team_id}&select=*`,
              {headers:{"apikey":"sb_publishable_Pjg3PkwsTB6iKfsRoGUZqw_MWGH505L"}}
            );
            const gd = await gr.json();
            foundGames = (gd||[]).map(x=>x.data).filter(Boolean);
          }catch(e){}
          break;
        }
      }
      if(!found){ setError("Player not found."); setLoading(false); return; }
      // Check PIN
      const playerPin = found.profilePin||"";
      if(playerPin && pin !== playerPin){ setError("Incorrect PIN. Try again."); setLoading(false); return; }
      setProfile({player:found, games:foundGames});
      setUnlocked(true);
    }catch(e){
      setError("Could not load profile. Check your connection.");
    }
    setLoading(false);
  }

  const iS = {width:"100%",padding:"12px 16px",background:"#181818",border:"1px solid #3a1a00",
    borderRadius:10,color:C.text,fontSize:18,outline:"none",fontFamily:"'Outfit',sans-serif",
    boxSizing:"border-box",textAlign:"center",letterSpacing:8,fontWeight:700};

  if(unlocked && profile){
    const {player:p, games} = profile;
    const pos = (Array.isArray(p.position)?p.position:[p.position||"CM"]);
    const pc  = posColor(pos[0]);
    const completedGames = games.filter(g=>g.status==="completed");
    const hist = completedGames.map(g=>{
      const st=g.stats?.find(s=>s.playerId===p.id);
      if(!st) return null;
      const cs=g.ourScore===0&&g.theirScore===0||g.theirScore===0;
      const {rating,label}=calcRating(st,pos[0],cs);
      return{date:g.date,opponent:g.opponent,rating,label,
        goals:st.goals,assists:st.assists,st};
    }).filter(Boolean).sort((a,b)=>b.date?.localeCompare(a.date||"")||0);

    const avg = hist.length ? hist.reduce((a,h)=>a+h.rating,0)/hist.length : 0;
    const totalGoals = hist.reduce((a,h)=>a+h.goals,0);
    const totalAssists = hist.reduce((a,h)=>a+h.assists,0);

    return(
      <div style={{minHeight:"100vh",background:"#080808",fontFamily:"'Outfit',sans-serif",
        backgroundImage:"radial-gradient(ellipse at 50% 0%, #ff6b0018 0%, transparent 60%)"}}>
        <div style={{maxWidth:640,margin:"0 auto",padding:24}}>
          {/* Header */}
          <div style={{textAlign:"center",marginBottom:8,paddingTop:20}}>
            <div style={{color:"#ff6b0088",fontSize:11,fontWeight:700,letterSpacing:2}}>PLAYER PROFILE</div>
            <div style={{color:"#ff6b00",fontFamily:"'Oswald',sans-serif",fontWeight:800,fontSize:14,letterSpacing:1,marginTop:4}}>COACHIQ</div>
          </div>
          {/* Player hero */}
          <div style={{background:"linear-gradient(135deg,#0d0400,#1a0800)",border:"1px solid #3a1a00",
            borderRadius:18,padding:28,marginBottom:16,textAlign:"center"}}>
            <div style={{width:72,height:72,borderRadius:16,background:pc+"22",border:`3px solid ${pc}55`,
              display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",
              fontFamily:"'Oswald',sans-serif",fontWeight:900,color:pc,fontSize:32}}>
              {p.number}
            </div>
            <div style={{color:"#ffffff",fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:28,marginBottom:6}}>{p.name}</div>
            <div style={{display:"flex",gap:6,justifyContent:"center",marginBottom:16}}>
              {pos.map(po=><span key={po} style={{background:posColor(po)+"22",color:posColor(po),border:`1px solid ${posColor(po)}44`,borderRadius:4,padding:"2px 10px",fontSize:12,fontWeight:700}}>{po}</span>)}
            </div>
            <div style={{display:"flex",gap:24,justifyContent:"center"}}>
              <div><div style={{color:rColor(avg),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:44,lineHeight:1}}>{avg>0?avg.toFixed(1):"—"}</div><div style={{color:"#ffffff66",fontSize:12,marginTop:2}}>Season Avg</div></div>
              <div><div style={{color:"#ff6b00",fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:44,lineHeight:1}}>{totalGoals}</div><div style={{color:"#ffffff66",fontSize:12,marginTop:2}}>Goals</div></div>
              <div><div style={{color:"#ffb300",fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:44,lineHeight:1}}>{totalAssists}</div><div style={{color:"#ffffff66",fontSize:12,marginTop:2}}>Assists</div></div>
            </div>
          </div>
          {/* Last 5 games */}
          <div style={{background:"#141414",border:"1px solid #2a1000",borderRadius:14,padding:18}}>
            <div style={{color:"#7a4a2a",fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:14}}>RECENT GAMES</div>
            {hist.slice(0,5).map((h,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,
                padding:"9px 12px",background:"#0a0400",borderRadius:9}}>
                <div style={{color:rColor(h.rating),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:20,minWidth:36}}>{h.rating.toFixed(1)}</div>
                <div style={{flex:1}}>
                  <div style={{color:C.text,fontWeight:600,fontSize:13}}>vs {h.opponent}</div>
                  <div style={{color:"#7a4a2a",fontSize:11}}>{h.date}</div>
                </div>
                <div style={{color:"#7a4a2a",fontSize:12}}>{h.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // PIN entry
  return(
    <div style={{minHeight:"100vh",background:"#080808",display:"flex",alignItems:"center",justifyContent:"center",
      fontFamily:"'Outfit',sans-serif",padding:20,
      backgroundImage:"radial-gradient(ellipse at 50% 0%, #ff6b0018 0%, transparent 60%)"}}>
      <div style={{width:"100%",maxWidth:380,textAlign:"center"}}>
        <AppLogo size={56} glow={true}/>
        <div style={{color:"#ffffff",fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:22,letterSpacing:1,marginTop:14,marginBottom:4}}>
          COACH<span style={{color:"#ff6b00"}}>IQ</span>
        </div>
        <div style={{color:"#7a4a2a",fontSize:13,marginBottom:32}}>Player Profile</div>
        <div style={{background:"#141414",border:"1px solid #3a1a00",borderRadius:16,padding:28}}>
          <div style={{color:"#ffffff",fontSize:16,fontWeight:600,marginBottom:8}}>Enter your PIN</div>
          <div style={{color:"#7a4a2a",fontSize:13,marginBottom:20}}>Your coach set a PIN to access your profile</div>
          <input type="password" inputMode="numeric" maxLength={8} value={pin}
            onChange={e=>setPin(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&loadProfile()}
            placeholder="••••" style={iS}/>
          {error&&<div style={{color:"#ff4444",fontSize:13,marginTop:10,fontWeight:600}}>{error}</div>}
          <button onClick={loadProfile} disabled={loading||!pin}
            style={{width:"100%",marginTop:16,padding:"13px",
              background:pin?"#ff6b00":"#2a1000",border:"none",borderRadius:10,
              color:pin?"#000":"#4a2a10",fontWeight:900,fontSize:15,cursor:pin?"pointer":"default",
              fontFamily:"'Oswald',sans-serif",letterSpacing:1}}>
            {loading?"LOADING…":"VIEW PROFILE →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TRYOUT CLOSE WIZARD ──────────────────────────────────────────────────────
function TryoutCloseWizard({tryout, teams, addPlayerToTeam, onClose, onDone}){
  const TYPE_COLORS = {varsity:"#ff6b00",jv:"#ffb300",jvb:"#42a5f5",other:"#7c6af5"};
  const TEAM_STATUSES = ["varsity","jv","jvb"];

  // Build initial state: candidates with a team status, with their assigned team
  const [step, setStep] = useState(1); // 1=review, 2=numbers, 3=confirm
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // {added:[], warned:[], skipped:[]}

  // Editable candidate list for step 1
  const [candidates, setCandidates] = useState(()=>
    tryout.candidates.map(c=>({...c, assignedTeamId: (() => {
      if(!TEAM_STATUSES.includes(c.status)) return null;
      const match = (teams||[]).filter(t=>t.type===c.status);
      return match[0]?.id || null;
    })()}))
  );

  // Numbers state for step 2 — only for those going to a team
  const [numbers, setNumbers] = useState(()=>{
    const n = {};
    tryout.candidates.forEach(c=>{ n[c.id] = ""; });
    return n;
  });

  const toTransfer = candidates.filter(c=>TEAM_STATUSES.includes(c.status) && c.assignedTeamId);
  const unresolved = candidates.filter(c=>c.status==="prospect");
  const cuts       = candidates.filter(c=>c.status==="cut");

  const iS = (extra={}) => ({padding:"8px 12px",background:C.bg,border:`1px solid ${C.border}`,
    borderRadius:8,color:C.text,fontSize:13,outline:"none",
    fontFamily:"'Outfit',sans-serif",boxSizing:"border-box",...extra});

  // Group by status for step 1
  const grouped = {
    varsity: candidates.filter(c=>c.status==="varsity"),
    jv:      candidates.filter(c=>c.status==="jv"),
    jvb:     candidates.filter(c=>c.status==="jvb"),
    cut:     candidates.filter(c=>c.status==="cut"),
    prospect:candidates.filter(c=>c.status==="prospect"),
  };

  // Group to-transfer by target team for step 2
  const byTeam = {};
  toTransfer.forEach(c=>{
    if(!byTeam[c.assignedTeamId]) byTeam[c.assignedTeamId] = [];
    byTeam[c.assignedTeamId].push(c);
  });

  async function submitRosters(){
    setSubmitting(true);
    const added=[], warned=[], skipped=[];

    for(const cand of toTransfer){
      const num = parseInt(numbers[cand.id])||1;
      const positions = cand.positions||[cand.primaryPos||"CM"];
      const newPlayer = {
        id:   `p${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: cand.name,
        number: num,
        position: positions,
        captain:  false,
        email:    "",
        availability:"available",
        availNote:"",returnDate:"",profilePin:"",
      };

      // Check for duplicate by fetching target roster
      const {data} = await supabase.from("rosters").select("*",{filter:{team_id:cand.assignedTeamId}});
      const existing = (data?.[0]?.players||[]).find(p=>
        p.name.trim().toLowerCase()===cand.name.trim().toLowerCase()
      );

      if(existing){
        warned.push({cand, teamId:cand.assignedTeamId});
      } else {
        await addPlayerToTeam(cand.assignedTeamId, newPlayer);
        added.push({cand, teamId:cand.assignedTeamId});
      }
    }

    setResult({added, warned, skipped});
    setSubmitting(false);
    setStep(4); // done screen
  }

  return(
    <div style={{position:"fixed",inset:0,background:"#000000dd",zIndex:1000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16,
      fontFamily:"'Outfit',sans-serif",overflowY:"auto"}}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,
        width:"100%",maxWidth:600,maxHeight:"90vh",display:"flex",flexDirection:"column",
        overflow:"hidden"}}>

        {/* Header */}
        <div style={{padding:"22px 28px 16px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:900}}>
              {step===1&&"Review Selections"}
              {step===2&&"Assign Jersey Numbers"}
              {step===3&&"Confirm & Submit"}
              {step===4&&"Tryout Closed ✓"}
            </h2>
            {step<4&&(
              <button onClick={onClose}
                style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18}}>✕</button>
            )}
          </div>
          {/* Progress */}
          {step<4&&(
            <div style={{display:"flex",gap:6,marginTop:12}}>
              {[1,2,3].map(n=>(
                <div key={n} style={{flex:1,height:4,borderRadius:99,
                  background:n<=step?C.accent:C.border,transition:"background .3s"}}/>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:"auto",padding:"20px 28px"}}>

          {/* ── STEP 1: Review ─────────────────────────────────────────── */}
          {step===1&&(
            <div>
              <p style={{color:C.muted,fontSize:13,marginBottom:18,lineHeight:1.6}}>
                Review your decisions before closing. You can still change any status here.
                {unresolved.length>0&&<span style={{color:C.warning,fontWeight:600}}> {unresolved.length} player{unresolved.length!==1?"s":""} still marked Prospect.</span>}
              </p>

              {[
                {key:"varsity",label:"Varsity",color:TYPE_COLORS.varsity},
                {key:"jv",     label:"JV",     color:TYPE_COLORS.jv},
                {key:"jvb",    label:"JVB",    color:TYPE_COLORS.jvb},
                {key:"cut",    label:"Cut",    color:C.danger},
                {key:"prospect",label:"Prospect (unresolved)",color:C.muted},
              ].filter(g=>grouped[g.key]?.length>0).map(group=>(
                <div key={group.key} style={{marginBottom:18}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <div style={{width:10,height:10,borderRadius:3,background:group.color,flexShrink:0}}/>
                    <div style={{color:group.color,fontSize:11,fontWeight:700,letterSpacing:1}}>
                      {group.label.toUpperCase()} ({grouped[group.key].length})
                    </div>
                  </div>
                  {grouped[group.key].map(c=>{
                    const pc = posColor(c.primaryPos||c.positions?.[0]||"CM");
                    const matchingTeams=(teams||[]).filter(t=>t.type===c.status);
                    const sel=candidates.find(x=>x.id===c.id);
                    return(
                      <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,
                        padding:"8px 12px",background:C.surface,borderRadius:9,marginBottom:5,
                        border:`1px solid ${C.border}`}}>
                        <div style={{width:28,height:28,borderRadius:7,flexShrink:0,
                          background:pc+"22",border:`1.5px solid ${pc}44`,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontFamily:"'Oswald',sans-serif",fontWeight:700,color:pc,fontSize:12}}>
                          {(c.positions||[c.primaryPos||"CM"])[0]}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{color:C.text,fontWeight:600,fontSize:13}}>{c.name}</div>
                          {c.grade&&<div style={{color:C.muted,fontSize:11}}>Grade {c.grade}</div>}
                        </div>
                        {/* Status selector inline */}
                        <select value={sel?.status||c.status}
                          onChange={e=>setCandidates(prev=>prev.map(x=>x.id===c.id?{...x,
                            status:e.target.value,
                            assignedTeamId:(()=>{
                              const mt=(teams||[]).filter(t=>t.type===e.target.value);
                              return mt[0]?.id||null;
                            })()
                          }:x))}
                          style={{...iS({width:"auto",fontSize:11,padding:"4px 8px"})}}>
                          <option value="prospect">Prospect</option>
                          <option value="varsity">Varsity</option>
                          <option value="jv">JV</option>
                          <option value="jvb">JVB</option>
                          <option value="cut">Cut</option>
                        </select>
                        {/* Team picker if multiple teams match */}
                        {TEAM_STATUSES.includes(sel?.status||c.status)&&matchingTeams.length>1&&(
                          <select value={sel?.assignedTeamId||""}
                            onChange={e=>setCandidates(prev=>prev.map(x=>x.id===c.id?{...x,assignedTeamId:e.target.value}:x))}
                            style={{...iS({width:"auto",fontSize:11,padding:"4px 8px"})}}>
                            {matchingTeams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {toTransfer.length===0&&(
                <div style={{background:C.surface,borderRadius:10,padding:"16px",textAlign:"center",color:C.muted,fontSize:13}}>
                  No players assigned to a team yet. You can still close without moving anyone.
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Jersey numbers ──────────────────────────────────── */}
          {step===2&&(
            <div>
              <p style={{color:C.muted,fontSize:13,marginBottom:18,lineHeight:1.6}}>
                Assign jersey numbers for players being added to rosters. You can change these in the Roster tab later.
              </p>
              {Object.entries(byTeam).map(([teamId,cands])=>{
                const team=(teams||[]).find(t=>t.id===teamId);
                const col=TYPE_COLORS[team?.type||"other"];
                return(
                  <div key={teamId} style={{marginBottom:22}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,
                      paddingBottom:8,borderBottom:`2px solid ${col}44`}}>
                      <span style={{fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:4,
                        background:col+"22",color:col,letterSpacing:.5}}>
                        {team?.type?.toUpperCase()||"TEAM"}
                      </span>
                      <span style={{color:C.text,fontWeight:700,fontSize:14}}>{team?.name}</span>
                      <span style={{color:C.muted,fontSize:12,marginLeft:"auto"}}>{cands.length} player{cands.length!==1?"s":""}</span>
                    </div>
                    {cands.map(c=>{
                      const pc=posColor(c.primaryPos||c.positions?.[0]||"CM");
                      return(
                        <div key={c.id} style={{display:"flex",alignItems:"center",gap:12,
                          padding:"9px 12px",background:C.surface,borderRadius:9,marginBottom:6,
                          border:`1px solid ${C.border}`}}>
                          <div style={{width:30,height:30,borderRadius:7,flexShrink:0,
                            background:pc+"22",border:`1.5px solid ${pc}44`,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontFamily:"'Oswald',sans-serif",fontWeight:700,color:pc,fontSize:13}}>
                            {(c.positions||[c.primaryPos||"CM"])[0]}
                          </div>
                          <div style={{flex:1}}>
                            <div style={{color:C.text,fontWeight:600,fontSize:14}}>{c.name}</div>
                            {c.grade&&<div style={{color:C.muted,fontSize:11}}>Grade {c.grade}</div>}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                            <label style={{color:C.muted,fontSize:11,fontWeight:600}}>JERSEY #</label>
                            <input type="number" min="1" max="99"
                              value={numbers[c.id]||""}
                              onChange={e=>setNumbers(prev=>({...prev,[c.id]:e.target.value}))}
                              placeholder="—"
                              style={{...iS({width:64,textAlign:"center",fontFamily:"'Oswald',sans-serif",
                                fontWeight:900,fontSize:18,padding:"6px 8px"})}}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {toTransfer.length===0&&(
                <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"24px 0"}}>
                  No players to transfer — skipping to confirmation.
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Confirm ─────────────────────────────────────────── */}
          {step===3&&(
            <div>
              <p style={{color:C.muted,fontSize:13,marginBottom:18,lineHeight:1.6}}>
                Review the final summary. Once submitted, the tryout will be archived and players added to their rosters.
              </p>
              {toTransfer.length>0&&(
                <div style={{background:C.surface,borderRadius:12,padding:16,marginBottom:14}}>
                  <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:12}}>
                    MOVING TO ROSTERS ({toTransfer.length})
                  </div>
                  {Object.entries(byTeam).map(([teamId,cands])=>{
                    const team=(teams||[]).find(t=>t.id===teamId);
                    const col=TYPE_COLORS[team?.type||"other"];
                    return(
                      <div key={teamId} style={{marginBottom:10}}>
                        <div style={{color:col,fontSize:12,fontWeight:700,marginBottom:5}}>{team?.name}</div>
                        {cands.map(c=>(
                          <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,
                            padding:"5px 8px",borderRadius:7,marginBottom:3,background:C.bg}}>
                            <span style={{color:C.text,fontSize:13,flex:1}}>{c.name}</span>
                            <span style={{color:C.muted,fontSize:12,fontFamily:"'Oswald',sans-serif",fontWeight:700}}>
                              #{numbers[c.id]||"?"}
                            </span>
                            <span style={{color:posColor(c.primaryPos||"CM"),fontSize:11,fontWeight:700}}>
                              {(c.positions||[c.primaryPos||"CM"])[0]}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
              {cuts.length>0&&(
                <div style={{background:C.surface,borderRadius:12,padding:16,marginBottom:14}}>
                  <div style={{color:C.danger,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:8}}>
                    CUT ({cuts.length})
                  </div>
                  <div style={{color:C.muted,fontSize:12}}>
                    {cuts.map(c=>c.name).join(", ")}
                  </div>
                </div>
              )}
              {unresolved.length>0&&(
                <div style={{background:C.warning+"11",border:`1px solid ${C.warning}44`,borderRadius:12,padding:16,marginBottom:14}}>
                  <div style={{color:C.warning,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:8}}>
                    ⚠ UNRESOLVED ({unresolved.length})
                  </div>
                  <div style={{color:C.muted,fontSize:12}}>
                    {unresolved.map(c=>c.name).join(", ")} — still marked Prospect, will remain in archived tryout.
                  </div>
                </div>
              )}
              <div style={{color:C.muted,fontSize:12,lineHeight:1.6,marginTop:8}}>
                The tryout record will be archived and can be referenced in future years.
              </div>
            </div>
          )}

          {/* ── STEP 4: Done ────────────────────────────────────────────── */}
          {step===4&&result&&(
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:48,marginBottom:16}}>🎉</div>
              <h3 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:900,marginBottom:8}}>
                Tryout Archived
              </h3>
              <p style={{color:C.muted,fontSize:14,marginBottom:24,lineHeight:1.6}}>
                {result.added.length>0&&`${result.added.length} player${result.added.length!==1?"s":""} added to their rosters. `}
                {result.warned.length>0&&<span style={{color:C.warning}}>{result.warned.length} skipped (name already on roster). </span>}
                The tryout is now archived.
              </p>
              {result.warned.length>0&&(
                <div style={{background:C.warning+"11",border:`1px solid ${C.warning}44`,borderRadius:10,
                  padding:"12px 16px",marginBottom:16,textAlign:"left"}}>
                  <div style={{color:C.warning,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:6}}>SKIPPED — ALREADY ON ROSTER</div>
                  {result.warned.map(({cand,teamId})=>{
                    const t=(teams||[]).find(x=>x.id===teamId);
                    return <div key={cand.id} style={{color:C.muted,fontSize:12}}>{cand.name} → {t?.name}</div>;
                  })}
                </div>
              )}
              <button onClick={onDone}
                style={{padding:"12px 32px",background:C.accent,border:"none",borderRadius:10,
                  color:"#000",fontWeight:900,fontSize:16,cursor:"pointer",fontFamily:"'Oswald',sans-serif",letterSpacing:1}}>
                DONE
              </button>
            </div>
          )}
        </div>

        {/* Footer nav */}
        {step<4&&(
          <div style={{padding:"16px 28px",borderTop:`1px solid ${C.border}`,
            display:"flex",justifyContent:"space-between",flexShrink:0}}>
            <button onClick={()=>step>1?setStep(s=>s-1):onClose()}
              style={{padding:"10px 20px",background:C.surface,border:`1px solid ${C.border}`,
                borderRadius:9,color:C.muted,cursor:"pointer",fontWeight:600,fontSize:13}}>
              {step===1?"Cancel":"← Back"}
            </button>
            {step<3&&(
              <button onClick={()=>setStep(s=>s+1)}
                style={{padding:"10px 24px",background:C.accent,border:"none",borderRadius:9,
                  color:"#000",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
                {step===1?"Next: Assign Numbers →":"Next: Confirm →"}
              </button>
            )}
            {step===3&&(
              <button onClick={submitRosters} disabled={submitting}
                style={{padding:"10px 24px",background:submitting?C.muted:C.accent,border:"none",borderRadius:9,
                  color:submitting?C.bg:"#000",fontWeight:800,fontSize:14,cursor:submitting?"default":"pointer",
                  fontFamily:"'Oswald',sans-serif"}}>
                {submitting?"Submitting…":"Submit & Archive →"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PITCH WITH PLAYERS ───────────────────────────────────────────────────────
function SharePitch({lineup, roster}){
  var ZONE_Y   = {GK:152, DEF:124, MID:94, FWD:56};
  var ZONE_COL = {GK:"#222", DEF:"#1565c0", MID:"#2e7d32", FWD:"#c94d00"};
  var FL = 7, FW = 96;

  function spread(count){
    var out=[], sp=FW/(count+1);
    for(var i=0;i<count;i++) out.push(FL+sp*(i+1));
    return out;
  }

  var slots=[];
  ["GK","DEF","MID","FWD"].forEach(function(zone){
    var pids=(lineup[zone]||[]).filter(Boolean);
    if(!pids.length) return;
    var xs=spread(pids.length);
    pids.forEach(function(pid,i){
      var p=roster.find(function(r){return r.id===pid;});
      if(p) slots.push({p:p,x:xs[i],y:ZONE_Y[zone],col:ZONE_COL[zone]});
    });
  });

  return(
    <svg viewBox="0 0 110 170" style={{width:"100%",height:"160px",display:"block"}}
      xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="102" height="162" fill="white" stroke="#333" strokeWidth="0.8"/>
      <line x1="4" y1="85" x2="106" y2="85" stroke="#ccc" strokeWidth="0.5"/>
      <circle cx="55" cy="85" r="14" fill="none" stroke="#ccc" strokeWidth="0.5"/>
      <circle cx="55" cy="85" r="1.2" fill="#ccc"/>
      <rect x="24" y="4" width="62" height="26" fill="none" stroke="#ccc" strokeWidth="0.5"/>
      <rect x="36" y="4" width="38" height="12" fill="none" stroke="#ccc" strokeWidth="0.5"/>
      <rect x="24" y="140" width="62" height="26" fill="none" stroke="#ccc" strokeWidth="0.5"/>
      <rect x="36" y="154" width="38" height="12" fill="none" stroke="#ccc" strokeWidth="0.5"/>
      {slots.map(function(s,i){
        var ln=s.p.name.split(" ").pop();
        if(ln.length>7) ln=ln.slice(0,6)+".";
        return(
          <g key={i}>
            <circle cx={s.x} cy={s.y} r="6" fill={s.col} stroke="white" strokeWidth="0.5"/>
            <text x={s.x} y={s.y+2.2} textAnchor="middle" fontSize="5.5" fill="white" fontFamily="Arial" fontWeight="bold">{s.p.number}</text>
            <text x={s.x} y={s.y+11} textAnchor="middle" fontSize="4.5" fill="#444" fontFamily="Arial">{ln}</text>
          </g>
        );
      })}
    </svg>
  );
}


// ─── PRO GATE ─────────────────────────────────────────────────────────────────
function ProGate({isPro, onUpgrade, feature, children}){
  if(isPro) return children;
  return(
    <div style={{padding:40,maxWidth:500,margin:"60px auto",textAlign:"center"}}>
      <div style={{width:64,height:64,borderRadius:16,background:C.accent+"22",
        border:`2px solid ${C.accent}44`,display:"flex",alignItems:"center",
        justifyContent:"center",margin:"0 auto 20px",fontSize:28}}>★</div>
      <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:26,
        fontWeight:900,marginBottom:10}}>Pro Feature</h2>
      <p style={{color:C.muted,fontSize:14,lineHeight:1.7,marginBottom:24}}>
        {feature} is available on CoachIQ Pro.<br/>
        Upgrade to unlock all features.
      </p>
      <button onClick={onUpgrade}
        style={{padding:"13px 32px",background:C.accent,border:"none",borderRadius:12,
          color:"#000",fontWeight:900,fontSize:15,cursor:"pointer",
          fontFamily:"'Oswald',sans-serif",letterSpacing:1}}>
        Upgrade to Pro → $9.99/mo
      </button>
      <div style={{color:C.muted,fontSize:12,marginTop:12}}>Cancel anytime</div>
    </div>
  );
}

// ─── GAME PLAN SHARE PAGE ─────────────────────────────────────────────────────
function GamePlanSharePage(){
  var hash    = window.location.hash;
  var shareId = hash.replace("#/plan/","");
  const [plan,    setPlan]    = useState(null);
  const [roster,  setRoster]  = useState([]);
  const [opp,     setOpp]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(()=>{
    async function load(){
      try{
        var gpRes=await supabase.from("game_plans").select("*");
        var gpRows=gpRes.data||[];
        var foundPlan=null, teamId=null;
        for(var ri=0;ri<gpRows.length;ri++){
          var row=gpRows[ri];
          if(!row.data) continue;
          var plans=Array.isArray(row.data)?row.data:[row.data];
          for(var pi=0;pi<plans.length;pi++){
            var gp=plans[pi];
            if(gp&&(gp.shareId===shareId||gp.id===shareId)){foundPlan=gp;teamId=row.team_id;break;}
          }
          if(foundPlan) break;
        }
        if(!foundPlan){setError("Game plan not found.");setLoading(false);return;}
        setPlan(foundPlan);
        if(teamId){
          var rRes=await supabase.from("rosters").select("*");
          var rRows=(rRes.data||[]).filter(function(r){return r.team_id===teamId;});
          setRoster(rRows[0]?rRows[0].players:[]);
        }
        if(foundPlan.opponent){
          var oRes=await supabase.from("opponents").select("*");
          var oRows=oRes.data||[];
          for(var oi=0;oi<oRows.length;oi++){
            var od=oRows[oi].data;
            if(od&&od.name&&od.name.trim().toLowerCase()===foundPlan.opponent.trim().toLowerCase()){
              setOpp(od); break;
            }
          }
        }
        setLoading(false);
      }catch(e){setError("Failed to load.");setLoading(false);}
    }
    load();
  },[shareId]);

  if(loading) return(<div style={{minHeight:"100vh",background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Arial,sans-serif",color:"#333"}}>Loading game plan...</div>);
  if(error)   return(<div style={{minHeight:"100vh",background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Arial,sans-serif",color:"#c00"}}>{error}</div>);

  // Build scout data
  var FORM_POS={"4-3-3":["GK","RB","CB","CB","LB","CM","CM","CM","RW","ST","LW"],"4-4-2":["GK","RB","CB","CB","LB","RM","CM","CM","LM","ST","ST"],"4-2-3-1":["GK","RB","CB","CB","LB","DM","DM","RAM","CAM","LAM","ST"],"3-5-2":["GK","CB","CB","CB","RWB","CM","CM","CM","LWB","ST","ST"],"5-3-2":["GK","RB","CB","CB","CB","LB","CM","CM","CM","ST","ST"],"4-1-4-1":["GK","RB","CB","CB","LB","DM","RM","CM","CM","LM","ST"],"4-3-2-1":["GK","RB","CB","CB","LB","CM","CM","CM","SS","SS","ST"]};
  var oppPlayers2=opp&&opp.oppPlayers?opp.oppPlayers:{};
  var oppPos=opp&&opp.formation?(FORM_POS[opp.formation]||[]):[];
  var extras2=oppPlayers2["extra"]||[];
  var allOppP=oppPos.map(function(pos,idx){var p=(oppPlayers2[pos]||[])[idx]||{};return Object.assign({},p,{pos:pos});})
    .concat(extras2.map(function(p){return Object.assign({},p,{pos:p.customPos||"SUB"});}))
    .filter(function(p){return p.name||p.number;});
  var threats=allOppP.filter(function(p){return p.threat;});

  // Scout description text
  var scoutLines=[];
  threats.forEach(function(p){
    scoutLines.push((p.number?"#"+p.number+" ":"")+(p.name||"")+(p.notes?" — "+p.notes:"")+".");
  });
  if(opp&&opp.tendencies){
    if(opp.tendencies.pressing)    scoutLines.push("Pressing: "+opp.tendencies.pressing+".");
    if(opp.tendencies.buildUp)     scoutLines.push("Build-up: "+opp.tendencies.buildUp+".");
    if(opp.tendencies.weaknesses)  scoutLines.push("Weaknesses: "+opp.tendencies.weaknesses+".");
    if(opp.tendencies.attackShape) scoutLines.push("Attack shape: "+opp.tendencies.attackShape+".");
  }
  if(opp&&opp.scoutNotes) scoutLines.push(opp.scoutNotes);
  var scoutText=scoutLines.join(" ");

  // Set pieces text
  var spLines=[];
  if(opp&&opp.setPieces){
    var sp=opp.setPieces;
    if(sp.cornersAtk)   spLines.push("Corners: "+sp.cornersAtk);
    if(sp.freeKicksAtk) spLines.push("Free kicks: "+sp.freeKicksAtk);
    if(sp.throwInsAtk)  spLines.push("Throw-ins: "+sp.throwInsAtk);
    if(sp.cornersDef||sp.freeKicksDef||sp.throwInsDef){
      var defParts=[];
      if(sp.cornersDef)   defParts.push("corners: "+sp.cornersDef);
      if(sp.freeKicksDef) defParts.push("free kicks: "+sp.freeKicksDef);
      if(sp.throwInsDef)  defParts.push("throw-ins: "+sp.throwInsDef);
      spLines.push("Our defence — "+defParts.join("; ")+".");
    }
  }
  var spText=spLines.join(" ");

  var cp=opp&&opp.counterPlan?opp.counterPlan:{};

  // Shared text styles
  var LBL={fontSize:10,fontWeight:"bold",letterSpacing:1,color:"#555",marginBottom:6,textTransform:"uppercase",display:"block",fontFamily:"Arial,sans-serif"};
  var BODY={fontSize:12,color:"#222",lineHeight:1.75,fontFamily:"Arial,sans-serif"};
  var SEC={borderTop:"1px solid #eee",paddingTop:12,marginBottom:14};

  return(
    <div>
      <style>{"*{box-sizing:border-box;margin:0;padding:0;}body{background:#fff;color:#000;font-family:Arial,sans-serif;}@media print{.no-print{display:none!important;}@page{margin:10mm 12mm;size:A4 portrait;}}"}</style>
      <div style={{maxWidth:760,margin:"0 auto",padding:"20px 16px",background:"#fff"}}>

        <div className="no-print" style={{display:"flex",gap:10,marginBottom:20}}>
          <button onClick={function(){window.history.back();}} style={{padding:"8px 16px",border:"1px solid #ccc",borderRadius:6,background:"#f5f5f5",cursor:"pointer",fontSize:13}}>Back</button>
          <div style={{flex:1}}/>
          <button onClick={function(){window.print();}} style={{padding:"9px 22px",background:"#1a1a1a",border:"none",borderRadius:6,color:"#fff",fontWeight:"bold",fontSize:13,cursor:"pointer"}}>Print / Save PDF</button>
        </div>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:14,borderBottom:"2.5px solid #000",paddingBottom:10,marginBottom:16}}>
          <div style={{flexShrink:0}}><AppLogo size={40} glow={false}/></div>
          <div style={{flex:1}}>
            <div style={{fontSize:18,fontWeight:"bold",fontFamily:"Arial,sans-serif"}}>{"vs "+plan.opponent}</div>
            <div style={{fontSize:11,color:"#666",marginTop:2,fontFamily:"Arial,sans-serif"}}>
              {[plan.date, plan.location, plan.formation].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{display:"flex",gap:24}}>

          {/* Left — pitch + instructions + attack */}
          <div style={{width:210,flexShrink:0}}>
            <span style={LBL}>Our Lineup</span>
            <SharePitch lineup={plan.lineup||{}} roster={roster}/>

            <div style={{marginTop:14,borderTop:"1px solid #eee",paddingTop:12,marginBottom:14}}>
              <span style={LBL}>Match Instructions</span>
              <div style={BODY}>{plan.instructions||"No instructions added."}</div>
            </div>

            {cp.howWeAttack?(
              <div style={SEC}>
                <span style={LBL}>How We Attack</span>
                <div style={BODY}>{cp.howWeAttack}</div>
              </div>
            ):null}
          </div>

          {/* Right — all scout info */}
          <div style={{flex:1,borderLeft:"1.5px solid #ddd",paddingLeft:20}}>

            {opp?(
              <div style={{marginBottom:14}}>
                <span style={LBL}>{"Scout — "+opp.name+(opp.formation?" ("+opp.formation+")":"")}</span>
                <div style={BODY}>{scoutText||"No scout notes added."}</div>
              </div>
            ):null}

            {spText?(
              <div style={SEC}>
                <span style={LBL}>Their Set Pieces</span>
                <div style={BODY}>{spText}</div>
              </div>
            ):null}

            {cp.howWeDefend?(
              <div style={SEC}>
                <span style={LBL}>How We Defend</span>
                <div style={BODY}>{cp.howWeDefend}</div>
              </div>
            ):null}

            {cp.keyMatchups?(
              <div style={SEC}>
                <span style={LBL}>Key Matchups</span>
                <div style={BODY}>{cp.keyMatchups}</div>
              </div>
            ):null}

            {cp.focusPoints?(
              <div style={SEC}>
                <span style={LBL}>Focus Points</span>
                <div style={BODY}>{cp.focusPoints}</div>
              </div>
            ):null}

            {!opp&&!plan.instructions?(
              <div style={{color:"#aaa",fontSize:13,fontStyle:"italic",fontFamily:"Arial,sans-serif"}}>
                No scout data found for this opponent.
              </div>
            ):null}

          </div>
        </div>

        <div style={{borderTop:"1px solid #ddd",marginTop:16,paddingTop:8,textAlign:"center",fontSize:9,color:"#aaa",fontFamily:"Arial,sans-serif"}}>CoachIQ</div>
      </div>
    </div>
  );
}

// ─── MATCH REPORT PAGE ────────────────────────────────────────────────────────
function MatchReportPage(){
  var hash   = window.location.hash;
  var gameId = hash.replace("#/report/","");
  const [game,    setGame]    = useState(null);
  const [roster,  setRoster]  = useState([]);
  const [opp,     setOpp]     = useState(null);
  const [gplan,   setGplan]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(()=>{
    async function load(){
      try{
        // Load all games
        var gRes=await supabase.from("games").select("*");
        var gRows=gRes.data||[];
        var foundGame=null, teamId=null;
        for(var ri=0;ri<gRows.length;ri++){
          var row=gRows[ri];
          var gs=Array.isArray(row.data)?row.data:[row.data];
          for(var gi=0;gi<gs.length;gi++){
            if(gs[gi]&&gs[gi].id===gameId){foundGame=gs[gi];teamId=row.team_id;break;}
          }
          if(foundGame) break;
        }
        if(!foundGame){setError("Game not found.");setLoading(false);return;}
        setGame(foundGame);

        // Load roster
        if(teamId){
          var rRes=await supabase.from("rosters").select("*");
          var rRows=(rRes.data||[]).filter(function(r){return r.team_id===teamId;});
          setRoster(rRows[0]?rRows[0].players:[]);
        }

        // Load opponent scout
        if(foundGame.opponent){
          var oRes=await supabase.from("opponents").select("*");
          var oRows=oRes.data||[];
          for(var oi=0;oi<oRows.length;oi++){
            var od=oRows[oi].data;
            if(od&&od.name&&od.name.trim().toLowerCase()===foundGame.opponent.trim().toLowerCase()){
              setOpp(od); break;
            }
          }
        }

        // Load linked game plan (for upcoming games)
        if(foundGame.status!=="completed"){
          var gpRes=await supabase.from("game_plans").select("*");
          var gpRows=gpRes.data||[];
          for(var gpi=0;gpi<gpRows.length;gpi++){
            var gprow=gpRows[gpi];
            if(!gprow.data) continue;
            var plans=Array.isArray(gprow.data)?gprow.data:[gprow.data];
            var match=plans.find(function(p){
              return p.opponent&&p.opponent.trim().toLowerCase()===foundGame.opponent.trim().toLowerCase()&&p.date===foundGame.date;
            });
            if(match){setGplan(match);break;}
          }
        }
        setLoading(false);
      }catch(e){setError("Failed to load.");setLoading(false);}
    }
    load();
  },[gameId]);

  if(loading) return(<div style={{minHeight:"100vh",background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Arial,sans-serif",color:"#333"}}>Loading report...</div>);
  if(error)   return(<div style={{minHeight:"100vh",background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Arial,sans-serif",color:"#c00"}}>{error}</div>);

  var isCompleted = game.status==="completed";
  var res  = isCompleted?(game.ourScore>game.theirScore?"W":game.ourScore<game.theirScore?"L":"D"):null;
  var resLabel = res==="W"?"VICTORY":res==="L"?"DEFEAT":"DRAW";
  var resCol   = res==="W"?"#2e7d32":res==="L"?"#c62828":"#b45a00";

  // Build player rows for completed games
  var rows=[];
  if(isCompleted&&game.stats){
    rows = game.stats.map(function(s){
      var p=roster.find(function(r){return r.id===s.playerId;});
      var cs=game.ourScore>0&&game.theirScore===0;
      var r=calcRating(s,p?primaryPos(p):"CM",cs);
      return {p:p,s:s,rating:r.rating,label:r.label};
    }).filter(function(r){return r.p;})
      .sort(function(a,b){return b.rating-a.rating;});
  }
  var squadAvg = rows.length?Math.round(rows.reduce(function(a,r){return a+r.rating;},0)/rows.length*10)/10:null;
  var topPlayer = rows[0]||null;
  var topScorer = rows.slice().sort(function(a,b){return (b.s.goals||0)-(a.s.goals||0);})[0];

  // Unavailable players
  var unavail = roster.filter(function(p){return p.availability&&p.availability!=="available";});

  var LBL={fontSize:10,fontWeight:"bold",letterSpacing:1,color:"#555",marginBottom:6,display:"block",textTransform:"uppercase",fontFamily:"Arial,sans-serif"};
  var BODY={fontSize:12,color:"#222",lineHeight:1.75,fontFamily:"Arial,sans-serif"};
  var SEC={borderTop:"1px solid #eee",paddingTop:12,marginBottom:14};

  return(
    <div>
      <style>{"*{box-sizing:border-box;margin:0;padding:0;}body{background:#fff;color:#000;font-family:Arial,sans-serif;}@media print{.no-print{display:none!important;}@page{margin:10mm 12mm;size:A4 portrait;}}"}</style>
      <div style={{maxWidth:760,margin:"0 auto",padding:"20px 16px",background:"#fff"}}>

        <div className="no-print" style={{display:"flex",gap:10,marginBottom:20}}>
          <button onClick={function(){window.history.back();}} style={{padding:"8px 16px",border:"1px solid #ccc",borderRadius:6,background:"#f5f5f5",cursor:"pointer",fontSize:13}}>Back</button>
          <div style={{flex:1}}/>
          <button onClick={function(){window.print();}} style={{padding:"9px 22px",background:"#1a1a1a",border:"none",borderRadius:6,color:"#fff",fontWeight:"bold",fontSize:13,cursor:"pointer"}}>Print / Save PDF</button>
        </div>

        {/* Header */}
        <div style={{borderBottom:"2.5px solid #000",paddingBottom:10,marginBottom:16,display:"flex",alignItems:"center",gap:14}}>
          <div style={{flexShrink:0}}><AppLogo size={40} glow={false}/></div>
          <div style={{flex:1}}>
            <div style={{fontSize:11,fontWeight:"bold",letterSpacing:1,color:"#777",textTransform:"uppercase",marginBottom:3,fontFamily:"Arial,sans-serif"}}>
              {isCompleted?"Match Report":"Match Preview"}
            </div>
            <div style={{fontSize:18,fontWeight:"bold",fontFamily:"Arial,sans-serif"}}>{"vs "+game.opponent}</div>
            <div style={{fontSize:11,color:"#666",marginTop:2,fontFamily:"Arial,sans-serif"}}>
              {[game.date,game.location,game.formation].filter(Boolean).join(" · ")}
            </div>
          </div>
          {isCompleted&&(
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:36,fontWeight:"bold",fontFamily:"Arial,sans-serif",lineHeight:1}}>
                {game.ourScore}<span style={{color:"#aaa",fontSize:24}}> – </span>{game.theirScore}
              </div>
              <div style={{fontSize:11,fontWeight:"bold",color:resCol,letterSpacing:1,marginTop:3,fontFamily:"Arial,sans-serif"}}>{resLabel}</div>
            </div>
          )}
        </div>

        {/* ── COMPLETED GAME REPORT ── */}
        {isCompleted&&(
          <div>
            {/* Key stats strip */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
              {[
                {label:"Squad Rating",   value:squadAvg?squadAvg+"/10":"—"},
                {label:"Top Performer",  value:topPlayer?topPlayer.p.name.split(" ").pop()+" ("+topPlayer.rating.toFixed(1)+")":"—"},
                {label:"Top Scorer",     value:topScorer&&topScorer.s.goals>0?topScorer.p.name.split(" ").pop()+" ("+topScorer.s.goals+")":"—"},
                {label:"Result",         value:resLabel},
              ].map(function(item){
                return(
                  <div key={item.label} style={{border:"1px solid #ddd",borderRadius:8,padding:"10px 12px"}}>
                    <div style={{fontSize:9,fontWeight:"bold",letterSpacing:1,color:"#777",marginBottom:4,textTransform:"uppercase",fontFamily:"Arial,sans-serif"}}>{item.label}</div>
                    <div style={{fontSize:13,fontWeight:"bold",color:"#111",fontFamily:"Arial,sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.value}</div>
                  </div>
                );
              })}
            </div>

            {/* Player ratings table */}
            <div style={{marginBottom:16}}>
              <span style={LBL}>Player Ratings</span>
              <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"Arial,sans-serif",fontSize:11}}>
                <thead>
                  <tr style={{borderBottom:"2px solid #000"}}>
                    {["Player","Position","Rating","Goals","Assists","Shots","Tackles","Passes"].map(function(h){
                      return <th key={h} style={{textAlign:"left",padding:"5px 8px",fontSize:9,letterSpacing:1,color:"#555",textTransform:"uppercase",fontWeight:"bold"}}>{h}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(function(r,i){
                    return(
                      <tr key={i} style={{borderBottom:"1px solid #eee",background:i===0?"#f9f9f9":"transparent"}}>
                        <td style={{padding:"6px 8px",fontWeight:i===0?"bold":"normal"}}>
                          {i===0&&<span style={{color:"#c94d00",marginRight:4}}>★</span>}
                          {r.p.name}
                        </td>
                        <td style={{padding:"6px 8px",color:"#666"}}>{primaryPos(r.p)}</td>
                        <td style={{padding:"6px 8px",fontWeight:"bold",color:r.rating>=7?"#2e7d32":r.rating>=5?"#b45a00":"#c62828"}}>{r.rating.toFixed(1)}</td>
                        <td style={{padding:"6px 8px"}}>{r.s.goals||0}</td>
                        <td style={{padding:"6px 8px"}}>{r.s.assists||0}</td>
                        <td style={{padding:"6px 8px"}}>{r.s.shots||0}</td>
                        <td style={{padding:"6px 8px"}}>{r.s.tackles||0}</td>
                        <td style={{padding:"6px 8px"}}>{r.s.passesCompleted||0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Scout notes if available */}
            {opp&&opp.scoutNotes&&(
              <div style={SEC}>
                <span style={LBL}>Opponent Notes</span>
                <div style={BODY}>{opp.scoutNotes}</div>
              </div>
            )}
          </div>
        )}

        {/* ── UPCOMING GAME PREVIEW ── */}
        {!isCompleted&&(
          <div style={{display:"flex",gap:24}}>

            {/* Left — lineup + instructions */}
            <div style={{width:210,flexShrink:0}}>
              {gplan&&gplan.lineup&&Object.values(gplan.lineup).some(function(s){return s.filter(Boolean).length>0;})&&(
                <div style={{marginBottom:14}}>
                  <span style={LBL}>Planned Lineup</span>
                  <SharePitch lineup={gplan.lineup} roster={roster}/>
                </div>
              )}
              {gplan&&gplan.instructions&&(
                <div style={{borderTop:"1px solid #eee",paddingTop:12,marginBottom:14}}>
                  <span style={LBL}>Match Instructions</span>
                  <div style={BODY}>{gplan.instructions}</div>
                </div>
              )}
              {unavail.length>0&&(
                <div style={{borderTop:"1px solid #eee",paddingTop:12}}>
                  <span style={LBL}>Unavailable</span>
                  <div style={BODY}>
                    {unavail.map(function(p){
                      return <div key={p.id} style={{marginBottom:3}}>{p.name}{p.availNote?" — "+p.availNote:""}</div>;
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right — scout */}
            <div style={{flex:1,borderLeft:"1.5px solid #ddd",paddingLeft:20}}>
              {opp?(
                <div>
                  <div style={{marginBottom:14}}>
                    <span style={LBL}>{"Scout — "+opp.name+(opp.formation?" ("+opp.formation+")":"")}</span>
                    {opp.scoutNotes&&<div style={Object.assign({},BODY,{marginBottom:8})}>{opp.scoutNotes}</div>}
                    {opp.tendencies&&opp.tendencies.pressing&&<div style={BODY}>{"Pressing: "+opp.tendencies.pressing}</div>}
                    {opp.tendencies&&opp.tendencies.weaknesses&&<div style={BODY}>{"Weaknesses: "+opp.tendencies.weaknesses}</div>}
                  </div>
                  {opp.counterPlan&&opp.counterPlan.howWeAttack&&(
                    <div style={SEC}>
                      <span style={LBL}>How We Attack</span>
                      <div style={BODY}>{opp.counterPlan.howWeAttack}</div>
                    </div>
                  )}
                  {opp.counterPlan&&opp.counterPlan.howWeDefend&&(
                    <div style={SEC}>
                      <span style={LBL}>How We Defend</span>
                      <div style={BODY}>{opp.counterPlan.howWeDefend}</div>
                    </div>
                  )}
                  {opp.counterPlan&&opp.counterPlan.focusPoints&&(
                    <div style={SEC}>
                      <span style={LBL}>Focus Points</span>
                      <div style={BODY}>{opp.counterPlan.focusPoints}</div>
                    </div>
                  )}
                </div>
              ):(
                <div style={{color:"#aaa",fontSize:13,fontStyle:"italic",fontFamily:"Arial,sans-serif"}}>No scout data found for this opponent.</div>
              )}
            </div>
          </div>
        )}

        <div style={{borderTop:"1px solid #ddd",marginTop:16,paddingTop:8,textAlign:"center",fontSize:9,color:"#aaa",fontFamily:"Arial,sans-serif"}}>CoachIQ</div>
      </div>
    </div>
  );
}


function DiagramArrow({x1,y1,x2,y2,color,dashed}){
  const angle=Math.atan2(y2-y1,x2-x1);
  const ax1=x2-14*Math.cos(angle-0.4), ay1=y2-14*Math.sin(angle-0.4);
  const ax2=x2-14*Math.cos(angle+0.4), ay2=y2-14*Math.sin(angle+0.4);
  return(
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color} strokeWidth="2.5"
        strokeDasharray={dashed?"6,4":"none"}/>
      <polygon points={`${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}`} fill={color}/>
    </g>
  );
}

// ─── DIAGRAM PREVIEW (SVG render of saved canvas for print) ──────────────────
function DiagramPreview({data, size=160}){
  if(!data) return null;
  let elements=[], fieldType2="full";
  try{
    const parsed=JSON.parse(data);
    if(Array.isArray(parsed)){ elements=parsed; }
    else{ elements=parsed.elements||[]; fieldType2=parsed.fieldType||"full"; }
  }catch(e){ return null; }

  const W=520, H=360;
  const scale = size/W;
  const sh = H*scale;

  return(
    <svg viewBox={"0 0 "+W+" "+H} style={{width:size,height:sh,display:"block",borderRadius:6,border:"1px solid #444"}}>
      <rect width={W} height={H} fill="#2d5a1b"/>
      <rect x="20" y="20" width={W-40} height={H-40} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5"/>
      <line x1="20" y1={H/2} x2={W-20} y2={H/2} stroke="rgba(255,255,255,0.7)" strokeWidth="1"/>
      <circle cx={W/2} cy={H/2} r="50" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1"/>
      <rect x={W/2-90} y="20" width="180" height="60" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1"/>
      <rect x={W/2-90} y={H-80} width="180" height="60" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1"/>
      {elements.map(function(el,i){
        if(el.type==="dot") return(
          <g key={i}>
            <circle cx={el.x} cy={el.y} r="10" fill={el.color} stroke="rgba(255,255,255,0.7)" strokeWidth="1.5"/>
          </g>
        );
        if(el.type==="cone") return(
          <polygon key={i} points={`${el.x},${el.y-10} ${el.x+8},${el.y+6} ${el.x-8},${el.y+6}`} fill="#ff8800"/>
        );
        if(el.type==="line") return(
          <DiagramArrow key={i} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} color={el.color} dashed={el.dashed}/>
        );
        return null;
      })}
    </svg>
  );
}

// ─── DRILL CANVAS ─────────────────────────────────────────────────────────────
function DrillCanvas({diagram, onSave, onClose}){
  const canvasRef = useRef(null);
  const toolRef   = useRef("red");
  const [tool, setToolState] = useState("red");
  function setTool(t){ setToolState(t); toolRef.current=t; }
  const [drawing, setDrawing] = useState(false);
  const [startPt, setStartPt] = useState(null);
  const [fieldType, setFieldType] = useState("full"); // full | half
  const parsed = diagram ? (() => { try { return JSON.parse(diagram); } catch(e) { return []; } })() : [];
  const initElements = Array.isArray(parsed) ? parsed : (parsed.elements||[]);
  const initField    = parsed.fieldType || "full";
  const [elements, setElements] = useState(initElements);
  const [history,  setHistory]  = useState([]);
  useEffect(()=>{ setFieldType(initField); },[]);

  // Draw everything on canvas
  useEffect(()=>{
    const canvas = canvasRef.current;
    if(!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);

    // Draw pitch
    ctx.fillStyle = "#2d5a1b";
    ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1.5;
    if(fieldType==="half"){
      // Half field - one penalty area at bottom
      ctx.strokeRect(20,20,W-40,H-40);
      // Penalty area
      ctx.strokeRect(W/2-90,H-80,180,60);
      ctx.strokeRect(W/2-45,H-48,90,28);
      // Penalty spot
      ctx.beginPath(); ctx.arc(W/2,H-60,2,0,Math.PI*2); ctx.fillStyle="white"; ctx.fill();
      // Penalty arc
      ctx.beginPath(); ctx.arc(W/2,H-60,50,Math.PI*1.2,Math.PI*1.8); ctx.stroke();
      // Top line label
      ctx.fillStyle="rgba(255,255,255,0.3)";
      ctx.font="11px Arial";
      ctx.textAlign="center";
      ctx.fillText("← Half Field →",W/2,35);
    } else {
      // Full field
      ctx.strokeRect(20,20,W-40,H-40);
      ctx.beginPath(); ctx.moveTo(20,H/2); ctx.lineTo(W-20,H/2); ctx.stroke();
      ctx.beginPath(); ctx.arc(W/2,H/2,50,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(W/2,H/2,3,0,Math.PI*2); ctx.fillStyle="white"; ctx.fill();
      ctx.strokeRect(W/2-90,20,180,60);
      ctx.strokeRect(W/2-45,20,90,28);
      ctx.strokeRect(W/2-90,H-80,180,60);
      ctx.strokeRect(W/2-45,H-48,90,28);
    }

    // Draw elements
    elements.forEach(el=>{
      if(el.type==="dot"){
        ctx.beginPath();
        ctx.arc(el.x,el.y,10,0,Math.PI*2);
        ctx.fillStyle=el.color;
        ctx.fill();
        ctx.strokeStyle="rgba(255,255,255,0.7)";
        ctx.lineWidth=1.5;
        ctx.stroke();
        if(el.label){
          ctx.fillStyle="white";
          ctx.font="bold 9px Arial";
          ctx.textAlign="center";
          ctx.textBaseline="middle";
          ctx.fillText(el.label,el.x,el.y);
        }
      } else if(el.type==="cone"){
        ctx.beginPath();
        ctx.moveTo(el.x,el.y-10);
        ctx.lineTo(el.x+8,el.y+6);
        ctx.lineTo(el.x-8,el.y+6);
        ctx.closePath();
        ctx.fillStyle="#ff8800";
        ctx.fill();
      } else if(el.type==="line"){
        ctx.beginPath();
        ctx.moveTo(el.x1,el.y1);
        ctx.lineTo(el.x2,el.y2);
        ctx.strokeStyle=el.color;
        ctx.lineWidth=2.5;
        if(el.dashed){
          ctx.setLineDash([6,4]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        // Arrow head
        const angle = Math.atan2(el.y2-el.y1, el.x2-el.x1);
        ctx.beginPath();
        ctx.moveTo(el.x2,el.y2);
        ctx.lineTo(el.x2-14*Math.cos(angle-0.4),el.y2-14*Math.sin(angle-0.4));
        ctx.lineTo(el.x2-14*Math.cos(angle+0.4),el.y2-14*Math.sin(angle+0.4));
        ctx.closePath();
        ctx.fillStyle=el.color;
        ctx.fill();
      }
    });
  },[elements, fieldType]);

  function getPos(e){
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const touch = e.touches?.[0] || e;
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top)  * scaleY,
    };
  }

  function handleDown(e){
    e.preventDefault();
    const pos = getPos(e);
    const t = toolRef.current;
    if(t==="ball"||t==="player"){
      setDrawing(true);
      setStartPt(pos);
    } else if(t==="erase"){
      // Remove closest element
      setHistory(h=>[...h,JSON.stringify(elements)]);
      setElements(prev=>{
        let minDist=30, minIdx=-1;
        prev.forEach((el,i)=>{
          let d=999;
          if(el.type==="dot"||el.type==="cone") d=Math.hypot(el.x-pos.x,el.y-pos.y);
          else if(el.type==="line") d=Math.min(Math.hypot(el.x1-pos.x,el.y1-pos.y),Math.hypot(el.x2-pos.x,el.y2-pos.y));
          if(d<minDist){minDist=d;minIdx=i;}
        });
        if(minIdx>=0){const n=[...prev];n.splice(minIdx,1);return n;}
        return prev;
      });
    } else {
      // Place dot or cone
      setHistory(h=>[...h,JSON.stringify(elements)]);
      const color = t==="red"?"#e53935":t==="blue"?"#1565c0":t==="gk"?"#f9a825":"#ff8800";
      if(t==="cone"){
        setElements(prev=>[...prev,{type:"cone",x:pos.x,y:pos.y}]);
      } else {
        setElements(prev=>[...prev,{type:"dot",x:pos.x,y:pos.y,color,label:""}]);
      }
    }
  }

  function handleUp(e){
    const t = toolRef.current;
    if((t==="ball"||t==="player")&&drawing&&startPt){
      const pos = getPos(e);
      if(Math.hypot(pos.x-startPt.x,pos.y-startPt.y)>10){
        setHistory(h=>[...h,JSON.stringify(elements)]);
        setElements(prev=>[...prev,{
          type:"line",
          x1:startPt.x,y1:startPt.y,
          x2:pos.x,y2:pos.y,
          color:t==="ball"?"#ffffff":"#ffeb3b",
          dashed:t==="player",
        }]);
      }
    }
    setDrawing(false);
    setStartPt(null);
  }

  function undo(){
    if(!history.length) return;
    const prev = history[history.length-1];
    setElements(JSON.parse(prev));
    setHistory(h=>h.slice(0,-1));
  }

  function clear(){
    if(window.confirm("Clear the diagram?")){ setHistory(h=>[...h,JSON.stringify(elements)]); setElements([]); }
  }

  const TOOLS = [
    {k:"red",    label:"Red",    color:"#e53935"},
    {k:"blue",   label:"Blue",   color:"#1565c0"},
    {k:"gk",     label:"GK",     color:"#f9a825"},
    {k:"cone",   label:"Cone",   color:"#ff8800"},
    {k:"ball",   label:"Ball",   color:"#ffffff"},
    {k:"player", label:"Run",    color:"#ffeb3b"},
    {k:"erase",  label:"Erase",  color:C.danger},
  ];

  return(
    <div className="modal-outer" style={{position:"fixed",inset:0,background:"#000000ee",zIndex:3000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div className="drill-canvas-inner" style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,
        width:"100%",maxWidth:560,overflow:"hidden",display:"flex",flexDirection:"column"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px 18px",
          borderBottom:`1px solid ${C.border}`}}>
          <div style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:16,fontWeight:800,flex:1}}>
            Drill Diagram
          </div>
          <button onClick={undo} style={{background:C.surface,border:`1px solid ${C.border}`,
            borderRadius:7,padding:"5px 10px",color:C.muted,cursor:"pointer",fontSize:12}}>
            ↩ Undo
          </button>
          <button onClick={clear} style={{background:C.surface,border:`1px solid ${C.border}`,
            borderRadius:7,padding:"5px 10px",color:C.muted,cursor:"pointer",fontSize:12}}>
            Clear
          </button>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18}}>✕</button>
        </div>

        {/* Field type + Tools */}
        <div style={{display:"flex",gap:6,padding:"8px 14px 0",flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:4,marginBottom:6}}>
            {["full","half"].map(ft=>(
              <button key={ft} onClick={()=>setFieldType(ft)}
                style={{padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:10,fontWeight:700,
                  border:`2px solid ${fieldType===ft?C.accent:C.border}`,
                  background:fieldType===ft?C.accent+"22":"transparent",
                  color:fieldType===ft?C.accent:C.muted}}>
                {ft==="full"?"Full Field":"Half Field"}
              </button>
            ))}
          </div>
        </div>
        <div style={{display:"flex",gap:6,padding:"4px 14px 10px",borderBottom:`1px solid ${C.border}`,flexWrap:"wrap"}}>
          {TOOLS.map(t=>(
            <button key={t.k} onClick={()=>setTool(t.k)}
              style={{padding:"5px 10px",borderRadius:7,cursor:"pointer",fontSize:11,fontWeight:700,
                border:`2px solid ${tool===t.k?t.color:C.border}`,
                background:tool===t.k?t.color+"22":"transparent",
                color:tool===t.k?t.color:C.muted}}>
              {t.label}
            </button>
          ))}
          <div style={{flex:1,textAlign:"right",color:C.muted,fontSize:10,alignSelf:"center",paddingRight:4}}>
            {tool==="ball"?"Drag = ball path (solid arrow)":
             tool==="player"?"Drag = player run (dotted arrow)":
             "Tap to place"}
          </div>
        </div>

        {/* Canvas */}
        <div style={{padding:"10px 14px"}}>
          <canvas ref={canvasRef} width={520} height={360}
            style={{width:"100%",borderRadius:8,cursor:tool==="erase"?"crosshair":"crosshair",touchAction:"none"}}
            onMouseDown={handleDown} onMouseUp={handleUp}
            onTouchStart={handleDown} onTouchEnd={handleUp}
          />
        </div>

        {/* Legend */}
        <div style={{display:"flex",gap:16,padding:"6px 18px 10px",fontSize:10,color:C.muted,flexWrap:"wrap"}}>
          <span style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{width:20,height:2,background:"white",display:"inline-block"}}/>Ball path (solid)
          </span>
          <span style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{width:20,height:0,borderTop:"2px dashed #ffeb3b",display:"inline-block"}}/>Player run (dashed)
          </span>
        </div>

        {/* Footer */}
        <div style={{display:"flex",gap:10,padding:"12px 18px",borderTop:`1px solid ${C.border}`}}>
          <button onClick={onClose}
            style={{flex:1,padding:"10px",background:C.surface,border:`1px solid ${C.border}`,
              borderRadius:9,color:C.muted,cursor:"pointer",fontSize:13}}>
            Cancel
          </button>
          <button onClick={()=>onSave(JSON.stringify(elements))}
            style={{flex:2,padding:"10px",background:C.accent,border:"none",
              borderRadius:9,color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",
              fontFamily:"'Oswald',sans-serif"}}>
            Save Diagram
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SETTINGS VIEW ────────────────────────────────────────────────────────────
function SettingsView({isPro, isElite, brandName, setBrandName, brandLogo, setBrandLogo, onUpgrade, onManage, userId, safeTeamId}){
  const [name,    setName]    = useState(brandName||"");
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [logoUrl, setLogoUrl] = useState(brandLogo||"");

  // Sync local fields when active team changes
  useEffect(()=>{ setName(brandName||""); },[brandName]);
  useEffect(()=>{ setLogoUrl(brandLogo||""); },[brandLogo]);

  async function saveBranding(){
    if(!isElite){ onUpgrade(); return; }
    if(!userId){ alert("Not logged in."); return; }
    setSaving(true);
    try{
      // If we have a specific team id use it, otherwise update all user's teams
      let q = supabase.from("teams").update({brand_name:name, brand_logo:logoUrl||null});
      if(safeTeamId){
        q = q.eq("id", safeTeamId);
      } else {
        q = q.eq("user_id", userId);
      }
      const {error:brandErr} = await q;
      if(brandErr) throw new Error(brandErr.message);
      setBrandName(name);
      setBrandLogo(logoUrl||null);
      setSaved(true);
      setTimeout(()=>setSaved(false),2500);
    }catch(e){ alert("Save failed: "+e.message); }
    setSaving(false);
  }

  const PLAN_COL = isElite?"#7c3aed":isPro?C.accent:C.muted;
  const PLAN_LBL = isElite?"Elite":isPro?"Pro":"Free";

  return(
    <div style={{padding:24,maxWidth:700,margin:"0 auto"}}>
      <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2,marginBottom:4}}>ACCOUNT</div>
      <h1 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:28,fontWeight:800,marginBottom:24}}>Settings</h1>

      {/* Subscription card */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:24,marginBottom:16}}>
        <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:14}}>SUBSCRIPTION</div>
        <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
              <div style={{padding:"4px 14px",background:PLAN_COL+"22",border:`1px solid ${PLAN_COL}44`,
                borderRadius:20,color:PLAN_COL,fontSize:13,fontWeight:800,fontFamily:"'Oswald',sans-serif"}}>
                {PLAN_LBL}
              </div>
              {!isPro&&<span style={{color:C.muted,fontSize:12}}>Free plan</span>}
              {isPro&&!isElite&&<span style={{color:C.muted,fontSize:12}}>Up to 4 teams · All Pro features</span>}
              {isElite&&<span style={{color:C.muted,fontSize:12}}>Unlimited teams · All Elite features</span>}
            </div>
          </div>
          {!isPro&&(
            <button onClick={onUpgrade}
              style={{padding:"9px 20px",background:C.accent,border:"none",borderRadius:9,
                color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
              Upgrade →
            </button>
          )}
          {isPro&&!isElite&&(
            <div style={{display:"flex",gap:8}}>
              <button onClick={onUpgrade}
                style={{padding:"9px 16px",background:"#7c3aed22",border:"1px solid #7c3aed44",
                  borderRadius:9,color:"#7c3aed",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                Upgrade to Elite
              </button>
              <button onClick={onManage}
                style={{padding:"9px 16px",background:C.surface,border:`1px solid ${C.border}`,
                  borderRadius:9,color:C.muted,fontWeight:600,fontSize:12,cursor:"pointer"}}>
                Manage / Cancel
              </button>
            </div>
          )}
          {isElite&&(
            <button onClick={onManage}
              style={{padding:"9px 16px",background:C.surface,border:`1px solid ${C.border}`,
                borderRadius:9,color:C.muted,fontWeight:600,fontSize:12,cursor:"pointer"}}>
              Manage / Cancel
            </button>
          )}
        </div>
      </div>

      {/* Custom branding card */}
      <div style={{background:C.card,border:`1px solid ${isElite?C.border:"#7c3aed33"}`,borderRadius:16,padding:24,marginBottom:16,position:"relative"}}>
        {!isElite&&(
          <div style={{position:"absolute",top:16,right:16,padding:"3px 10px",background:"#7c3aed22",
            border:"1px solid #7c3aed44",borderRadius:20,fontSize:10,fontWeight:800,color:"#7c3aed"}}>
            ELITE ONLY
          </div>
        )}
        <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:6}}>CUSTOM BRANDING</div>
        <div style={{color:C.muted,fontSize:12,marginBottom:12}}>Branding is saved per team. Switch teams to set different branding for each.</div>
        <p style={{color:C.muted,fontSize:13,marginBottom:16,lineHeight:1.6}}>
          Your school or club name and logo will appear on printed game plans and match reports instead of the CoachIQ logo.
        </p>
        <div style={{marginBottom:14}}>
          <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>SCHOOL / CLUB NAME</label>
          <input value={name} onChange={e=>setName(e.target.value)}
            placeholder={isElite?"e.g. Marion Warriors":"Upgrade to Elite to add custom branding"}
            disabled={!isElite}
            style={{width:"100%",padding:"10px 14px",background:isElite?C.bg:C.surface,
              border:`1px solid ${C.border}`,borderRadius:9,color:C.text,fontSize:14,
              outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box",
              opacity:isElite?1:0.6}}/>
        </div>
        <div style={{marginBottom:16}}>
          <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>LOGO URL <span style={{color:C.muted,fontWeight:400,fontSize:10}}>(paste an image URL)</span></label>
          <input value={logoUrl} onChange={e=>setLogoUrl(e.target.value)}
            placeholder={isElite?"https://your-school.com/logo.png":"Upgrade to Elite to add custom branding"}
            disabled={!isElite}
            style={{width:"100%",padding:"10px 14px",background:isElite?C.bg:C.surface,
              border:`1px solid ${C.border}`,borderRadius:9,color:C.text,fontSize:14,
              outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box",
              opacity:isElite?1:0.6}}/>
          {logoUrl&&isElite&&(
            <div style={{marginTop:8,padding:8,background:C.surface,borderRadius:8,display:"inline-block"}}>
              <img src={logoUrl} alt="Logo preview" style={{height:48,objectFit:"contain"}}
                onError={e=>{e.target.style.display="none";}}/>
            </div>
          )}
        </div>
        <button onClick={saveBranding} disabled={saving}
          style={{padding:"10px 24px",background:isElite?C.accent:"#7c3aed",border:"none",
            borderRadius:9,color:isElite?"#000":"#fff",fontWeight:800,fontSize:13,
            cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
          {saving?"Saving...":(saved?"✓ Saved!":(isElite?"Save Branding":"Upgrade to Elite →"))}
        </button>
      </div>

      {/* What's included */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:24}}>
        <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:14}}>PLAN FEATURES</div>
        {[
          {feature:"Games & Score Tracking",         free:true, pro:true,  elite:true},
          {feature:"Roster Management",              free:true, pro:true,  elite:true},
          {feature:"Calendar",                       free:true, pro:true,  elite:true},
          {feature:"Live Stat Tracking & Ratings",   free:false,pro:true,  elite:true},
          {feature:"Game Plans & Share Links",       free:false,pro:true,  elite:true},
          {feature:"Opponent Intelligence",          free:false,pro:true,  elite:true},
          {feature:"Match Reports & PDF",            free:false,pro:true,  elite:true},
          {feature:"AI Match Analysis",              free:false,pro:true,  elite:true},
          {feature:"Practice & Drill Canvas",        free:false,pro:true,  elite:true},
          {feature:"Season Analytics",               free:false,pro:true,  elite:true},
          {feature:"Number of Teams",                free:"1",  pro:"4",   elite:"∞"},
          {feature:"Multi-Team Analytics",           free:false,pro:false, elite:true},
          {feature:"Full Season Export PDF",         free:false,pro:false, elite:true},
          {feature:"Custom School Branding",         free:false,pro:false, elite:true},
        ].map(function(row){
          function cell(val){
            if(val===true)  return <span style={{color:C.accent,fontWeight:700}}>✓</span>;
            if(val===false) return <span style={{color:C.border}}>—</span>;
            return <span style={{color:C.text,fontWeight:700}}>{val}</span>;
          }
          return(
            <div key={row.feature} style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 80px",
              gap:8,padding:"8px 0",borderBottom:`1px solid ${C.border}`,alignItems:"center"}}>
              <div style={{color:C.text,fontSize:13}}>{row.feature}</div>
              <div style={{textAlign:"center",fontSize:13}}>{cell(row.free)}</div>
              <div style={{textAlign:"center",fontSize:13}}>{cell(row.pro)}</div>
              <div style={{textAlign:"center",fontSize:13}}>{cell(row.elite)}</div>
            </div>
          );
        })}
        <div style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 80px",gap:8,paddingTop:8}}>
          <div style={{color:C.muted,fontSize:11}}>Monthly price</div>
          <div style={{textAlign:"center",color:C.muted,fontSize:11}}>Free</div>
          <div style={{textAlign:"center",color:C.accent,fontSize:11,fontWeight:700}}>$9.99</div>
          <div style={{textAlign:"center",color:"#7c3aed",fontSize:11,fontWeight:700}}>$19.99</div>
        </div>
      </div>
    </div>
  );
}

// ─── FEEDBACK MODAL ───────────────────────────────────────────────────────────
function PlayerPortalPage(){
  var playerId = window.location.hash.replace("#/player/","").split("?")[0];
  var [player,     setPlayer]    = useState(null);
  var [teamName,   setTeamName]  = useState("");
  var [games,      setGamesP]    = useState([]);
  var [error,      setError]     = useState(null);
  var [loading,    setLoading]   = useState(true);
  var [tab,        setTab]       = useState("stats");
  var [perGame,    setPerGame]   = useState(false);
  var [videos,     setVideos]    = useState([]);
  var [newVideo,   setNewVideo]  = useState({label:"",url:""});
  var [addingVid,  setAddingVid] = useState(false);
  var [savingVid,  setSavingVid] = useState(false);
  var [bio,        setBio]       = useState("");
  var [editBio,    setEditBio]   = useState(false);
  var [savingBio,  setSavingBio] = useState(false);
  var [copied,     setCopied]    = useState(false);

  useEffect(function(){
    async function load(){
      setLoading(true);
      try{
        var {data:rosters} = await supabase.from("rosters").select("*");
        var foundPlayer=null, teamId=null;
        for(var i=0;i<(rosters||[]).length;i++){
          var r=rosters[i];
          var p=(r.players||[]).find(function(p){return p.id===playerId;});
          if(p){foundPlayer=p;teamId=r.team_id;break;}
        }
        if(!foundPlayer){setError("Player not found.");setLoading(false);return;}
        setPlayer(Object.assign({},foundPlayer,{teamId:teamId}));
        setVideos(foundPlayer.videoLinks||[]);
        setBio(foundPlayer.playerBio||"");
        var {data:teams} = await supabase.from("teams").select("name").eq("id",teamId);
        setTeamName(teams?.[0]?.name||"");
        var {data:gData} = await supabase.from("games").select("*").eq("team_id",teamId);
        setGamesP((gData||[]).map(function(x){return x.data;}));
      }catch(e){setError("Failed to load profile.");}
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
    await saveField("playerBio", bio);
    setEditBio(false); setSavingBio(false);
    setPlayer(function(p){return Object.assign({},p,{playerBio:bio});});
  }

  async function saveVideos(list){
    setSavingVid(true);
    await saveField("videoLinks", list);
    setVideos(list); setSavingVid(false);
    setAddingVid(false); setNewVideo({label:"",url:""});
  }

  function addVideo(){
    if(!newVideo.url.trim()) return;
    saveVideos(videos.concat([{id:"v"+Date.now(),label:newVideo.label.trim()||"Highlights",url:newVideo.url.trim()}]));
  }

  function copyLink(){
    navigator.clipboard.writeText(window.location.href)
      .then(function(){setCopied(true);setTimeout(function(){setCopied(false);},2000);})
      .catch(function(){});
  }

  var A = "#ff6b00";

  if(loading) return(
    <div style={{minHeight:"100vh",background:"#fff",display:"flex",alignItems:"center",
      justifyContent:"center",flexDirection:"column",gap:14,fontFamily:"'Outfit',sans-serif"}}>
      <div style={{width:32,height:32,borderRadius:"50%",border:"3px solid "+A,
        borderTopColor:"transparent",animation:"spin .7s linear infinite"}}/>
      <div style={{color:A,fontSize:13,fontWeight:600}}>Loading profile...</div>
    </div>
  );

  if(error) return(
    <div style={{minHeight:"100vh",background:"#fff",display:"flex",alignItems:"center",
      justifyContent:"center",padding:24,fontFamily:"'Outfit',sans-serif"}}>
      <div style={{color:"#c00",fontSize:14,textAlign:"center"}}>{error}</div>
    </div>
  );

  // ── Stats calculations ──────────────────────────────────────────────────────
  var pos = primaryPos(player);
  var posColor = (POS_META[pos]||{}).color||A;
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
      keyPasses:acc.keyPasses+(s.keyPasses||0), passesCompleted:acc.passesCompleted+(s.passesCompleted||0),
      passesAttempted:acc.passesAttempted+((s.passesCompleted||0)+(s.passesIncomplete||s.passesAttempted||0)),
      saves:acc.saves+(s.saves||0), goalsConceded:acc.goalsConceded+(s.goalsConceded||0),
      aerialDuelsWon:acc.aerialDuelsWon+(s.aerialDuelsWon||0),
      minutesPlayed:acc.minutesPlayed+(s.minutesPlayed||0),
    };
  },{goals:0,assists:0,shots:0,shotsOnTarget:0,tackles:0,interceptions:0,
    keyPasses:0,passesCompleted:0,passesAttempted:0,saves:0,goalsConceded:0,
    aerialDuelsWon:0,minutesPlayed:0});

  var passAcc = tots.passesAttempted>0
    ? Math.round(tots.passesCompleted/tots.passesAttempted*100)+"%"
    : "—";
  var shotConv = tots.shots>0
    ? Math.round(tots.goals/tots.shots*100)+"%" : "—";
  var avgRating = (function(){
    var ratings = playerGames.map(function(g){
      var s=(g.stats||[]).find(function(x){return x.playerId===playerId;});
      if(!s) return null;
      return calcRating(s, pos, g.theirScore===0).rating;
    }).filter(function(r){return r!==null;});
    return ratings.length ? (ratings.reduce(function(a,b){return a+b;},0)/ratings.length).toFixed(1) : "—";
  })();

  // Per-game divider
  var D = perGame ? gp : 1;
  var fmt = function(n){ return perGame ? (n/D).toFixed(1) : n; };

  // Position-specific stat blocks
  var isGK  = allPos(player).includes("GK");
  var isCB  = ["CB","FB"].some(function(p){return allPos(player).includes(p);});
  var isMid = ["CM","DM","W"].some(function(p){return allPos(player).includes(p);});

  var posStats = isGK
    ? [{l:"Saves",v:fmt(tots.saves)},{l:"Conceded",v:fmt(tots.goalsConceded)},
       {l:"Avg Rating",v:avgRating},{l:"Games",v:playerGames.length}]
    : isCB
    ? [{l:"Goals",v:fmt(tots.goals)},{l:"Tackles",v:fmt(tots.tackles)},
       {l:"Interceptions",v:fmt(tots.interceptions)},{l:"Aerials",v:fmt(tots.aerialDuelsWon)},
       {l:"Pass Acc",v:passAcc},{l:"Games",v:playerGames.length}]
    : isMid
    ? [{l:"Goals",v:fmt(tots.goals)},{l:"Assists",v:fmt(tots.assists)},
       {l:"Key Passes",v:fmt(tots.keyPasses)},{l:"Pass Acc",v:passAcc},
       {l:"Tackles",v:fmt(tots.tackles)},{l:"Games",v:playerGames.length}]
    : [{l:"Goals",v:fmt(tots.goals)},{l:"Assists",v:fmt(tots.assists)},
       {l:"Shots",v:fmt(tots.shots)},{l:"Conv",v:shotConv},
       {l:"Key Passes",v:fmt(tots.keyPasses)},{l:"Games",v:playerGames.length}];

  // Rating trend — last 5 games
  var trend = [].concat(playerGames)
    .sort(function(a,b){return (a.date||"").localeCompare(b.date||"");})
    .slice(-5)
    .map(function(g){
      var s=(g.stats||[]).find(function(x){return x.playerId===playerId;});
      if(!s) return null;
      return {r:calcRating(s,pos,g.theirScore===0).rating, opp:g.opponent, date:g.date};
    }).filter(Boolean);

  var maxR = Math.max.apply(null, trend.map(function(t){return t.r;}).concat([10]));

  // Best game
  var bestGame = playerGames.reduce(function(best,g){
    var s=(g.stats||[]).find(function(x){return x.playerId===playerId;});
    if(!s) return best;
    var r=calcRating(s,pos,g.theirScore===0).rating;
    return (!best||r>best.r)?{g:g,s:s,r:r}:best;
  },null);

  var sortedGames = [].concat(playerGames).sort(function(a,b){
    return (b.date||"").localeCompare(a.date||"");
  });

  var recLabel = {open:"Open",d1:"D1 Target",d2:"D2 Target",d3:"D3 Target",
    committed:"Committed",not_recruiting:"Not Recruiting"}[player.recruitingStatus]||"";
  var recColor = {open:A,d1:"#7c3aed",d2:"#1565c0",d3:"#2d7a3a",
    committed:"#2e7d32",not_recruiting:"#888"}[player.recruitingStatus]||A;

  var TABS=[{t:"stats",l:"Stats"},{t:"recruiting",l:"Recruiting"},
            {t:"videos",l:"Videos"},{t:"about",l:"About"}];

  return(
    <div style={{minHeight:"100vh",background:"#f7f7f7",fontFamily:"'Outfit',sans-serif"}}>

      {/* ── TOP BAR ── */}
      <div style={{background:"#fff",borderBottom:"1px solid #eee",
        padding:"10px 20px",display:"flex",alignItems:"center",
        justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:A}}/>
          <span style={{color:A,fontSize:11,fontWeight:700,letterSpacing:2}}>COACHIQ</span>
          {teamName&&<span style={{color:"#ccc",fontSize:11}}>· {teamName}</span>}
        </div>
        <button onClick={copyLink}
          style={{padding:"6px 14px",background:copied?"#27a56018":A+"18",
            border:"1px solid "+(copied?"#27a56044":A+"44"),borderRadius:20,
            color:copied?"#27a560":A,fontWeight:700,fontSize:11,cursor:"pointer"}}>
          {copied?"✓ Copied!":"⎘ Share Profile"}
        </button>
      </div>

      {/* ── HERO ── */}
      <div style={{background:"#fff",borderBottom:"1px solid #eee",padding:"20px 20px 0"}}>
        <div style={{maxWidth:600,margin:"0 auto"}}>

          {/* Name + jersey */}
          <div style={{display:"flex",gap:14,alignItems:"flex-start",marginBottom:16}}>
            <div style={{width:72,height:72,borderRadius:16,flexShrink:0,
              background:posColor+"18",border:"2px solid "+posColor+"44",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontFamily:"'Oswald',sans-serif",fontWeight:900,color:posColor,fontSize:28}}>
              #{player.number}
            </div>
            <div style={{flex:1,paddingTop:4}}>
              <h1 style={{color:"#111",fontFamily:"'Oswald',sans-serif",
                fontSize:26,fontWeight:900,margin:"0 0 4px",lineHeight:1.1}}>
                {player.name}
              </h1>
              <div style={{color:"#888",fontSize:12,marginBottom:8}}>
                {allPos(player).join(" · ")}
                {player.gradYear&&" · Class of "+player.gradYear}
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {recLabel&&(
                  <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,
                    background:recColor+"18",border:"1px solid "+recColor+"33",color:recColor}}>
                    {recLabel}
                  </span>
                )}
                <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,
                  background:"#27a56018",border:"1px solid #27a56033",color:"#27a560"}}>
                  {player.availability==="injured"?"Injured":
                   player.availability==="doubtful"?"Doubtful":
                   player.availability==="suspended"?"Suspended":"Available"}
                </span>
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0,paddingTop:4}}>
              <div style={{color:A,fontFamily:"'Oswald',sans-serif",
                fontWeight:900,fontSize:36,lineHeight:1}}>{avgRating}</div>
              <div style={{color:"#bbb",fontSize:10,fontWeight:700,marginTop:2}}>AVG RTG</div>
            </div>
          </div>

          {/* Position stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat("+posStats.length+",1fr)",
            gap:6,marginBottom:14}}>
            {posStats.map(function(item){return(
              <div key={item.l} style={{background:"#f8f8f8",borderRadius:9,
                padding:"10px 6px",textAlign:"center"}}>
                <div style={{color:item.l==="Goals"||item.l==="Assists"?A:"#111",
                  fontFamily:"'Oswald',sans-serif",fontWeight:900,
                  fontSize:item.l==="Pass Acc"||item.l==="Conv"?14:18,lineHeight:1}}>
                  {item.v}
                </div>
                <div style={{color:"#bbb",fontSize:9,fontWeight:700,
                  letterSpacing:.5,marginTop:3}}>{item.l.toUpperCase()}</div>
              </div>
            );})}
          </div>

          {/* Rating trend */}
          {trend.length>=2&&(
            <div style={{marginBottom:0,padding:"12px 0 16px",
              borderTop:"1px solid #f0f0f0"}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",marginBottom:8}}>
                <div style={{color:"#bbb",fontSize:10,fontWeight:700,letterSpacing:1}}>
                  RATING TREND (LAST {trend.length} GAMES)
                </div>
                <div style={{color:A,fontSize:11,fontWeight:700}}>
                  {trend[trend.length-1].r.toFixed(1)} latest
                </div>
              </div>
              <div style={{display:"flex",alignItems:"flex-end",gap:4,height:36}}>
                {trend.map(function(t,i){
                  var h=Math.max(10,Math.round((t.r/maxR)*100));
                  var isLatest=i===trend.length-1;
                  return(
                    <div key={i} style={{flex:1,display:"flex",flexDirection:"column",
                      alignItems:"center",gap:3}}>
                      <div style={{width:"100%",background:isLatest?A:A+"44",
                        borderRadius:"3px 3px 0 0",height:h+"%",
                        transition:"height .3s"}}/>
                      <div style={{color:"#ccc",fontSize:8,whiteSpace:"nowrap",
                        overflow:"hidden",textOverflow:"ellipsis",
                        maxWidth:"100%",textAlign:"center"}}>
                        {(t.opp||"").split(" ")[0]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={{background:"#fff",borderBottom:"1px solid #eee",
        position:"sticky",top:0,zIndex:10}}>
        <div style={{maxWidth:600,margin:"0 auto",display:"flex"}}>
          {TABS.map(function(item){return(
            <button key={item.t} onClick={function(){setTab(item.t);}}
              style={{flex:1,padding:"13px 0",background:"none",border:"none",
                borderBottom:"2px solid "+(tab===item.t?A:"transparent"),
                color:tab===item.t?A:"#999",cursor:"pointer",
                fontWeight:700,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>
              {item.l}
            </button>
          );})}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{maxWidth:600,margin:"0 auto",padding:"20px 16px 48px"}}>

        {/* STATS */}
        {tab==="stats"&&(
          <div>
            {/* Per-game toggle */}
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
              <div style={{display:"flex",background:"#f0f0f0",borderRadius:20,padding:3}}>
                <button onClick={function(){setPerGame(false);}}
                  style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",
                    background:!perGame?"#fff":"transparent",
                    color:!perGame?"#111":"#999",fontWeight:700,fontSize:11,
                    boxShadow:!perGame?"0 1px 3px rgba(0,0,0,.1)":"none"}}>
                  Season
                </button>
                <button onClick={function(){setPerGame(true);}}
                  style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",
                    background:perGame?"#fff":"transparent",
                    color:perGame?"#111":"#999",fontWeight:700,fontSize:11,
                    boxShadow:perGame?"0 1px 3px rgba(0,0,0,.1)":"none"}}>
                  Per Game
                </button>
              </div>
            </div>

            {/* Best game callout */}
            {bestGame&&(
              <div style={{background:"#fff8f3",border:"1px solid "+A+"33",
                borderRadius:12,padding:"12px 16px",marginBottom:12,
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{color:A,fontSize:10,fontWeight:700,
                    letterSpacing:1,marginBottom:3}}>BEST PERFORMANCE</div>
                  <div style={{color:"#111",fontWeight:700,fontSize:14}}>
                    vs {bestGame.g.opponent}
                    <span style={{color:"#999",fontWeight:400,fontSize:12}}> · {bestGame.g.date}</span>
                  </div>
                  <div style={{color:"#888",fontSize:12,marginTop:2}}>
                    {bestGame.s.goals||0}G · {bestGame.s.assists||0}A · {bestGame.s.tackles||0} tackles
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{color:A,fontFamily:"'Oswald',sans-serif",
                    fontWeight:900,fontSize:28,lineHeight:1}}>
                    {bestGame.r.toFixed(1)}
                  </div>
                  <div style={{color:"#bbb",fontSize:10,fontWeight:700}}>RATING</div>
                </div>
              </div>
            )}

            {sortedGames.length===0?(
              <div style={{textAlign:"center",padding:"48px 0",color:"#bbb"}}>
                <div style={{fontSize:32,marginBottom:10}}>⚽</div>
                <div style={{fontWeight:700,color:"#999",marginBottom:4}}>No stats yet</div>
                <div style={{fontSize:13}}>Stats appear here after games are logged</div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {sortedGames.map(function(g){
                  var s=(g.stats||[]).find(function(x){return x.playerId===playerId;});
                  if(!s) return null;
                  var rat=calcRating(s,pos,g.theirScore===0);
                  var win=g.ourScore>g.theirScore, loss=g.ourScore<g.theirScore;
                  var rc=win?A:loss?"#e53935":"#f57c00";
                  var rl=win?"W":loss?"L":"D";
                  var statRow = isGK
                    ? [{l:"Saves",v:s.saves||0},{l:"Conceded",v:s.goalsConceded||0},{l:"Mins",v:s.minutesPlayed||90}]
                    : [{l:"Goals",v:s.goals||0},{l:"Assists",v:s.assists||0},
                       {l:"Shots",v:s.shots||0},{l:"Tackles",v:s.tackles||0},{l:"Mins",v:s.minutesPlayed||90}];
                  return(
                    <div key={g.id} style={{background:"#fff",border:"1px solid #eee",
                      borderRadius:14,overflow:"hidden"}}>
                      <div style={{padding:"12px 14px 10px",
                        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:24,height:24,borderRadius:6,
                            background:rc+"18",display:"flex",alignItems:"center",
                            justifyContent:"center",fontWeight:900,fontSize:11,
                            color:rc,fontFamily:"'Oswald',sans-serif",flexShrink:0}}>
                            {rl}
                          </div>
                          <div>
                            <div style={{color:"#111",fontWeight:700,fontSize:13}}>
                              vs {g.opponent}
                            </div>
                            <div style={{color:"#bbb",fontSize:10,marginTop:1}}>
                              {g.date}{g.location?" · "+g.location:""}
                            </div>
                          </div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{color:rc,fontFamily:"'Oswald',sans-serif",
                            fontWeight:900,fontSize:17,lineHeight:1}}>
                            {g.ourScore}–{g.theirScore}
                          </div>
                          <div style={{color:rColor(rat.rating),
                            fontSize:11,fontWeight:700,marginTop:2}}>
                            {rat.rating.toFixed(1)} · {rat.label}
                          </div>
                        </div>
                      </div>
                      <div style={{display:"flex",background:"#f8f8f8",
                        borderTop:"1px solid #f0f0f0"}}>
                        {statRow.map(function(item,i){return(
                          <div key={item.l} style={{flex:1,padding:"8px 0",
                            textAlign:"center",
                            borderRight:i<statRow.length-1?"1px solid #eee":"none"}}>
                            <div style={{color:(item.v>0&&(item.l==="Goals"||item.l==="Assists"))?A:"#111",
                              fontWeight:900,fontSize:15,lineHeight:1,
                              fontFamily:"'Oswald',sans-serif"}}>
                              {item.v}
                            </div>
                            <div style={{color:"#bbb",fontSize:8,marginTop:2,
                              fontWeight:700,letterSpacing:.5}}>
                              {item.l.toUpperCase()}
                            </div>
                          </div>
                        );})}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* RECRUITING */}
        {tab==="recruiting"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {player.coachScoutNotes&&(
              <div style={{background:"#fff8f3",border:"1px solid "+A+"33",
                borderLeft:"3px solid "+A,borderRadius:"0 12px 12px 0",
                padding:"14px 16px"}}>
                <div style={{color:A,fontSize:10,fontWeight:700,
                  letterSpacing:2,marginBottom:6}}>COACH PROFILE</div>
                <div style={{color:"#333",fontSize:14,lineHeight:1.7}}>
                  {player.coachScoutNotes}
                </div>
              </div>
            )}
            {(player.gpa||player.height||player.weight)&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {[{l:"GPA",v:player.gpa},{l:"Height",v:player.height},
                  {l:"Weight",v:player.weight&&player.weight+" lbs"}
                ].filter(function(x){return x.v;}).map(function(x){return(
                  <div key={x.l} style={{background:"#fff",border:"1px solid #eee",
                    borderRadius:10,padding:"12px",textAlign:"center"}}>
                    <div style={{color:"#111",fontWeight:900,fontSize:18,
                      fontFamily:"'Oswald',sans-serif"}}>{x.v}</div>
                    <div style={{color:"#bbb",fontSize:10,fontWeight:700,
                      letterSpacing:1,marginTop:2}}>{x.l}</div>
                  </div>
                );})}
              </div>
            )}
            {player.highlightsUrl&&(
              <a href={player.highlightsUrl} target="_blank" rel="noopener noreferrer"
                style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",
                  background:"#fff",border:"1px solid #eee",borderRadius:12,
                  textDecoration:"none"}}>
                <div style={{width:40,height:40,borderRadius:10,background:A+"18",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  color:A,fontSize:18,flexShrink:0}}>▶</div>
                <div>
                  <div style={{color:"#111",fontWeight:700,fontSize:14}}>
                    Watch Highlights
                  </div>
                  <div style={{color:"#aaa",fontSize:11,marginTop:2,
                    overflow:"hidden",textOverflow:"ellipsis",
                    whiteSpace:"nowrap",maxWidth:240}}>
                    {player.highlightsUrl}
                  </div>
                </div>
              </a>
            )}
            {(player.recruitingSchools||[]).length>0&&(
              <div>
                <div style={{color:"#bbb",fontSize:10,fontWeight:700,
                  letterSpacing:2,marginBottom:10,paddingLeft:2}}>
                  INTERESTED SCHOOLS
                </div>
                {(player.recruitingSchools||[]).map(function(s){
                  var sc={identified:"#aaa",contacted:"#f57c00",
                    visit:A,committed:"#2e7d32"}[s.status]||"#aaa";
                  var sl={identified:"Identified",contacted:"Contacted",
                    visit:"Official Visit",committed:"Committed"}[s.status]||s.status;
                  return(
                    <div key={s.id} style={{background:"#fff",border:"1px solid #eee",
                      borderRadius:12,padding:"12px 16px",marginBottom:8,
                      display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{color:"#111",fontWeight:700,fontSize:14}}>
                          {s.school}
                        </div>
                        {s.contact&&(
                          <div style={{color:"#999",fontSize:12,marginTop:2}}>
                            Contact: {s.contact}
                          </div>
                        )}
                      </div>
                      <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                        <div style={{background:sc+"18",color:sc,fontSize:11,
                          fontWeight:700,padding:"4px 10px",borderRadius:20,
                          marginBottom:3}}>{sl}</div>
                        <div style={{color:"#ccc",fontSize:11}}>{s.division}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!player.coachScoutNotes&&!(player.recruitingSchools||[]).length
              &&!player.gpa&&!player.highlightsUrl&&(
              <div style={{textAlign:"center",padding:"48px 0",color:"#bbb"}}>
                <div style={{fontSize:32,marginBottom:10}}>🎓</div>
                <div style={{fontWeight:700,color:"#999",marginBottom:4}}>
                  Recruiting info coming soon
                </div>
                <div style={{fontSize:13}}>Your coach will add this</div>
              </div>
            )}
          </div>
        )}

        {/* VIDEOS */}
        {tab==="videos"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:14}}>
              <div style={{color:"#bbb",fontSize:10,fontWeight:700,letterSpacing:2}}>
                MY VIDEOS
              </div>
              <button onClick={function(){setAddingVid(true);}}
                style={{padding:"7px 14px",background:A,border:"none",
                  borderRadius:8,color:"#fff",fontWeight:700,fontSize:12,
                  cursor:"pointer"}}>
                + Add Link
              </button>
            </div>
            {addingVid&&(
              <div style={{background:"#fff",border:"1px solid "+A+"33",
                borderRadius:12,padding:16,marginBottom:12}}>
                <input value={newVideo.label}
                  onChange={function(e){setNewVideo(function(v){
                    return Object.assign({},v,{label:e.target.value});});}}
                  placeholder="Label (e.g. Junior Year Highlights)"
                  style={{width:"100%",padding:"10px 12px",background:"#f8f8f8",
                    border:"1px solid #eee",borderRadius:8,color:"#111",fontSize:13,
                    outline:"none",fontFamily:"'Outfit',sans-serif",
                    boxSizing:"border-box",marginBottom:8}}/>
                <input value={newVideo.url}
                  onChange={function(e){setNewVideo(function(v){
                    return Object.assign({},v,{url:e.target.value});});}}
                  placeholder="YouTube, Hudl, or any video URL"
                  style={{width:"100%",padding:"10px 12px",background:"#f8f8f8",
                    border:"1px solid #eee",borderRadius:8,color:"#111",fontSize:13,
                    outline:"none",fontFamily:"'Outfit',sans-serif",
                    boxSizing:"border-box",marginBottom:10}}/>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={addVideo}
                    disabled={savingVid||!newVideo.url.trim()}
                    style={{flex:1,padding:"9px",background:A,border:"none",
                      borderRadius:8,color:"#fff",fontWeight:700,fontSize:13,
                      cursor:"pointer"}}>
                    {savingVid?"Saving...":"Save Link"}
                  </button>
                  <button onClick={function(){setAddingVid(false);
                    setNewVideo({label:"",url:""});}}
                    style={{padding:"9px 14px",background:"#f0f0f0",border:"none",
                      borderRadius:8,color:"#666",fontSize:13,cursor:"pointer"}}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {videos.length===0&&!addingVid&&(
              <div style={{textAlign:"center",padding:"48px 0",color:"#bbb"}}>
                <div style={{width:52,height:52,borderRadius:12,background:"#f5f5f5",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  margin:"0 auto 10px",color:"#ddd",fontSize:22}}>▶</div>
                <div style={{fontWeight:700,color:"#999",marginBottom:4}}>No videos yet</div>
                <div style={{fontSize:13}}>Add your highlight links for college coaches</div>
              </div>
            )}
            {videos.map(function(v){return(
              <div key={v.id} style={{background:"#fff",border:"1px solid #eee",
                borderRadius:12,padding:"12px 14px",marginBottom:8,
                display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:40,height:40,borderRadius:9,background:A+"15",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  color:A,fontSize:16,flexShrink:0}}>▶</div>
                <div style={{flex:1,overflow:"hidden"}}>
                  <div style={{color:"#111",fontWeight:700,fontSize:13}}>{v.label}</div>
                  <a href={v.url} target="_blank" rel="noopener noreferrer"
                    style={{color:A,fontSize:11,textDecoration:"none",display:"block",
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {v.url}
                  </a>
                </div>
                <button onClick={function(){
                  saveVideos(videos.filter(function(x){return x.id!==v.id;}));}}
                  style={{background:"none",border:"none",color:"#ddd",
                    cursor:"pointer",fontSize:18,padding:4,flexShrink:0,lineHeight:1}}>
                  ×
                </button>
              </div>
            );})}
          </div>
        )}

        {/* ABOUT */}
        {tab==="about"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>

            {/* Personal bio */}
            <div style={{background:"#fff",border:"1px solid #eee",borderRadius:12,padding:"14px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",marginBottom:8}}>
                <div style={{color:"#bbb",fontSize:10,fontWeight:700,letterSpacing:2}}>
                  ABOUT ME
                </div>
                {!editBio&&(
                  <button onClick={function(){setEditBio(true);}}
                    style={{background:"none",border:"1px solid #eee",borderRadius:6,
                      padding:"4px 10px",color:"#aaa",fontSize:11,cursor:"pointer",
                      fontWeight:700}}>
                    {player.playerBio?"Edit":"+ Add Bio"}
                  </button>
                )}
              </div>
              {editBio?(
                <div>
                  <textarea value={bio}
                    onChange={function(e){setBio(e.target.value);}}
                    placeholder="Tell college coaches about yourself — your playing style, strengths, goals..."
                    rows={4}
                    style={{width:"100%",padding:"10px 12px",background:"#f8f8f8",
                      border:"1px solid #eee",borderRadius:8,color:"#111",fontSize:13,
                      outline:"none",fontFamily:"'Outfit',sans-serif",
                      boxSizing:"border-box",resize:"vertical",lineHeight:1.6,
                      marginBottom:8}}/>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={saveBio} disabled={savingBio}
                      style={{flex:1,padding:"8px",background:A,border:"none",
                        borderRadius:8,color:"#fff",fontWeight:700,fontSize:13,
                        cursor:"pointer"}}>
                      {savingBio?"Saving...":"Save"}
                    </button>
                    <button onClick={function(){setEditBio(false);setBio(player.playerBio||"");}}
                      style={{padding:"8px 14px",background:"#f0f0f0",border:"none",
                        borderRadius:8,color:"#666",fontSize:13,cursor:"pointer"}}>
                      Cancel
                    </button>
                  </div>
                </div>
              ):(
                <div style={{color:player.playerBio?"#444":"#ccc",fontSize:14,
                  lineHeight:1.7,fontStyle:player.playerBio?"normal":"italic"}}>
                  {player.playerBio||"No bio yet — tap Edit to introduce yourself to college coaches"}
                </div>
              )}
            </div>

            {/* Info */}
            <div style={{background:"#fff",border:"1px solid #eee",
              borderRadius:12,overflow:"hidden"}}>
              {[
                {l:"Position",v:allPos(player).join(", ")},
                {l:"Jersey",v:"#"+player.number},
                {l:"Graduation Year",v:player.gradYear},
                {l:"Height",v:player.height},
                {l:"Weight",v:player.weight&&player.weight+" lbs"},
                {l:"GPA",v:player.gpa},
              ].filter(function(item){return item.v;}).map(function(item,i){return(
                <div key={item.l} style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",padding:"13px 16px",
                  borderBottom:"1px solid #f5f5f5"}}>
                  <div style={{color:"#999",fontSize:13}}>{item.l}</div>
                  <div style={{color:"#111",fontSize:14,fontWeight:700}}>{item.v}</div>
                </div>
              );})}
            </div>
          </div>
        )}

        <div style={{textAlign:"center",marginTop:36,display:"flex",
          alignItems:"center",justifyContent:"center",gap:6}}>
          <div style={{width:5,height:5,borderRadius:"50%",background:A,opacity:.35}}/>
          <span style={{color:"#ccc",fontSize:11,fontWeight:700,letterSpacing:1}}>COACHIQ</span>
        </div>
      </div>
    </div>
  );
}

// ─── RECRUITING TAB COMPONENT ─────────────────────────────────────────────────
function RecruitingTab({form,setForm,
  addingSchool,setAddingSchool,newSchool,setNewSchool,addSchool,removeSchool}){

  var STATUS_COLORS = {identified:C.muted,contacted:C.warning,visit:C.accent,committed:"#66bb6a"};
  var DIVISIONS = ["D1","D2","D3","NAIA","JUCO"];
  var STATUSES  = [
    {k:"identified",l:"Identified"},{k:"contacted",l:"Contacted"},
    {k:"visit",l:"Official Visit"},{k:"committed",l:"Committed"}
  ];
  var REC_STATUSES = [
    {k:"open",l:"Open"},{k:"d1",l:"D1 Target"},{k:"d2",l:"D2 Target"},
    {k:"d3",l:"D3 Target"},{k:"committed",l:"Committed"},{k:"not_recruiting",l:"Not Recruiting"}
  ];
  var FIELDS = [
    {label:"Grad Year",key:"gradYear",ph:"e.g. 2026"},
    {label:"Height",key:"height",ph:"e.g. 72 inches"},
    {label:"Weight",key:"weight",ph:"lbs"},
    {label:"GPA",key:"gpa",ph:"e.g. 3.8"},
  ];

  function sendProfileEmail(){
    if(!form.email){ alert("No email set. Add it in the Player Info tab."); return; }
    var link=window.location.origin+window.location.pathname+"#/player/"+form.id;
    fetch("https://api.emailjs.com/api/v1.0/email/send",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        service_id:EJS_SERVICE,
        template_id:"template_invite",
        user_id:EJS_KEY,
        template_params:{to_email:form.email,player_name:form.name,profile_link:link,pin:"No PIN required"}
      })
    }).then(function(res){
      if(res.ok){ alert("Profile link sent to "+form.email+"!"); }
      else { res.text().then(function(t){ alert("Email failed ("+res.status+"): "+t); }); }
    }).catch(function(e){ alert("Email error: "+e.message); });
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>

      {/* Share profile */}
      <div style={{background:C.surface,border:"1px solid "+C.accent+"33",borderRadius:10,padding:"16px 18px"}}>
        <div style={{color:C.text,fontWeight:700,fontSize:13,marginBottom:4}}>Share Player Profile</div>
        <div style={{color:C.muted,fontSize:12,marginBottom:10,lineHeight:1.5}}>
          Share this link with {form.name} or a college coach.
        </div>
        <div style={{background:C.bg,border:"1px solid "+C.border,borderRadius:8,
          padding:"9px 12px",marginBottom:10,color:C.muted,fontSize:11,wordBreak:"break-all",lineHeight:1.6}}>
          {window.location.origin+window.location.pathname+"#/player/"+form.id}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={function(){
            var link=window.location.origin+window.location.pathname+"#/player/"+form.id;
            navigator.clipboard.writeText(link).then(function(){alert("Link copied!");}).catch(function(){alert(link);});
          }} style={{flex:1,padding:"9px",background:C.surface,border:"1px solid "+C.border,
            borderRadius:8,color:C.text,fontWeight:700,fontSize:12,cursor:"pointer"}}>
            ⎘ Copy Link
          </button>
          <button onClick={sendProfileEmail}
            style={{flex:1,padding:"9px",background:C.accent,border:"none",
              borderRadius:8,color:"#000",fontWeight:800,fontSize:12,cursor:"pointer",
              fontFamily:"'Oswald',sans-serif"}}>
            ✉ Send to Player
          </button>
        </div>
      </div>

      {/* Recruiting status */}
      <div>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:8}}>RECRUITING STATUS</label>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {REC_STATUSES.map(function(opt){return(
            <button key={opt.k} onClick={function(){setForm(function(f){return Object.assign({},f,{recruitingStatus:opt.k});});}}
              style={{padding:"6px 12px",borderRadius:7,cursor:"pointer",fontSize:11,fontWeight:700,
                background:form.recruitingStatus===opt.k?C.accent+"22":"transparent",
                border:"1px solid "+(form.recruitingStatus===opt.k?C.accent:C.border),
                color:form.recruitingStatus===opt.k?C.accent:C.muted}}>
              {opt.l}
            </button>
          );})}
        </div>
      </div>

      {/* Physical stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
        {FIELDS.map(function(f){return(
          <div key={f.key}>
            <label style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:1,display:"block",marginBottom:4}}>{f.label}</label>
            <input value={form[f.key]||""} onChange={function(e){setForm(function(prev){return Object.assign({},prev,{[f.key]:e.target.value});});}}
              placeholder={f.ph}
              style={{width:"100%",padding:"7px 8px",background:C.bg,border:"1px solid "+C.border,
                borderRadius:7,color:C.text,fontSize:12,outline:"none",
                fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}/>
          </div>
        );})}
      </div>

      {/* Highlights URL */}
      <div>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>HIGHLIGHTS VIDEO URL</label>
        <input value={form.highlightsUrl||""} onChange={function(e){setForm(function(f){return Object.assign({},f,{highlightsUrl:e.target.value});});}}
          placeholder="YouTube or Hudl link..."
          style={{width:"100%",padding:"9px 12px",background:C.bg,border:"1px solid "+C.border,
            borderRadius:7,color:C.text,fontSize:13,outline:"none",
            fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}/>
      </div>

      {/* Coach scouting notes */}
      <div>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>COACH SCOUTING NOTES</label>
        <textarea value={form.coachScoutNotes||""}
          onChange={function(e){setForm(function(f){return Object.assign({},f,{coachScoutNotes:e.target.value});});}}
          placeholder="Describe the player for college coaches..."
          rows={3}
          style={{width:"100%",padding:"9px 12px",background:C.bg,border:"1px solid "+C.border,
            borderRadius:7,color:C.text,fontSize:13,outline:"none",
            fontFamily:"'Outfit',sans-serif",boxSizing:"border-box",resize:"vertical",lineHeight:1.5}}/>
      </div>

      {/* Schools */}
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1}}>INTERESTED SCHOOLS</label>
          <button onClick={function(){setAddingSchool(true);}}
            style={{padding:"5px 10px",background:C.accent+"22",border:"1px solid "+C.accent+"44",
              borderRadius:7,color:C.accent,fontSize:11,fontWeight:700,cursor:"pointer"}}>
            + Add School
          </button>
        </div>

        {addingSchool&&(
          <div style={{background:C.bg,border:"1px solid "+C.accent+"44",borderRadius:10,padding:14,marginBottom:10}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <input value={newSchool.school}
                onChange={function(e){setNewSchool(function(s){return Object.assign({},s,{school:e.target.value});});}}
                placeholder="School name"
                style={{padding:"7px 10px",background:C.surface,border:"1px solid "+C.border,
                  borderRadius:7,color:C.text,fontSize:12,outline:"none",fontFamily:"'Outfit',sans-serif"}}/>
              <select value={newSchool.division}
                onChange={function(e){setNewSchool(function(s){return Object.assign({},s,{division:e.target.value});});}}
                style={{padding:"7px 10px",background:C.surface,border:"1px solid "+C.border,
                  borderRadius:7,color:C.text,fontSize:12,outline:"none",fontFamily:"'Outfit',sans-serif"}}>
                {DIVISIONS.map(function(d){return <option key={d}>{d}</option>;})}
              </select>
              <input value={newSchool.contact}
                onChange={function(e){setNewSchool(function(s){return Object.assign({},s,{contact:e.target.value});});}}
                placeholder="Contact name"
                style={{padding:"7px 10px",background:C.surface,border:"1px solid "+C.border,
                  borderRadius:7,color:C.text,fontSize:12,outline:"none",fontFamily:"'Outfit',sans-serif"}}/>
              <select value={newSchool.status}
                onChange={function(e){setNewSchool(function(s){return Object.assign({},s,{status:e.target.value});});}}
                style={{padding:"7px 10px",background:C.surface,border:"1px solid "+C.border,
                  borderRadius:7,color:C.text,fontSize:12,outline:"none",fontFamily:"'Outfit',sans-serif"}}>
                {STATUSES.map(function(s){return <option key={s.k} value={s.k}>{s.l}</option>;})}
              </select>
            </div>
            <input value={newSchool.notes}
              onChange={function(e){setNewSchool(function(s){return Object.assign({},s,{notes:e.target.value});});}}
              placeholder="Notes..."
              style={{width:"100%",padding:"7px 10px",background:C.surface,border:"1px solid "+C.border,
                borderRadius:7,color:C.text,fontSize:12,outline:"none",
                fontFamily:"'Outfit',sans-serif",boxSizing:"border-box",marginBottom:8}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={addSchool}
                style={{flex:1,padding:"8px",background:C.accent,border:"none",borderRadius:8,
                  color:"#000",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                Save School
              </button>
              <button onClick={function(){setAddingSchool(false);}}
                style={{padding:"8px 12px",background:C.surface,border:"1px solid "+C.border,
                  borderRadius:8,color:C.muted,fontSize:12,cursor:"pointer"}}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {(form.recruitingSchools||[]).length===0&&!addingSchool&&(
          <div style={{color:C.muted,fontSize:12,fontStyle:"italic",textAlign:"center",padding:"12px 0"}}>
            No schools added yet
          </div>
        )}

        {(form.recruitingSchools||[]).map(function(s){
          return(
            <div key={s.id} style={{background:C.surface,border:"1px solid "+C.border,borderRadius:9,
              padding:"10px 14px",marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:C.text,fontWeight:700,fontSize:13}}>{s.school}</span>
                  <span style={{color:C.muted,fontSize:11,padding:"2px 7px",border:"1px solid "+C.border,borderRadius:4}}>{s.division}</span>
                  <span style={{color:STATUS_COLORS[s.status]||C.muted,fontSize:11,fontWeight:700}}>{s.status}</span>
                </div>
                {s.contact&&<div style={{color:C.muted,fontSize:11,marginTop:2}}>Contact: {s.contact}</div>}
                {s.notes&&<div style={{color:C.muted,fontSize:11,marginTop:2,fontStyle:"italic"}}>{s.notes}</div>}
              </div>
              <button onClick={function(){removeSchool(s.id);}}
                style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:4,fontSize:16}}>
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── EDIT STATS MODAL ─────────────────────────────────────────────────────────
function EditStatsModal({editStats, setEditStats, games, setGames, roster}){
  if(!editStats) return null;

  const game = games.find(function(g){ return g.id===editStats.gameId; });
  if(!game) return null;

  var stats = editStats.stats;

  var STAT_FIELDS = [
    {k:"goals",        label:"Goals"},
    {k:"assists",      label:"Assists"},
    {k:"shots",        label:"Shots"},
    {k:"shotsOnTarget",label:"Shots on Target"},
    {k:"keyPasses",    label:"Key Passes"},
    {k:"passesCompleted",label:"Passes Completed"},
    {k:"passesAttempted",label:"Passes Attempted"},
    {k:"tackles",      label:"Tackles"},
    {k:"interceptions",label:"Interceptions"},
    {k:"aerialDuelsWon",label:"Aerial Duels Won"},
    {k:"fouls",        label:"Fouls"},
    {k:"dangerousTurnovers",label:"Turnovers"},
    {k:"saves",        label:"Saves (GK)"},
    {k:"goalsConceded",label:"Conceded (GK)"},
    {k:"minutesPlayed",label:"Minutes Played"},
  ];

  function updateStat(playerId, key, val){
    setEditStats(function(prev){
      var newStats = prev.stats.map(function(s){
        if(s.playerId===playerId) return Object.assign({},s,{[key]:parseInt(val)||0});
        return s;
      });
      return Object.assign({},prev,{stats:newStats});
    });
  }

  function save(){
    setGames(function(prev){
      return prev.map(function(g){
        if(g.id!==editStats.gameId) return g;
        return Object.assign({},g,{stats:editStats.stats});
      });
    });
    setEditStats(null);
  }

  return(
    <div style={{position:"fixed",inset:0,background:"#000000dd",zIndex:2000,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:20,
        width:"100%",maxWidth:700,maxHeight:"90vh",overflowY:"auto"}}>

        <div style={{padding:"20px 24px 16px",borderBottom:"1px solid "+C.border,
          display:"flex",justifyContent:"space-between",alignItems:"center",
          position:"sticky",top:0,background:C.card,zIndex:1}}>
          <div>
            <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2}}>
              {(editStats.stats||[]).every(function(s){return !Object.keys(s).some(function(k){return k!=="playerId"&&s[k]>0;})})?"ADD STATS":"EDIT STATS"}
            </div>
            <h3 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:20,fontWeight:800,margin:"2px 0 0"}}>
              vs {game.opponent} · {game.date}
            </h3>
          </div>
          <button onClick={function(){setEditStats(null);}}
            style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20}}>✕</button>
        </div>

        <div style={{padding:"8px 24px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{color:C.muted,fontSize:11}}>Click any number to edit. Tab between fields.</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <label style={{color:C.muted,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
              <Upload size={11}/>
              <span>Import spreadsheet instead</span>
              <input type="file" accept=".xlsx,.xls" style={{display:"none"}}
                onChange={function(e){
                  if(fileRef&&fileRef.current){
                    setAddStatsFor(editStats.gameId);
                    handleImportForGame(e,editStats.gameId);
                    setEditStats(null);
                  }
                }}/>
            </label>
          </div>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{borderBottom:"2px solid "+C.border}}>
                <th style={{padding:"10px 16px",textAlign:"left",color:C.muted,fontWeight:600,
                  fontSize:11,letterSpacing:1,position:"sticky",left:0,background:C.card,minWidth:140}}>
                  PLAYER
                </th>
                {STAT_FIELDS.map(function(f){
                  return(
                    <th key={f.k} style={{padding:"10px 8px",textAlign:"center",color:C.muted,
                      fontWeight:600,fontSize:10,letterSpacing:.5,whiteSpace:"nowrap",minWidth:70}}>
                      {f.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {stats.map(function(s){
                var player = (roster||[]).find(function(p){ return p.id===s.playerId; });
                var pos = player ? primaryPos(player) : "CM";
                var pc = POS_META[pos]||{};
                return(
                  <tr key={s.playerId} style={{borderBottom:"1px solid "+C.border}}>
                    <td style={{padding:"8px 16px",position:"sticky",left:0,background:C.card}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:28,height:28,borderRadius:7,flexShrink:0,
                          background:(pc.color||C.accent)+"22",
                          border:"1.5px solid "+(pc.color||C.accent)+"44",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontFamily:"'Oswald',sans-serif",fontWeight:900,
                          color:pc.color||C.accent,fontSize:13}}>
                          {player?player.number:"?"}
                        </div>
                        <div>
                          <div style={{color:C.text,fontWeight:600,fontSize:13,whiteSpace:"nowrap"}}>
                            {player?player.name:"Unknown"}
                          </div>
                          <div style={{color:C.muted,fontSize:10}}>{pos}</div>
                        </div>
                      </div>
                    </td>
                    {STAT_FIELDS.map(function(f){
                      return(
                        <td key={f.k} style={{padding:"6px 4px",textAlign:"center"}}>
                          <input
                            type="number" min="0" max="999"
                            value={s[f.k]||0}
                            onChange={function(e){ updateStat(s.playerId,f.k,e.target.value); }}
                            style={{width:54,padding:"5px 4px",textAlign:"center",
                              background:C.bg,border:"1px solid "+C.border,borderRadius:6,
                              color:C.text,fontSize:13,fontWeight:600,outline:"none",
                              fontFamily:"'Outfit',sans-serif"}}/>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{padding:"12px 24px 16px",borderTop:"1px solid "+C.border,
          display:"flex",gap:10,justifyContent:"space-between",alignItems:"center",
          position:"sticky",bottom:0,background:C.card,flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:8}}>
            <button onClick={function(){
              setEditStats(function(prev){
                return Object.assign({},prev,{stats:prev.stats.map(function(s){
                  return Object.assign({},s,{minutesPlayed:90});
                })});
              });
            }} style={{padding:"8px 12px",background:C.surface,border:"1px solid "+C.border,
              borderRadius:8,color:C.muted,cursor:"pointer",fontSize:11,fontWeight:700}}>
              Set All 90 min
            </button>
            <button onClick={function(){
              setEditStats(function(prev){
                return Object.assign({},prev,{stats:prev.stats.map(function(s){
                  return Object.assign({},s,{minutesPlayed:0});
                })});
              });
            }} style={{padding:"8px 12px",background:C.surface,border:"1px solid "+C.border,
              borderRadius:8,color:C.muted,cursor:"pointer",fontSize:11,fontWeight:700}}>
              Clear All Min
            </button>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={function(){setEditStats(null);}}
              style={{padding:"10px 20px",background:C.surface,border:"1px solid "+C.border,
                borderRadius:9,color:C.muted,cursor:"pointer",fontSize:13}}>
              Cancel
            </button>
            <button onClick={save}
              style={{padding:"10px 28px",background:C.accent,border:"none",
                borderRadius:9,color:"#000",fontWeight:800,fontSize:14,
                cursor:"pointer",fontFamily:"'Oswald',sans-serif",letterSpacing:.5}}>
              Save Stats →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PUBLIC SCHEDULE PAGE ─────────────────────────────────────────────────────
function PublicSchedulePage(){
  var teamId = window.location.hash.replace("#/schedule/","").split("?")[0];
  var [teamName, setTeamName] = useState("");
  var [events,   setEvents]   = useState([]);
  var [games,    setGames]    = useState([]);
  var [loading,  setLoading]  = useState(true);
  var [error,    setError]    = useState(null);

  useEffect(function(){
    async function load(){
      try{
        // Load team name
        var {data:teams}  = await supabase.from("teams").select("name").eq("id",teamId);
        setTeamName(teams?.[0]?.name||"Season Schedule");

        // Load schedule events
        var {data:schData} = await supabase.from("schedule").select("*").eq("team_id",teamId);
        var evts = (schData||[]).map(function(x){return x.data;});
        setEvents(evts);

        // Load completed games
        var {data:gData} = await supabase.from("games").select("*").eq("team_id",teamId);
        setGames((gData||[]).map(function(x){return x.data;}));
      }catch(e){ setError("Failed to load schedule."); }
      setLoading(false);
    }
    load();
  },[]);

  var today = new Date().toISOString().split("T")[0];

  // Merge schedule events + games into one list
  var allItems = [];
  (events||[]).forEach(function(e){ allItems.push(e); });
  (games||[]).filter(function(g){
    return !events.find(function(e){return e.linkedGameId===g.id;});
  }).forEach(function(g){
    allItems.push({id:"g_"+g.id,type:"game",date:g.date,time:"",
      opponent:g.opponent,location:g.location,
      result:{our:g.ourScore,their:g.theirScore},auto:true});
  });
  allItems.sort(function(a,b){return (a.date||"").localeCompare(b.date||"");});

  var upcoming = allItems.filter(function(e){return e.date>=today;});
  var past     = allItems.filter(function(e){return e.date<today;}).reverse();

  // Record
  var gamesOnly = (games||[]).filter(function(g){return g.status==="completed"||g.ourScore!==undefined;});
  var wins   = gamesOnly.filter(function(g){return g.ourScore>g.theirScore;}).length;
  var draws  = gamesOnly.filter(function(g){return g.ourScore===g.theirScore;}).length;
  var losses = gamesOnly.filter(function(g){return g.ourScore<g.theirScore;}).length;

  // Next game countdown
  var nextGame = upcoming.find(function(e){return e.type==="game"||(e.opponent);});
  var daysUntil = nextGame ? Math.ceil((new Date(nextGame.date)-new Date(today))/(1000*60*60*24)) : null;

  var A = "#ff6b00";

  function formatDate(d, t){
    if(!d) return "";
    var parts = d.split("-");
    var dt = new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var days   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    var str = days[dt.getDay()]+" "+months[dt.getMonth()]+" "+dt.getDate();
    if(t) str += " · "+formatTime(t);
    return str;
  }

  function formatTime(t){
    if(!t) return "";
    var parts = t.split(":");
    var h = parseInt(parts[0]);
    var m = parts[1];
    var ampm = h>=12?"PM":"AM";
    h = h%12||12;
    return h+":"+m+" "+ampm;
  }

  if(loading) return(
    <div style={{minHeight:"100vh",background:"#fff",display:"flex",alignItems:"center",
      justifyContent:"center",fontFamily:"'Outfit',sans-serif",flexDirection:"column",gap:14}}>
      <div style={{width:32,height:32,borderRadius:"50%",border:"3px solid "+A,
        borderTopColor:"transparent",animation:"spin .7s linear infinite"}}/>
      <div style={{color:A,fontSize:13,fontWeight:600}}>Loading schedule...</div>
    </div>
  );

  if(error) return(
    <div style={{minHeight:"100vh",background:"#fff",display:"flex",alignItems:"center",
      justifyContent:"center",fontFamily:"'Outfit',sans-serif"}}>
      <div style={{color:"#c00",fontSize:14}}>{error}</div>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:"#f7f7f7",fontFamily:"'Outfit',sans-serif"}}>

      {/* Header */}
      <div style={{background:A,padding:"28px 20px 24px"}}>
        <div style={{maxWidth:560,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:16}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:"rgba(255,255,255,.5)"}}/>
            <span style={{color:"rgba(255,255,255,.75)",fontSize:11,fontWeight:700,letterSpacing:2}}>COACHIQ</span>
          </div>
          <h1 style={{color:"#fff",fontFamily:"'Oswald',sans-serif",fontSize:28,
            fontWeight:900,margin:"0 0 4px"}}>{teamName}</h1>
          <div style={{color:"rgba(255,255,255,.75)",fontSize:13}}>Season Schedule</div>

          {/* Record strip */}
          {gamesOnly.length>0&&(
            <div style={{display:"flex",gap:0,marginTop:20,
              background:"rgba(0,0,0,.2)",borderRadius:10,overflow:"hidden",
              width:"fit-content"}}>
              {[[wins,"W","#fff"],[draws,"D","rgba(255,255,255,.7)"],[losses,"L","rgba(255,255,255,.5)"]].map(function(item){return(
                <div key={item[1]} style={{padding:"10px 20px",textAlign:"center",
                  borderRight:"1px solid C.border"}}>
                  <div style={{color:item[2],fontFamily:"'Oswald',sans-serif",
                    fontWeight:900,fontSize:22,lineHeight:1}}>{item[0]}</div>
                  <div style={{color:"rgba(255,255,255,.55)",fontSize:9,
                    fontWeight:700,letterSpacing:1,marginTop:2}}>{item[1]}</div>
                </div>
              );})}
            </div>
          )}
        </div>
      </div>

      <div style={{maxWidth:560,margin:"0 auto",padding:"20px 16px 40px"}}>

        {/* Next game countdown */}
        {nextGame&&daysUntil>=0&&(
          <div style={{background:"#fff",border:"2px solid "+A,borderRadius:14,
            padding:"16px 18px",marginBottom:20,display:"flex",
            justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{color:A,fontSize:10,fontWeight:700,letterSpacing:2,marginBottom:4}}>NEXT GAME</div>
              <div style={{color:"#111",fontWeight:800,fontSize:16}}>
                vs {nextGame.opponent||nextGame.title}
              </div>
              <div style={{color:"#999",fontSize:12,marginTop:2}}>
                {formatDate(nextGame.date, nextGame.time)}
                {nextGame.location&&" · "+nextGame.location}
              </div>
            </div>
            <div style={{textAlign:"center",flexShrink:0,marginLeft:16}}>
              <div style={{color:A,fontFamily:"'Oswald',sans-serif",
                fontWeight:900,fontSize:36,lineHeight:1}}>
                {daysUntil===0?"TODAY":daysUntil}
              </div>
              {daysUntil>0&&<div style={{color:"#aaa",fontSize:10,fontWeight:700,
                letterSpacing:1}}>DAYS</div>}
            </div>
          </div>
        )}

        {/* Add all to calendar */}
        {upcoming.length>0&&(
          <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
            <button onClick={function(){downloadICS(upcoming, teamName);}}
              style={{flex:1,padding:"10px 14px",background:"#fff",
                border:"1px solid #ddd",borderRadius:9,color:"#555",
                fontWeight:700,fontSize:12,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              ⬇ Apple / Outlook Calendar
            </button>
            {upcoming[0]&&(
              <a href={makeGoogleCalUrl(upcoming[0], teamName)}
                target="_blank" rel="noopener noreferrer"
                style={{flex:1,padding:"10px 14px",background:"#fff",
                  border:"1px solid #ddd",borderRadius:9,color:"#555",
                  fontWeight:700,fontSize:12,cursor:"pointer",textDecoration:"none",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                + Google Calendar
              </a>
            )}
          </div>
        )}

        {/* Upcoming */}
        {upcoming.length>0&&(
          <div style={{marginBottom:28}}>
            <div style={{color:"#aaa",fontSize:10,fontWeight:700,letterSpacing:2,
              marginBottom:12,paddingLeft:2}}>UPCOMING</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {upcoming.map(function(e){
                var isGame = e.type==="game"||e.opponent;
                var typeColors = {game:A,practice:"#27a560",tournament:"#7c6af5",other:"#42a5f5"};
                var color = typeColors[e.type]||A;
                var dLeft = Math.ceil((new Date(e.date)-new Date(today))/(1000*60*60*24));
                return(
                  <div key={e.id} style={{background:"#fff",border:"1px solid #eee",
                    borderRadius:12,padding:"14px 16px",
                    display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <div style={{width:8,height:8,borderRadius:"50%",
                          background:color,flexShrink:0}}/>
                        <div style={{color:"#111",fontWeight:700,fontSize:14}}>
                          {isGame?"vs "+(e.opponent||""):(e.title||"Event")}
                        </div>
                      </div>
                      <div style={{color:"#999",fontSize:12,paddingLeft:16}}>
                        {formatDate(e.date, e.time)}
                        {e.location&&" · "+e.location}
                      </div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",
                      alignItems:"flex-end",gap:6,flexShrink:0,marginLeft:12}}>
                      {dLeft===0?(
                        <span style={{background:A+"18",color:A,fontSize:10,
                          fontWeight:700,padding:"3px 8px",borderRadius:20}}>TODAY</span>
                      ):dLeft===1?(
                        <span style={{background:"#f0f0f0",color:"#555",fontSize:10,
                          fontWeight:700,padding:"3px 8px",borderRadius:20}}>TOMORROW</span>
                      ):(
                        <span style={{color:"#bbb",fontSize:11,fontWeight:700}}>
                          in {dLeft}d
                        </span>
                      )}
                      <a href={makeGoogleCalUrl(e, teamName)}
                        target="_blank" rel="noopener noreferrer"
                        style={{color:"#bbb",fontSize:10,fontWeight:700,
                          textDecoration:"none",padding:"3px 7px",
                          border:"1px solid #eee",borderRadius:5}}>
                        + GCal
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Past results */}
        {past.length>0&&(
          <div>
            <div style={{color:"#aaa",fontSize:10,fontWeight:700,letterSpacing:2,
              marginBottom:12,paddingLeft:2}}>RESULTS</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {past.filter(function(e){return e.type==="game"||e.opponent||e.result;}).map(function(e){
                var r = e.result;
                var win  = r&&r.our>r.their;
                var loss = r&&r.our<r.their;
                var draw = r&&r.our===r.their;
                var rc   = win?A:loss?"#e53935":"#f57c00";
                var rl   = win?"W":loss?"L":"D";
                return(
                  <div key={e.id} style={{background:"#fff",border:"1px solid #eee",
                    borderRadius:12,padding:"12px 16px",
                    display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{color:"#111",fontWeight:700,fontSize:14}}>
                        vs {e.opponent||""}
                      </div>
                      <div style={{color:"#bbb",fontSize:12,marginTop:2}}>
                        {formatDate(e.date, "")}
                        {e.location&&" · "+e.location}
                      </div>
                    </div>
                    {r?(
                      <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                        <div style={{color:rc,fontFamily:"'Oswald',sans-serif",
                          fontWeight:900,fontSize:18}}>{r.our}–{r.their}</div>
                        <div style={{width:28,height:28,borderRadius:7,
                          background:rc+"18",display:"flex",alignItems:"center",
                          justifyContent:"center",fontFamily:"'Oswald',sans-serif",
                          fontWeight:900,color:rc,fontSize:13}}>{rl}</div>
                      </div>
                    ):(
                      <div style={{color:"#ddd",fontSize:12}}>No result</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {upcoming.length===0&&past.length===0&&(
          <div style={{textAlign:"center",padding:"60px 0",color:"#bbb"}}>
            <div style={{fontSize:32,marginBottom:12}}>📅</div>
            <div style={{fontWeight:700,color:"#999",marginBottom:6}}>No events yet</div>
            <div style={{fontSize:13}}>The coach hasn't added any games yet</div>
          </div>
        )}

        <div style={{textAlign:"center",marginTop:40,display:"flex",
          alignItems:"center",justifyContent:"center",gap:6}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:A,opacity:.35}}/>
          <span style={{color:"#ccc",fontSize:11,fontWeight:700,letterSpacing:1}}>COACHIQ</span>
        </div>
      </div>
    </div>
  );
}

// ─── JOIN ACTIVE SESSION COMPONENT ───────────────────────────────────────────
// Shows inside LiveTrackView setup screen — lets assistants join active sessions
function JoinActiveSession({teamId, onJoin, userId}){
  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(false);

  async function endSession(sid){
    if(!window.confirm("End this session? This will remove it from the active games list.")) return;
    await supabase.from("live_sessions").update({status:"ended"}).eq("id",sid);
    setSessions(function(prev){return prev.filter(function(s){return s.id!==sid;});});
  }

  useEffect(function(){
    if(!teamId) return;
    setLoading(true);
    supabase.from("live_sessions").select("*")
      .eq("team_id", teamId)
      .eq("status", "active")
      .then(function(result){
        setSessions(result.data||[]);
        setLoading(false);
      });
  },[teamId]);

  if(loading||!sessions.length) return null;

  return(
    <div style={{marginTop:20,padding:"16px",background:C.accent+"15",
      border:"1px solid "+C.accent+"44",borderRadius:12}}>
      <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2,marginBottom:10}}>
        ACTIVE GAME IN PROGRESS
      </div>
      {sessions.map(function(s){
        var setup = s.game_setup||{};
        var isOwner = s.user_id===userId;
        return(
          <div key={s.id} style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",gap:10}}>
            <div style={{flex:1}}>
              <div style={{color:C.text,fontWeight:700,fontSize:14}}>
                vs {setup.opponent||"Unknown"}
              </div>
              <div style={{color:C.muted,fontSize:12,marginTop:2}}>
                {setup.date||""} · {setup.location||""}
                {isOwner&&<span style={{color:C.accent,marginLeft:6,fontSize:11,fontWeight:700}}>· You started this</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              <button onClick={function(){onJoin(s.id);}}
                style={{padding:"9px 14px",background:C.accent,border:"none",
                  borderRadius:9,color:"#000",fontWeight:800,fontSize:13,
                  cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
                Join →
              </button>
              {isOwner&&(
                <button onClick={function(){endSession(s.id);}}
                  style={{padding:"9px 12px",background:"transparent",
                    border:"1px solid "+C.danger+"55",borderRadius:9,
                    color:C.danger,fontWeight:700,fontSize:13,cursor:"pointer"}}
                  title="End and remove this session">
                  ✕ End
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── LIVE JOIN PAGE (no login required) ──────────────────────────────────────
// Accessible at #/live/[sessionId]
function LiveJoinPage(){
  var sessionId = window.location.hash.replace("#/live/","").split("?")[0];
  var [session,   setSessionData] = useState(null);
  var [loading,   setLoading]     = useState(true);
  var [error,     setError]       = useState(null);
  var [name,      setName]        = useState("");
  var [role,      setRole]        = useState(null);
  var [joined,    setJoined]      = useState(false);
  var [stats,     setStats]       = useState({});
  var [events,    setEvents]      = useState([]);
  var [score,     setScore]       = useState({our:0,their:0});
  var [min,       setMin]         = useState(0);
  var [activeStat,setActiveStat]  = useState(null);
  var [possession,setPossession]  = useState({home:0,away:0,current:null,lastMin:null});
  var [roster,    setRoster]      = useState([]);
  var [rtStatus,  setRtStatus]    = useState("disconnected");
  var [connectedUsers,setConnectedUsers] = useState([]);
  var [flash,     setFlash]       = useState(null);
  var [oppScorer, setOppScorer]   = useState(false);
  var [oppName,   setOppName]     = useState("");

  var A = "#ff6b00";

  var ROLES = [
    {k:"attack",   label:"Attack Analyst",   desc:"Goals, assists, shots, key passes",    color:"#ef4444",
     stats:["goals","assists","shots","shotsOnTarget","keyPasses"]},
    {k:"defence",  label:"Defence Analyst",  desc:"Tackles, interceptions, fouls, turnovers", color:"#3b82f6",
     stats:["tackles","interceptions","aerialDuelsWon","fouls","dangerousTurnovers"]},
    {k:"possession",label:"Possession Tracker",desc:"Possession timing + passing stats",   color:"#27a560",
     stats:["passesCompleted","passesIncomplete","keyPasses"]},
  ];

  var STAT_BTNS = [
    {k:"goals",label:"Goal",color:"#ef4444"},{k:"assists",label:"Assist",color:"#ef4444"},
    {k:"shots",label:"Shot",color:"#f59e0b"},{k:"shotsOnTarget",label:"On Target",color:"#f59e0b"},
    {k:"keyPasses",label:"Key Pass",color:"#8b5cf6"},
    {k:"passesCompleted",label:"Pass ✓",color:"#27a560"},{k:"passesIncomplete",label:"Pass ✗",color:"#ef4444"},
    {k:"tackles",label:"Tackle",color:"#3b82f6"},{k:"interceptions",label:"Int",color:"#3b82f6"},
    {k:"aerialDuelsWon",label:"Aerial",color:"#3b82f6"},
    {k:"fouls",label:"Foul",color:"#f59e0b"},{k:"dangerousTurnovers",label:"Bad Turn",color:"#f59e0b"},
    {k:"saves",label:"Save",color:"#a855f7"},{k:"goalsConceded",label:"Conceded",color:"#ef4444"},
  ];

  function myStats(){
    if(!role) return STAT_BTNS;
    var r = ROLES.find(function(x){return x.k===role;});
    if(!r) return STAT_BTNS;
    return STAT_BTNS.filter(function(b){return r.stats.includes(b.k);});
  }

  useEffect(function(){
    async function load(){
      try{
        var result = await supabase.from("live_sessions").select("*").eq("id",sessionId);
        if(!result.data||!result.data[0]){ setError("Session not found or already ended."); setLoading(false); return; }
        setSessionData(result.data[0]);
        var rResult = await supabase.from("rosters").select("*").eq("team_id",result.data[0].team_id);
        setRoster(rResult.data&&rResult.data[0]?rResult.data[0].players||[]:[]);
        var setup = result.data[0].game_setup||{};
        setScore({our:setup.ourScore||0,their:setup.theirScore||0});
      }catch(e){ setError("Failed to load session."); }
      setLoading(false);
    }
    load();
  },[]);

  function applyEvent(event, payload){
    if(event==="stat"){
      setStats(function(prev){
        var s=Object.assign({},prev[payload.pid]||{});
        s[payload.stat]=(s[payload.stat]||0)+payload.delta;
        return Object.assign({},prev,{[payload.pid]:s});
      });
      if(payload.stat==="goals") setScore(function(sc){return {our:sc.our+1,their:sc.their};});
      setFlash({pid:payload.pid,key:payload.stat});
      setTimeout(function(){setFlash(null);},400);
    } else if(event==="opp_goal"){
      setScore(function(sc){return {our:sc.our,their:sc.their+1};});
    } else if(event==="min_update"){
      setMin(payload.min);
    } else if(event==="possession"){
      setPossession(function(p){
        var u=Object.assign({},p);
        if(p.current&&p.lastMin!==null) u[p.current]=p[p.current]+(payload.min-p.lastMin);
        u.current=payload.team; u.lastMin=payload.min; return u;
      });
    } else if(event==="possession_end"){
      setPossession(function(p){
        if(!p.current||p.lastMin===null) return Object.assign({},p,{current:null});
        var u=Object.assign({},p);
        u[p.current]=p[p.current]+(payload.min-p.lastMin);
        u.current=null; u.lastMin=null; return u;
      });
    } else if(event==="game_ended"){
      setError("The game has ended.");
    } else if(event==="user_joined"){
      setConnectedUsers(function(prev){
        if(prev.find(function(u){return u.name===payload.name;})) return prev;
        return [...prev,{name:payload.name,role:payload.role}];
      });
      setEvents(function(ev){return [{id:Date.now(),text:"👋 "+payload.name+" joined"},...ev.slice(0,19)];});
    }
  }

  function broadcast(event, payload){
    realtimeManager.broadcast(event, payload);
    applyEvent(event, payload);
  }

  function joinSession(){
    if(!name.trim()||!role) return;
    realtimeManager.connect("game_"+sessionId, applyEvent, setRtStatus);
    broadcast("user_joined",{name:name.trim(),role:ROLES.find(function(r){return r.k===role;})?ROLES.find(function(r){return r.k===role;}).label:role});
    setJoined(true);
  }

  function logStat(pid){
    if(!activeStat) return;
    broadcast("stat",{pid:pid,stat:activeStat,delta:1,min:min});
  }

  function togglePossession(team){
    if(possession.current===team){
      broadcast("possession_end",{min:min});
    } else {
      broadcast("possession",{team:team,min:min});
    }
  }

  function possPct(){
    var total=possession.home+possession.away;
    if(!total) return {home:50,away:50};
    return {home:Math.round(possession.home/total*100),away:100-Math.round(possession.home/total*100)};
  }

  if(loading) return(
    <div style={{minHeight:"100vh",background:"#0a0a0a",display:"flex",alignItems:"center",
      justifyContent:"center",flexDirection:"column",gap:14,fontFamily:"'Outfit',sans-serif"}}>
      <div style={{width:32,height:32,borderRadius:"50%",border:"3px solid "+A,
        borderTopColor:"transparent",animation:"spin .7s linear infinite"}}/>
      <div style={{color:A,fontSize:13,fontWeight:600}}>Connecting to game...</div>
    </div>
  );

  if(error) return(
    <div style={{minHeight:"100vh",background:"#0a0a0a",display:"flex",alignItems:"center",
      justifyContent:"center",padding:24,fontFamily:"'Outfit',sans-serif",flexDirection:"column",gap:12}}>
      <div style={{color:"#ef4444",fontSize:15,textAlign:"center"}}>{error}</div>
      <a href={window.location.origin+window.location.pathname}
        style={{color:A,fontSize:13,fontWeight:700}}>← Back to CoachIQ</a>
    </div>
  );

  var setup = (session&&session.game_setup)||{};

  // ── Name + role picker ──
  if(!joined) return(
    <div style={{minHeight:"100vh",background:"#0a0a0a",fontFamily:"'Outfit',sans-serif",
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{color:A,fontSize:11,fontWeight:700,letterSpacing:2,marginBottom:8}}>COACHIQ · LIVE</div>
          <h1 style={{color:"#fff",fontFamily:"'Oswald',sans-serif",fontSize:28,fontWeight:900,marginBottom:4}}>
            Join Game
          </h1>
          <div style={{color:"#ffffff88",fontSize:14}}>vs {setup.opponent||"Opponent"} · {setup.date||""}</div>
        </div>

        <div style={{marginBottom:16}}>
          <label style={{color:"#ffffff66",fontSize:11,fontWeight:700,letterSpacing:1,display:"block",marginBottom:6}}>YOUR NAME</label>
          <input value={name} onChange={function(e){setName(e.target.value);}}
            placeholder="e.g. Coach Smith" autoFocus
            style={{width:"100%",padding:"13px 16px",background:"#1a1a1a",border:"1px solid #333",
              borderRadius:10,color:"#fff",fontSize:15,outline:"none",
              fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}/>
        </div>

        <div style={{marginBottom:24}}>
          <label style={{color:"#ffffff66",fontSize:11,fontWeight:700,letterSpacing:1,display:"block",marginBottom:10}}>YOUR ROLE</label>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {ROLES.map(function(r){return(
              <button key={r.k} onClick={function(){setRole(r.k);}}
                style={{padding:"14px 16px",background:role===r.k?r.color+"22":"#1a1a1a",
                  border:"1.5px solid "+(role===r.k?r.color:"#333"),borderRadius:11,
                  cursor:"pointer",textAlign:"left",transition:"all .12s"}}>
                <div style={{color:role===r.k?r.color:"#fff",fontWeight:800,fontSize:14,fontFamily:"'Oswald',sans-serif",marginBottom:2}}>
                  {r.label}
                </div>
                <div style={{color:"#ffffff66",fontSize:12}}>{r.desc}</div>
              </button>
            );})}
          </div>
        </div>

        <button onClick={joinSession} disabled={!name.trim()||!role}
          style={{width:"100%",padding:"15px",
            background:name.trim()&&role?A:"#1a1a1a",border:"none",borderRadius:11,
            color:name.trim()&&role?"#000":"#666",fontWeight:900,fontSize:16,
            cursor:name.trim()&&role?"pointer":"default",fontFamily:"'Oswald',sans-serif",letterSpacing:1}}>
          Join Game →
        </button>
      </div>
    </div>
  );

  // ── Live tracking screen ──
  var activeStat_def = STAT_BTNS.find(function(b){return b.k===activeStat;});
  var pct = possPct();
  var activePlayers = roster.filter(function(p){return true;});

  return(
    <div style={{height:"100vh",display:"flex",flexDirection:"column",
      background:"#0a0a0a",fontFamily:"'Outfit',sans-serif",overflow:"hidden",userSelect:"none"}}>

      {/* Top bar */}
      <div style={{background:"#111",borderBottom:"1px solid #2a2a2a",padding:"8px 12px",
        display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <div style={{color:"#ffffff55",fontSize:10,fontWeight:700,letterSpacing:2}}>COACHIQ</div>
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{color:"#ffffff66",fontSize:10,fontWeight:600}}>vs {setup.opponent||""}</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <span style={{color:"#fff",fontFamily:"'Oswald',sans-serif",fontSize:26,fontWeight:900}}>{score.our}</span>
            <span style={{color:"#666",fontSize:14}}>–</span>
            <span style={{color:"#fff",fontFamily:"'Oswald',sans-serif",fontSize:26,fontWeight:900}}>{score.their}</span>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{color:"#ffffff44",fontSize:9,fontWeight:700}}>POSSESSION</div>
          <div style={{width:80,height:6,background:"#333",borderRadius:3,overflow:"hidden",margin:"3px 0"}}>
            <div style={{height:"100%",background:A,width:pct.home+"%",transition:"width .5s",borderRadius:3}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span style={{color:A,fontSize:9,fontWeight:700}}>{pct.home}%</span>
            <span style={{color:"#3b82f6",fontSize:9,fontWeight:700}}>{pct.away}%</span>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:rtStatus==="connected"?"#27a560":"#ef4444"}}/>
          <span style={{color:"#ffffff44",fontSize:9,fontWeight:700}}>{connectedUsers.length} online</span>
        </div>
      </div>

      {/* Possession row */}
      <div style={{background:"#0a0a0a",borderBottom:"1px solid #1a1a1a",
        padding:"8px 12px",display:"flex",gap:8,flexShrink:0}}>
        <button onClick={function(){togglePossession("home");}}
          style={{flex:1,padding:"9px",borderRadius:8,cursor:"pointer",fontWeight:800,fontSize:12,
            fontFamily:"'Oswald',sans-serif",letterSpacing:.5,transition:"all .15s",
            background:possession.current==="home"?A:"#1a1000",
            border:"2px solid "+(possession.current==="home"?A:"#333"),
            color:possession.current==="home"?"#000":"#666"}}>
          🟠 HOME {possession.current==="home"?"●":""}
        </button>
        <button onClick={function(){togglePossession("away");}}
          style={{flex:1,padding:"9px",borderRadius:8,cursor:"pointer",fontWeight:800,fontSize:12,
            fontFamily:"'Oswald',sans-serif",letterSpacing:.5,transition:"all .15s",
            background:possession.current==="away"?"#3b82f6":"#0a1020",
            border:"2px solid "+(possession.current==="away"?"#3b82f6":"#333"),
            color:possession.current==="away"?"#fff":"#666"}}>
          🔵 AWAY {possession.current==="away"?"●":""}
        </button>
      </div>

      {/* Stat buttons */}
      <div style={{background:"#111",borderBottom:"1px solid #1a1a1a",padding:"8px 10px",
        display:"flex",gap:6,overflowX:"auto",flexShrink:0,WebkitOverflowScrolling:"touch"}}>
        {myStats().map(function(btn){
          var active=activeStat===btn.k;
          return(
            <button key={btn.k} onClick={function(){setActiveStat(active?null:btn.k);}}
              style={{padding:"7px 12px",borderRadius:7,cursor:"pointer",flexShrink:0,
                whiteSpace:"nowrap",fontWeight:700,fontSize:11,transition:"all .1s",
                background:active?btn.color+"33":"#1a1a1a",
                border:"2px solid "+(active?btn.color:"#333"),
                color:active?btn.color:"#888",
                boxShadow:active?"0 0 8px "+btn.color+"44":"none"}}>
              {btn.label}
            </button>
          );
        })}
      </div>

      {/* Active stat prompt */}
      <div style={{background:activeStat_def?activeStat_def.color+"18":"#0a0a0a",
        borderBottom:"1px solid "+(activeStat_def?activeStat_def.color+"22":"#1a1a1a"),
        padding:"6px 12px",flexShrink:0,minHeight:26,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        {activeStat_def
          ?<span style={{color:activeStat_def.color,fontWeight:700,fontSize:12}}>{activeStat_def.label} — tap a player</span>
          :<span style={{color:"#555",fontSize:11}}>Select a stat above then tap a player</span>}
        <span style={{color:"#555",fontSize:10,background:"#1a1a1a",padding:"2px 6px",borderRadius:4,fontWeight:700}}>
          {ROLES.find(function(r){return r.k===role;})?ROLES.find(function(r){return r.k===role;}).label:""}
        </span>
      </div>

      {/* Player grid */}
      <div style={{flex:1,overflowY:"auto",padding:10}}>
        {activePlayers.length===0?(
          <div style={{textAlign:"center",padding:"40px 0",color:"#444",fontSize:13}}>
            No roster loaded
          </div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(85px,1fr))",gap:7}}>
            {activePlayers.map(function(player){
              var s=stats[player.id]||{};
              var pc=posColor(primaryPos(player));
              var isFlash=flash&&flash.pid===player.id;
              var canLog=!!activeStat&&!!myStats().find(function(b){return b.k===activeStat;});
              return(
                <div key={player.id}
                  onClick={function(){canLog&&logStat(player.id);}}
                  style={{borderRadius:10,padding:"7px 5px 5px",display:"flex",
                    flexDirection:"column",alignItems:"center",gap:2,
                    background:isFlash?(activeStat_def?activeStat_def.color+"44":"#ff6b0044"):"#1a1a1a",
                    border:"2px solid "+(isFlash?(activeStat_def?activeStat_def.color:"#ff6b00"):canLog&&activeStat?activeStat_def?activeStat_def.color+"44":"#333":"#222"),
                    transform:isFlash?"scale(0.95)":"scale(1)",
                    transition:"all .1s",cursor:canLog?"pointer":"default",
                    opacity:canLog||!activeStat?1:0.35}}>
                  <div style={{width:42,height:42,borderRadius:9,background:pc+"22",
                    border:"2px solid "+pc+"55",display:"flex",alignItems:"center",
                    justifyContent:"center",fontFamily:"'Oswald',sans-serif",
                    fontWeight:900,color:pc,fontSize:20}}>
                    {player.number}
                  </div>
                  <div style={{color:"#ccc",fontWeight:700,fontSize:10,textAlign:"center",
                    maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {player.name.split(" ")[0]}
                  </div>
                  {activeStat&&(
                    <div style={{color:activeStat_def?activeStat_def.color:"#ff6b00",
                      fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:18,lineHeight:1}}>
                      {s[activeStat]||0}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Match feed */}
      {events.length>0&&(
        <div style={{background:"#111",borderTop:"1px solid #1a1a1a",
          padding:"6px 12px",maxHeight:80,overflowY:"auto",flexShrink:0}}>
          {events.slice(0,3).map(function(ev){return(
            <div key={ev.id} style={{color:"#555",fontSize:11,lineHeight:1.6}}>{ev.text}</div>
          );})}
        </div>
      )}
    </div>
  );
}