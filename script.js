/* ---------- Navigation ---------- */
const views = ['home','medicine','symptoms','pharmacy','dashboard','chat','appointment'];
const navLabels = {home:'Home',medicine:'Medicines',symptoms:'Symptoms',pharmacy:'Pharmacy',dashboard:'Dashboard',chat:'AI Chat',appointment:'Book visit'};
const navEl = document.getElementById('nav');
views.forEach(v=>{
  const b = document.createElement('button');
  b.textContent = navLabels[v];
  b.onclick = ()=>showView(v);
  b.id = 'nav-'+v;
  navEl.appendChild(b);
});
function showView(name){
  views.forEach(v=>{
    document.getElementById('view-'+v).classList.toggle('active', v===name);
    document.getElementById('nav-'+v).classList.toggle('active', v===name);
  });
  window.scrollTo({top:0,behavior:'smooth'});
}
showView('home');

/* ---------- Medicine search ---------- */
const drugs = [
  {name:'Ibuprofen', form:'NSAID · tablet', dose:'200–400mg every 6–8h, max 1200mg/day OTC', use:'Pain, inflammation, fever', warn:'Avoid with stomach ulcers, kidney disease, or late pregnancy', sev:'med'},
  {name:'Amoxicillin', form:'Penicillin · capsule', dose:'500mg every 8h for 7–10 days', use:'Bacterial infections (ear, throat, chest)', warn:'Do not use if allergic to penicillin', sev:'high'},
  {name:'Metformin', form:'Biguanide · tablet', dose:'500mg twice daily with meals', use:'Type 2 diabetes, blood sugar control', warn:'Pause before contrast imaging; risk of lactic acidosis in kidney disease', sev:'med'},
  {name:'Paracetamol', form:'Analgesic · tablet', dose:'500–1000mg every 4–6h, max 4g/day', use:'Pain relief, fever reduction', warn:'Liver damage in overdose — check combination products', sev:'low'},
  {name:'Lisinopril', form:'ACE inhibitor · tablet', dose:'10mg once daily', use:'High blood pressure, heart failure', warn:'Avoid in pregnancy; may cause persistent dry cough', sev:'med'},
  {name:'Atorvastatin', form:'Statin · tablet', dose:'20mg once daily, evening', use:'High cholesterol, cardiovascular risk reduction', warn:'Avoid grapefruit juice; report unexplained muscle pain', sev:'low'},
  {name:'Loratadine', form:'Antihistamine · tablet', dose:'10mg once daily', use:'Allergies, hay fever, hives', warn:'Generally non-drowsy; reduce dose in kidney impairment', sev:'low'},
  {name:'Tramadol', form:'Opioid · capsule', dose:'50–100mg every 4–6h, max 400mg/day', use:'Moderate to severe pain', warn:'Risk of dependence; do not combine with other sedatives', sev:'high'},
];
function renderDrugs(){
  const q = document.getElementById('medSearch').value.toLowerCase();
  const list = drugs.filter(d=>d.name.toLowerCase().includes(q));
  const container = document.getElementById('drugResults');
  container.innerHTML = list.map(d=>`
    <div class="card drug-card">
      <div class="head">
        <span class="name">${d.name}</span>
        <span class="form">${d.form}</span>
      </div>
      <dl>
        <dt>Typical dose</dt><dd>${d.dose}</dd>
        <dt>Used for</dt><dd>${d.use}</dd>
        <dt>Caution</dt><dd><span class="severity sev-${d.sev}"></span>${d.warn}</dd>
      </dl>
    </div>`).join('') || `<p class="lede">No matches. Try a different name.</p>`;
}
renderDrugs();

/* ---------- Symptom checker ---------- */
const symptomList = ['Headache','Fever','Cough','Sore throat','Fatigue','Nausea','Shortness of breath','Chest pain','Dizziness','Rash','Joint pain','Abdominal pain'];
const chipBox = document.getElementById('symptomChips');
let selected = new Set();
symptomList.forEach(s=>{
  const c = document.createElement('span');
  c.className='chip'; c.textContent=s;
  c.onclick=()=>{ c.classList.toggle('selected'); selected.has(s)?selected.delete(s):selected.add(s); };
  chipBox.appendChild(c);
});
function runSymptomCheck(){
  const box = document.getElementById('symptomResult');
  if(selected.size===0){
    box.innerHTML = `<p class="lede">Select at least one symptom first.</p>`;
    box.classList.add('show'); return;
  }
  const urgent = ['Chest pain','Shortness of breath'];
  const hasUrgent = [...selected].some(s=>urgent.includes(s));
  const score = hasUrgent ? 88 : Math.min(20 + selected.size*9, 65);
  const level = hasUrgent ? 'Seek care promptly' : score>45 ? 'Consider seeing a clinician' : 'Likely manageable at home';
  const color = hasUrgent ? 'var(--pulse)' : score>45 ? '#C99A3B' : 'var(--sage)';
  box.innerHTML = `
    <h3 style="font-family:Georgia,serif;font-size:20px;color:var(--navy);margin:0 0 4px;">${level}</h3>
    <p class="lede" style="margin-bottom:10px;">Based on: ${[...selected].join(', ')}</p>
    <div class="bar-track"><div class="bar-fill" style="width:${score}%;background:${color}"></div></div>
    <p class="lede" style="margin:0;">${hasUrgent ? 'Chest pain or breathing difficulty can indicate a serious condition. Contact emergency services or go to the nearest emergency department now.' : 'This is general guidance, not a diagnosis. If symptoms worsen, persist beyond a few days, or you feel concerned, contact a clinician.'}</p>
  `;
  box.classList.add('show');
}

/* ---------- Pharmacy locator: real geolocation + OpenStreetMap data ---------- */
const pharmStatus = document.getElementById('pharmStatus');
const pharmList = document.getElementById('pharmList');
const pharmMapNote = document.getElementById('pharmMapNote');

(function initLocator(){
  if(!window.isSecureContext){
    const btn = document.getElementById('locateBtn');
    btn.title = 'Location access needs an https:// page — use the address box instead';
    pharmStatus.innerHTML = `This page isn't loaded over <b>https://</b>, so browsers won't allow automatic location lookup here. Type a city or address below and press Search — it still pulls real, live pharmacy data.`;
  }
})();

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

function haversineKm(lat1, lon1, lat2, lon2){
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLon = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function queryOverpass(query){
  let lastErr;
  for(const url of OVERPASS_MIRRORS){
    try{
      const resp = await fetch(url, { method:'POST', body: query });
      if(!resp.ok) throw new Error('HTTP '+resp.status);
      return await resp.json();
    }catch(e){ lastErr = e; }
  }
  throw lastErr;
}

async function findPharmaciesNear(lat, lon, placeLabel){
  pharmStatus.textContent = `Searching for pharmacies near ${placeLabel}…`;
  pharmList.innerHTML = '';
  try{
    const query = `[out:json][timeout:15];(node["amenity"="pharmacy"](around:4000,${lat},${lon});way["amenity"="pharmacy"](around:4000,${lat},${lon}););out center 20;`;
    const data = await queryOverpass(query);
    const elements = (data.elements || []).map(el=>{
      const elat = el.lat ?? el.center?.lat;
      const elon = el.lon ?? el.center?.lon;
      return {
        name: el.tags?.name || 'Unnamed pharmacy',
        lat: elat, lon: elon,
        addr: [el.tags?.['addr:street'], el.tags?.['addr:city']].filter(Boolean).join(', '),
        dist: haversineKm(lat, lon, elat, elon)
      };
    }).filter(p=>!isNaN(p.dist)).sort((a,b)=>a.dist-b.dist).slice(0,10);

    if(elements.length===0){
      pharmStatus.textContent = `No pharmacies found in OpenStreetMap data near ${placeLabel}. Try a different search.`;
      pharmMapNote.textContent = 'no results to plot';
      return;
    }
    pharmStatus.textContent = `Found ${elements.length} pharmacies near ${placeLabel} (sorted by distance).`;
    pharmMapNote.textContent = `${elements.length} pharmacy pin(s) near ${lat.toFixed(3)}, ${lon.toFixed(3)} — open in a map app to view`;
    pharmList.innerHTML = elements.map(p=>`
      <div class="pharm-row">
        <div>
          <div class="name">${p.name}</div>
          <div class="meta">${p.dist.toFixed(1)} km away${p.addr ? ' · '+p.addr : ''}</div>
        </div>
        <a class="ghost" style="text-decoration:none;font-size:11px;padding:8px 14px;" target="_blank"
           href="https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=17/${p.lat}/${p.lon}">View map</a>
      </div>`).join('');
  }catch(err){
    console.error('Solaris pharmacy lookup error:', err);
    pharmStatus.textContent = 'Could not reach the pharmacy database right now. Please try again shortly.';
  }
}

function locatePharmacies(){
  if(!window.isSecureContext){
    pharmStatus.innerHTML = `Your browser is blocking location access because this page isn't loaded over <b>https://</b> (it only allows location lookup on secure pages). Use the address box below instead — try typing your city or street.`;
    return;
  }
  if(!navigator.geolocation){
    pharmStatus.textContent = 'Your browser does not support location lookup. Try searching by address instead.';
    return;
  }
  pharmStatus.textContent = 'Requesting your location…';
  navigator.geolocation.getCurrentPosition(
    pos => findPharmaciesNear(pos.coords.latitude, pos.coords.longitude, 'your location'),
    err => {
      console.error(err);
      let msg = 'Could not get your location. Try searching by address instead.';
      if(err.code === 1) msg = 'Location permission was denied. Allow location access in your browser, or search by address below.';
      if(err.code === 2) msg = 'Your location is currently unavailable. Try searching by address instead.';
      if(err.code === 3) msg = 'Location request timed out. Try again, or search by address instead.';
      pharmStatus.textContent = msg;
    },
    { enableHighAccuracy:true, timeout:10000 }
  );
}

async function searchByAddress(){
  const q = document.getElementById('manualLocation').value.trim();
  if(!q){ pharmStatus.textContent = 'Type a city or address first.'; return; }
  pharmStatus.textContent = `Looking up "${q}"…`;
  try{
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`);
    const results = await resp.json();
    if(!results.length){
      pharmStatus.textContent = `Couldn't find "${q}". Try a more specific place name.`;
      return;
    }
    const { lat, lon, display_name } = results[0];
    findPharmaciesNear(parseFloat(lat), parseFloat(lon), display_name);
  }catch(err){
    console.error(err);
    pharmStatus.textContent = 'Address lookup failed. Please try again.';
  }
}

/* ---------- Dashboard mini chart ---------- */
const hrData = [68,74,71,80,69,73,71];
document.getElementById('hrChart').innerHTML = hrData.map(v=>`<div style="height:${(v/90*100)}%"></div>`).join('');

/* ---------- Chat: live, powered by Claude ---------- */
const chatWindow = document.getElementById('chatWindow');
const chatHistory = []; // {role, content}

const SOLARIS_SYSTEM_PROMPT = `You are Solaris, a cautious AI medical-information assistant embedded in a demo website.
Rules you must always follow:
- You are NOT a doctor and you NEVER provide a diagnosis. Speak in general, educational terms only.
- If the person describes anything suggesting an emergency (chest pain, trouble breathing, severe bleeding, stroke signs, suicidal ideation, overdose, severe allergic reaction, etc.), tell them clearly and immediately to contact local emergency services or go to the nearest emergency department. Keep that instruction at the very top of your reply.
- Keep replies short and conversational — 2 to 5 sentences, plain language, no headers or bullet lists unless truly necessary.
- You can discuss medicines, general symptom information, healthy habits, and when to see a clinician, but always encourage seeing a licensed clinician for anything beyond mild/self-limiting concerns.
- Never invent specific lab values, prescriptions, or dosing for the person individually — speak in general terms ("typical adult doses are usually...") and suggest confirming with a pharmacist or doctor.
- Stay warm, brief, and non-alarmist unless the situation is genuinely urgent.`;

function addMsg(text, who){
  const d = document.createElement('div');
  d.className = 'msg '+who;
  d.textContent = text;
  chatWindow.appendChild(d);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return d;
}

async function sendChat(){
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if(!text) return;
  addMsg(text,'user');
  chatHistory.push({role:'user', content:text});
  input.value='';

  const typingEl = addMsg('…thinking','bot');

  try{
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: SOLARIS_SYSTEM_PROMPT,
        messages: chatHistory
      })
    });
    const data = await response.json();
    const reply = (data.content || [])
      .map(block => block.type === 'text' ? block.text : '')
      .join('')
      .trim() || "I couldn't quite process that — could you rephrase?";
    typingEl.textContent = reply;
    chatHistory.push({role:'assistant', content:reply});
  }catch(err){
    typingEl.textContent = "Something went wrong reaching the assistant. Please try again in a moment.";
    console.error('Solaris chat error:', err);
  }
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* ---------- Appointment booking ---------- */
const slotTimes = ['9:00 AM','10:30 AM','11:15 AM','1:00 PM','2:45 PM','4:00 PM'];
let chosenSlot = null;
const slotsEl = document.getElementById('slots');
slotTimes.forEach(t=>{
  const s = document.createElement('span');
  s.className='slot'; s.textContent=t;
  s.onclick=()=>{
    [...slotsEl.children].forEach(c=>c.classList.remove('selected'));
    s.classList.add('selected');
    chosenSlot = t;
  };
  slotsEl.appendChild(s);
});
function bookAppointment(){
  const name = document.getElementById('apName').value.trim();
  const clinician = document.getElementById('apClinician').value;
  const date = document.getElementById('apDate').value;
  const reason = document.getElementById('apReason').value.trim();
  const box = document.getElementById('apConfirm');
  if(!name || !date || !chosenSlot){
    box.style.borderColor = 'var(--pulse)';
    box.style.color = '#6e3a2e';
    box.style.background = 'rgba(200,71,58,.08)';
    box.innerHTML = 'Please add your name, a date, and pick a time slot before confirming.';
    box.classList.add('show');
    return;
  }
  box.style.borderColor = 'var(--sage)';
  box.style.color = '#3c4d40';
  box.style.background = 'rgba(92,122,102,.08)';
  box.innerHTML = `<b>Appointment requested.</b><br>${name} with ${clinician} on ${date} at ${chosenSlot}${reason ? ' — ' + reason : ''}. You'll receive a confirmation message shortly.`;
  box.classList.add('show');
}
