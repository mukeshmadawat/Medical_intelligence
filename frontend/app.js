'use strict';
/* ══ Global State ══ */
let MASTER_DATA = null;
let _gR=[],_gF=[],_gPg=0,_gPS=18,_gSt='all',_gSr='';
const charts={}, _done={};

/* ══ Custom Cursor ══ */
const dot=document.getElementById('cur-dot'),ring=document.getElementById('cur-ring');
let mx=0,my=0,rx=0,ry=0;
document.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;});
(function cl(){
  rx+=(mx-rx)*.1;ry+=(my-ry)*.1;
  if(dot)dot.style.transform=`translate(${mx}px,${my}px)`;
  if(ring)ring.style.transform=`translate(${rx}px,${ry}px)`;
  requestAnimationFrame(cl);
})();

/* ══ Clock ══ */
setInterval(()=>{const t=document.getElementById('dclock');if(t)t.textContent=new Date().toLocaleTimeString('en-IN');},1000);

/* ══ THREE.JS SCENE ══ */
let orbU = null;
try {
  const cnv=document.getElementById('bg');
  if (cnv) {
    const R=new THREE.WebGLRenderer({canvas:cnv,antialias:true});
    R.setPixelRatio(Math.min(devicePixelRatio,2));
    R.setSize(innerWidth,innerHeight);
    R.toneMapping=THREE.ACESFilmicToneMapping;
    R.toneMappingExposure=1.15;

    const SC=new THREE.Scene();
    SC.background=new THREE.Color(0xF5F7FA);
    SC.fog=new THREE.FogExp2(0xF5F7FA,.04);
    const CAM=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,100);
    CAM.position.set(0,.2,4.5);

    SC.add(new THREE.AmbientLight(0xffffff,1.2));
    const pt=new THREE.PointLight(0x007AFF,.8,12);pt.position.set(0,2,2);SC.add(pt);
    const pt2=new THREE.PointLight(0xFF4D4D,.5,10);pt2.position.set(-3,-1,1);SC.add(pt2);

    const fMat=new THREE.MeshStandardMaterial({color:0xF0F2F5,metalness:.4,roughness:.2});
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30,60,60),fMat);
    floor.rotation.x=-Math.PI/2;floor.position.y=-1.5;SC.add(floor);
    const gH=new THREE.GridHelper(30,40,0x007AFF,0xE1E4E8);
    gH.position.y=-1.49;gH.material.opacity=.4;gH.material.transparent=true;SC.add(gH);

    /* Orb Shaders */
    const VERT=`uniform float uT;uniform float uNSR;varying vec3 vN,vP;
    vec3 m289(vec3 x){return x-floor(x*(1./289.))*289.;}
    vec4 m289(vec4 x){return x-floor(x*(1./289.))*289.;}
    vec4 perm(vec4 x){return m289(((x*34.)+1.)*x);}
    float sn(vec3 v){
      const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
      vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
      vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;
      vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
      vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
      i=m289(i);
      vec4 p=perm(perm(perm(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
      float n_=.142857;vec3 ns=n_*D.wyz-D.xzx;
      vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
      vec4 xx=x_*ns.x+ns.yyyy;vec4 yy=y_*ns.x+ns.yyyy;vec4 h=1.-abs(xx)-abs(yy);
      vec4 b0=vec4(xx.xy,yy.xy);vec4 b1=vec4(xx.zw,yy.zw);
      vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
      vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
      vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
      vec4 nr=1.79284291400159-.85373472095314*sqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
      p0*=nr.x;p1*=nr.y;p2*=nr.z;p3*=nr.w;
      vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
      return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
    void main(){vN=normalize(normalMatrix*normal);vec3 p=position;float r=uNSR/100.;
      float a=.07+r*.25,f=1.6+r*1.4;
      float n=sn(p*f+uT*.36)*a+sn(p*f*2.2-uT*.2)*(a*.4);
      p+=normal*n;vP=(modelMatrix*vec4(p,1.)).xyz;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;

    const FRAG=`uniform float uT;uniform float uNSR;uniform vec3 uCam;varying vec3 vN,vP;
    vec3 hsv(vec3 c){vec4 K=vec4(1.,2./3.,1./3.,3.);
      vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);
      return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);}
    void main(){vec3 n=normalize(vN);vec3 v=normalize(uCam-vP);
      float fr=pow(1.-abs(dot(n,v)),2.7);float r=uNSR/100.;
      float bh=.55-r*.2;float hs=dot(n,v)*.3+sin(uT*.4+vP.y*1.9)*.15;
      vec3 iri=hsv(vec3(bh+hs,.25,1.));
      vec3 core=mix(vec3(.96,.97,.99),iri,fr);
      vec3 ra=hsv(vec3(bh+.1,.4,1.));vec3 rb=hsv(vec3(bh-.15,.4,1.));
      float rm=pow(1.-abs(dot(n,v)),3.);
      vec3 rim=mix(ra,rb,sin(uT*.3+vP.x*2.)*.5+.5)*rm*1.2;
      vec3 col=core+rim;vec3 hv=normalize(v+vec3(.5,.8,.6));
      col+=pow(max(dot(n,hv),0.),80.)*1.2*fr;
      gl_FragColor=vec4(col,1.);}`;

    orbU={uT:{value:0},uNSR:{value:26},uCam:{value:new THREE.Vector3(0,0,4.5)}};
    const orb=new THREE.Mesh(new THREE.SphereGeometry(1.05,128,128),
      new THREE.ShaderMaterial({vertexShader:VERT,fragmentShader:FRAG,uniforms:orbU}));
    SC.add(orb);

    const pC=1500,pG=new THREE.BufferGeometry(),pP=new Float32Array(pC*3);
    for(let i=0;i<pC;i++){const r=4+Math.random()*10,t=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1);
      pP[i*3]=r*Math.sin(ph)*Math.cos(t);pP[i*3+1]=r*Math.sin(ph)*Math.sin(t);pP[i*3+2]=r*Math.cos(ph);}
    pG.setAttribute('position',new THREE.BufferAttribute(pP,3));
    SC.add(new THREE.Points(pG,new THREE.PointsMaterial({color:0x007AFF,size:.015,transparent:true,opacity:.2,sizeAttenuation:true})));

    let oT={x:0,y:0};
    document.addEventListener('mousemove',e=>{oT.x=(e.clientX/innerWidth-.5)*.4;oT.y=-(e.clientY/innerHeight-.5)*.28;});
    (function loop(t=0){requestAnimationFrame(loop);
      if(orbU) {
        orbU.uT.value=t*.001;orbU.uCam.value.copy(CAM.position);
      }
      orb.rotation.y=t*.00017;orb.rotation.x=t*.00008;
      orb.position.x+=(oT.x-orb.position.x)*.04;orb.position.y+=(oT.y-orb.position.y)*.04;
      pt.position.x=Math.sin(t*.0008)*2;R.render(SC,CAM);})();
    window.addEventListener('resize',()=>{CAM.aspect=innerWidth/innerHeight;CAM.updateProjectionMatrix();R.setSize(innerWidth,innerHeight);});
  }
} catch (webglError) {
  console.warn("Three.js/WebGL failed to load or is not supported. Dashboard fallback enabled.", webglError);
}

/* ══ GSAP Intro ══ */
gsap.timeline({delay:.25})
  .from('#h-eye',{autoAlpha:0,y:18,duration:.7,ease:'power2.out'},0)
  .from('#h-med',{autoAlpha:0,y:26,duration:.95,ease:'power3.out'},.2)
  .from('#h-int',{autoAlpha:0,y:14,duration:.7,ease:'power2.out'},.5)
  .to('#h-rl',{autoAlpha:1,duration:.5},.8)
  .to('#h-kp',{autoAlpha:1,duration:.5},.95)
  .from('#topbar',{autoAlpha:0,y:-12,duration:.6},.15)
  .from('#botbar',{autoAlpha:0,y:12,duration:.6},.2);

/* ══ DATA BOOT ══ */
async function boot(){
  try{
    const res=await fetch('/api/master');
    if(!res.ok) throw new Error('HTTP '+res.status);
    MASTER_DATA=await res.json();
    const k=MASTER_DATA.kpis;
    if(orbU) orbU.uNSR.value=k.no_show_rate;
    const e=id=>document.getElementById(id);
    if(e('h-rate'))e('h-rate').textContent=k.no_show_rate+'%';
    if(e('h-leak'))e('h-leak').textContent='₹'+k.revenue_leakage.toLocaleString('en-IN');
    if(e('pval'))e('pval').textContent='₹'+k.revenue_leakage.toLocaleString('en-IN');
    if(e('f1')){e('f1').textContent=k.total_appointments+' appointments loaded';e('f1').style.color='#007AFF';}
    if(e('f2')){e('f2').textContent=k.unique_patients+' unique patients tracked';e('f2').style.color='#1A1C1E';}
    gsap.to('#pulse',{autoAlpha:1,y:-10,duration:.8,delay:.5,ease:'power2.out'});
    if(e('sp-docs')&&MASTER_DATA.doctor_performance){
      e('sp-docs').innerHTML=MASTER_DATA.doctor_performance.slice(0,8).map(d=>
        `<div class="sp-row"><span>${d.full_name}</span><span class="sp-val ${d.no_show_rate>=35?'sp-hot':''}">${d.no_show_rate}%</span></div>`).join('');
    }
    if(e('sp-pts')&&MASTER_DATA.at_risk_patients){
      e('sp-pts').innerHTML=MASTER_DATA.at_risk_patients.slice(0,6).map(p=>
        `<div class="sp-row"><span>${p.full_name}</span><span class="sp-hot">${p.no_show_count} NS</span></div>`).join('');
    }
    if(e('dash')&&e('dash').classList.contains('open')){
      const active=document.querySelector('.dnt.active');
      if(active){const id=active.id.replace('btn-','');if(!_done[id]){_done[id]=true;render(id);}}
    }
  }catch(err){
    const f1=document.getElementById('f1');
    if(f1){f1.textContent='\u26a0 Error: '+err.message;f1.style.color='#FF4D4D';}
    console.error('boot failed:',err);
  }
}
boot();

/* ══ NAV ══ */
let panelOpen=false;
function togglePanel(){panelOpen=!panelOpen;document.getElementById('sidepanel').classList.toggle('open',panelOpen);}

function openDash(id){
  document.getElementById('dash').classList.add('open');
  switchView('s-'+id,id);
  gsap.from('.dc',{opacity:0,y:16,duration:.45,ease:'power2.out',delay:.1});
}
function closeDash(){
  gsap.to('#dash',{opacity:0,duration:.3,ease:'power2.in',onComplete:()=>{
    document.getElementById('dash').classList.remove('open');
    gsap.set('#dash',{opacity:1});
  }});
}

/* ══ CORE SPA SWITCH — zero page reloads, O(1) ══ */
function switchView(tabId, dataId){
  const cur=document.querySelector('.view.active');
  const nxt=document.getElementById(tabId);
  if(cur===nxt) return;

  // Update nav buttons
  document.querySelectorAll('.dnt').forEach(b=>b.classList.remove('active'));
  const btn=document.getElementById('btn-'+dataId);
  if(btn) btn.classList.add('active');

  const showNext=()=>{
    document.querySelectorAll('.view').forEach(v=>{v.classList.remove('active');v.style.display='none';});
    if(nxt){
      nxt.style.display='flex';
      nxt.classList.add('active');
      gsap.fromTo(nxt,{opacity:0,x:20},{opacity:1,x:0,duration:.4,ease:'power2.out'});
      if(MASTER_DATA&&!_done[dataId]){_done[dataId]=true;render(dataId);}
    }
  };

  if(cur){gsap.to(cur,{opacity:0,x:-20,duration:.25,onComplete:()=>{cur.style.display='none';showNext();}});}
  else{showNext();}
}

/* ══ CHART HELPERS ══ */
const T='#007AFF',CR='#FF4D4D',GO='#F0C060',BL='#4F8EF7',VI='#9F7AEA',GR='#06B6D4';
const MU='rgba(0,0,0,.05)';
Chart.defaults.font.family="'JetBrains Mono',monospace";
Chart.defaults.color='#4A4A4A';
const SC2={x:{ticks:{color:'#A0AAB5',font:{size:10}},grid:{color:MU}},y:{ticks:{color:'#A0AAB5',font:{size:10}},grid:{color:MU}}};

function mk(id,cfg){if(charts[id])charts[id].destroy();const c=document.getElementById(id);if(!c)return;charts[id]=new Chart(c.getContext('2d'),cfg);}
function kc(el,items){
  if(!el)return;
  el.innerHTML='';
  items.forEach(c=>{const d=document.createElement('div');d.className='dk '+c.s;
    d.innerHTML=`<div class="dkl">${c.l}</div><div class="dkv">${c.v}</div><div class="dks">${c.sub}</div>`;
    el.appendChild(d);});
  gsap.from(el.querySelectorAll('.dk'),{opacity:0,y:12,stagger:.06,duration:.45,ease:'power2.out'});
}

/* ══ RENDER DISPATCHER ══ */
function render(id){
  if(!MASTER_DATA){console.warn('Data not ready');return;}
  if(id==='overview')  rOverview();
  else if(id==='clinical') rClinical();
  else if(id==='revenue')  rRevenue();
  else if(id==='risk')     rRisk();
  else if(id==='doctors')  rDoctors();
  else if(id==='treatments') rTreatments();
}

/* ── Overview ── */
function rOverview(){
  const k=MASTER_DATA.kpis, tr=MASTER_DATA.trend, sp=MASTER_DATA.specialization, rs=MASTER_DATA.reason_breakdown;
  kc(document.getElementById('kpi-row'),[
    {l:'Total Appointments',v:k.total_appointments,s:'tl',sub:k.unique_patients+' unique patients'},
    {l:'No-Show Rate',v:k.no_show_rate+'%',s:'cr',sub:k.no_show_count+' missed'},
    {l:'Cancelled',v:k.cancelled,s:'go',sub:'appointments'},
    {l:'At-Risk Patients',v:k.at_risk_patients,s:'cr',sub:'≥2 no-shows'},
  ]);
  const labels=tr.map(t=>t.month);
  mk('cTrend',{type:'bar',data:{labels,datasets:[
    {label:'No-Show',data:tr.map(t=>t.no_shows),backgroundColor:'rgba(255,77,77,.7)',borderRadius:4},
    {label:'Completed',data:tr.map(t=>t.completed),backgroundColor:'rgba(0,122,255,.65)',borderRadius:4},
    {label:'Cancelled',data:tr.map(t=>t.cancelled),backgroundColor:'rgba(240,192,96,.7)',borderRadius:4},
  ]},options:{scales:SC2,plugins:{legend:{labels:{color:'#4A4A4A'}}}}});
  mk('cSpec',{type:'doughnut',data:{labels:sp.map(s=>s.specialization),datasets:[{data:sp.map(s=>s.total),backgroundColor:[T,CR,GO,BL,VI],borderWidth:2,borderColor:'#fff'}]},options:{plugins:{legend:{position:'right',labels:{color:'#4A4A4A',font:{size:10}}}}}});
  mk('cLine',{type:'line',data:{labels,datasets:[{label:'No-Shows',data:tr.map(t=>t.no_shows),borderColor:CR,backgroundColor:'rgba(255,77,77,.1)',tension:.4,fill:true,pointRadius:3}]},options:{scales:SC2,plugins:{legend:{display:false}}}});
  if(rs&&rs.length) mk('cReason',{type:'bar',data:{labels:rs.map(r=>r.reason_for_visit),datasets:[{label:'Count',data:rs.map(r=>r.count),backgroundColor:[CR,T,GO,VI,BL,GR],borderRadius:5}]},options:{indexAxis:'y',scales:SC2,plugins:{legend:{display:false}}}});
}

/* ── Revenue ── */
function rRevenue(){
  const d=MASTER_DATA.billing;
  kc(document.getElementById('rev-kr'),[
    {l:'Total Billed',v:'₹'+d.total_billed.toLocaleString('en-IN'),s:'tl',sub:'all appointments'},
    {l:'Revenue Leakage',v:'₹'+d.revenue_leakage.toLocaleString('en-IN'),s:'cr',sub:'from no-shows'},
    {l:'Avg Bill',v:'₹'+d.average_bill.toLocaleString('en-IN'),s:'go',sub:'per appointment'},
  ]);
  const ps=d.payment_status_breakdown;
  mk('cPayS',{type:'doughnut',data:{labels:ps.map(p=>p.payment_status),datasets:[{data:ps.map(p=>p.total_amount),backgroundColor:[T,GO,CR,GR],borderWidth:2,borderColor:'#fff'}]},options:{plugins:{legend:{position:'right',labels:{color:'#4A4A4A'}}}}});
  const pm=d.payment_method_breakdown;
  mk('cPayM',{type:'bar',data:{labels:pm.map(p=>p.payment_method),datasets:[{label:'Total',data:pm.map(p=>p.total),backgroundColor:[T,GO,CR,GR,VI],borderRadius:5}]},options:{scales:SC2,plugins:{legend:{display:false}}}});
}

/* ── Risk Register ── */
function rRisk(){
  const rc=r=>r>=50?CR:r>=30?GO:T;
  document.getElementById('risk-tbl').innerHTML=`<table>
  <thead><tr><th>ID</th><th>Name</th><th>Gender</th><th>Insurance</th><th>No-Shows</th><th>Total</th><th>NS Rate</th></tr></thead>
  <tbody>${MASTER_DATA.at_risk_patients.map(p=>`<tr>
    <td style="color:${T}">${p.patient_id}</td>
    <td style="color:#1A1C1E;font-weight:500">${p.full_name}</td>
    <td>${p.gender||'—'}</td><td>${p.insurance_provider||'—'}</td>
    <td style="color:${CR};font-weight:700">${p.no_show_count}</td>
    <td>${p.total_appointments}</td>
    <td><span style="color:${rc(p.no_show_rate)};font-weight:600">${p.no_show_rate}%</span></td>
  </tr>`).join('')}</tbody></table>`;
}

/* ── Doctor Ranking ── */
function rDoctors(){
  const docs=MASTER_DATA.doctor_performance;
  document.getElementById('dr-bars').innerHTML=docs.map(d=>{
    const c=d.no_show_rate>=35?CR:d.no_show_rate>=25?GO:T;
    return `<div class="dri"><div class="drin"><span>${d.full_name}</span><span style="color:#A0AAB5;font-size:.57rem">${d.specialization}</span></div>
    <div class="drib"><div class="drif" style="width:${d.no_show_rate}%;background:${c}"></div></div>
    <span class="driv" style="color:${c}">${d.no_show_rate}%</span></div>`;
  }).join('');
  mk('cDocB',{type:'bar',data:{labels:docs.map(d=>d.full_name.replace('Dr. ','')),datasets:[{label:'No-Shows',data:docs.map(d=>d.no_shows),backgroundColor:docs.map(d=>d.no_show_rate>=35?'rgba(255,77,77,.75)':'rgba(0,122,255,.65)'),borderRadius:5}]},options:{scales:SC2,plugins:{legend:{display:false}}}});
  mk('cDocA',{type:'bar',data:{labels:docs.map(d=>d.full_name.replace('Dr. ','')),datasets:[{label:'Attendance %',data:docs.map(d=>d.attendance_rate),backgroundColor:'rgba(0,122,255,.6)',borderRadius:5}]},options:{scales:{...SC2,y:{...SC2.y,min:0,max:100}},plugins:{legend:{display:false}}}});
}

/* ── Treatments ── */
function rTreatments(){
  const tx=MASTER_DATA.treatment_breakdown, sp=MASTER_DATA.specialization;
  mk('cTreat',{type:'pie',data:{labels:tx.map(t=>t.treatment_type),datasets:[{data:tx.map(t=>t.count),backgroundColor:[CR,T,GO,BL,VI,GR],borderWidth:2,borderColor:'#fff',hoverOffset:8}]},options:{plugins:{legend:{position:'right',labels:{color:'#4A4A4A',font:{size:10}}}}}});
  mk('cSpecR',{type:'bar',data:{labels:sp.map(s=>s.specialization),datasets:[{label:'No-Show %',data:sp.map(s=>s.no_show_rate),backgroundColor:sp.map(s=>s.no_show_rate>=35?'rgba(255,77,77,.75)':'rgba(0,122,255,.65)'),borderRadius:5}]},options:{scales:SC2,plugins:{legend:{display:false}}}});
}

/* ── Clinical Grid ── */
function rClinical(){_gR=MASTER_DATA.appointments;_gPg=0;applyF();renderG();}
function filterG(){_gSr=document.getElementById('g-search').value.toLowerCase();_gPg=0;applyF();renderG();}
function setGF(s,b){_gSt=s;_gPg=0;document.querySelectorAll('.gfb').forEach(x=>x.classList.remove('active'));b.classList.add('active');applyF();renderG();}
function applyF(){
  _gF=_gR.filter(r=>{
    const sm=_gSt==='all'||r.status===_gSt;
    const sr=!_gSr||Object.values(r).join(' ').toLowerCase().includes(_gSr);
    return sm&&sr;
  });
}
function gPg(d){_gPg=Math.max(0,Math.min(_gPg+d,Math.ceil(_gF.length/_gPS)-1));renderG();}
function renderG(){
  const start=_gPg*_gPS,page=_gF.slice(start,start+_gPS);
  const sc=document.getElementById('g-scroll');
  const NS='No-show',CA='Cancelled';
  const bc={[NS]:'rgba(255,77,77,.08)',[CA]:'rgba(240,192,96,.07)'};
  const tc={[NS]:'#FF4D4D',[CA]:'#F0C060'};
  sc.innerHTML=`<table><thead><tr>
    <th>ID</th><th>Date</th><th>Time</th><th>Patient</th><th>Doctor</th><th>Specialty</th><th>Reason</th><th>Status</th>
  </tr></thead><tbody>${page.map(r=>{
    const s=r.status,bg=bc[s]||'transparent',tc_=tc[s]||'#007AFF';
    const pulse=s===NS?'<span class="ns-pulse"></span>':'';
    return `<tr style="background:${bg}">
      <td style="color:#007AFF;font-family:var(--mono)">${r.appointment_id}</td>
      <td>${r.appointment_date||'—'}</td><td>${r.appointment_time||'—'}</td>
      <td style="color:#1A1C1E;font-weight:500">${r.patient_name||'—'}</td>
      <td>${r.doctor_name||'—'}</td><td>${r.specialization||'—'}</td>
      <td>${r.reason_for_visit||'—'}</td>
      <td><span style="color:${tc_};display:flex;align-items:center;gap:5px">${pulse}${s}</span></td>
    </tr>`;
  }).join('')}</tbody></table>`;
  const total=_gF.length,pages=Math.ceil(total/_gPS)||1;
  document.getElementById('g-show').textContent=`${start+1}–${Math.min(start+_gPS,total)} of ${total}`;
  document.getElementById('g-pg').textContent=`${_gPg+1}/${pages}`;
  document.getElementById('gp-prev').disabled=_gPg===0;
  document.getElementById('gp-next').disabled=_gPg>=pages-1;
}
