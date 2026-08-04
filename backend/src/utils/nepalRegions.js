// Nepal's 77 districts by province. Names match the ML location encoder and
// the external weather poll's city field, so alerts filter cleanly by district.

const DISTRICT_PROVINCE = {
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

const PROVINCES = [
  'Koshi', 'Madhesh', 'Bagmati', 'Gandaki', 'Lumbini', 'Karnali', 'Sudurpashchim',
];

const ALL_DISTRICTS = Object.keys(DISTRICT_PROVINCE);

// Canonical district name for a district/location string, or null.
function normalizeDistrict(name) {
  if (!name) return null;
  let n = String(name).trim();
  if (!n) return null;
  if (/ district$/i.test(n)) n = n.replace(/ district$/i, '').trim();
  const match = ALL_DISTRICTS.find(d => d.toLowerCase() === n.toLowerCase());
  return match || null;
}

function provinceOfDistrict(name) {
  const d = normalizeDistrict(name);
  return d ? DISTRICT_PROVINCE[d] : null;
}

function districtsOfProvince(province) {
  if (!province) return [];
  const p = String(province).trim().toLowerCase();
  return ALL_DISTRICTS.filter(d => DISTRICT_PROVINCE[d].toLowerCase() === p);
}

// Case-insensitive equality regex for a district, tolerating a " District" suffix.
function districtRegex(district) {
  const d = normalizeDistrict(district);
  if (!d) return null;
  return new RegExp(`^${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( district)?$`, 'i');
}

module.exports = {
  DISTRICT_PROVINCE,
  PROVINCES,
  ALL_DISTRICTS,
  normalizeDistrict,
  provinceOfDistrict,
  districtsOfProvince,
  districtRegex,
};
