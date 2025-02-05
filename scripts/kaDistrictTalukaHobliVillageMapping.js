const axios = require("axios");
const fs = require("fs");
const { makeRequest } = require("../utils/pupeteer");
const logger = require("../utils/logger");
const { restoreLatestSros, restoreLatestVillages, insertLatestVillages, insertLatestSro, villageDistrictBackup } = require("../src/services/nirnai.service");

const getDistrictsDetails = async () => {
  const districtDetails = await makeRequest(
    `https://kaveri.karnataka.gov.in/api/GetDistrictAsync`,
    "post"
  );

  return districtDetails.data;
};

const getSroDetails = async (districtcode) => {
  const sroDetails = await makeRequest(
    `https://kaveri.karnataka.gov.in/api/GetSroDistrict`,
    "post",
    {},
    { districtcode }
  );

  return sroDetails.data;
};

const getTalukaDetails = async (districtCode) => {
  const talukaDetails = await makeRequest(
    `https://kaveri.karnataka.gov.in/api/GetTalukaAsync`,
    "post",
    {},
    {
      districtCode,
    }
  );

  return talukaDetails.data;
};
const getHobliDetails = async (talukaCode) => {
  const hobliDetails = await makeRequest(
    `https://kaveri.karnataka.gov.in/api/GetHobliAsync`,
    "post",
    {},
    { talukaCode }
  );

  return hobliDetails.data;
};
const getVillageDetails = async (hobliCode) => {
  const villageDetails = await makeRequest(
    `https://kaveri.karnataka.gov.in/api/GetVillageAsync`,
    "post",
    {},
    { hobliCode }
  );

  return villageDetails.data;
};

const fetchKAVillageDistricts = async () => {
  const villageDistrictMapping = [];

  try {
    // Fetch all districts
    const districts = await getDistrictsDetails();
    for (let district of districts) {
      const { districtCode: districtCode, districtNamee: districtName } =
        district;

      // Fetch talukas for the district
      const talukas = await getTalukaDetails(districtCode);

      for (let taluka of talukas) {
        const { talukCode: talukaCode, talukNamee: talukaName } = taluka;

        const hoblis = await getHobliDetails(talukaCode);
        for (let hobli of hoblis) {
          const { hoblicode: hobliCode, hoblinamee: hobliName } = hobli;
          const villages = await getVillageDetails(hobliCode);

          villages.forEach((village) => {
            villageDistrictMapping.push({
              state: "KARNATAKA",
              district: districtName,
              mandal: talukaName,
              village: village.villagenamee,
              sroName: null,
              zone: null,
              town: hobliName,
              createdUser: "4cdfcf9b-0cc9-4c70-9686-22856d6ed01f",
              createdTenant: "0a2ab4d3-4070-4b5f-bcb0-9611a07e0c49",
            });
          });
        }
      }
    }
  } catch (error) {
    console.error("Error getting zone data:", error);
  }
};

const fetchKASroDistricts = async () => {
  const districtSroMapping = [];
  const districts = await getDistrictsDetails();

  await Promise.all(
    districts.map(async (district) => {
      const { districtCode, districtNamee: districtName } = district;
      try {
        const sros = await getSroDetails(districtCode);
        const districtData = sros.map((sro) => ({
          tenant: "38784e96-6b31-4fa1-9072-648304b6b67d",
          code: "STATE.KARNATAKA",
          state: "KARNATAKA",
          district: districtName,
          sroName: sro.sronamee,
          createdUser: "4cdfcf9b-0cc9-4c70-9686-22856d6ed01f",
          createdTenant: "0a2ab4d3-4070-4b5f-bcb0-9611a07e0c49",
        }));
        districtSroMapping.push(...districtData);
      } catch (error) {
        console.error(
          `Error fetching SRO for district ${district.drname}:`,
          error
        );
      }
    })
  );

  return districtSroMapping;
};

const kaProcedure = async () => {
  let state = "KARNATAKA";
  try {
    kaVillageMandalData = await fetchKAVillageDistricts();
    kaSroDistrictsData = await fetchKASroDistricts();

    await villageDistrictBackup({ state }); //backupResponse
    logger.info("KA backup done successfully!");
    await insertLatestSro(kaSroDistrictsData); //insert latest data
    logger.info("KA SroMaster data updated successfully!");
    await insertLatestVillages(kaVillageMandalData); //insert latest data
    logger.info("KA Village data updated successfully!");
  } catch (error) {
    logger.error(`Error occured: ${error.message}`);
    await restoreLatestSros({ state }); //rollback
    await restoreLatestVillages({ state }); //rollback
  }
};

kaProcedure();
