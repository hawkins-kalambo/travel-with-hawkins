"use client";
import { useState, useEffect } from "react";
import Image from "next/image";

const API_URL = "https://script.google.com/macros/s/AKfycby17HHcmR3G_8GhP7wdb3pvkcZpnAy6R0mtH8W7qrkcRuu5JiEQy4FIRkEDQ81KFk_L/exec";
type BookingStatus = "Pending"|"Confirmed"|"Boarding"|"Departed"|"Arrived"|"Completed"|"Cancelled"|string;
type BookingRecord = {timestamp?:unknown;name?:string;studentId?:string;phone?:string;destination?:string;travelDate?:string;seats?:number;pickup?:string;location?:string;bookingId?:string;status?:BookingStatus;tripId?:string;bookingType?:string;};
const STATUS_ORDER:BookingStatus[]=["Pending","Confirmed","Boarding","Departed","Arrived","Completed"];
const STEPPER_LABELS=["Booked","Confirmed","Boarding","En Route","Arrived","Completed"];

function StepperTimeline({currentStatus}:{currentStatus:BookingStatus}){
  const activeIndex=Math.max(0,STATUS_ORDER.indexOf(currentStatus));
  return(
    <div className="w-full py-4">
      <div className="flex items-center justify-between">
        {STEPPER_LABELS.map((label,i)=>{
          const isActive=i<=activeIndex,isCurrent=i===activeIndex;
          return(
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${isActive?"bg-[#E8650A] border-[#E8650A] text-white":"bg-white border-slate-200 text-slate-400"} ${isCurrent?"ring-2 ring-[#E8650A]/40":""}`}>{isActive?"✓":i+1}</div>
                <span className={`text-[10px] mt-1 text-center leading-tight max-w-[52px] ${isActive?"text-[#E8650A] font-semibold":"text-slate-400"}`}>{label}</span>
              </div>
              {i<STEPPER_LABELS.length-1&&<div className={`flex-1 h-0.5 mx-1 mt-[-1.5rem] ${i<activeIndex?"bg-[#E8650A]":"bg-slate-200"}`}/>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BoardingPass({name,studentId,phone,destination,travelDate,seats,bookingId,tripId,bookingType}:{name:string;studentId:string;phone:string;destination:string;travelDate:string;seats:number;bookingId:string;tripId:string;bookingType:string;}){
  const [copied,setCopied]=useState(false);
  const handleCopy=async()=>{try{await navigator.clipboard.writeText(bookingId);setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{}};
  return(
    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-md mx-auto">
      <div className="px-5 py-4 flex items-center justify-between text-white" style={{background:"linear-gradient(135deg,#1a0f00,#E8650A)"}}>
        <div><p className="text-[11px] text-orange-200 uppercase tracking-wider">Travel with Hawkins</p><h3 className="font-bold text-base mt-0.5" style={{fontFamily:"Georgia,serif"}}>Boarding Pass</h3></div>
        <span className="bg-white/20 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase">{bookingType}</span>
      </div>
      <div className="px-5 py-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-[10px] text-slate-400 uppercase">Passenger</p><p className="font-bold text-slate-900">{name}</p></div>
          <div><p className="text-[10px] text-slate-400 uppercase">Student ID</p><p className="font-semibold text-slate-900">{studentId}</p></div>
          <div><p className="text-[10px] text-slate-400 uppercase">Phone</p><p className="font-semibold text-slate-900">{phone}</p></div>
          <div><p className="text-[10px] text-slate-400 uppercase">Seats</p><p className="font-bold text-slate-900">{seats}</p></div>
        </div>
        <div className="border-t border-dashed border-orange-100 pt-3 grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-[10px] text-slate-400 uppercase">Destination</p><p className="font-bold text-[#E8650A]">{destination}</p></div>
          <div><p className="text-[10px] text-slate-400 uppercase">Travel Date</p><p className="font-semibold text-slate-900">{travelDate}</p></div>
        </div>
        <div className="rounded-xl p-3 space-y-2" style={{background:"#fff8f2",border:"1px solid #f0e0d0"}}>
          <div className="flex items-center justify-between"><p className="text-[10px] text-slate-400">Booking ID</p><p className="text-sm font-bold font-mono" style={{color:"#E8650A"}}>{bookingId}</p></div>
          <div className="flex items-center justify-between"><p className="text-[10px] text-slate-400">Trip ID</p><p className="text-sm font-bold font-mono" style={{color:"#1a0f00"}}>{tripId}</p></div>
        </div>
        <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
          <p className="text-[10px] font-bold text-orange-800 mb-1">Departure Rules</p>
          <ul className="text-[10px] text-orange-700 space-y-0.5 list-disc list-inside">
            <li>Arrive at pickup 15 minutes early</li><li>Keep your booking ID for verification</li>
            <li>Luggage limit: 1 bag + 1 hand carry</li><li>Wear seatbelt at all times</li>
          </ul>
        </div>
      </div>
      <div className="flex border-t border-orange-100">
        <button onClick={handleCopy} className="flex-1 py-3 text-sm font-semibold text-[#E8650A] hover:bg-orange-50 transition">{copied?"✓ Copied":"Copy ID"}</button>
      </div>
    </div>
  );
}

export default function Home(){
  const [menuOpen,setMenuOpen]=useState(false);
  const HERO_IMAGES=["/images/hero/hero1.jpg","/images/hero/hero2.jpg","/images/hero/hero3.jpg","/images/hero/hero4.jpg","/images/hero/hero5.jpg","/images/hero/hero6.jpg","/images/hero/hero7.jpg","/images/hero/hero8.jpg"];
  const [heroIndex,setHeroIndex]=useState(0);
  useEffect(()=>{const id=setInterval(()=>setHeroIndex(i=>(i+1)%HERO_IMAGES.length),6000);return()=>clearInterval(id);},[HERO_IMAGES.length]);
  const [selectedRoute,setSelectedRoute]=useState("");
  const [bookingType,setBookingType]=useState<"route"|"custom">("custom");
  const [showBooking,setShowBooking]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [form,setForm]=useState(()=>{
    try{const raw=typeof window!=="undefined"?localStorage.getItem("twh_profile"):null;if(raw){const p=JSON.parse(raw);return{name:p.name||"",studentId:p.studentId||"",phone:p.phone||"",seats:1,travelDate:new Date().toISOString().split("T")[0]};}}catch{}
    return{name:"",studentId:"",phone:"",seats:1,travelDate:new Date().toISOString().split("T")[0]};
  });
  const POPULAR_ROUTES=["Mzuzu → Lilongwe","Mzuzu → Blantyre","Mzuzu → Zomba","Mzuzu → Kasungu","Mzuzu → Karonga"];
  const [customDestination,setCustomDestination]=useState("");
  const [successData,setSuccessData]=useState<{name:string;studentId:string;phone:string;route:string;bookingType:"route"|"custom";travelDate:string;bookingId:string;tripId:string;seats:number;}|null>(null);
  const [showTrack,setShowTrack]=useState(false);
  const [trackId,setTrackId]=useState("");
  const [trackLoading,setTrackLoading]=useState(false);
  const [trackError,setTrackError]=useState("");
  type TrackResult={name?:string;status?:string;destination?:string;travelDate?:string;seats?:number;tripId?:string;bookingType?:string;[key:string]:unknown;};
  const [trackResult,setTrackResult]=useState<TrackResult|null>(null);
  const [allBookings,setAllBookings]=useState<BookingRecord[]>([]);
  useEffect(()=>{const f=async()=>{try{const res=await fetch(API_URL);const data=await res.json();if(data?.bookings&&Array.isArray(data.bookings))setAllBookings(data.bookings as BookingRecord[]);}catch{}};f();const id=setInterval(f,30000);return()=>clearInterval(id);},[]);
  type UrgencyDisplay={message:string;dest:string;remaining:number;};
  const urgencyDisplay:UrgencyDisplay|null = (() => {
    if(!allBookings.length)return null;
    const today=new Date().toISOString().split("T")[0];
    const groupMap=new Map<string,{destination:string;travelDate:string;totalSeats:number;}>();
    for(const b of allBookings){const dest=b.destination||"",date=b.travelDate||"";if(date<today)continue;const key=`${dest}||${date}`;if(!groupMap.has(key))groupMap.set(key,{destination:dest,travelDate:date,totalSeats:0});groupMap.get(key)!.totalSeats+=b.seats||1;}
    for(const[,g]of groupMap){const rem=15-g.totalSeats;if(rem>0&&rem<=4){const day=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(g.travelDate).getDay()];return{message:`🔥 Only ${rem} seat${rem===1?"":"s"} left for ${day}'s ${g.destination} dispatch!`,dest:g.destination,remaining:rem};}}
    return null;
  })();
  const isFormValid=()=>form.name.trim()&&form.studentId.trim()&&form.phone.trim()&&form.seats>=1&&String(form.travelDate).trim();
  const closeBooking=()=>{setShowBooking(false);setForm(p=>({...p,name:"",studentId:"",phone:"",seats:1}));setSelectedRoute("");setCustomDestination("");setBookingType("custom");setError("");};
  const handleBooking=async()=>{
    setError("");if(!isFormValid()){setError("Please fill all fields");return;}
    const isCustom=bookingType==="custom";if(isCustom&&!customDestination.trim()){setError("Please enter your destination");return;}
    setLoading(true);
    const destination=isCustom?customDestination:selectedRoute;
    try{
      const res=await fetch(API_URL,{method:"POST",body:JSON.stringify({name:form.name.trim(),studentId:form.studentId.trim(),phone:form.phone.trim(),destination,travelDate:form.travelDate,seats:form.seats,pickup:"Mzuzu University",location:"Campus",bookingType})});
      const result=await res.json();
      if(result.success){setSuccessData({name:form.name,studentId:form.studentId,phone:form.phone,route:isCustom?customDestination:selectedRoute,bookingType,travelDate:form.travelDate,bookingId:result.bookingId||"PENDING",tripId:result.tripId||"PENDING",seats:form.seats});try{localStorage.setItem("twh_profile",JSON.stringify({name:form.name.trim(),studentId:form.studentId.trim(),phone:form.phone.trim()}));}catch{}closeBooking();}
      else setError(result.error||"Booking failed. Please try again.");
    }catch{setError("Network error. Please check your connection.");}
    setLoading(false);
  };
  const ROUTES_DATA=[
    {route:"Mzuzu → Lilongwe",duration:"6–7 Hours",img:"/images/routes/mzuzu-lilongwe.jpg"},
    {route:"Mzuzu → Blantyre",duration:"10–12 Hours",img:"/images/routes/mzuzu-blantyre.jpg"},
    {route:"Mzuzu → Zomba",duration:"9–10 Hours",img:"/images/routes/mzuzu-zomba.jpeg"},
    {route:"Mzuzu → Kasungu",duration:"4–5 Hours",img:"/images/routes/mzuzu-kasungu.jpg"},
    {route:"Mzuzu → Karonga",duration:"2–3 Hours",img:"/images/routes/mzuzu-karonga.jpg",special:true},
  ];
  const iCls="w-full border px-4 py-3 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-[#E8650A] transition";
  const iStyle={borderColor:"#e2d4c5",background:"#fff",color:"#1a0f00"};

  return(
  <main className="min-h-screen" style={{fontFamily:"'Inter',Arial,sans-serif",color:"#1a0f00",fontSize:"16px",background:"#fff"}}>

    {/* URGENCY BANNER */}
    {urgencyDisplay&&(
      <div className="fixed top-0 inset-x-0 z-[200] flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold" style={{background:"#fff7ed",borderBottom:"2px solid #E8650A"}}>
        <span>🔥</span><span className="text-orange-900">{urgencyDisplay.message}</span>
      </div>
    )}

    {/* ═══════════ NAV ═══════════ */}
    <nav className="fixed inset-x-0 z-50 bg-white" style={{top:urgencyDisplay?"40px":"0",boxShadow:"0 1px 0 #f0e0d0"}}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16 gap-4">
        <a href="#" className="flex items-center gap-3 flex-shrink-0">
          <div className="w-11 h-11 flex-shrink-0"><Image src="/logo.png" width={44} height={44} className="object-contain w-full h-full" alt="Logo"/></div>
          <div className="hidden sm:block leading-tight">
            <span className="font-black text-[15px]" style={{fontFamily:"Georgia,serif",color:"#1a0f00"}}>Travel with <span style={{color:"#E8650A"}}>Hawkins</span></span>
            <p className="text-[10px] text-slate-400">Safe Journeys · Trusted Service</p>
          </div>
        </a>
        <div className="hidden md:flex items-center gap-6 text-[14px] font-semibold text-slate-600">
          {[["Home","#"],["Routes","#routes"],["How It Works","#how"],["Meet the Team","#team"],["Contact","#footer"]].map(([l,h])=>(
            <a key={l} href={h} className="hover:text-[#E8650A] transition-colors">{l}</a>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={()=>setShowTrack(true)} className="hidden sm:block text-[13px] font-semibold px-3 py-2 rounded-lg border transition whitespace-nowrap" style={{borderColor:"#E8650A",color:"#E8650A"}}>Track Booking</button>
          <button onClick={()=>{setSelectedRoute("");setBookingType("custom");setShowBooking(true);}} className="text-[13px] font-bold px-4 py-2 rounded-lg text-white transition whitespace-nowrap" style={{background:"#E8650A"}}>Book Now</button>
          <button onClick={()=>setMenuOpen(!menuOpen)} className="md:hidden w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-lg hover:bg-orange-50" aria-label="Menu">
            <span className={`block w-5 h-0.5 bg-slate-700 transition-all ${menuOpen?"rotate-45 translate-y-2":""}`}/>
            <span className={`block w-5 h-0.5 bg-slate-700 transition-all ${menuOpen?"opacity-0":""}`}/>
            <span className={`block w-5 h-0.5 bg-slate-700 transition-all ${menuOpen?"-rotate-45 -translate-y-2":""}`}/>
          </button>
        </div>
      </div>
      {menuOpen&&(
        <div className="md:hidden border-t px-4 py-4 space-y-3 bg-white" style={{borderColor:"#f0e0d0"}}>
          {[["Home","#"],["Routes","#routes"],["How It Works","#how"],["Meet the Team","#team"],["Contact","#footer"]].map(([l,h])=>(
            <a key={l} href={h} onClick={()=>setMenuOpen(false)} className="block text-[15px] font-semibold text-slate-700 hover:text-[#E8650A]">{l}</a>
          ))}
          <div className="flex gap-2 pt-2">
            <button onClick={()=>{setMenuOpen(false);setShowTrack(true);}} className="flex-1 py-2.5 rounded-lg border text-[14px] font-semibold" style={{borderColor:"#E8650A",color:"#E8650A"}}>Track</button>
            <button onClick={()=>{setMenuOpen(false);setSelectedRoute("");setBookingType("custom");setShowBooking(true);}} className="flex-1 py-2.5 rounded-lg text-[14px] font-bold text-white" style={{background:"#E8650A"}}>Book Now</button>
          </div>
        </div>
      )}
    </nav>

    {/* ═══════════ HERO — SPLIT LAYOUT ═══════════ */}
    <section className="relative min-h-screen flex flex-col lg:flex-row" style={{paddingTop:urgencyDisplay?"100px":"64px"}}>

      {/* Left — dark photo + text */}
      <div className="relative flex-1 lg:min-w-0 min-h-[420px] lg:min-h-0 flex items-center overflow-hidden">
        {HERO_IMAGES.map((src,i)=>(
          <div key={src} className="absolute inset-0 bg-cover bg-center transition-opacity duration-[1800ms]" style={{backgroundImage:`url(${src})`,backgroundPosition:"center 35%",opacity:i===heroIndex?1:0}}/>
        ))}
        <div className="absolute inset-0" style={{background:"linear-gradient(110deg,rgba(10,5,0,0.90) 0%,rgba(15,8,0,0.72) 60%,rgba(20,10,0,0.45) 100%)"}}/>
        <div className="relative z-10 px-8 sm:px-12 py-16 max-w-xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest mb-6" style={{background:"rgba(232,101,10,0.20)",border:"1px solid rgba(232,101,10,0.45)",color:"#ffb87a"}}>
            ✦ Verified Student Transport — Mzuzu University
          </div>
          <h1 className="font-black text-white leading-tight mb-5" style={{fontFamily:"Georgia,serif",fontSize:"clamp(2rem,4.5vw,3.2rem)"}}>
            Your Journey Home<br/><span style={{color:"#E8650A"}}>Starts Here.</span>
          </h1>
          <p className="text-white/75 text-[16px] leading-relaxed mb-8 max-w-md">
            Safe, reliable transport for Mzuzu University students. Book a verified route or request a custom destination — anywhere in Malawi.
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={()=>{setSelectedRoute("");setBookingType("custom");setShowBooking(true);}} className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white text-[15px] shadow-lg transition hover:scale-105" style={{background:"#E8650A"}}>
              <Image src="/icons/bus.png" width={18} height={18} className="object-contain" style={{filter:"brightness(0) invert(1)"}} alt=""/> Book Your Seat
            </button>
            <button onClick={()=>document.getElementById("routes")?.scrollIntoView({behavior:"smooth"})} className="px-6 py-3 rounded-xl font-semibold text-white text-[15px] border transition hover:bg-white/10" style={{borderColor:"rgba(255,255,255,0.4)"}}>
              Explore Routes →
            </button>
          </div>
          {/* Inline trust badges */}
          <div className="flex items-center gap-6 mt-10">
            {[["500+","Students"],["10+","Routes"],["95%","On-Time"]].map(([n,l])=>(
              <div key={l}><p className="font-black text-[22px]" style={{color:"#E8650A"}}>{n}</p><p className="text-[11px] text-white/55 mt-0.5">{l}</p></div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — booking form card */}
      <div className="lg:w-[420px] xl:w-[460px] flex-shrink-0 flex items-center justify-center bg-white p-6 sm:p-8 lg:overflow-y-auto lg:max-h-screen">
        <div className="w-full max-w-sm">
          <h2 className="font-black text-[22px] mb-1" style={{fontFamily:"Georgia,serif",color:"#1a0f00"}}>Book a Trip</h2>
          <p className="text-slate-500 text-[14px] mb-5">Fill in your details to reserve your seat instantly.</p>

          {/* Route selector */}
          <div className="mb-4">
            <label className="block text-[12px] font-bold uppercase tracking-wider text-slate-500 mb-2">Choose Route</label>
            <div className="flex flex-wrap gap-2">
              {POPULAR_ROUTES.map(r=>{const active=r===selectedRoute&&bookingType==="route";return(
                <button key={r} onClick={()=>{setSelectedRoute(r);setBookingType("route");setCustomDestination("");}} className="text-[12px] px-3 py-1.5 rounded-full border font-medium transition" style={{background:active?"#E8650A":"#fff",color:active?"#fff":"#555",borderColor:active?"#E8650A":"#e2d4c5"}}>{r}</button>
              );})}
              <button onClick={()=>{setBookingType("custom");setSelectedRoute("");}} className="text-[12px] px-3 py-1.5 rounded-full border font-medium transition" style={{background:bookingType==="custom"?"#1a0f00":"#fff",color:bookingType==="custom"?"#fff":"#555",borderColor:bookingType==="custom"?"#1a0f00":"#e2d4c5"}}>Custom</button>
            </div>
          </div>
          {bookingType==="custom"&&<><input placeholder="Enter destination (e.g. Mzuzu → Rumphi)" value={customDestination} className={iCls} style={iStyle} onChange={e=>setCustomDestination(e.target.value)}/><div className="mb-3"/></>}
          {error&&<div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-3 text-[13px]">{error}</div>}
          <div className="space-y-3">
            <input placeholder="Full Name" value={form.name} className={iCls} style={iStyle} onChange={e=>{setForm({...form,name:e.target.value});setError("");}}/>
            <input placeholder="Student ID" value={form.studentId} className={iCls} style={iStyle} onChange={e=>{setForm({...form,studentId:e.target.value});setError("");}}/>
            <input placeholder="Phone Number" type="tel" value={form.phone} className={iCls} style={iStyle} onChange={e=>{setForm({...form,phone:e.target.value});setError("");}}/>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">Travel Date</label>
              <input type="date" value={form.travelDate} min={new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,travelDate:e.target.value})} className={iCls} style={iStyle}/>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">Seats</label>
              <div className="flex items-center gap-3">
                <button onClick={()=>setForm({...form,seats:Math.max(1,form.seats-1)})} className="w-10 h-10 rounded-lg font-bold text-xl" style={{background:"#fff5ee",color:"#E8650A"}}>−</button>
                <span className="text-xl font-bold w-8 text-center">{form.seats}</span>
                <button onClick={()=>setForm({...form,seats:Math.min(10,form.seats+1)})} className="w-10 h-10 rounded-lg font-bold text-xl" style={{background:"#fff5ee",color:"#E8650A"}}>+</button>
              </div>
            </div>
          </div>
          <button onClick={handleBooking} disabled={loading||!isFormValid()} className="w-full mt-5 py-3.5 rounded-xl font-bold text-white text-[15px] transition" style={{background:loading||!isFormValid()?"#ccc":"#E8650A"}}>
            {loading?"Processing…":"Confirm Booking"}
          </button>
          <p className="text-center text-[12px] text-slate-400 mt-3">Or <button onClick={()=>setShowTrack(true)} className="underline" style={{color:"#E8650A"}}>track an existing booking</button></p>
        </div>
      </div>
    </section>

    {/* ═══════════ STATS STRIP ═══════════ */}
    <div style={{background:"#1a0f00"}} className="py-8">
      <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
        {[["500+","Students Served"],["10+","Active Routes"],["95%","On-Time Rate"],["24/7","Support"]].map(([n,l])=>(
          <div key={l} className="border-r last:border-r-0 border-white/10 px-4">
            <p className="font-black text-[2.2rem]" style={{color:"#E8650A",fontFamily:"Georgia,serif"}}>{n}</p>
            <p className="text-[13px] mt-1 text-white/50 uppercase tracking-wider">{l}</p>
          </div>
        ))}
      </div>
    </div>

    {/* ═══════════ WHY TRUST US ═══════════ */}
    <section className="py-20 px-4" style={{background:"#fafaf9"}}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <span className="block w-8 h-0.5" style={{background:"#E8650A"}}/>
          <p className="text-[12px] font-bold uppercase tracking-widest" style={{color:"#E8650A"}}>Why students trust us</p>
        </div>
        <h2 className="font-black text-[2rem] mb-12 max-w-lg" style={{fontFamily:"Georgia,serif",color:"#1a0f00"}}>Built for Mzuzu University students</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {icon:"/icons/safe.png",title:"Safe & Verified",desc:"Every driver is verified and every trip fully organised for your safety and peace of mind.",accent:"#E8650A"},
            {icon:"/icons/student.png",title:"Student Focused",desc:"Routes and schedules built around UNIMA term dates and the destinations students actually need.",accent:"#1a0f00"},
            {icon:"/icons/thunder.png",title:"Book in 60 Seconds",desc:"Confirm your seat instantly online or via WhatsApp — no long forms, no waiting around.",accent:"#E8650A"},
          ].map((c,i)=>(
            <div key={i} className="bg-white rounded-2xl p-7 border hover:-translate-y-1 hover:shadow-xl transition-all cursor-default group" style={{borderColor:"#f0e0d0"}}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 transition-transform group-hover:scale-110" style={{background:"#fff5ee",border:"1px solid #ffe0c0"}}>
                <Image src={c.icon} width={28} height={28} className="object-contain" alt={c.title}/>
              </div>
              <h3 className="font-bold text-[17px] mb-2" style={{color:"#1a0f00"}}>{c.title}</h3>
              <p className="text-[14px] text-slate-500 leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ═══════════ ROUTES ═══════════ */}
    <section id="routes" className="py-20 px-4" style={{background:"#fff"}}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <span className="block w-8 h-0.5" style={{background:"#E8650A"}}/>
          <p className="text-[12px] font-bold uppercase tracking-widest" style={{color:"#E8650A"}}>Available routes</p>
        </div>
        <h2 className="font-black text-[2rem] mb-10" style={{fontFamily:"Georgia,serif",color:"#1a0f00"}}>Where are you headed?</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {ROUTES_DATA.map((r,i)=>(
            <div key={i} className="relative rounded-2xl overflow-hidden cursor-pointer group" style={{minHeight:"260px",boxShadow:r.special?"0 8px 32px rgba(232,101,10,0.2)":"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110" style={{backgroundImage:`url(${r.img})`}}/>
              <div className="absolute inset-0" style={{background:"linear-gradient(180deg,rgba(0,0,0,0.0) 0%,rgba(0,0,0,0.18) 45%,rgba(0,0,0,0.65) 100%)"}}/>
              {r.special&&<div className="absolute top-3 right-3 text-[11px] font-bold px-2.5 py-1 rounded-full text-white backdrop-blur-sm" style={{background:"rgba(232,101,10,0.85)"}}>⚡ Nearest</div>}
              <div className="relative z-10 flex flex-col justify-end h-full p-4">
                <div className="rounded-xl p-3 backdrop-blur-sm" style={{background:"rgba(10,5,0,0.35)"}}>
                  <p className="font-bold text-white text-[16px] mb-0.5" style={{textShadow:"0 1px 4px rgba(0,0,0,0.5)"}}>{r.route}</p>
                  <p className="text-white/80 text-[13px] mb-3">⏱ {r.duration}</p>
                  <button onClick={()=>{setSelectedRoute(r.route);setBookingType("route");setShowBooking(true);}} className="w-full py-2.5 rounded-xl font-bold text-[14px] transition" style={{background:"#fff",color:"#E8650A"}}
                    onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background="#E8650A";(e.currentTarget as HTMLButtonElement).style.color="#fff";}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background="#fff";(e.currentTarget as HTMLButtonElement).style.color="#E8650A";}}>
                    Book this route
                  </button>
                </div>
              </div>
            </div>
          ))}
          {/* Custom destination card */}
          <div className="relative rounded-2xl overflow-hidden cursor-pointer group" style={{minHeight:"260px"}}>
            <div className="absolute inset-0" style={{background:"linear-gradient(135deg,#1a0f00 0%,#2d1a00 100%)"}}/>
            <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-15" style={{background:"#E8650A"}}/>
            <div className="absolute -bottom-10 -left-6 w-32 h-32 rounded-full opacity-10" style={{background:"#fff"}}/>
            <div className="relative z-10 flex flex-col justify-end h-full p-4">
              <p className="text-[28px] mb-2">🧭</p>
              <div className="rounded-xl p-3" style={{background:"rgba(0,0,0,0.3)"}}>
                <p className="font-bold text-white text-[16px] mb-0.5">Custom Destination</p>
                <p className="text-white/70 text-[13px] mb-3">Anywhere in Malawi</p>
                <button onClick={()=>{setBookingType("custom");setSelectedRoute("");setShowBooking(true);}} className="w-full py-2.5 rounded-xl font-bold text-[14px] transition" style={{background:"#E8650A",color:"#fff"}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background="#fff";(e.currentTarget as HTMLButtonElement).style.color="#E8650A";}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background="#E8650A";(e.currentTarget as HTMLButtonElement).style.color="#fff";}}>
                  Request a route
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* ═══════════ HOW IT WORKS ═══════════ */}
    <section id="how" className="py-20 px-4" style={{background:"#1a0f00"}}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <span className="block w-8 h-0.5" style={{background:"#E8650A"}}/>
          <p className="text-[12px] font-bold uppercase tracking-widest" style={{color:"#E8650A"}}>How it works</p>
        </div>
        <h2 className="font-black text-[2rem] mb-12 text-white" style={{fontFamily:"Georgia,serif"}}>Four steps to your journey</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {n:"1",title:"Choose your route",desc:"Pick from verified routes or request a custom one."},
            {n:"2",title:"Book online",desc:"Fill in your details and confirm your seat instantly."},
            {n:"3",title:"Get confirmed",desc:"Receive confirmation via WhatsApp or email."},
            {n:"4",title:"Travel safely",desc:"Board and enjoy a safe, comfortable journey home."},
          ].map((s,i)=>(
            <div key={i} className="flex flex-col gap-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center font-black text-xl text-white flex-shrink-0" style={{background:"#E8650A",fontFamily:"Georgia,serif"}}>{s.n}</div>
              <div>
                <h4 className="font-bold text-white text-[16px] mb-1">{s.title}</h4>
                <p className="text-[13px] text-white/50 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ═══════════ MEET THE TEAM ═══════════ */}
    <section id="team" className="py-20 px-4" style={{background:"#fafaf9"}}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <span className="block w-8 h-0.5" style={{background:"#E8650A"}}/>
          <p className="text-[12px] font-bold uppercase tracking-widest" style={{color:"#E8650A"}}>Meet the team</p>
        </div>
        <h2 className="font-black text-[2rem] mb-12" style={{fontFamily:"Georgia,serif",color:"#1a0f00"}}>The people behind Travel with Hawkins</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-10">
          {[
            {name:"Hawkins Gondwe Kalambo",role:"Founder & CEO",img:"/images/team/ceo.jpg",bio:"Leads vision and operations, making sure every student gets home safely and on time."},
            {name:"Developer",role:"Software Developer",img:"/images/team/developer.jpg",bio:"Builds and maintains the booking system that powers every trip behind the scenes."},
            {name:"Graphic Designer",role:"Graphic Designer",img:"/images/team/designer.jpg",bio:"Shapes the look and feel of Travel with Hawkins — from the logo to every screen."},
          ].map((m,i)=>(
            <div key={i} className="text-center group">
              <div className="relative w-36 h-36 mx-auto mb-5">
                <div className="absolute inset-0 rounded-full transition-transform group-hover:scale-105" style={{background:"linear-gradient(135deg,#E8650A,#c94f00)",transform:"scale(1.08)"}}/>
                <div className="absolute inset-1.5 rounded-full overflow-hidden border-4 border-white shadow-lg">
                  <Image src={m.img} width={144} height={144} className="object-cover w-full h-full" alt={m.name}/>
                </div>
              </div>
              <h3 className="font-bold text-[17px]" style={{color:"#1a0f00"}}>{m.name}</h3>
              <p className="text-[13px] font-semibold mb-2" style={{color:"#E8650A"}}>{m.role}</p>
              <p className="text-[14px] text-slate-500 leading-relaxed max-w-xs mx-auto">{m.bio}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ═══════════ CTA BANNER ═══════════ */}
    <div className="py-12 px-4" style={{background:"#E8650A"}}>
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <h3 className="font-black text-white text-[1.6rem]" style={{fontFamily:"Georgia,serif"}}>Ready to travel? Book in under 60 seconds.</h3>
          <p className="text-white/80 text-[14px] mt-1">Choose your route, confirm your seat, and you&apos;re set.</p>
        </div>
        <button onClick={()=>{setSelectedRoute("");setBookingType("custom");setShowBooking(true);}} className="flex-shrink-0 px-8 py-3.5 rounded-xl font-bold text-[15px] transition hover:scale-105" style={{background:"#fff",color:"#E8650A"}}>
          Book Now →
        </button>
      </div>
    </div>

    {/* ═══════════ FOOTER ═══════════ */}
    <footer id="footer" style={{background:"#1a0f00"}} className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-10 pb-10 border-b border-white/10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 flex-shrink-0"><Image src="/logo.png" width={48} height={48} className="object-contain w-full h-full" alt="Logo"/></div>
              <span className="font-black text-white text-[17px]" style={{fontFamily:"Georgia,serif"}}>Travel with <span style={{color:"#E8650A"}}>Hawkins</span></span>
            </div>
            <p className="text-[13px] leading-relaxed mb-5 text-white/40 max-w-[220px]">Safe, reliable and smart student transport for Mzuzu University students.</p>
            <a href="https://wa.me/265989127308" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white text-[13px]" style={{background:"#25D366"}}>
              <Image src="/icons/whatsapp.png" width={16} height={16} className="object-contain" alt=""/> Book via WhatsApp
            </a>
          </div>
          {/* Quick links */}
          <div>
            <h4 className="font-bold text-white text-[14px] uppercase tracking-wider mb-4">Quick Links</h4>
            <div className="space-y-2">
              {[["#","Home"],["#routes","Routes"],["#how","How It Works"],["#team","Meet the Team"]].map(([h,l])=>(
                <a key={l} href={h} className="block text-[13px] text-white/45 hover:text-[#E8650A] transition-colors">{l}</a>
              ))}
            </div>
          </div>
          {/* Contact */}
          <div>
            <h4 className="font-bold text-white text-[14px] uppercase tracking-wider mb-4">Contact</h4>
            <div className="space-y-3">
              {[
                ["/icons/phone.png","+265 989 127 308"],
                ["/icons/phone.png","0886 470 843"],
                ["/icons/email.png","hgkalambo@gmail.com"],
              ].map(([icon,val],i)=>(
                <div key={i} className="flex items-center gap-2.5 text-[13px] text-white/45">
                  <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full" style={{background:"rgba(255,255,255,0.08)"}}>
                    <Image src={icon} width={12} height={12} className="object-contain" alt=""/>
                  </span>{val}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-white/25">
          <span>© 2026 Travel with Hawkins. All rights reserved.</span>
          <span>Built with ❤ for Mzuzu University students</span>
        </div>
      </div>
    </footer>

    {/* ═══════════ BOOKING MODAL ═══════════ */}
    {showBooking&&(
      <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center p-4 z-[9999]">
        <div className="bg-white p-5 sm:p-6 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto relative">
          <button onClick={closeBooking} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100">✕</button>
          <h2 className="font-black text-[22px] mb-1" style={{fontFamily:"Georgia,serif",color:"#1a0f00"}}>Book Trip</h2>
          <p className="text-slate-600 text-[14px] mb-4">Destination: <span className="font-semibold" style={{color:"#E8650A"}}>{bookingType==="custom"?customDestination||"Enter below":selectedRoute}</span></p>
          <div className="mb-4">
            <p className="text-[11px] text-slate-500 mb-2 font-bold uppercase tracking-wider">Popular Routes</p>
            <div className="flex gap-2 flex-wrap">
              {POPULAR_ROUTES.map(r=>{const active=r===selectedRoute&&bookingType==="route";return<button key={r} onClick={()=>{setSelectedRoute(r);setBookingType("route");setCustomDestination("");}} className="text-[12px] px-3 py-1.5 rounded-full border font-medium transition" style={{background:active?"#E8650A":"#fff",color:active?"#fff":"#555",borderColor:active?"#E8650A":"#e0d0c0"}}>{r}</button>;})}
            </div>
          </div>
          {error&&<div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-3 text-[13px]">{error}</div>}
          <div className="space-y-3">
            <input placeholder="Full Name" value={form.name} className={iCls} style={iStyle} onChange={e=>{setForm({...form,name:e.target.value});setError("");}}/>
            <input placeholder="Student ID" value={form.studentId} className={iCls} style={iStyle} onChange={e=>{setForm({...form,studentId:e.target.value});setError("");}}/>
            <input placeholder="Phone Number" type="tel" value={form.phone} className={iCls} style={iStyle} onChange={e=>{setForm({...form,phone:e.target.value});setError("");}}/>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Travel Date</label>
              <input type="date" value={form.travelDate} min={new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,travelDate:e.target.value})} className={iCls} style={iStyle}/>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Number of Seats</label>
              <div className="flex items-center gap-3">
                <button onClick={()=>setForm({...form,seats:Math.max(1,form.seats-1)})} className="w-10 h-10 rounded-lg font-bold text-xl" style={{background:"#fff5ee",color:"#E8650A"}}>−</button>
                <span className="text-xl font-bold w-8 text-center">{form.seats}</span>
                <button onClick={()=>setForm({...form,seats:Math.min(10,form.seats+1)})} className="w-10 h-10 rounded-lg font-bold text-xl" style={{background:"#fff5ee",color:"#E8650A"}}>+</button>
              </div>
            </div>
            {bookingType==="custom"&&<input placeholder="Destination (e.g. Mzuzu → Rumphi)" value={customDestination} className={iCls} style={iStyle} onChange={e=>{setCustomDestination(e.target.value);setError("");}}/>}
          </div>
          <button onClick={handleBooking} disabled={loading||!isFormValid()} className="w-full mt-5 py-3.5 rounded-xl font-bold text-white text-[15px] transition" style={{background:loading||!isFormValid()?"#ccc":"#E8650A"}}>
            {loading?"Processing…":"Confirm Booking"}
          </button>
          <button onClick={closeBooking} className="w-full mt-2 py-3 rounded-xl font-semibold text-[14px] border" style={{borderColor:"#f0e0d0",color:"#777"}}>Cancel</button>
        </div>
      </div>
    )}

    {/* ═══════════ TRACK MODAL ═══════════ */}
    {showTrack&&(
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[9999]">
        <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto">
          <button onClick={()=>{setShowTrack(false);setTrackId("");setTrackError("");setTrackResult(null);}} className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100">✕</button>
          <h2 className="font-black text-[22px] mb-1" style={{fontFamily:"Georgia,serif",color:"#1a0f00"}}>Track Booking</h2>
          <p className="text-slate-600 text-[14px] mb-4">Enter your Booking ID to check status</p>
          {trackError&&<div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-3 text-[13px]">{trackError}</div>}
          <input placeholder="Booking ID (e.g. TWH-...)" value={trackId} onChange={e=>setTrackId(e.target.value)} className={iCls} style={iStyle}/>
          <div className="mb-3"/>
          <button onClick={async()=>{
            setTrackError("");setTrackResult(null);
            if(!trackId.trim()){setTrackError("Please enter a Booking ID");return;}
            setTrackLoading(true);
            try{const res=await fetch(API_URL,{method:"POST",body:JSON.stringify({action:"trackBooking",bookingId:trackId.trim()})});const json=await res.json();
              if(json?.success&&Array.isArray(json.bookings)&&json.bookings.length>0)setTrackResult(json.bookings[0]);
              else setTrackError(json?.error?String(json.error):"Booking not found.");}
            catch{setTrackError("Network error. Please try again.");}
            setTrackLoading(false);
          }} disabled={trackLoading} className="w-full py-3.5 rounded-xl font-bold text-white text-[15px]" style={{background:trackLoading?"#ccc":"#E8650A"}}>
            {trackLoading?"Searching…":"Track Booking"}
          </button>
          {trackResult&&(
            <div className="mt-4 space-y-3">
              <div className="p-4 rounded-xl" style={{background:"#fff8f2",border:"1px solid #f0e0d0"}}>
                <p className="font-bold text-[15px] mb-3" style={{color:"#1a0f00"}}>{trackResult.name||"—"}</p>
                <div className="grid grid-cols-2 gap-2 text-[13px]">
                  <div><p className="text-slate-400 text-[11px] uppercase">Destination</p><p className="font-semibold text-slate-800">{trackResult.destination||"—"}</p></div>
                  <div><p className="text-slate-400 text-[11px] uppercase">Date</p><p className="font-semibold text-slate-800">{trackResult.travelDate||"—"}</p></div>
                  <div><p className="text-slate-400 text-[11px] uppercase">Seats</p><p className="font-semibold text-slate-800">{trackResult.seats||"—"}</p></div>
                  <div><p className="text-slate-400 text-[11px] uppercase">Trip ID</p><p className="font-semibold" style={{color:"#E8650A"}}>{trackResult.tripId||"—"}</p></div>
                </div>
              </div>
              <StepperTimeline currentStatus={String(trackResult.status||"Pending")}/>
            </div>
          )}
        </div>
      </div>
    )}

    {/* ═══════════ SUCCESS / BOARDING PASS ═══════════ */}
    {successData&&(
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[9999] overflow-y-auto">
        <div className="w-full max-w-md">
          <BoardingPass name={successData.name} studentId={successData.studentId} phone={successData.phone} destination={successData.route} travelDate={successData.travelDate} seats={successData.seats} bookingId={successData.bookingId} tripId={successData.tripId} bookingType={successData.bookingType} />
          <button onClick={()=>setSuccessData(null)} className="w-full mt-3 py-3 rounded-xl font-semibold text-white text-[14px]" style={{background:"rgba(255,255,255,0.15)"}}>Close</button>
        </div>
      </div>
    )}

  </main>
  );
}
