const districts = [
  { drname: "ADILABAD", drcode: "19_1" },
  { drname: "BHADRADRI KOTHAGUDEM", drcode: "22_2" },
  { drname: "HANUMAKONDA", drcode: "21_1" },
  { drname: "HYDERABAD", drcode: "16_1" },
  { drname: "JAGTIAL", drcode: "20_2" },
  { drname: "JANGAON", drcode: "21_3" },
  { drname: "JAYASHANKAR BHOOPALPALLY", drcode: "21_4" },
  { drname: "JOGULAMBA GADWAL", drcode: "14_2" },
  { drname: "KAMAREDDY", drcode: "18_2" },
  { drname: "KARIMNAGAR", drcode: "20_1" },
  { drname: "KHAMMAM", drcode: "22_1" },
  { drname: "KOMARAM BHEEM ASIFABAD", drcode: "19_4" },
  { drname: "MAHABUBABAD", drcode: "21_5" },
  { drname: "MAHABUBNAGAR", drcode: "14_1" },
  { drname: "MANCHERIAL", drcode: "19_3" },
  { drname: "MEDAK", drcode: "17_1" },
  { drname: "MEDCHAL-MALKAJGIRI", drcode: "15_2" },
  { drname: "MULUGU", drcode: "21_6" },
  { drname: "NAGARKURNOOL", drcode: "14_3" },
  { drname: "NALGONDA", drcode: "23_1" },
  { drname: "NARAYANPET", drcode: "14_5" },
  { drname: "NIRMAL", drcode: "19_2" },
  { drname: "NIZAMABAD", drcode: "18_1" },
  { drname: "PEDDAPALLI", drcode: "20_4" },
  { drname: "RAJANNA SIRCILLA", drcode: "20_3" },
  { drname: "RANGAREDDY", drcode: "15_1" },
  { drname: "SANGAREDDY", drcode: "17_2" },
  { drname: "SIDDIPET", drcode: "17_3" },
  { drname: "SURYAPET", drcode: "23_2" },
  { drname: "VIKARABAD", drcode: "15_3" },
  { drname: "VIKARABAD", drcode: "15_3" },
  { drname: "VIKARABAD", drcode: "15_3" },
  { drname: "WANAPARTHY", drcode: "14_4" },
  { drname: "WARANGAL", drcode: "21_2" },
  { drname: "YADADRI BHUVANAGIRI", drcode: "23_3" },
];

const axios = require("axios");
const fs = require("fs");
const headers = {
  Cookie:
    "BIGipServerregistration.telangana.gov.in_HTTPS_pool=1433143818.47873.0000; JSESSIONID=Zn2fn1Sd1XytKKSGHpqBDzB3pHBKlYF1jpK466JXpHLd7QwRcfVj!2077272998!1736397661562; TS016bddd0=01646265bc58448b9a13c19fc260191de538a783a14d068b07b7bfd0aa7a721243db5954684d8ffdeb52df798ff8de2243f979fc53355784870b22da021b5c605fc6830f386a120728c2ed8d5f4f315141ba5c413f1c4234da973221af481c63485531aaa7",
  Referer:
    "https://registration.telangana.gov.in/EncumbranceCertificate/Search_Form.htm",
};

const fetchData = async (url) => {
  try {
    const response = await axios.post(url, null, { headers });
    return response.data;
  } catch (error) {
    console.error("Error fetching data:", error);
    return null;
  }
};

// Function to get mandals and villages for a district
const getMandalDetails = async (district) => {
  // Get mandal details for the district
  const mandalDetails = await fetchData(
    `https://registration.telangana.gov.in/EncumbranceCertificate/MandalDetails.htm?dist_code=${district.drcode}`
  );

  if (!mandalDetails || !mandalDetails.mandalDetails) return [];

  const districtMandalVillageData = [];

  // Process each mandal
  for (let mandal of mandalDetails.mandalDetails) {
    const villages = await getVillageDetails(
      district.drcode,
      mandal.mandal_code
    );

    if (villages.length > 0) {
      // Add the district, mandal, and village data to the result
      districtMandalVillageData.push({
        district: district.drname,
        mandal: mandal.mandal_name,
        villages: villages.map((village) => village.village_name),
      });
    }
  }

  return districtMandalVillageData;
};

const getVillageDetails = async (districtCode, mandalCode) => {
  const villageDetails = await fetchData(
    `https://registration.telangana.gov.in/EncumbranceCertificate/VillageDetails.htm?dist_code=${districtCode}&mandal_code=${mandalCode}`
  );

  return villageDetails && villageDetails.villageDetails
    ? villageDetails.villageDetails
    : [];
};
// Function to fetch data for all districts
const fetchAllDistrictsData = async (districts) => {
  const allDistrictData = [];

  for (let district of districts) {
    const districtData = await getMandalDetails(district);
    allDistrictData.push(...districtData);
  }

  return allDistrictData;
};

// Fetch data and output
fetchAllDistrictsData(districts).then((data) => {
  fs.writeFileSync(
    "tgMandalVillageMapping.json",
    JSON.stringify(data, null, 2)
  );
});
