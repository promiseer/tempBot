const axios = require("axios");
const logger = require("../utils/logger");

const https = require("https");
const agent = new https.Agent({
  rejectUnauthorized: false, // Disables certificate verification
});

const getDistricts = async () => {
  try {
    const agent = new https.Agent({
      rejectUnauthorized: false, // Disables certificate verification
    });
    const districts = await axios.get(
      "https://registration.ap.gov.in/igrspi/v1/mvHandle/getDist",
      { httpsAgent: agent } // Pass the agent to axios
    );

    return districts?.data?.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchApMandalVillage= async () => {
  const districtSroMapping = [];
  const districts = await getDistricts();

  await Promise.all(
    districts.map(async (district) => {
      try {
        const mandalResponse = await axios.get(
          `https://registration.ap.gov.in/igrspi/v1/mvHandle/getMandal?DISTRICT_CODE=${district.DISTRICT_CODE}`,
          { httpsAgent: agent } // Pass the agent to axios
        );

        if (mandalResponse.data && mandalResponse.data.data) {
          const mandals = mandalResponse.data.data;
          mandals.map(async (mandal) => {
            const vilageResponse = await axios.get(
              `https://registration.ap.gov.in/igrspi/v1/mvHandle/getVillage?DISTRICT_CODE=${district.DISTRICT_CODE}&MANDAL_CODE=${mandal.MANDAL_CODE}`,
              { httpsAgent: agent } // Pass the agent to
            );
            villages = vilageResponse.data.data;

            const villageData = villages.map((village) => ({
              state: "ANDHRA PRADESH",
              district: district.DISTRICT_NAME,
              mandal: mandal.MANDAL_NAME,
              village: village.VILLAGE_NAME,
              villageCode: null,
              sroName: null,
              zone: null,
              town: null,
              createdUser: "4cdfcf9b-0cc9-4c70-9686-22856d6ed01f",
              createdTenant: "0a2ab4d3-4070-4b5f-bcb0-9611a07e0c49",
            }));

            districtSroMapping.push(...villageData);
          });
        } else {
          throw new Error("data not found");
        }
      } catch (error) {
        console.error(
          `Error fetching SRO for district ${district.DISTRICT_NAME}:`,
          error
        );
      }
    })
  );
  return districtSroMapping;
};

module.exports = fetchApMandalVillage;
