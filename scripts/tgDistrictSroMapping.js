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
const logger = require("../utils/logger");
const { makeRequest } = require("../utils/pupeteer");
const fetchTgVillageMandal = require("./tgMandalVillageMapping");
const {
  insertLatestVillages,
  villageDistrictBackup,
  insertLatestSro,
  restoreLatestSros,
  restoreLatestVillages,
} = require("../src/services/nirnai.service");

const districtSroMapping = [];
const fetchTgSroDistricts = async () => {
  await Promise.all(
    districts.map(async (district) => {
      try {
        const response = await makeRequest(
          `https://registration.telangana.gov.in/getsrolist.htm?districtCode=${district.drcode}`,
          "get"
        );
        if (response.data) {
          const districtData = response.data
            .split("##")
            .filter((item) => item && item.trim() !== "")
            .map((item) => {
              const [name, code] = item.split("/");
              return {
                tenant: "38784e96-6b31-4fa1-9072-648304b6b67d",
                code: "STATE.TELANGANA",
                state: "TELANGANA",
                district: district.drname,
                sroName: `${name}(${code})`,
                createdUser: "4cdfcf9b-0cc9-4c70-9686-22856d6ed01f",
                createdTenant: "0a2ab4d3-4070-4b5f-bcb0-9611a07e0c49",
              };
            });
          districtSroMapping.push(...districtData);
        } else {
          throw new Error("data not found");
        }
      } catch (error) {
        logger.error(
          `Error fetching SRO for district ${district.drname}:`,
          error
        );
      }
    })
  );
  return districtSroMapping;
};

const tgProcedure = async () => {
  let state = "TELANGANA";
  try {
    tgVillageMandalData = await fetchTgVillageMandal();
    tgSroDistrictsData = await fetchTgSroDistricts();

    await villageDistrictBackup({ state }); //backupResponse
    logger.info("TG backup done successfully!");
    await insertLatestSro(tgSroDistrictsData); //insert latest data
    await insertLatestVillages(tgVillageMandalData); //insert latest data
    logger.info("TG sro data updated successfully!");
  } catch (error) {
    console.log(error);

    logger.error(`Error occured: ${error.message}`);
    await restoreLatestSros({ state }); //rollback
    await restoreLatestVillages({ state }); //rollback
  }
};

tgProcedure();
