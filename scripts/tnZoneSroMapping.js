const zones = [
  { value: "15", zone: "Chengalpattu" },
  { value: "1", zone: "Chennai" },
  { value: "2", zone: "Coimbatore" },
  { value: "3", zone: "Cuddalore" },
  { value: "4", zone: "Madurai" },
  { value: "13", zone: "Ramanathapuram" },
  { value: "5", zone: "Salem" },
  { value: "7", zone: "Tanjore" },
  { value: "8", zone: "Thirunelveli" },
  { value: "6", zone: "Trichy" },
  { value: "9", zone: "Vellore" },
];
const axios = require("axios");
const fs = require("fs");
const xmlParser = require("xml2js");

const postRequest = async (url, payload = null) => {
  try {
    const response = await axios.post(url, payload, {
      headers: {
        Cookie:
          "PORTALJSESSIONID=GW7xfV8jL5UVWpL8Yx5qBE16njv0CpOg0cPFuRzB.portal6", //@TODO: update cookie and csrf
        Referer:
          "https://tnreginet.gov.in/portal/webHP?requestType=ApplicationRH&actionVal=homePage&screenId=114&UserLocaleID=en&_csrf=0ca42a63-edd5-47ab-b73a-07a892feb855",
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching data:", error);
    return null;
  }
};

const extractOptions = (xmlData, valueKey, labelKey) => {
  const result = xmlParser.parseStringPromise(xmlData);
  return result.then((parsedData) => {
    const options = parsedData.select.option;
    return options
      .map((option) => ({
        id: option.$.value,
        [labelKey]: option._,
      }))
      .slice(1); // Remove the "Select" option
  });
};

const getDistrictsDetails = async (zoneId) => {
  const districtDetails = await postRequest(
    `https://tnreginet.gov.in/portal/webHP?requestType=ApplicationRH&actionVal=loadDistrictCombo&queryType=Select&screenId=8400001&comboValue=${zoneId}&_csrf=0ca42a63-edd5-47ab-b73a-07a892feb855`
  );

  return extractOptions(districtDetails, "value", "district");
};

const getSroDetails = async (distictId) => {
  const sroDetails = await postRequest(
    `https://tnreginet.gov.in/portal/webHP?requestType=ApplicationRH&actionVal=loadSroCombo&queryType=Select&screenId=8400001&comboValue=${distictId}&_csrf=0ca42a63-edd5-47ab-b73a-07a892feb855`
  );
  return extractOptions(sroDetails, "value", "sro");
};
const getVillageDetails = async (villagetId) => {
  const villageDetails = await postRequest(
    `https://tnreginet.gov.in/portal/webHP?requestType=ApplicationRH&actionVal=loadVillageCombo&queryType=Select&screenId=8400001&comboValue=${villagetId}&_csrf=0ca42a63-edd5-47ab-b73a-07a892feb855`
  );
  return extractOptions(villageDetails, "value", "village");
};

const getZoneData = async () => {
  const allZoneData = [];

  for (let zone of zones) {
    const districtData = await getDistrictsDetails(zone.value);

    const districtsWithSroAndVillage = [];

    for (let district of districtData) {
      const sroData = await getSroDetails(district.id);
      const sroWithVillages = [];

      for (let sro of sroData) {
        const villages = await getVillageDetails(sro.id);
        const villageData = villages.map((village) => village.village);

        sroWithVillages.push({
          sro: sro.sro,
          villages: villageData,
        });
      }

      districtsWithSroAndVillage.push({
        district: district.district,
        sros: sroWithVillages,
      });
    }

    // Add zone with its districts, SROs, and villages
    allZoneData.push({
      zone: zone.zone,
      districts: districtsWithSroAndVillage,
    });
  }

  // Return the final structured data
  return allZoneData;
};
// // Fetch and output the data
getZoneData().then((data) => {
  fs.writeFileSync("tnZoneSroMapping.json", JSON.stringify(data, null, 2));
});
