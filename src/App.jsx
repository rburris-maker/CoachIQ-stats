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
  Check, Activity, Plus, Zap, Upload, Download, FileSpreadsheet, X, ClipboardList, UserPlus, Trash2, Pencil, Save, ChevronDown, Settings, BookOpen, Dumbbell, ChevronUp, AlignLeft
} from "lucide-react";
import * as XLSX from "xlsx";

// ─── EMAILJS CONFIG ───────────────────────────────────────────────────────────
const EJS_SERVICE  = "service_67o2kbq";
const EJS_TEMPLATE = "template_xlcc4wg";
const EJS_KEY      = "XdWTyjACtwXgLPPkV";

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
  return(
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{filter:glow?"drop-shadow(0 0 8px #ff6b0077)":"none",flexShrink:0}}>
      {/* Shield */}
      <path d="M50 6 L88 20 L88 52 C88 72 70 88 50 95 C30 88 12 72 12 52 L12 20 Z"
        fill="url(#shieldGrad)" stroke="#ff6b00" strokeWidth="2.5"/>
      {/* Shield inner highlight */}
      <path d="M50 14 L80 25 L80 52 C80 68 65 81 50 87 C35 81 20 68 20 52 L20 25 Z"
        fill="none" stroke="#ff8c0033" strokeWidth="1"/>
      {/* Bar chart bars */}
      <rect x="24" y="62" width="12" height="20" rx="2" fill="#ff6b00" opacity="0.9"/>
      <rect x="40" y="52" width="12" height="30" rx="2" fill="#ff8c00" opacity="0.95"/>
      <rect x="56" y="44" width="12" height="38" rx="2" fill="#ffb300"/>
      {/* Trend arrow */}
      <path d="M22 68 L44 50 L58 56 L76 34" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>
      <path d="M70 30 L78 32 L76 40" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9"/>
      {/* Soccer ball */}
      <circle cx="50" cy="22" r="14" fill="#fff" stroke="#e0e0e0" strokeWidth="1"/>
      <path d="M50 8 L52 14 L58 12 L56 18 L62 20 L56 22 L58 28 L52 26 L50 32 L48 26 L42 28 L44 22 L38 20 L44 18 L42 12 L48 14 Z"
        fill="#1a1a2e" opacity="0.75"/>
      <circle cx="50" cy="22" r="14" fill="none" stroke="#ff6b00" strokeWidth="1.5" opacity="0.4"/>
      {/* Gradients */}
      <defs>
        <linearGradient id="shieldGrad" x1="50" y1="6" x2="50" y2="95" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1a0800"/>
          <stop offset="100%" stopColor="#0a0400"/>
        </linearGradient>
      </defs>
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
    bg:"#f4ede4", surface:"#ffffff", card:"#fdf8f4",
    border:"#ddc9b0", accent:"#c94d00", accent2:"#a33800",
    danger:"#bb1100", warning:"#c4620a", text:"#180c00", muted:"#6b3d1e",
    sidebar:"#18090a", sidebarBorder:"#2a1200", topbar:"#ffffff",
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
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
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
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
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
function GamesView({games,setGames,teamName:activeTeamName,roster:activeRoster}){
  const [sel,setSel]=useState(null);
  const [aiTxt,setAiTxt]=useState("");
  const [loading,setLoading]=useState(false);
  const [expanded,setExpanded]=useState(null);
  const [importing,setImporting]=useState(false);
  const [importMsg,setImportMsg]=useState(null); // {type:"ok"|"err", text}
  const [sending,setSending]=useState(false);
  const [sendMsg,setSendMsg]=useState(null);
  const fileRef=useRef(null);

  async function sendReports(game, roster, teamName, allGames){
    const playersWithEmail = roster.filter(p=>p.email&&p.email.trim());
    if(!playersWithEmail.length){
      setSendMsg({type:"err", text:"No players have email addresses. Add them in the Roster tab."});
      return;
    }
    setSending(true); setSendMsg(null);
    let sent=0, failed=0;
    for(const player of playersWithEmail){
      const st = game.stats.find(s=>s.playerId===player.id);
      if(!st) continue;
      const cs  = isCS(game, player.id);
      const {rating, label, coachNote, breakdown} = calcRating(st, primaryPos(player), cs);
      const seasonAvg   = avgRating(player.id, allGames||[game]);
      const gamesPlayed = (allGames||[game]).filter(g=>g.status==="completed"&&g.stats.find(s=>s.playerId===player.id)).length;
      const passAtt  = (st.passesCompleted||0)+(st.passesIncomplete||st.passesAttempted||0);
      const passAccStr = passAtt>0 ? `${Math.round((st.passesCompleted/passAtt)*100)}%` : "N/A";
      const isGK = allPos(player).includes("GK");

      const fmt = n => n >= 0 ? `+${n}` : String(n);

      try{
        await sendPlayerEmail({
          // Routing
          to_email:      player.email.trim(),
          to_name:       player.name,
          // Game info
          player_name:   player.name,
          team_name:     teamName||"Your Team",
          game_opponent: game.opponent,
          game_date:     game.date,
          game_location: game.location,
          // Rating
          rating:        rating.toFixed(1),
          rating_label:  label,
          // Score breakdown
          attack:        fmt(breakdown.attack),
          possession:    fmt(breakdown.possession),
          defensive:     fmt(breakdown.defensive),
          bonus:         fmt(breakdown.bonus),
          errors:        fmt(breakdown.errors),
          // Individual stats — each sent separately for clean HTML layout
          stat_goals:       String(st.goals),
          stat_assists:     String(st.assists),
          stat_shots:       String(st.shots),
          stat_shots_ot:    String(st.shotsOnTarget),
          stat_key_passes:  String(st.keyPasses||0),
          stat_pass_comp:   String(st.passesCompleted),
          stat_pass_att:    String(passAtt),
          stat_pass_acc:    passAccStr,
          stat_tackles:     String(st.tackles),
          stat_ints:        String(st.interceptions),
          stat_aerials:     String(st.aerialDuelsWon||0),
          stat_fouls:       String(st.fouls||0),
          stat_turns:       String(st.dangerousTurnovers||0),
          stat_saves:       String(st.saves||0),
          stat_conceded:    String(st.goalsConceded||0),
          stat_minutes:     String(st.minutesPlayed||90),
          stat_is_gk:       isGK ? "true" : "false",
          // Coach note
          coach_note:    coachNote,
          // Season context
          season_avg:    seasonAvg.toFixed(1),
          games_played:  String(gamesPlayed),
        });
        sent++;
      }catch(e){
        console.error("Email failed for", player.name, e);
        failed++;
      }
      await new Promise(r=>setTimeout(r,400));
    }
    setSending(false);
    if(failed===0) setSendMsg({type:"ok", text:`✓ Match reports sent to ${sent} player${sent!==1?"s":""}`});
    else setSendMsg({type:"err", text:`Sent ${sent}, failed ${failed}. Check player emails in Roster.`});
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

  async function genAI(game){
    setLoading(true);setAiTxt("");
    try{
      const summary=game.stats.map(s=>{
        const p=PLAYERS.find(x=>x.id===s.playerId);
        const cs=isCS(game,s.playerId);
        const {rating,coachNote}=calcRating(s,primaryPos(p),cs);
        return `${p?.name}(${allPos(p).join("/")}) ${rating}/10 – ${coachNote}`;
      }).join("\n");
      const prompt=`You are a professional soccer coach analyst. Match: Marion FC ${game.ourScore}–${game.theirScore} ${game.opponent} (${game.formation})\n\nPlayer ratings:\n${summary}\n\nGive 4 sharp bullet-point coaching insights. Cover: tactical pattern, top performer, main weakness, one lineup change recommendation. Each bullet max 20 words. Be direct.`;
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:500,messages:[{role:"user",content:prompt}]})
      });
      const data=await res.json();
      setAiTxt(data.content?.[0]?.text||"Analysis unavailable.");
    }catch{setAiTxt("• Defensive shape was compact and well-organised throughout\n• Midfield press created key turnovers in dangerous areas\n• Final third decision-making was inconsistent\n• Recommend higher striker press to reduce opponent build-up");}
    setLoading(false);
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
        <button onClick={()=>{setSel(null);setAiTxt("");setExpanded(null);}} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",color:C.text,cursor:"pointer",marginBottom:20,fontSize:13}}>← Back</button>

        <div style={{background:`linear-gradient(135deg,#0d0400,#1a0800)`,border:`1px solid ${C.border}`,borderRadius:16,padding:"20px 24px",marginBottom:16}}>
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
          <div style={{display:"flex",gap:14,marginTop:16,flexWrap:"wrap"}}>
            {[["Shots",tSh],["On Target",tSoT],["Pass Acc.",`${pacc}%`],["Passes",tPC]].map(([l,v])=>(
              <div key={l} style={{background:"#ffffff08",borderRadius:8,padding:"8px 14px"}}>
                <div style={{color:"#ffffff66",fontSize:10,fontWeight:600}}>{l}</div>
                <div style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:20,fontWeight:700}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI panel */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"flex",alignItems:"center",gap:7}}><Cpu size={12}/>AI MATCH ANALYSIS</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>sendReports(game,activeRoster||PLAYERS,activeTeamName,games)} disabled={sending}
                style={{background:"#42a5f522",border:"1px solid #42a5f544",borderRadius:8,padding:"6px 12px",
                  color:"#42a5f5",cursor:"pointer",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:6}}>
                {sending?<><RefreshCw size={12} style={{animation:"spin 1s linear infinite"}}/>Sending…</>:<>✉ Send Reports</>}
              </button>
              <button onClick={()=>genAI(game)} disabled={loading} style={{background:C.accent+"22",border:`1px solid ${C.accent}44`,borderRadius:8,padding:"6px 12px",color:C.accent,cursor:"pointer",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:6}}>
                {loading?<><RefreshCw size={12} style={{animation:"spin 1s linear infinite"}}/>Analyzing…</>:<><Zap size={12}/>Generate</>}
              </button>
            </div>
          </div>
          {sendMsg&&(
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            background:sendMsg.type==="ok"?C.accent+"15":C.danger+"15",
            border:`1px solid ${sendMsg.type==="ok"?C.accent:C.danger}44`,
            borderRadius:8,padding:"10px 14px",marginBottom:10}}>
            <span style={{color:sendMsg.type==="ok"?C.accent:C.danger,fontWeight:600,fontSize:13}}>{sendMsg.text}</span>
            <button onClick={()=>setSendMsg(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer"}}><X size={13}/></button>
          </div>
        )}
        {aiTxt?<div style={{color:C.text,fontSize:13,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{aiTxt}</div>
               :<div style={{color:C.muted,fontSize:13,fontStyle:"italic"}}>Click Generate to get AI coaching insights based on the rating breakdowns.</div>}
        </div>

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
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
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
      {/* Header row with title + import toolbar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:20}}>
        <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:26,fontWeight:700,margin:0}}>Season Games</h2>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
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
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} style={{display:"none"}}/>
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
              <div onClick={()=>setSel(game.id)} style={{flex:1,cursor:"pointer"}}>
                <div style={{color:C.text,fontWeight:700,fontSize:15}}>vs {game.opponent}</div>
                <div style={{color:C.muted,fontSize:12,marginTop:2,display:"flex",gap:12}}>
                  <span style={{display:"flex",alignItems:"center",gap:4}}><Calendar size={11}/>{game.date}</span>
                  <span style={{display:"flex",alignItems:"center",gap:4}}><MapPin size={11}/>{game.location}</span>
                  <span>{game.formation}</span>
                </div>
              </div>
              <div onClick={()=>setSel(game.id)} style={{color:C.text,fontSize:22,fontWeight:900,fontFamily:"'Oswald',sans-serif",cursor:"pointer"}}>{game.ourScore} – {game.theirScore}</div>
              <ChevronRight onClick={()=>setSel(game.id)} size={16} color={C.muted} style={{cursor:"pointer"}}/>
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
function LiveTrackView({games,setGames}){
  const [live,setLive]           = useState(null);
  const [stats,setStats]         = useState({});
  const [min,setMin]             = useState(0);
  const [autoMin,setAutoMin]     = useState(false);
  const [events,setEvents]       = useState([]);
  const [form,setForm]           = useState({opponent:"",location:"Home",formation:"4-3-3",date:new Date().toISOString().split("T")[0]});
  const [activeStat,setActiveStat] = useState(null);
  const [benched,setBenched]     = useState(new Set());
  const [subLog,setSubLog]       = useState([]); // [{pid, on:bool, minute}]
  const [playerMins,setPlayerMins] = useState({}); // {pid: {startMin, totalMins}}
  const [halfTime,setHalfTime]   = useState(false);
  const [endConfirm,setEndConfirm] = useState(false);
  const [flash,setFlash]         = useState(null);
  const timerRef                 = useRef(null);

  // Auto-minute ticker
  useEffect(()=>{
    if(autoMin && live && !halfTime){
      timerRef.current = setInterval(()=>{
        setMin(m=>{ if(m>=120){ setAutoMin(false); return 120; } return m+1; });
      }, 60000);
    } else {
      clearInterval(timerRef.current);
    }
    return ()=>clearInterval(timerRef.current);
  },[autoMin, live, halfTime]);

  // Stat buttons — shown across the top
  // Grouped stat buttons — label only, no emoji, Attack last
  const STAT_GROUPS_LIVE = [
    { group:"Passing",    color:"#66bb6a", stats:[
      { k:"passesCompleted",   label:"Pass"     },
      { k:"passesIncomplete",  label:"Incomplete"},
      { k:"keyPasses",         label:"Key Pass" },
    ]},
    { group:"Defence",    color:"#42a5f5", stats:[
      { k:"tackles",           label:"Tackle"   },
      { k:"interceptions",     label:"Int"      },
      { k:"aerialDuelsWon",    label:"Aerial"   },
    ]},
    { group:"Discipline", color:"#ffa502", stats:[
      { k:"fouls",             label:"Foul"     },
      { k:"dangerousTurnovers",label:"Bad Turn" },
    ]},
    { group:"GK",         color:"#ffb300", stats:[
      { k:"saves",             label:"Save",    gkOnly:true },
      { k:"goalsConceded",     label:"Conceded",gkOnly:true },
    ]},
    { group:"Attack",     color:"#ff6b00", stats:[
      { k:"shotsOnTarget",     label:"On Target"},
      { k:"shots",             label:"Shot"     },
      { k:"assists",           label:"Assist"   },
      { k:"goals",             label:"Goal"     },
    ]},
  ];
  const STAT_BTNS = STAT_GROUPS_LIVE.flatMap(g=>g.stats.map(s=>({...s,color:g.color})));

  function syncPassAtt(s){
    return {...s, passesAttempted:(s.passesCompleted||0)+(s.passesIncomplete||0)};
  }

  function logStat(pid){
    if(!activeStat) return;
    const key = activeStat;
    setStats(prev=>{
      let s={...prev[pid],[key]:(prev[pid][key]||0)+1};
      if(key==="passesCompleted"||key==="passesIncomplete") s=syncPassAtt(s);
      if(key==="goals"){
        const pn=PLAYERS.find(x=>x.id===pid)?.name;
        setEvents(ev=>[{id:Date.now(),text:`⚽ GOAL — ${pn} (${min}')`},...ev]);
        setLive(g=>({...g,ourScore:g.ourScore+1}));
      }
      return {...prev,[pid]:s};
    });
    // Flash feedback
    setFlash({pid,key});
    setTimeout(()=>setFlash(null),400);
  }

  function undoLast(){
    if(!events.length) return;
    // just pop the last goal event visually — full undo is complex, keep simple
    const last = events[0];
    if(last.text.includes("GOAL")){
      setLive(g=>({...g,ourScore:Math.max(0,g.ourScore-1)}));
    }
    setEvents(ev=>ev.slice(1));
  }

  function startGame(){
    if(!form.opponent)return;
    const init={};
    const initMins={};
    PLAYERS.forEach(p=>{
      init[p.id]={playerId:p.id,goals:0,assists:0,shots:0,shotsOnTarget:0,keyPasses:0,passesCompleted:0,passesAttempted:0,passesIncomplete:0,tackles:0,interceptions:0,aerialDuelsWon:0,dangerousTurnovers:0,fouls:0,saves:0,goalsConceded:0,minutesPlayed:0};
      initMins[p.id]={startMin:0,totalMins:0};
    });
    setLive({id:`g${Date.now()}`,...form,ourScore:0,theirScore:0,status:"live"});
    setStats(init);setMin(0);setAutoMin(false);setEvents([]);
    setBenched(new Set());setSubLog([]);setPlayerMins(initMins);
    setHalfTime(false);setActiveStat(null);
  }

  function toggleBench(pid, e){
    e && e.stopPropagation();
    setBenched(prev=>{
      const isBenched = prev.has(pid);
      const n = new Set(prev);
      if(isBenched){
        // Coming ON — record sub-on minute
        n.delete(pid);
        setSubLog(sl=>[...sl,{pid, on:true,  minute:min}]);
        setPlayerMins(pm=>({...pm,[pid]:{...pm[pid], startMin:min}}));
        setEvents(ev=>{
          const pn=PLAYERS.find(x=>x.id===pid)?.name;
          return [{id:Date.now(),text:`↑ SUB ON — ${pn} (${min}')`},...ev];
        });
      } else {
        // Going OFF — accumulate minutes played
        n.add(pid);
        setSubLog(sl=>[...sl,{pid, on:false, minute:min}]);
        setPlayerMins(pm=>{
          const start = pm[pid]?.startMin || 0;
          const prev  = pm[pid]?.totalMins || 0;
          return {...pm,[pid]:{startMin:null, totalMins:prev+(min-start)}};
        });
        setEvents(ev=>{
          const pn=PLAYERS.find(x=>x.id===pid)?.name;
          return [{id:Date.now(),text:`↓ SUB OFF — ${pn} (${min}')`},...ev];
        });
      }
      return n;
    });
  }

  function doHalfTime(){
    // Bank minutes for all active players at 45'
    setPlayerMins(pm=>{
      const updated={...pm};
      PLAYERS.forEach(p=>{
        if(!benched.has(p.id)){
          const start = updated[p.id]?.startMin ?? 0;
          updated[p.id]={startMin:45, totalMins:(updated[p.id]?.totalMins||0)+(45-start)};
        }
      });
      return updated;
    });
    setMin(45);setAutoMin(false);setHalfTime(true);
    setEvents(ev=>[{id:Date.now(),text:"── Half Time ──"},...ev]);
  }

  function startSecondHalf(){
    // Resume — set startMin to 45 for all currently active players
    setPlayerMins(pm=>{
      const updated={...pm};
      PLAYERS.forEach(p=>{
        if(!benched.has(p.id)) updated[p.id]={...updated[p.id], startMin:45};
      });
      return updated;
    });
    setHalfTime(false);
  }

  function endGame(){
    // Final minute accumulation for all active players
    const finalMins={};
    PLAYERS.forEach(p=>{
      const pm = playerMins[p.id]||{};
      if(!benched.has(p.id)){
        const start = pm.startMin ?? 0;
        finalMins[p.id] = (pm.totalMins||0) + (min - start);
      } else {
        finalMins[p.id] = pm.totalMins || 0;
      }
    });
    const sa=PLAYERS.map(p=>({...stats[p.id], minutesPlayed: finalMins[p.id]||0}));
    setGames(prev=>[{...live,status:"completed",stats:sa},...prev]);
    setLive(null);setEndConfirm(false);setAutoMin(false);
  }

  // ── Setup screen ──────────────────────────────────────────────────────────
  if(!live) return(
    <div style={{padding:24,maxWidth:500,margin:"0 auto"}}>
      <div style={{marginBottom:22}}>
        <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2}}>LIVE TRACKER</div>
        <h1 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:28,fontWeight:800,marginTop:4}}>New Game</h1>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>OPPONENT</label>
        <input value={form.opponent} onChange={e=>setForm(f=>({...f,opponent:e.target.value}))}
          placeholder="e.g. City FC"
          style={{width:"100%",padding:"12px 14px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,color:C.text,fontSize:15,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}/>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>DATE</label>
        <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}
          style={{width:"100%",padding:"12px 14px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,color:C.text,fontSize:15,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}/>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>LOCATION</label>
        <div style={{display:"flex",gap:8}}>
          {["Home","Away"].map(l=>(
            <button key={l} onClick={()=>setForm(f=>({...f,location:l}))}
              style={{flex:1,padding:"11px",background:form.location===l?C.accent+"22":C.card,border:`1px solid ${form.location===l?C.accent:C.border}`,borderRadius:9,color:form.location===l?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:14}}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div style={{marginBottom:28}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>FORMATION</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {["4-3-3","4-4-2","4-2-3-1","3-5-2","5-3-2"].map(f=>(
            <button key={f} onClick={()=>setForm(g=>({...g,formation:f}))}
              style={{padding:"9px 16px",background:form.formation===f?C.accent+"22":C.card,border:`1px solid ${form.formation===f?C.accent:C.border}`,borderRadius:9,color:form.formation===f?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:13}}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <button onClick={startGame} disabled={!form.opponent}
        style={{width:"100%",padding:"16px",background:form.opponent?C.accent:"#2a1000",border:"none",borderRadius:11,color:form.opponent?"#000":C.muted,fontWeight:900,fontSize:17,cursor:form.opponent?"pointer":"default",fontFamily:"'Oswald',sans-serif",letterSpacing:1}}>
        KICK OFF →
      </button>
    </div>
  );

  // ── Live screen ───────────────────────────────────────────────────────────
  const activeStat_def = STAT_BTNS.find(b=>b.k===activeStat);
  const activePlayers  = PLAYERS.filter(p=>!benched.has(p.id));
  const benchPlayers   = PLAYERS.filter(p=>benched.has(p.id));

  return(
    <div style={{height:"calc(100vh - 56px)",display:"flex",flexDirection:"column",overflow:"hidden",userSelect:"none"}}>

      {/* ── Match bar ─────────────────────────────────────────────────── */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"8px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        {/* Time + auto-min toggle */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          <div style={{display:"flex",alignItems:"center",gap:3}}>
            <button onClick={()=>setMin(m=>Math.max(0,m-1))} style={{width:20,height:20,borderRadius:4,background:C.border,border:"none",color:C.text,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
            <span style={{color:C.text,fontWeight:900,fontFamily:"'Oswald',sans-serif",fontSize:22,minWidth:40,textAlign:"center"}}>{min}'</span>
            <button onClick={()=>setMin(m=>Math.min(m+1,120))} style={{width:20,height:20,borderRadius:4,background:C.accent+"33",border:`1px solid ${C.accent}44`,color:C.accent,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900}}>+</button>
          </div>
          <button onClick={()=>setAutoMin(a=>!a)}
            style={{padding:"2px 8px",borderRadius:5,border:`1px solid ${autoMin?C.accent:C.border}`,
              background:autoMin?C.accent+"22":"transparent",
              color:autoMin?C.accent:C.muted,fontSize:9,fontWeight:700,cursor:"pointer"}}>
            {autoMin?"⏱ AUTO":"⏱ AUTO"}
          </button>
        </div>

        {/* Score */}
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:1}}>vs {live.opponent.toUpperCase()}</div>
          <div style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:26,fontWeight:900,lineHeight:1.1}}>
            {live.ourScore}<span style={{color:C.muted,margin:"0 5px",fontSize:16}}>–</span>{live.theirScore}
          </div>
        </div>

        {/* Controls */}
        <div style={{display:"flex",flexDirection:"column",gap:5,alignItems:"flex-end"}}>
          <div style={{display:"flex",gap:5}}>
            <button onClick={()=>setLive(g=>({...g,theirScore:g.theirScore+1}))}
              style={{padding:"5px 9px",background:C.danger+"22",border:`1px solid ${C.danger}44`,borderRadius:6,color:C.danger,cursor:"pointer",fontWeight:700,fontSize:11}}>+OPP</button>
            {!halfTime
              ? <button onClick={doHalfTime}
                  style={{padding:"5px 9px",background:"#1a1400",border:`1px solid ${C.warning}44`,borderRadius:6,color:C.warning,cursor:"pointer",fontWeight:700,fontSize:11}}>HT</button>
              : <button onClick={startSecondHalf}
                  style={{padding:"5px 9px",background:C.accent+"22",border:`1px solid ${C.accent}44`,borderRadius:6,color:C.accent,cursor:"pointer",fontWeight:700,fontSize:11}}>2nd Half</button>
            }
          </div>
          <button onClick={()=>setEndConfirm(true)}
            style={{padding:"5px 9px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,cursor:"pointer",fontWeight:700,fontSize:11}}>End</button>
        </div>
      </div>

      {/* Halftime banner */}
      {halfTime&&(
        <div style={{background:C.surface,borderBottom:`1px solid ${C.warning}44`,padding:"7px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <span style={{color:C.warning,fontWeight:700,fontSize:13}}>── Half Time ──</span>
          <button onClick={startSecondHalf}
            style={{padding:"5px 14px",background:C.accent,border:"none",borderRadius:7,color:"#000",fontWeight:800,fontSize:12,cursor:"pointer"}}>
            Start 2nd Half →
          </button>
        </div>
      )}

      {/* End confirm */}
      {endConfirm&&(
        <div style={{background:C.surface,borderBottom:`1px solid ${C.danger}44`,padding:"8px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexShrink:0}}>
          <span style={{color:C.text,fontSize:13}}>Save and end this game?</span>
          <div style={{display:"flex",gap:8}}>
            <button onClick={endGame} style={{padding:"6px 14px",background:C.accent,border:"none",borderRadius:7,color:"#000",fontWeight:800,fontSize:13,cursor:"pointer"}}>Save & End</button>
            <button onClick={()=>setEndConfirm(false)} style={{padding:"6px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:7,color:C.muted,fontWeight:700,fontSize:13,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Stat selector strip ───────────────────────────────────────── */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"8px 10px",display:"flex",gap:10,overflowX:"auto",flexShrink:0,WebkitOverflowScrolling:"touch",alignItems:"flex-start"}}>
        {STAT_GROUPS_LIVE.map(group=>{
          const visibleStats = group.stats.filter(b=>!b.gkOnly||PLAYERS.some(p=>allPos(p).includes("GK")&&!benched.has(p.id)));
          if(!visibleStats.length) return null;
          return(
            <div key={group.group} style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
              {/* Group label */}
              <div style={{color:group.color,fontSize:9,fontWeight:700,letterSpacing:1,textTransform:"uppercase",paddingLeft:2}}>{group.group}</div>
              {/* Stat buttons in a row */}
              <div style={{display:"flex",gap:4}}>
                {visibleStats.map(btn=>{
                  const active = activeStat===btn.k;
                  return(
                    <button key={btn.k}
                      onClick={()=>setActiveStat(active?null:btn.k)}
                      style={{padding:"7px 12px",borderRadius:8,cursor:"pointer",flexShrink:0,
                        transition:"all .12s",whiteSpace:"nowrap",
                        background: active ? group.color+"33" : C.card,
                        border: `2px solid ${active ? group.color : C.border}`,
                        color: active ? group.color : C.muted,
                        fontWeight:700,fontSize:12,
                        boxShadow: active ? `0 0 8px ${group.color}44` : "none"}}>
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
      <div style={{background: activeStat_def ? activeStat_def.color+"18" : C.bg,
        borderBottom:`1px solid ${activeStat_def ? activeStat_def.color+"33" : C.border}`,
        padding:"6px 14px",flexShrink:0,minHeight:32,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        {activeStat_def
          ? <span style={{color:activeStat_def.color,fontWeight:700,fontSize:13}}>
              {activeStat_def.emoji} {activeStat_def.label} — tap a player
            </span>
          : <span style={{color:C.muted,fontSize:12}}>← Select a stat above, then tap the player</span>
        }
        {events.length>0&&(
          <button onClick={undoLast} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"2px 8px",color:C.muted,fontSize:11,cursor:"pointer"}}>↩ Undo</button>
        )}
      </div>

      {/* ── Player grid ───────────────────────────────────────────────── */}
      <div style={{flex:1,overflowY:"auto",padding:"10px"}}>

        {/* Active players grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:8,marginBottom:benched.size>0?16:0}}>
          {activePlayers.map(player=>{
            const s   = stats[player.id]||{};
            const cs  = live.theirScore===0;
            const {rating} = calcRating({...s,minutesPlayed:min},primaryPos(player),cs);
            const rc  = rColor(rating);
            const pc  = posColor(primaryPos(player));
            const val = activeStat ? (s[activeStat]||0) : null;
            const isFlashing = flash?.pid===player.id;
            const canLog = !!activeStat && !(STAT_BTNS.find(b=>b.k===activeStat)?.gkOnly && !allPos(player).includes("GK"));

            // Calculate minutes on pitch
            const minsOnPitch = (()=>{
              const pm = playerMins[player.id];
              if(!pm) return 0;
              const start = pm.startMin ?? 0;
              const acc   = pm.totalMins || 0;
              return acc + (min - start);
            })();

            return(
              <div key={player.id}
                style={{borderRadius:12,padding:"8px 6px 6px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                  position:"relative",transition:"all .1s",
                  background: isFlashing ? (activeStat_def?.color||C.accent)+"44" : activeStat&&canLog ? C.surface : C.card,
                  border: `2px solid ${isFlashing ? (activeStat_def?.color||C.accent) : activeStat&&canLog ? (activeStat_def?.color||C.accent)+"44" : C.border}`,
                  transform: isFlashing ? "scale(0.95)" : "scale(1)",
                  opacity: canLog||!activeStat ? 1 : 0.35}}>

                {/* Bench button — top-right corner */}
                <button
                  onClick={e=>toggleBench(player.id,e)}
                  title="Move to bench"
                  style={{position:"absolute",top:4,right:4,width:18,height:18,borderRadius:4,
                    background:"#2a1000",border:`1px solid ${C.border}`,
                    color:C.muted,cursor:"pointer",fontSize:10,fontWeight:900,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    lineHeight:1,zIndex:2}}
                  onMouseEnter={e=>{e.currentTarget.style.background=C.warning+"33";e.currentTarget.style.color=C.warning;e.currentTarget.style.borderColor=C.warning;}}
                  onMouseLeave={e=>{e.currentTarget.style.background="#2a1000";e.currentTarget.style.color=C.muted;e.currentTarget.style.borderColor=C.border;}}>
                  ↓
                </button>

                {/* Tap zone — jersey + name + rating */}
                <div onClick={()=>canLog&&logStat(player.id)}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                    cursor:canLog?"pointer":"default",width:"100%"}}>

                  {/* Jersey number */}
                  <div style={{width:44,height:44,borderRadius:10,
                    background:pc+"22",border:`2px solid ${pc}55`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontFamily:"'Oswald',sans-serif",fontWeight:900,color:pc,fontSize:22}}>
                    {player.number}
                  </div>

                  {/* Name */}
                  <div style={{color:C.text,fontWeight:700,fontSize:11,textAlign:"center",lineHeight:1.2,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {player.name.split(" ")[1]||player.name}
                  </div>

                  {/* Rating + stat count */}
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{color:rc,fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:14}}>{rating.toFixed(1)}</span>
                    {val!==null&&val>0&&(
                      <span style={{background:(activeStat_def?.color||C.accent)+"33",color:activeStat_def?.color||C.accent,borderRadius:4,padding:"0 4px",fontSize:10,fontWeight:800}}>{val}</span>
                    )}
                  </div>

                  {/* Minutes on pitch */}
                  <div style={{color:C.warning,fontSize:9,fontWeight:700}}>{minsOnPitch}'</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bench section */}
        {benched.size>0&&(
          <>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{color:C.warning,fontSize:10,fontWeight:700,letterSpacing:1}}>BENCH</div>
              <div style={{flex:1,height:1,background:C.border}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(80px,1fr))",gap:6}}>
              {benchPlayers.map(player=>{
                const pc=posColor(primaryPos(player));
                return(
                  <div key={player.id}
                    onClick={()=>toggleBench(player.id,{stopPropagation:()=>{}})}
                    style={{borderRadius:10,padding:"8px 4px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                      cursor:"pointer",background:C.card,border:`1px solid ${C.border}`,
                      opacity:.6,transition:"opacity .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.opacity="1"}
                    onMouseLeave={e=>e.currentTarget.style.opacity=".6"}>
                    <div style={{width:34,height:34,borderRadius:8,background:pc+"22",border:`2px solid ${pc}44`,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontFamily:"'Oswald',sans-serif",fontWeight:900,color:pc,fontSize:17}}>
                      {player.number}
                    </div>
                    <div style={{color:C.muted,fontSize:10,fontWeight:600}}>{player.name.split(" ")[1]||player.name}</div>
                    <div style={{color:C.muted,fontSize:9,fontWeight:700}}>
                      {(()=>{const pm=playerMins[player.id];return `${pm?.totalMins||0}'`})()}
                    </div>
                    <div style={{color:C.accent,fontSize:9,fontWeight:700,letterSpacing:.5}}>↑ SUB ON</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Last 3 events ─────────────────────────────────────────────── */}
      {events.length>0&&(
        <div style={{background:C.surface,borderTop:`1px solid ${C.border}`,padding:"5px 14px",display:"flex",gap:14,overflow:"hidden",flexShrink:0}}>
          {events.slice(0,3).map(ev=>(
            <span key={ev.id} style={{color:C.muted,fontSize:11,whiteSpace:"nowrap"}}>{ev.text}</span>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── PLAYERS VIEW ─────────────────────────────────────────────────────────────
function PlayersView({games}){
  const [sel,setSel]=useState(null);
  const [search,setSearch]=useState("");
  const [pos,setPos]=useState("ALL");

  const list=useMemo(()=>
    PLAYERS.filter(p=>p.name.toLowerCase().includes(search.toLowerCase()))
           .filter(p=>pos==="ALL"||allPos(p).includes(pos))
           .map(p=>({...p,avg:avgRating(p.id,games)}))
           .sort((a,b)=>b.avg-a.avg)
  ,[games,search,pos]);

  if(sel){
    const player=PLAYERS.find(p=>p.id===sel);
    const hist=getHistory(sel,games);
    const avg=avgRating(sel,games);
    const tots=hist.reduce((acc,h)=>{["goals","assists","shots","shotsOnTarget","keyPasses","tackles","interceptions","saves"].forEach(k=>{acc[k]=(acc[k]||0)+(h[k]||0);});return acc;},{});
    const rTrend=hist.map((h,i)=>({name:`G${i+1}`,rating:h.rating,game:h.opponent}));
    const avgBD=hist.reduce((acc,h)=>{Object.keys(h.breakdown||{}).forEach(k=>{acc[k]=(acc[k]||0)+(h.breakdown[k]||0);});return acc;},{});
    Object.keys(avgBD).forEach(k=>{avgBD[k]=Math.round((avgBD[k]/hist.length)*100)/100;});
    const radar=[
      {stat:"Goals",  value:Math.min(10,(tots.goals||0)*2)},
      {stat:"Assists",value:Math.min(10,(tots.assists||0)*2)},
      {stat:"Passing",value:hist.length?Math.round(hist.reduce((a,h)=>a+(h.passesAttempted>0?h.passesCompleted/h.passesAttempted:0),0)/hist.length*10):0},
      {stat:"Defence",value:Math.min(10,Math.round(((tots.tackles||0)+(tots.interceptions||0))/(hist.length||1)))},
      {stat:"Shots",  value:Math.min(10,Math.round((tots.shots||0)/(hist.length||1)))},
    ];
    return(
      <div style={{padding:20,maxWidth:920,margin:"0 auto"}}>
        <button onClick={()=>setSel(null)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",color:C.text,cursor:"pointer",marginBottom:20,fontSize:13}}>← Back</button>
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:"20px 24px",marginBottom:16}}>
          <div style={{display:"flex",gap:18,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{width:68,height:68,borderRadius:14,background:posColor(primaryPos(player))+"22",border:`3px solid ${posColor(primaryPos(player))}55`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:900,color:posColor(primaryPos(player)),fontSize:28,flexShrink:0}}>{player.number}</div>
            <div style={{flex:1}}>
              <div style={{display:"flex",gap:8,marginBottom:6}}>
                {allPos(player).map(pos=><Tag key={pos} color={posColor(pos)}>{POS_META[pos]?.group} · {pos}</Tag>)}
                {player.captain&&<Tag color={C.warning}>CAPTAIN</Tag>}
              </div>
              <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:30,fontWeight:800,margin:0}}>{player.name}</h2>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:rColor(avg),fontSize:48,fontWeight:900,fontFamily:"'Oswald',sans-serif",lineHeight:1}}>{avg.toFixed(1)}</div>
              <div style={{color:rColor(avg),fontSize:12,fontWeight:700}}>Season Avg</div>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
          {[["Goals",tots.goals||0],["Assists",tots.assists||0],["Shots",tots.shots||0],["Key Passes",tots.keyPasses||0],["Tackles",tots.tackles||0],["Games",hist.length]].map(([l,v])=><Badge key={l} label={l} value={v}/>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px"}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>RATING TREND</div>
            <ResponsiveContainer width="100%" height={145}>
              <AreaChart data={rTrend} margin={{top:4,right:4,left:-24,bottom:0}}>
                <defs><linearGradient id="rt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff6b00" stopOpacity={.4}/><stop offset="100%" stopColor="#ff6b00" stopOpacity={0}/></linearGradient></defs>
                <XAxis dataKey="name" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis domain={[4,10]} tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12}} formatter={v=>[`${v}/10`,"Rating"]}/>
                <Area type="monotone" dataKey="rating" stroke={C.accent} fill="url(#rt)" strokeWidth={2}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px"}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>SKILL PROFILE</div>
            <ResponsiveContainer width="100%" height={145}>
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radar}>
                <PolarGrid stroke={C.border}/>
                <PolarAngleAxis dataKey="stat" tick={{fill:C.muted,fontSize:10}}/>
                <Radar dataKey="value" stroke={C.accent} fill={C.accent} fillOpacity={.18} strokeWidth={2}/>
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,marginBottom:14}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:14}}>SEASON AVG BREAKDOWN (base 6.0)</div>
          <BreakdownBars breakdown={avgBD}/>
        </div>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:14}}>MATCH BY MATCH</div>
          {hist.map((h,i)=>(
            <div key={i} style={{background:C.surface,borderRadius:10,padding:"10px 14px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}>
                <span style={{color:C.muted,fontSize:12,width:80}}>{h.date}</span>
                <span style={{color:C.text,fontSize:13,flex:1}}>vs {h.opponent}</span>
                <span style={{color:C.muted,fontSize:12}}>{h.goals}G {h.assists}A {h.tackles}T {h.keyPasses||0}KP</span>
                <span style={{color:rColor(h.rating),fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:20}}>{h.rating.toFixed(1)}</span>
              </div>
              <p style={{color:C.muted,fontSize:12,lineHeight:1.5,margin:0}}>{h.coachNote}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return(
    <div style={{padding:20,maxWidth:920,margin:"0 auto"}}>
      <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:26,fontWeight:700,marginBottom:16}}>Squad Profiles</h2>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
        <div style={{flex:1,minWidth:180,display:"flex",alignItems:"center",gap:8,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 14px"}}>
          <Search size={14} color={C.muted}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search player…" style={{background:"none",border:"none",outline:"none",color:C.text,fontSize:14,flex:1}}/>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {["ALL","GK","CB","FB","DM","CM","W","ST"].map(p=>(
            <button key={p} onClick={()=>setPos(p)}
              style={{padding:"7px 12px",background:pos===p?(p==="ALL"?C.accent:posColor(p))+"33":C.card,border:`1px solid ${pos===p?(p==="ALL"?C.accent:posColor(p)):C.border}`,borderRadius:8,color:pos===p?(p==="ALL"?C.accent:posColor(p)):C.muted,cursor:"pointer",fontWeight:700,fontSize:12}}>{p}</button>
          ))}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(276px,1fr))",gap:12}}>
        {list.map(p=>{
          const lbl=p.avg>=9?"Dominant":p.avg>=8?"Excellent":p.avg>=7?"Strong":p.avg>=6?"Solid":p.avg>=5?"Below Par":"Poor";
          return(
            <div key={p.id} onClick={()=>setSel(p.id)}
              style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px",cursor:"pointer",transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.background=C.surface;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.card;}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:40,height:40,borderRadius:9,background:posColor(primaryPos(p))+"22",border:`2px solid ${posColor(primaryPos(p))}55`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:700,color:posColor(primaryPos(p)),fontSize:17,flexShrink:0}}>{p.number}</div>
                  <div>
                    <div style={{color:C.text,fontWeight:700,fontSize:15}}>{p.name}</div>
                    <div style={{display:"flex",gap:6,marginTop:3}}>
                      {allPos(p).map(pos=><Tag key={pos} color={posColor(pos)}>{pos}</Tag>)}
                      {p.captain&&<Tag color={C.warning}>©</Tag>}
                    </div>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{color:rColor(p.avg),fontSize:26,fontWeight:900,fontFamily:"'Oswald',sans-serif"}}>{p.avg.toFixed(1)}</div>
                  <div style={{color:rColor(p.avg),fontSize:11,fontWeight:700}}>{lbl}</div>
                </div>
              </div>
              <RBar value={p.avg}/>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────
function AnalyticsView({games}){
  const done=games.filter(g=>g.status==="completed");
  const trend=useMemo(()=>done.slice().reverse().map((g,i)=>{
    const t=g.stats.reduce((a,s)=>({sh:a.sh+s.shots,pc:a.pc+s.passesCompleted,pa:a.pa+s.passesAttempted}),{sh:0,pc:0,pa:0});
    return{name:`G${i+1}`,label:`vs ${g.opponent.split(" ")[0]}`,goalsFor:g.ourScore,goalsAgainst:g.theirScore,shots:t.sh,passAcc:t.pa>0?Math.round((t.pc/t.pa)*100):0};
  }),[done]);

  const squad=useMemo(()=>PLAYERS.map(p=>({name:p.name.split(" ")[1]||p.name,rating:avgRating(p.id,games),position:primaryPos(p)})).sort((a,b)=>b.rating-a.rating),[games]);

  const byPos=useMemo(()=>Object.entries(POS_META).map(([pos,meta])=>{
    const pp=PLAYERS.filter(p=>primaryPos(p)===pos);
    const av=pp.reduce((a,p)=>a+avgRating(p.id,games),0)/(pp.length||1);
    const tg=pp.reduce((a,p)=>a+done.reduce((b,g)=>b+(g.stats.find(s=>s.playerId===p.id)?.goals||0),0),0);
    return{pos,label:meta.label,color:meta.color,avg:Math.round(av*10)/10,totalGoals:tg,players:pp.length};
  }),[games,done]);

  return(
    <div style={{padding:20,maxWidth:920,margin:"0 auto"}}>
      <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:26,fontWeight:700,marginBottom:20}}>Season Analytics</h2>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px",marginBottom:14}}>
        <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:14}}>GOALS FOR vs AGAINST</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={trend} margin={{top:4,right:4,left:-20,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
            <XAxis dataKey="label" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12}}/>
            <Legend wrapperStyle={{color:C.muted,fontSize:12}}/>
            <Bar dataKey="goalsFor"     name="Goals Scored"   fill={C.accent} radius={[4,4,0,0]}/>
            <Bar dataKey="goalsAgainst" name="Goals Conceded" fill={C.danger} radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px"}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>PASS ACCURACY</div>
          <ResponsiveContainer width="100%" height={145}>
            <AreaChart data={trend} margin={{top:4,right:4,left:-24,bottom:0}}>
              <defs><linearGradient id="pa" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff9500" stopOpacity={.35}/><stop offset="100%" stopColor="#ff9500" stopOpacity={0}/></linearGradient></defs>
              <XAxis dataKey="name" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis domain={[60,95]} tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12}} formatter={v=>[`${v}%`,"Pass Acc."]}/>
              <Area type="monotone" dataKey="passAcc" stroke="#ff9500" fill="url(#pa)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px"}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:12}}>SHOTS PER GAME</div>
          <ResponsiveContainer width="100%" height={145}>
            <AreaChart data={trend} margin={{top:4,right:4,left:-24,bottom:0}}>
              <defs><linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff9500" stopOpacity={.35}/><stop offset="100%" stopColor="#ff9500" stopOpacity={0}/></linearGradient></defs>
              <XAxis dataKey="name" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12}}/>
              <Area type="monotone" dataKey="shots" stroke={C.warning} fill="url(#sh)" strokeWidth={2} name="Shots"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px",marginBottom:14}}>
        <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:14}}>SQUAD RATINGS (SEASON AVG)</div>
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={squad} layout="vertical" margin={{top:0,right:50,left:76,bottom:0}}>
            <XAxis type="number" domain={[0,10]} tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
            <YAxis type="category" dataKey="name" tick={{fill:C.text,fontSize:12}} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12}} formatter={v=>[`${v}/10`,"Rating"]}/>
            <Bar dataKey="rating" radius={[0,4,4,0]} label={{position:"right",fill:C.muted,fontSize:11,formatter:v=>v.toFixed(1)}}>
              {squad.map((e,i)=><rect key={i} fill={posColor(e.position)}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
        <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:14}}>POSITION GROUP ANALYSIS</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12}}>
          {byPos.map(g=>(
            <div key={g.pos} style={{background:g.color+"11",border:`1px solid ${g.color}33`,borderRadius:12,padding:"14px 16px"}}>
              <Tag color={g.color}>{g.label}</Tag>
              <div style={{color:g.color,fontSize:30,fontWeight:900,fontFamily:"'Oswald',sans-serif",margin:"10px 0 2px"}}>{g.avg}</div>
              <div style={{color:C.muted,fontSize:11}}>Avg Rating</div>
              <div style={{color:C.text,fontSize:13,fontWeight:700,marginTop:6}}>{g.totalGoals} goals</div>
              <div style={{color:C.muted,fontSize:11}}>{g.players} players</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────

// ─── ROSTER VIEW ──────────────────────────────────────────────────────────────
// ── Shared input style ────────────────────────────────────────────────────────
const iStyle = (extra={}) => ({
  background:C.surface, border:`1px solid ${C.border}`, borderRadius:7,
  color:C.text, fontFamily:"'Outfit',sans-serif", fontSize:13,
  padding:"7px 10px", outline:"none", width:"100%", boxSizing:"border-box",
  ...extra
});

function PlayerModal({player, onSave, onDelete, onClose}){
  const isNew = !player.id;
  // Safely normalise position to array regardless of storage format
  const initPositions = (()=>{
    const p = player.position;
    if(Array.isArray(p) && p.length) return p;
    if(typeof p === "string" && p)   return [p];
    return ["CM"];
  })();
  const [form,setForm] = useState({
    id:        player.id      || `p${Date.now()}`,
    name:      player.name    || "",
    number:    player.number  ?? "",
    positions: initPositions,
    captain:   player.captain || false,
    email:     player.email   || "",
  });
  const [err,setErr] = useState("");

  function save(){
    if(!form.name.trim())        return setErr("Name is required");
    if(!form.number && form.number!==0) return setErr("Jersey number is required");
    if(isNaN(parseInt(form.number))) return setErr("Jersey number must be a number");
    setErr("");
    onSave({...form, number:parseInt(form.number), position:form.positions});
  }

  const primaryColor = POS_META[form.positions?.[0]]?.color || C.accent;

  return(
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:28,width:"100%",maxWidth:420,boxShadow:"0 24px 60px #00000099"}}>

        {/* Modal header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
          <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:800}}>
            {isNew ? "Add Player" : "Edit Player"}
          </h2>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:4}}><X size={18}/></button>
        </div>

        {/* Jersey preview */}
        <div style={{display:"flex",justifyContent:"center",marginBottom:22}}>
          <div style={{width:72,height:72,borderRadius:14,background:primaryColor+"22",border:`3px solid ${primaryColor}55`,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontFamily:"'Oswald',sans-serif",fontWeight:900,color:primaryColor,fontSize:32}}>
            {form.number || "#"}
          </div>
        </div>

        {/* Fields */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* Name */}
          <div>
            <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>FULL NAME</label>
            <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
              placeholder="e.g. James Mitchell" style={iStyle()}/>
          </div>

          {/* Number */}
          <div>
            <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>JERSEY NUMBER</label>
            <input type="number" min="1" max="99" value={form.number}
              onChange={e=>setForm(f=>({...f,number:e.target.value}))}
              placeholder="1–99" style={iStyle({width:120})}/>
          </div>

          {/* Positions — multi-select */}
          <div>
            <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:4}}>POSITIONS <span style={{color:C.muted,fontWeight:400,fontSize:10}}>(select all that apply)</span></label>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:6}}>
              {Object.entries(POS_META).map(([pos,meta])=>{
                const active = form.positions.includes(pos);
                return(
                  <button key={pos} onClick={()=>setForm(f=>({
                    ...f,
                    positions: active
                      ? f.positions.filter(p=>p!==pos).length ? f.positions.filter(p=>p!==pos) : f.positions // keep at least 1
                      : [...f.positions, pos]
                  }))}
                    style={{padding:"6px 14px",borderRadius:7,fontWeight:700,fontSize:12,cursor:"pointer",
                      background: active ? meta.color+"33" : "#0d0400",
                      border: `1px solid ${active ? meta.color : C.border}`,
                      color: active ? meta.color : C.muted,
                      transition:"all .12s"}}>
                    {pos}
                  </button>
                );
              })}
            </div>
            <div style={{color:C.muted,fontSize:11,marginTop:6}}>
              Primary: <span style={{color:primaryColor,fontWeight:700}}>{form.positions[0]}</span>
              {form.positions.length>1 && <span> · Can also play: {form.positions.slice(1).join(", ")}</span>}
            </div>
          </div>

          {/* Email */}
          <div>
            <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:5}}>EMAIL <span style={{color:C.muted,fontWeight:400,fontSize:10}}>(for match reports)</span></label>
            <input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}
              placeholder="player@email.com" style={iStyle()}/>
          </div>

          {/* Captain toggle */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,padding:"12px 16px"}}>
            <div>
              <div style={{color:C.text,fontWeight:600,fontSize:13}}>Team Captain</div>
              <div style={{color:C.muted,fontSize:11,marginTop:2}}>Marks player with © badge</div>
            </div>
            <button onClick={()=>setForm(f=>({...f,captain:!f.captain}))}
              style={{width:46,height:26,borderRadius:13,border:"none",cursor:"pointer",
                background:form.captain ? C.warning : C.border,
                position:"relative",transition:"background .2s"}}>
              <div style={{width:20,height:20,borderRadius:"50%",background:"#fff",
                position:"absolute",top:3,transition:"left .2s",
                left: form.captain ? 23 : 3}}/>
            </button>
          </div>
        </div>

        {/* Error */}
        {err && <div style={{color:C.danger,fontSize:12,marginTop:10,fontWeight:600}}>{err}</div>}

        {/* Actions */}
        <div style={{display:"flex",gap:10,marginTop:22}}>
          <button onClick={save}
            style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:7,
              padding:"11px",background:C.accent,border:"none",borderRadius:9,
              color:"#000",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"'Oswald',sans-serif",letterSpacing:.5}}>
            <Save size={15}/>{isNew ? "ADD PLAYER" : "SAVE CHANGES"}
          </button>
          {!isNew && (
            <button onClick={onDelete}
              style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                padding:"11px 16px",background:"#2a0800",border:`1px solid ${C.danger}44`,
                borderRadius:9,color:C.danger,fontWeight:700,fontSize:13,cursor:"pointer"}}>
              <Trash2 size={14}/>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RosterView({players, setPlayers, teamName}){
  const [msg,setMsg]             = useState(null);
  const [importing,setImporting] = useState(false);
  const [confirmClear,setConfirmClear] = useState(false);
  const [editPlayer,setEditPlayer]     = useState(null);  // null | player obj | {new:true}
  const fileRef = useRef(null);

  async function handleUpload(e){
    const file=e.target.files?.[0]; if(!file)return;
    setImporting(true); setMsg(null);
    try{
      const newPlayers=await parseRosterSpreadsheet(file);
      setPlayers(newPlayers);
      setMsg({type:"ok",text:`✓ Roster loaded — ${newPlayers.length} players imported successfully`});
    }catch(err){
      setMsg({type:"err",text:`✗ ${err.message}`});
    }
    setImporting(false);
    e.target.value="";
  }

  function resetToDefault(){
    setPlayers(DEFAULT_PLAYERS);
    setConfirmClear(false);
    setMsg({type:"ok",text:`✓ Roster reset to default squad`});
  }

  function savePlayer(updated){
    setPlayers(prev => {
      const exists = prev.find(p=>p.id===updated.id);
      if(exists) return prev.map(p=>p.id===updated.id ? updated : p);
      return [...prev, updated];
    });
    setEditPlayer(null);
    setMsg({type:"ok", text: `✓ ${updated.name} saved`});
  }

  function deletePlayer(id){
    setPlayers(prev=>prev.filter(p=>p.id!==id));
    setEditPlayer(null);
    setMsg({type:"ok",text:"Player removed from roster"});
  }

  const byPos = Object.entries(POS_META).map(([pos,meta])=>({
    pos, ...meta, players: players.filter(p=>primaryPos(p)===pos)
  })).filter(g=>g.players.length>0);

  return(
    <div style={{padding:20,maxWidth:900,margin:"0 auto"}}>

      {/* Edit / Add modal */}
      {editPlayer && (
        <PlayerModal
          player={editPlayer}
          onSave={savePlayer}
          onDelete={()=>deletePlayer(editPlayer.id)}
          onClose={()=>setEditPlayer(null)}
        />
      )}

      {/* Header */}
      <div style={{marginBottom:20}}>
        <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2}}>SQUAD MANAGEMENT</div>
        <h1 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:28,fontWeight:800,marginTop:4}}>Roster</h1>
      </div>

      {/* Action bar */}
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18,alignItems:"center"}}>
        {/* Add player */}
        <button onClick={()=>setEditPlayer({name:"",number:"",position:"CM",captain:false})}
          style={{display:"flex",alignItems:"center",gap:8,padding:"10px 18px",
            background:C.accent,border:"none",borderRadius:10,
            color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
          <Plus size={15}/> Add Player
        </button>

        {/* Divider */}
        <div style={{width:1,height:30,background:C.border,margin:"0 4px"}}/>

        {/* Bulk upload */}
        <button onClick={downloadRosterTemplate}
          style={{display:"flex",alignItems:"center",gap:8,padding:"10px 18px",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,color:C.muted,fontWeight:700,fontSize:13,cursor:"pointer"}}>
          <Download size={14}/> Template
        </button>
        <button onClick={()=>fileRef.current?.click()} disabled={importing}
          style={{display:"flex",alignItems:"center",gap:8,padding:"10px 18px",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,color:C.muted,fontWeight:700,fontSize:13,cursor:"pointer"}}>
          {importing
            ? <><RefreshCw size={14} style={{animation:"spin 1s linear infinite"}}/>Importing…</>
            : <><Upload size={14}/>Bulk Upload</>}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleUpload} style={{display:"none"}}/>

        {/* Reset — pushed right */}
        <button onClick={()=>setConfirmClear(true)}
          style={{display:"flex",alignItems:"center",gap:8,padding:"10px 18px",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,color:C.muted,fontWeight:700,fontSize:13,cursor:"pointer",marginLeft:"auto"}}>
          <Trash2 size={14}/> Reset
        </button>
      </div>

      {/* Confirm reset */}
      {confirmClear&&(
        <div style={{background:"#2a0800",border:`1px solid ${C.danger}44`,borderRadius:12,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <span style={{color:C.text,fontSize:13}}>Replace current roster with the default Marion FC squad?</span>
          <div style={{display:"flex",gap:8}}>
            <button onClick={resetToDefault} style={{padding:"7px 16px",background:C.danger+"33",border:`1px solid ${C.danger}55`,borderRadius:8,color:C.danger,fontWeight:700,fontSize:13,cursor:"pointer"}}>Yes, Reset</button>
            <button onClick={()=>setConfirmClear(false)} style={{padding:"7px 16px",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,fontWeight:700,fontSize:13,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      {/* Feedback banner */}
      {msg&&(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:msg.type==="ok"?C.accent+"15":C.danger+"15",border:`1px solid ${msg.type==="ok"?C.accent:C.danger}44`,borderRadius:10,padding:"12px 16px",marginBottom:16}}>
          <span style={{color:msg.type==="ok"?C.accent:C.danger,fontWeight:600,fontSize:13}}>{msg.text}</span>
          <button onClick={()=>setMsg(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer"}}><X size={14}/></button>
        </div>
      )}

      {/* Squad table — grouped by position */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"flex",alignItems:"center",gap:6}}>
            <Users size={12}/>CURRENT SQUAD
          </div>
          <span style={{background:C.accent+"22",color:C.accent,borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:700}}>{players.length} players</span>
        </div>

        {byPos.map(group=>(
          <div key={group.pos} style={{marginBottom:20}}>
            {/* Position divider */}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <Tag color={group.color}>{group.label}</Tag>
              <span style={{color:C.muted,fontSize:11}}>{group.group}</span>
              <div style={{flex:1,height:1,background:C.border}}/>
              <span style={{color:C.muted,fontSize:11}}>{group.players.length}</span>
            </div>

            {/* Player rows */}
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {group.players.sort((a,b)=>a.number-b.number).map(p=>(
                <div key={p.id}
                  style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",
                    background:C.surface,borderRadius:9,border:`1px solid ${group.color}18`,
                    transition:"border-color .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=group.color+"44"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=group.color+"18"}>

                  {/* Jersey number badge */}
                  <div style={{width:38,height:38,borderRadius:9,flexShrink:0,
                    background:posColor(primaryPos(p))+"22",border:`2px solid ${posColor(primaryPos(p))}44`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontFamily:"'Oswald',sans-serif",fontWeight:900,color:posColor(primaryPos(p)),fontSize:18}}>
                    {p.number}
                  </div>

                  {/* Name + captain */}
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{color:C.text,fontWeight:700,fontSize:14}}>{p.name}</span>
                      {p.captain && <Tag color={C.warning}>© Captain</Tag>}
                    </div>
                    <div style={{color:C.muted,fontSize:11,marginTop:2}}>{POS_META[primaryPos(p)]?.group}</div>
                  </div>

                  {/* Edit button */}
                  <button onClick={()=>setEditPlayer(p)}
                    style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",
                      background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,
                      color:C.muted,fontWeight:600,fontSize:12,cursor:"pointer",
                      transition:"all .15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.color=C.accent;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.muted;}}>
                    <Pencil size={12}/> Edit
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Empty state */}
        {players.length===0&&(
          <div style={{textAlign:"center",padding:"40px 20px",color:C.muted}}>
            <Users size={40} style={{opacity:.3,marginBottom:12}}/>
            <div style={{fontSize:15,fontWeight:600}}>No players yet</div>
            <div style={{fontSize:13,marginTop:6}}>Add players one by one or bulk upload a roster spreadsheet</div>
          </div>
        )}
      </div>
    </div>
  );
}

// Sidebar nav groups
const SIDEBAR_GROUPS = [
  { label:"MATCH", items:[
    {id:"home",     label:"Home",      icon:LayoutDashboard},
    {id:"games",    label:"Games",     icon:Trophy},
    {id:"live",     label:"Live",      icon:Radio},
  ]},
  { label:"SQUAD", items:[
    {id:"players",  label:"Players",   icon:Users},
    {id:"roster",   label:"Roster",    icon:ClipboardList},
  ]},
  { label:"PLANNING", items:[
    {id:"gameplan", label:"Game Plan", icon:BookOpen},
    {id:"practice", label:"Practice",  icon:Dumbbell},
  ]},
  { label:"INSIGHTS", items:[
    {id:"analytics",label:"Analytics", icon:BarChart2},
  ]},
];
const NAV = SIDEBAR_GROUPS.flatMap(g=>g.items);
const NAV_PRIMARY = NAV;
const NAV_SECONDARY = [];


// ─── MORE MENU ────────────────────────────────────────────────────────────────
function MoreMenu({view, setView, secondaryInActive}){
  const [open,setOpen] = useState(false);
  return(
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{display:"flex",alignItems:"center",gap:5,padding:"7px 11px",
          background: secondaryInActive||open ? C.accent+"22" : "transparent",
          border: secondaryInActive||open ? `1px solid ${C.accent}44` : "1px solid transparent",
          borderRadius:8, color: secondaryInActive||open ? C.accent : C.muted,
          cursor:"pointer",fontWeight:600,fontSize:13,transition:"all .15s"}}>
        More <ChevronDown size={12} style={{transition:"transform .2s",transform:open?"rotate(180deg)":"rotate(0deg)"}}/>
      </button>

      {open&&(
        <>
          <div onClick={()=>setOpen(false)}
            style={{position:"fixed",inset:0,zIndex:199}}/>
          <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,minWidth:180,
            background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
            boxShadow:"0 16px 40px #00000088",zIndex:200,overflow:"hidden",padding:6}}>
            {NAV_SECONDARY.map(v=>{
              const Icon=v.icon,active=view===v.id;
              return(
                <button key={v.id}
                  onClick={()=>{setView(v.id);setOpen(false);}}
                  style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 12px",
                    background:active?C.accent+"22":"transparent",borderRadius:8,
                    border:"none",color:active?C.accent:C.muted,cursor:"pointer",
                    fontWeight:600,fontSize:13,textAlign:"left",transition:"all .12s",
                    marginBottom:2}}>
                  <Icon size={15}/>{v.label}
                  {active&&<span style={{marginLeft:"auto",width:6,height:6,borderRadius:"50%",background:C.accent}}/>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── TEAM SWITCHER DROPDOWN ──────────────────────────────────────────────────
function TeamSwitcher({teams, activeTeamId, onSwitch, onAdd, onRename, onDelete}){
  const [open,setOpen]     = useState(false);
  const [adding,setAdding] = useState(false);
  const [newName,setNewName]= useState("");
  const [editing,setEditing]= useState(null); // {id,name}
  const activeTeam = teams.find(t=>t.id===activeTeamId) || teams[0];

  function addTeam(){
    if(!newName.trim()) return;
    onAdd(newName.trim());
    setNewName(""); setAdding(false);
  }
  function saveRename(){
    if(!editing.name.trim()) return;
    onRename(editing.id, editing.name.trim());
    setEditing(null);
  }

  return(
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",
          background:C.accent+"22",border:`1px solid ${C.accent}44`,borderRadius:7,
          color:C.accent,fontWeight:700,fontSize:12,cursor:"pointer"}}>
        <span style={{maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {activeTeam?.name || "Select Team"}
        </span>
        <ChevronDown size={12}/>
      </button>

      {open&&(
        <>
          {/* backdrop */}
          <div onClick={()=>{setOpen(false);setAdding(false);setEditing(null);}}
            style={{position:"fixed",inset:0,zIndex:199}}/>
          <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,minWidth:220,
            background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
            boxShadow:"0 16px 40px #00000088",zIndex:200,overflow:"hidden"}}>

            {/* Team list */}
            {teams.map(t=>(
              <div key={t.id}
                style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",
                  background:t.id===activeTeamId?"#ff6b0012":"transparent",
                  borderBottom:`1px solid ${C.border}`}}>
                {editing?.id===t.id ? (
                  <>
                    <input value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}
                      onKeyDown={e=>e.key==="Enter"&&saveRename()}
                      autoFocus
                      style={{flex:1,background:C.surface,border:`1px solid ${C.accent}`,borderRadius:6,
                        color:C.text,fontSize:13,padding:"4px 8px",outline:"none",fontFamily:"'Outfit',sans-serif"}}/>
                    <button onClick={saveRename} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",padding:2,fontSize:11,fontWeight:700}}>Save</button>
                    <button onClick={()=>setEditing(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:2}}><X size={12}/></button>
                  </>
                ) : (
                  <>
                    <span onClick={()=>{onSwitch(t.id);setOpen(false);}}
                      style={{flex:1,color:t.id===activeTeamId?C.accent:C.text,fontWeight:t.id===activeTeamId?700:500,
                        fontSize:13,cursor:"pointer"}}>
                      {t.id===activeTeamId&&<span style={{color:C.accent,marginRight:6}}>✓</span>}{t.name}
                    </span>
                    <button onClick={()=>setEditing({id:t.id,name:t.name})}
                      style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:2,opacity:.7}}
                      title="Rename"><Pencil size={11}/></button>
                    {teams.length>1&&(
                      <button onClick={()=>{if(window.confirm(`Delete "${t.name}"? This will remove all their games and roster.`)){onDelete(t.id);setOpen(false);}}}
                        style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:2,opacity:.7}}
                        title="Delete team"><Trash2 size={11}/></button>
                    )}
                  </>
                )}
              </div>
            ))}

            {/* Add team */}
            <div style={{padding:"10px 14px"}}>
              {adding ? (
                <div style={{display:"flex",gap:6}}>
                  <input value={newName} onChange={e=>setNewName(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&addTeam()}
                    placeholder="Team name…" autoFocus
                    style={{flex:1,background:C.surface,border:`1px solid ${C.accent}`,borderRadius:6,
                      color:C.text,fontSize:13,padding:"5px 8px",outline:"none",fontFamily:"'Outfit',sans-serif"}}/>
                  <button onClick={addTeam}
                    style={{padding:"5px 10px",background:C.accent,border:"none",borderRadius:6,
                      color:"#000",fontWeight:700,fontSize:12,cursor:"pointer"}}>Add</button>
                  <button onClick={()=>{setAdding(false);setNewName("");}}
                    style={{background:"none",border:"none",color:C.muted,cursor:"pointer"}}><X size={13}/></button>
                </div>
              ) : (
                <button onClick={()=>setAdding(true)}
                  style={{display:"flex",alignItems:"center",gap:6,color:C.muted,background:"none",
                    border:"none",cursor:"pointer",fontSize:13,fontWeight:600,width:"100%"}}>
                  <Plus size={13}/> Add team
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function CoachIQStats(){
  const [view,setView] = useState("home");

  // ── Persistent teams ──────────────────────────────────────────────────────
  const INIT_TEAM_ID = "t_default";
  const [teams, setTeams] = useLocalStorage("coachiq_teams", [
    {id: INIT_TEAM_ID, name: "Marion FC"}
  ]);
  const [activeTeamId, setActiveTeamId] = useLocalStorage("coachiq_active_team", INIT_TEAM_ID);

  // ── Per-team rosters & games & plans ─────────────────────────────────────
  const [allRosters,   setAllRosters]   = useLocalStorage("coachiq_rosters",   {[INIT_TEAM_ID]: DEFAULT_PLAYERS});
  const [allGames,     setAllGames]     = useLocalStorage("coachiq_games",     {[INIT_TEAM_ID]: GAMES});
  const [allGamePlans, setAllGamePlans] = useLocalStorage("coachiq_gameplans", {[INIT_TEAM_ID]: []});
  const [allPractices, setAllPractices] = useLocalStorage("coachiq_practices", {[INIT_TEAM_ID]: []});

  const safeTeamId = teams.find(t=>t.id===activeTeamId) ? activeTeamId : teams[0]?.id;
  const roster    = allRosters[safeTeamId]   || DEFAULT_PLAYERS;
  const games     = allGames[safeTeamId]     || [];
  const gamePlans = allGamePlans[safeTeamId] || [];
  const practices = allPractices[safeTeamId] || [];

  // Sync module-level PLAYERS so all helper functions see the current squad
  PLAYERS = roster;

  function setRoster(val){
    const resolved = typeof val==="function" ? val(roster) : val;
    setAllRosters(prev=>({...prev,[safeTeamId]:resolved}));
  }
  function setGames(val){
    const resolved = typeof val==="function" ? val(games) : val;
    setAllGames(prev=>({...prev,[safeTeamId]:resolved}));
  }
  function setGamePlans(val){
    const resolved = typeof val==="function" ? val(gamePlans) : val;
    setAllGamePlans(prev=>({...prev,[safeTeamId]:resolved}));
  }
  function setPractices(val){
    const resolved = typeof val==="function" ? val(practices) : val;
    setAllPractices(prev=>({...prev,[safeTeamId]:resolved}));
  }

  // ── Team management ───────────────────────────────────────────────────────
  function addTeam(name){
    const id = `t_${Date.now()}`;
    setTeams(prev=>[...prev,{id,name}]);
    setAllRosters(prev=>({...prev,[id]:DEFAULT_PLAYERS}));
    setAllGames(prev=>({...prev,[id]:[]}));
    setAllGamePlans(prev=>({...prev,[id]:[]}));
    setAllPractices(prev=>({...prev,[id]:[]}));
    setActiveTeamId(id);
    setView("home");
  }
  function switchTeam(id){
    setActiveTeamId(id);
    setView("home");
  }
  function renameTeam(id,name){
    setTeams(prev=>prev.map(t=>t.id===id?{...t,name}:t));
  }
  function deleteTeam(id){
    const remaining = teams.filter(t=>t.id!==id);
    setTeams(remaining);
    setAllRosters(prev=>{const n={...prev};delete n[id];return n;});
    setAllGames(prev=>{const n={...prev};delete n[id];return n;});
    setAllGamePlans(prev=>{const n={...prev};delete n[id];return n;});
    setAllPractices(prev=>{const n={...prev};delete n[id];return n;});
    if(activeTeamId===id) setActiveTeamId(remaining[0]?.id);
  }

  const activeTeam = teams.find(t=>t.id===safeTeamId) || teams[0];

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useLocalStorage("coachiq_theme","dark");
  // Mutate C in place so all components pick up the right theme
  Object.assign(C, THEMES[theme] || THEMES.dark);

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
      `}</style>

      <div style={{minHeight:"100vh",background:C.bg,display:"flex",transition:"background .3s"}}>

        {/* ═══ SIDEBAR ═══════════════════════════════════════════════════ */}
        <div style={{
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
                      COACHIQ <span style={{color:C.accent}}>STATS</span>
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
                <TeamSwitcher
                  teams={teams} activeTeamId={safeTeamId}
                  onSwitch={switchTeam} onAdd={addTeam}
                  onRename={renameTeam} onDelete={deleteTeam}
                />
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
            padding:"0 20px",flexShrink:0}}>
            <div style={{color:C.muted,fontSize:12,fontWeight:600}}>
              {activeTeam?.name} · <span style={{color:C.text}}>{NAV.find(n=>n.id===view)?.label||"Home"}</span>
            </div>
            {/* Right side: date + theme toggle */}
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{color:C.muted,fontSize:11}}>{new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</span>
              {/* Theme toggle */}
              <button
                onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}
                title={theme==="dark"?"Switch to Light Mode":"Switch to Dark Mode"}
                style={{display:"flex",alignItems:"center",gap:6,padding:"5px 11px",
                  background:theme==="light"?"#1a0d05":"#f5f0eb",
                  border:`1px solid ${C.border}`,borderRadius:8,cursor:"pointer",
                  color:theme==="light"?"#ff9500":"#1a0d00",fontWeight:700,fontSize:11,
                  transition:"all .2s"}}>
                {theme==="dark" ? "☀ Light" : "☾ Dark"}
              </button>
            </div>
          </div>

          {/* Page content */}
          <div style={{flex:1,overflowY:"auto",background:C.bg,
            backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100'%3E%3Cpath d='M28 2 L54 17 L54 47 L28 62 L2 47 L2 17 Z' fill='none' stroke='%23ff6b0011' stroke-width='1'/%3E%3Cpath d='M28 52 L54 67 L54 97 L28 112 L2 97 L2 67 Z' fill='none' stroke='%23ff6b0011' stroke-width='1'/%3E%3C/svg%3E")`}}>
            {view==="home"      &&<HomeView      games={games} gamePlans={gamePlans} practices={practices} roster={roster} setView={setView} teamName={activeTeam?.name}/>}
            {view==="games"     &&<GamesView     games={games} setGames={setGames} teamName={activeTeam?.name} roster={roster}/>}
            {view==="live"      &&<LiveTrackView games={games} setGames={setGames}/>}
            {view==="players"   &&<PlayersView   games={games}/>}
            {view==="analytics" &&<AnalyticsView games={games}/>}
            {view==="roster"    &&<RosterView    players={roster} setPlayers={setRoster} teamName={activeTeam?.name}/>}
            {view==="gameplan"  &&<GamePlanView  gamePlans={gamePlans} setGamePlans={setGamePlans} games={games} roster={roster}/>}
            {view==="practice"  &&<PracticeView  practices={practices} setPractices={setPractices} gamePlans={gamePlans} roster={roster}/>}
            {/* redirect old dashboard id */}
            {view==="dashboard" &&<HomeView      games={games} gamePlans={gamePlans} practices={practices} roster={roster} setView={setView} teamName={activeTeam?.name}/>}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── GAME PLAN VIEW ───────────────────────────────────────────────────────────
// ─── HOME VIEW ────────────────────────────────────────────────────────────────
function HomeView({games, gamePlans, practices, roster, setView, teamName}){
  const ts   = teamSum(games);
  const done = games.filter(g=>g.status==="completed");
  const upcoming = [...gamePlans].sort((a,b)=>a.date.localeCompare(b.date)).find(gp=>gp.date>=new Date().toISOString().split("T")[0]);
  const recent = done.slice(0,3);
  const topPlayers = useMemo(()=>
    roster.map(p=>({...p,avg:avgRating(p.id,games)})).sort((a,b)=>b.avg-a.avg).slice(0,3)
  ,[games,roster]);
  const lastPractice = practices[0];
  const form5 = done.slice(0,5).map(g=>g.ourScore>g.theirScore?"W":g.ourScore<g.theirScore?"L":"D");
  const FOCUS_COLS={"Mixed":C.accent,"Attacking":"#ff6b00","Defending":"#42a5f5","Transition":"#7c6af5","Set Pieces":"#ffb300","Fitness":"#ef5350","Technical":"#66bb6a"};
  const QUICK=[
    {label:"Start Live Game",icon:Radio,  color:"#ff6b00",view:"live",    desc:"Track stats in real time"},
    {label:"New Game Plan",  icon:BookOpen,color:"#ffb300",view:"gameplan",desc:"Prepare for your next match"},
    {label:"Log Practice",   icon:Dumbbell,color:"#66bb6a",view:"practice",desc:"Record today's session"},
    {label:"View Squad",     icon:Users,   color:"#42a5f5",view:"players", desc:"Player profiles and ratings"},
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

      {/* Quick actions */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10,marginBottom:22}}>
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

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* Upcoming game plan */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1}}>NEXT GAME PLAN</div>
            <button onClick={()=>setView("gameplan")} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:11,fontWeight:700}}>View all →</button>
          </div>
          {upcoming?(
            <div>
              <div style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:800,marginBottom:4}}>vs {upcoming.opponent}</div>
              <div style={{display:"flex",gap:12,color:C.muted,fontSize:12,marginBottom:14,flexWrap:"wrap"}}>
                <span style={{display:"flex",alignItems:"center",gap:4}}><Calendar size={11}/>{upcoming.date}</span>
                <span>{upcoming.location}</span><span>{upcoming.formation}</span>
              </div>
              {(()=>{
                const assigned=Object.values(upcoming.lineup).flat().filter(Boolean);
                const total=Object.values(upcoming.lineup).flat().length;
                return(
                  <div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                      {assigned.slice(0,9).map(pid=>{const p=roster.find(r=>r.id===pid);if(!p)return null;return(
                        <div key={pid} style={{width:28,height:28,borderRadius:6,background:posColor(primaryPos(p))+"22",border:`1.5px solid ${posColor(primaryPos(p))}44`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:700,color:posColor(primaryPos(p)),fontSize:12}}>{p.number}</div>
                      );})}
                      {assigned.length>9&&<div style={{width:28,height:28,borderRadius:6,background:C.surface,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:10,fontWeight:700}}>+{assigned.length-9}</div>}
                    </div>
                    <div style={{color:C.muted,fontSize:12}}>{assigned}/{total} set · {upcoming.subs.length} subs planned</div>
                  </div>
                );
              })()}
            </div>
          ):(
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <BookOpen size={28} style={{color:C.muted,opacity:.3,marginBottom:8}}/>
              <div style={{color:C.muted,fontSize:13,marginBottom:10}}>No upcoming game plan</div>
              <button onClick={()=>setView("gameplan")} style={{padding:"7px 16px",background:C.accent+"22",border:`1px solid ${C.accent}44`,borderRadius:8,color:C.accent,cursor:"pointer",fontWeight:700,fontSize:12}}>Create one →</button>
            </div>
          )}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* Top performers */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1}}>TOP PERFORMERS</div>
              <button onClick={()=>setView("players")} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:11,fontWeight:700}}>All →</button>
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

function GamePlanView({gamePlans, setGamePlans, games, roster}){
  const [sel,setSel]       = useState(null);
  const [creating,setCreating] = useState(false);
  const [picking,setPicking]   = useState(null); // {zone,idx} for lineup slot picker
  const [form,setForm]     = useState({opponent:"",date:new Date().toISOString().split("T")[0],location:"Home",formation:"4-3-3"});

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
      {[["OPPONENT","opponent","text"],["DATE","date","date"]].map(([lbl,key,type])=>(
        <div key={key} style={{marginBottom:14}}>
          <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>{lbl}</label>
          <input type={type} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
            style={{width:"100%",padding:"11px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:9,color:C.text,fontSize:14,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}/>
        </div>
      ))}
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

    return(
      <div style={{padding:20,maxWidth:900,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22}}>
          <button onClick={()=>setSel(null)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",color:C.text,cursor:"pointer",fontSize:13}}>← Back</button>
          <div style={{flex:1}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1}}>{plan.date} · {plan.location} · {plan.formation}</div>
            <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:24,fontWeight:800}}>vs {plan.opponent}</h2>
          </div>
          <button onClick={()=>{if(window.confirm("Delete this game plan?"))setGamePlans(prev=>prev.filter(p=>p.id!==sel));setSel(null);}}
            style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",color:C.muted,cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13}}>
            <Trash2 size={13}/>Delete
          </button>
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
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>

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
                            background:p?"#1a0800":C.surface,
                            border:`1.5px solid ${p?ZONE_COL[zone]+"66":C.border}`,
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
        </div>
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
function PracticeView({practices, setPractices, gamePlans, roster}){
  const [sel,setSel]           = useState(null);
  const [creating,setCreating] = useState(false);
  const [filterTag,setFilterTag] = useState("All");
  const [selPlayer,setSelPlayer] = useState("");
  const [noteText,setNoteText]   = useState("");
  const [form,setForm]         = useState({date:new Date().toISOString().split("T")[0],duration:"60",focus:"Mixed",plan:"",linkedGame:""});

  const FOCUS_TAGS = ["Mixed","Attacking","Defending","Transition","Set Pieces","Fitness","Technical"];
  const FOCUS_COLORS = {Mixed:C.accent,Attacking:"#ff6b00",Defending:"#42a5f5",Transition:"#7c6af5",
    "Set Pieces":"#ffb300",Fitness:"#ef5350",Technical:"#66bb6a"};

  function createSession(){
    const session = {
      id:`pr${Date.now()}`, ...form,
      playerNotes:[], createdAt:new Date().toISOString()
    };
    setPractices(prev=>[session,...prev]);
    setSel(session.id); setCreating(false);
  }

  if(creating) return(
    <div style={{padding:24,maxWidth:500,margin:"0 auto"}}>
      <button onClick={()=>setCreating(false)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",color:C.text,cursor:"pointer",marginBottom:20,fontSize:13}}>← Back</button>
      <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:2,marginBottom:4}}>PRACTICE</div>
      <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:26,fontWeight:800,marginBottom:22}}>New Session</h2>
      <div style={{marginBottom:14}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>DATE</label>
        <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}
          style={{width:"100%",padding:"11px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:9,color:C.text,fontSize:14,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}/>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>DURATION (MINS)</label>
        <div style={{display:"flex",gap:8}}>
          {["45","60","75","90","120"].map(d=><button key={d} onClick={()=>setForm(f=>({...f,duration:d}))} style={{flex:1,padding:"10px 6px",background:form.duration===d?C.accent+"22":C.card,border:`1px solid ${form.duration===d?C.accent:C.border}`,borderRadius:8,color:form.duration===d?C.accent:C.muted,cursor:"pointer",fontWeight:700,fontSize:13}}>{d}</button>)}
        </div>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>FOCUS</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {FOCUS_TAGS.map(t=>{const col=FOCUS_COLORS[t];return(<button key={t} onClick={()=>setForm(f=>({...f,focus:t}))} style={{padding:"8px 14px",background:form.focus===t?col+"22":C.card,border:`1px solid ${form.focus===t?col:C.border}`,borderRadius:8,color:form.focus===t?col:C.muted,cursor:"pointer",fontWeight:700,fontSize:12}}>{t}</button>);})}
        </div>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>LINKED GAME (OPTIONAL)</label>
        <select value={form.linkedGame} onChange={e=>setForm(f=>({...f,linkedGame:e.target.value}))}
          style={{width:"100%",padding:"11px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:9,color:C.text,fontSize:14,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}>
          <option value="">None</option>
          {gamePlans.map(gp=><option key={gp.id} value={gp.id}>vs {gp.opponent} ({gp.date})</option>)}
        </select>
      </div>
      <div style={{marginBottom:24}}>
        <label style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,display:"block",marginBottom:6}}>SESSION PLAN</label>
        <textarea value={form.plan} onChange={e=>setForm(f=>({...f,plan:e.target.value}))} rows={5}
          placeholder="Warmup, drills, small-sided games, cooldown..."
          style={{width:"100%",padding:"11px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:9,color:C.text,fontSize:14,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box",resize:"vertical"}}/>
      </div>
      <button onClick={createSession}
        style={{width:"100%",padding:"14px",background:C.accent,border:"none",borderRadius:10,color:"#000",fontWeight:900,fontSize:16,cursor:"pointer",fontFamily:"'Oswald',sans-serif",letterSpacing:1}}>
        CREATE SESSION →
      </button>
    </div>
  );

  if(sel){
    const session = practices.find(p=>p.id===sel);
    if(!session) return null;
    const focusCol = FOCUS_COLORS[session.focus]||C.accent;
    const linked   = gamePlans.find(gp=>gp.id===session.linkedGame);

    function updateSession(updater){
      setPractices(prev=>prev.map(p=>p.id===sel?{...p,...updater(p)}:p));
    }



    function addPlayerNote(){
      if(!selPlayer||!noteText.trim()) return;
      const p = roster.find(r=>r.id===selPlayer);
      updateSession(s=>({playerNotes:[...s.playerNotes,{id:`n${Date.now()}`,pid:selPlayer,name:p?.name||"",note:noteText.trim()}]}));
      setNoteText(""); setSelPlayer("");
    }
    function removeNote(id){
      updateSession(s=>({playerNotes:s.playerNotes.filter(n=>n.id!==id)}));
    }

    return(
      <div style={{padding:20,maxWidth:860,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22}}>
          <button onClick={()=>setSel(null)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",color:C.text,cursor:"pointer",fontSize:13}}>← Back</button>
          <div style={{flex:1}}>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
              <Tag color={focusCol}>{session.focus}</Tag>
              <span style={{color:C.muted,fontSize:12}}>{session.date} · {session.duration} mins</span>
              {linked&&<span style={{color:C.muted,fontSize:12}}>· Prep for vs {linked.opponent}</span>}
            </div>
            <h2 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:800}}>Training Session</h2>
          </div>
          <button onClick={()=>{if(window.confirm("Delete this session?"))setPractices(prev=>prev.filter(p=>p.id!==sel));setSel(null);}}
            style={{background:"#1a0800",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",color:C.muted,cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13}}>
            <Trash2 size={13}/>Delete
          </button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {/* Session plan */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1,marginBottom:10}}>SESSION PLAN</div>
            <textarea value={session.plan} onChange={e=>updateSession(()=>({plan:e.target.value}))} rows={10}
              placeholder="Write your session plan here..."
              style={{width:"100%",padding:"10px 12px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box",resize:"vertical"}}/>
          </div>

          {/* Player notes */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,display:"flex",flexDirection:"column",gap:12}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:1}}>PLAYER NOTES</div>

            {/* Add note */}
            <div style={{background:C.surface,borderRadius:10,padding:12,display:"flex",flexDirection:"column",gap:8}}>
              <select value={selPlayer} onChange={e=>setSelPlayer(e.target.value)}
                style={{width:"100%",padding:"8px 10px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,color:C.text,fontSize:13,outline:"none",fontFamily:"'Outfit',sans-serif"}}>
                <option value="">Select player...</option>
                {roster.map(p=><option key={p.id} value={p.id}>{p.name} #{p.number}</option>)}
              </select>
              <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} rows={2}
                placeholder="Note about this player's session..."
                style={{width:"100%",padding:"8px 10px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:7,color:C.text,fontSize:13,outline:"none",fontFamily:"'Outfit',sans-serif",resize:"vertical",boxSizing:"border-box"}}/>
              <button onClick={addPlayerNote} disabled={!selPlayer||!noteText.trim()}
                style={{padding:"8px 14px",background:selPlayer&&noteText.trim()?C.accent:"#2a1000",border:"none",borderRadius:7,color:selPlayer&&noteText.trim()?"#000":C.muted,fontWeight:700,fontSize:13,cursor:selPlayer&&noteText.trim()?"pointer":"default"}}>
                Add Note
              </button>
            </div>

            {/* Notes list */}
            <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:8}}>
              {session.playerNotes.length===0
                ? <div style={{color:C.muted,fontSize:13,fontStyle:"italic"}}>No player notes yet</div>
                : session.playerNotes.map(note=>{
                    const p = roster.find(r=>r.id===note.pid);
                    return(
                      <div key={note.id} style={{background:C.surface,borderRadius:9,padding:"10px 12px",display:"flex",gap:10}}>
                        <div style={{width:30,height:30,borderRadius:7,flexShrink:0,background:posColor(primaryPos(p))+"22",border:`1.5px solid ${posColor(primaryPos(p))}44`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Oswald',sans-serif",fontWeight:700,color:posColor(primaryPos(p)),fontSize:13}}>{p?.number||"?"}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{color:C.text,fontWeight:700,fontSize:12,marginBottom:3}}>{note.name}</div>
                          <div style={{color:C.muted,fontSize:12,lineHeight:1.5}}>{note.note}</div>
                        </div>
                        <button onClick={()=>removeNote(note.id)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",flexShrink:0,alignSelf:"flex-start"}}><X size={13}/></button>
                      </div>
                    );
                  })
              }
            </div>
          </div>
        </div>
      </div>
    );
  }

  const filtered = filterTag==="All" ? practices : practices.filter(p=>p.focus===filterTag);

  return(
    <div style={{padding:20,maxWidth:900,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <div style={{color:C.accent,fontSize:11,fontWeight:700,letterSpacing:2}}>TRAINING</div>
          <h1 style={{color:C.text,fontFamily:"'Oswald',sans-serif",fontSize:28,fontWeight:800,marginTop:4}}>Practice Log</h1>
        </div>
        <button onClick={()=>setCreating(true)}
          style={{display:"flex",alignItems:"center",gap:8,padding:"10px 18px",background:C.accent,border:"none",borderRadius:10,color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"'Oswald',sans-serif"}}>
          <Plus size={15}/>New Session
        </button>
      </div>

      {/* Focus filter */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
        {["All",...FOCUS_TAGS].map(t=>{
          const col=t==="All"?C.accent:(FOCUS_COLORS[t]||C.accent);
          return(<button key={t} onClick={()=>setFilterTag(t)} style={{padding:"6px 12px",background:filterTag===t?col+"22":C.card,border:`1px solid ${filterTag===t?col:C.border}`,borderRadius:7,color:filterTag===t?col:C.muted,cursor:"pointer",fontWeight:700,fontSize:12}}>{t}</button>);
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
              return(
                <div key={session.id} onClick={()=>setSel(session.id)}
                  style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,transition:"all .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=col}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  <div style={{width:44,height:44,borderRadius:10,background:col+"22",border:`2px solid ${col}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <Dumbbell size={20} color={col}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                      <Tag color={col}>{session.focus}</Tag>
                      <span style={{color:C.muted,fontSize:12}}>{session.duration} mins</span>
                      {linked&&<span style={{color:C.muted,fontSize:12}}>· Prep: vs {linked.opponent}</span>}
                    </div>
                    <div style={{color:C.text,fontWeight:700,fontSize:14}}>{session.date}</div>
                    {session.plan&&<div style={{color:C.muted,fontSize:12,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:400}}>{session.plan.slice(0,80)}{session.plan.length>80?"…":""}</div>}
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    {session.playerNotes.length>0&&<div style={{color:C.muted,fontSize:12}}>{session.playerNotes.length} player note{session.playerNotes.length!==1?"s":""}</div>}
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