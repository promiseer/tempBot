const axios = require("axios");
const fs = require("fs");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const postRequest = async (url, payload = null) => {
  try {
    const response = await axios.post(url, payload);
    return response.data;
  } catch (error) {
    console.error("Error fetching data:", error);
    return null;
  }
};

const getDistrictsDetails = async (zoneId) => {
  const districtDetails = await postRequest(
    `https://kaveri.karnataka.gov.in/api/GetDistrictAsync`
  );

  return districtDetails;
};
const getTalukaDetails = async (districtCode) => {
  const districtDetails = await postRequest(
    `https://kaveri.karnataka.gov.in/api/GetTalukaAsync`,
    {
      districtCode,
    }
  );

  return districtDetails;
};
const getHobliDetails = async (talukaCode) => {
  const hobliDetails = await postRequest(
    `https://kaveri.karnataka.gov.in/api/GetHobliAsync`,
    { talukaCode }
  );

  return hobliDetails;
};
const getVillageDetails = async (hobliCode) => {
  const villageDetails = await postRequest(
    `https://kaveri.karnataka.gov.in/api/GetVillageAsync`,
    { hobliCode }
  );

  return villageDetails;
};

const getZoneData = async () => {
  const allZoneData = [];

  // Fetch all districts
  const districts = await getDistrictsDetails();
  for (let district of districts) {
    const districtCode = district.districtCode;
    const districtName = district.districtNamee;

    // Fetch talukas for the district
    const talukas = await getTalukaDetails(districtCode);
    const talukaData = [];

    for (let taluka of talukas) {
      const talukaCode = taluka.talukCode;
      const talukaName = taluka.talukNamee;

      const hoblis = await getHobliDetails(talukaCode);

      const hobliData = [];

      for (let hobli of hoblis) {
        const hobliCode = hobli.hoblicode;
        const hobliName = hobli.hoblinamee;
        const villages = await getVillageDetails(hobliCode);
        const villageData = villages.map((village) => village.villagenamee);

        hobliData.push({
          hobliName,
          villages: villageData,
        });
        await delay(1000);
      }

      talukaData.push({
        talukaName,
        hoblis: hobliData,
      });
      await delay(1000);
    }

    allZoneData.push({
      districtName,
      talukas: talukaData,
    });
    console.log(allZoneData);

    await delay(1000);
  }

  // Write the final mapped data to a JSON file
  fs.writeFileSync(
    "kaDistrictTalukaHobliVillageMapping.json",
    JSON.stringify(allZoneData, null, 2)
  );
  console.log(
    "Data successfully written to district_taluka_hobli_village_mapping.json"
  );
};

// Execute the main function
getZoneData();
