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
  { drname: "WANAPARTHY", drcode: "14_4" },
  { drname: "WARANGAL", drcode: "21_2" },
  { drname: "YADADRI BHUVANAGIRI", drcode: "23_3" },
];

const axios = require("axios");
const { puppeteerInstance } = require("../utils/pupeteer");
const { handleLogin } = require("../src/automations/tgEcDownloader");
const logger = require("../utils/logger");

let cachedCookies = null; // Variable to cache cookies

const getCookies = async () => {
  try {
    const browser = await puppeteerInstance();
    let page = await browser.newPage();
    page = await handleLogin(page, browser);
    const cookies = await page.cookies();
    const sessionValue = cookies.find(
      (cookie) => cookie.name === "JSESSIONID"
    )?.value;
    const tsValue = cookies.find(
      (cookie) => cookie.name === "TS016bddd0"
    )?.value;

    if (sessionValue && tsValue) {
      await page.close();
      await browser.close();

      cachedCookies = `BIGipServerregistration.telangana.gov.in_HTTPS_pool=1433143818.47873.0000; JSESSIONID=${sessionValue}; TS016bddd0=${tsValue}`;
      return cachedCookies;
    } else {
      throw new Error("Cookie values not found");
    }
  } catch (error) {
    throw error;
  }
};

// Function to get headers, including cookies
const getHeaders = async () => {
  const cookies = await getCookies();
  return {
    Cookie: cookies,
    Referer:
      "https://registration.telangana.gov.in/EncumbranceCertificate/Search_Form.htm",
  };
};

const fetchData = async (url, headers) => {
  try {
    const response = await axios.post(url, null, { headers });
    return response.data;
  } catch (error) {
    console.error("Error fetching data:", error);
    return null;
  }
};

const getMandalDetails = async (district, headers) => {
  const mandalDetails = await fetchData(
    `https://registration.telangana.gov.in/EncumbranceCertificate/MandalDetails.htm?dist_code=${district.drcode}`,
    headers
  );

  if (mandalDetails?.message === "fail") {
    logger.error("invalid cookies");
    console.log(district);

    return [];
  }

  if (!mandalDetails || !mandalDetails.mandalDetails) return [];

  const districtMandalVillageData = await Promise.all(
    mandalDetails.mandalDetails.map(async (mandal) => {
      const villages = await getVillageDetails(
        district.drcode,
        mandal.mandal_code,
        headers
      );

      return villages.map((village) => ({
        state: "TELANGANA",
        district: district.drname,
        mandal: mandal.mandal_name,
        village: village.village_name,
        sroName: null,
        zone: null,
        town: null,
        createdUser: "4cdfcf9b-0cc9-4c70-9686-22856d6ed01f",
        createdTenant: "0a2ab4d3-4070-4b5f-bcb0-9611a07e0c49",
      }));
    })
  );

  return districtMandalVillageData.flat();
};

const getVillageDetails = async (districtCode, mandalCode, headers) => {
  const villageDetails = await fetchData(
    `https://registration.telangana.gov.in/EncumbranceCertificate/VillageDetails.htm?dist_code=${districtCode}&mandal_code=${mandalCode}`,
    headers
  );
  return villageDetails && villageDetails.villageDetails
    ? villageDetails.villageDetails
    : [];
};

const fetchTgVillageMandal = async () => {
  const mandalVillageMapping = [];
  const headers = await getHeaders();
  await Promise.all(
    districts.map(async (district) => {
      const districtData = await getMandalDetails(district, headers);
      mandalVillageMapping.push(...districtData);
    })
  );

  return mandalVillageMapping;
};

module.exports = fetchTgVillageMandal;
