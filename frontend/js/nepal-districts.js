// Nepal's 77 districts by province. Names match the ML location encoder and
// the external weather poll's city field.

const NEPAL_PROVINCES = [
  { name: 'Koshi',         icon: '🏔️', color: '#3b82f6' },
  { name: 'Madhesh',       icon: '🌾', color: '#22c55e' },
  { name: 'Bagmati',       icon: '🏙️', color: '#8b5cf6' },
  { name: 'Gandaki',       icon: '⛰️', color: '#f97316' },
  { name: 'Lumbini',       icon: '🕌', color: '#eab308' },
  { name: 'Karnali',       icon: '🏞️', color: '#14b8a6' },
  { name: 'Sudurpashchim', icon: '🌄', color: '#ec4899' },
];

const NEPAL_DISTRICT_PROVINCE = {
  Bhojpur: 'Koshi', Dhankuta: 'Koshi', Ilam: 'Koshi', Jhapa: 'Koshi',
  Khotang: 'Koshi', Morang: 'Koshi', Okhaldhunga: 'Koshi', Panchthar: 'Koshi',
  Sankhuwasabha: 'Koshi', Solukhumbu: 'Koshi', Sunsari: 'Koshi', Taplejung: 'Koshi',
  Terhathum: 'Koshi', Udayapur: 'Koshi',
  Bara: 'Madhesh', Dhanusa: 'Madhesh', Mahottari: 'Madhesh', Parsa: 'Madhesh',
  Rautahat: 'Madhesh', Saptari: 'Madhesh', Sarlahi: 'Madhesh', Siraha: 'Madhesh',
  Bhaktapur: 'Bagmati', Chitwan: 'Bagmati', Dhading: 'Bagmati', Dolakha: 'Bagmati',
  Kathmandu: 'Bagmati', Kavrepalanchok: 'Bagmati', Lalitpur: 'Bagmati', Makwanpur: 'Bagmati',
  Nuwakot: 'Bagmati', Ramechhap: 'Bagmati', Rasuwa: 'Bagmati', Sindhuli: 'Bagmati',
  Sindhupalchok: 'Bagmati',
  Baglung: 'Gandaki', Gorkha: 'Gandaki', Kaski: 'Gandaki', Lamjung: 'Gandaki',
  Manang: 'Gandaki', Mustang: 'Gandaki', Myagdi: 'Gandaki', 'Nawalparasi East': 'Gandaki',
  Parbat: 'Gandaki', Syangja: 'Gandaki', Tanahu: 'Gandaki',
  Arghakhanchi: 'Lumbini', Banke: 'Lumbini', Bardiya: 'Lumbini', Dang: 'Lumbini',
  Gulmi: 'Lumbini', Kapilbastu: 'Lumbini', 'Nawalparasi West': 'Lumbini', Palpa: 'Lumbini',
  Pyuthan: 'Lumbini', Rolpa: 'Lumbini', 'Rukum East': 'Lumbini', Rupandehi: 'Lumbini',
  Dailekh: 'Karnali', Dolpa: 'Karnali', Humla: 'Karnali', Jajarkot: 'Karnali',
  Jumla: 'Karnali', Kalikot: 'Karnali', Mugu: 'Karnali', Salyan: 'Karnali',
  Surkhet: 'Karnali', 'Rukum West': 'Karnali',
  Achham: 'Sudurpashchim', Baitadi: 'Sudurpashchim', Bajhang: 'Sudurpashchim', Bajura: 'Sudurpashchim',
  Dadeldhura: 'Sudurpashchim', Darchula: 'Sudurpashchim', Doti: 'Sudurpashchim',
  Kailali: 'Sudurpashchim', Kanchanpur: 'Sudurpashchim',
};

// Province for a district name or free-form location string
function nepalProvinceOf(location) {
  if (!location) return null;
  const norm = String(location).trim().toLowerCase();
  if (!norm) return null;

  const lookup = {};
  for (const [district, province] of Object.entries(NEPAL_DISTRICT_PROVINCE)) {
    lookup[district.toLowerCase()] = province;
  }

  // Exact district name first
  if (lookup[norm]) return lookup[norm];

  // Token match: "Koshi River, Sunsari" → Sunsari → Koshi
  const tokens = norm.split(/[,;|/\\\u2013\u2014-]+/);
  for (const raw of tokens) {
    const token = raw.trim();
    if (lookup[token]) return lookup[token];
    // Handle "X District" / "X district" suffixes
    if (token.endsWith('district')) {
      const stripped = token.slice(0, -'district'.length).trim();
      if (lookup[stripped]) return lookup[stripped];
    }
  }
  return null;
}

// Fill a district <select> for a province (disables it when no province).
function populateDistrictSelect(districtSel, provinceName) {
  if (!districtSel) return;
  districtSel.innerHTML = '<option value="">All districts</option>';
  if (!provinceName) { districtSel.disabled = true; return; }
  districtSel.disabled = false;
  Object.entries(NEPAL_DISTRICT_PROVINCE)
    .filter(([, prov]) => prov === provinceName)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([district]) => {
      const opt = document.createElement('option');
      opt.value = district;
      opt.textContent = district;
      districtSel.appendChild(opt);
    });
}

window.NEPAL_PROVINCES = NEPAL_PROVINCES;
window.NEPAL_DISTRICT_PROVINCE = NEPAL_DISTRICT_PROVINCE;
window.nepalProvinceOf = nepalProvinceOf;
window.populateDistrictSelect = populateDistrictSelect;
