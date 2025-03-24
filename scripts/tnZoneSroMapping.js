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
const xmlParser = require("xml2js");
const {
  makeRequest,
  puppeteerInstance,
  clickButton,
} = require("../utils/pupeteer");
const logger = require("../utils/logger");

const {
  villageDistrictBackup,
  insertLatestVillages,
  restoreLatestVillages,
} = require("../src/services/nirnai.service");

const getCookies = async () => {
  try {
    logger.info(":: TN EC Downloader Automation Started");

    const browser = await puppeteerInstance();
    const page = await browser.newPage();

    // 1. Go to Tamil Nadu registration portal
    logger.info("Navigating to Tamil Nadu registration portal...");
    await page.goto("https://tnreginet.gov.in/portal/", {
      waitUntil: "load",
    });

    // 2. Check if #fontSelection contains "English"
    const fontSelectionContent = await page.$eval(
      "#fontSelection",
      (el) => el.textContent
    );
    if (fontSelectionContent.includes("English")) {
      logger.info(
        "The 'fontSelection' element contains 'English'; clicking it..."
      );
      await clickButton(page, "#fontSelection");
      await page.waitForNavigation({ waitUntil: "load" });

      const { screenId, csrfToken } = await page.evaluate(() => {
        const url = window.location.href; // Get the current URL
        const urlParams = new URLSearchParams(url.split("?")[1]); // Parse the query string
        const screenId = urlParams.get("screenId");
        const csrfToken = urlParams.get("_csrf");

        return { screenId, csrfToken };
      });
      const cookies = await page.cookies();
      const sessionValue = cookies.find(
        (cookie) => cookie.name === "PORTALJSESSIONID"
      )?.value;
      if (sessionValue && screenId && csrfToken) {
        await page.close();
        await browser.close();

        let Cookie = `PORTALJSESSIONID=${sessionValue}`;
        return { Cookie, screenId, csrfToken };
      } else {
        throw new Error("Cookie values not found");
      }
    } else {
      logger.info(
        "The 'fontSelection' element does not contain 'English'; skipping the click."
      );
    }
  } catch (error) {
    throw error;
  }
};

const getHeaders = async () => {
  const { Cookie, screenId, csrfToken } = await getCookies();
  return {
    headers: {
      cookie: Cookie,
      Referer: `https://tnreginet.gov.in/portal/webHP?requestType=ApplicationRH&actionVal=homePage&screenId=${screenId}&UserLocaleID=en&_csrf=${csrfToken}`,
    },
    screenId,
    csrfToken,
  };
};

const extractOptions = (xmlData, valueKey, labelKey) => {
  try {
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
  } catch (error) {
    console.log(error);
  }
};

const getDistrictsDetails = async (zoneId, csrfToken, headers) => {
  try {
    const districtDetails = await makeRequest(
      `https://tnreginet.gov.in/portal/webHP?requestType=ApplicationRH&actionVal=loadDistrictCombo&queryType=Select&screenId=8400001&comboValue=${zoneId}&_csrf=${csrfToken}`,
      "post",
      headers
    );

    return extractOptions(districtDetails.data, "value", "district");
  } catch (error) {
    console.log(error.message);
  }
};

const getSroDetails = async (distictId, csrfToken, headers) => {
  try {
    const sroDetails = await makeRequest(
      `https://tnreginet.gov.in/portal/webHP?requestType=ApplicationRH&actionVal=loadSroCombo&queryType=Select&screenId=8400001&comboValue=${distictId}&_csrf=${csrfToken}`,
      "post",
      headers
    );

    return extractOptions(sroDetails.data, "value", "sro");
  } catch (error) {
    console.log(error);
  }
};
const getVillageDetails = async (villagetId, csrfToken, headers) => {
  try {
    const villageDetails = await makeRequest(
      `https://tnreginet.gov.in/portal/webHP?requestType=ApplicationRH&actionVal=loadVillageCombo&queryType=Select&screenId=8400001&comboValue=${villagetId}&_csrf=${csrfToken}`,
      "post",
      headers
    );
    return extractOptions(villageDetails.data, "value", "village");
  } catch (error) {
    console.log(error);
  }
};

const getZoneData = async () => {
  try {
    const allZoneData = [];
    const { headers, csrfToken } = await getHeaders();
    for (let zone of zones) {
      const districtData = await getDistrictsDetails(
        zone.value,
        csrfToken,
        headers
      );

      for (let district of districtData) {
        const sroData = await getSroDetails(district.id, csrfToken, headers);
        for (let sro of sroData) {
          const villages = await getVillageDetails(sro.id, csrfToken, headers);
          villages.forEach((village) =>
            allZoneData.push({
              state: "TAMIL NADU",
              district: district.district,
              mandal: null,
              village: village.village,
              villagecode: null,
              sroName: sro.sro,
              zone: zone.zone,
              town: null,
              createdUser: "4cdfcf9b-0cc9-4c70-9686-22856d6ed01f",
              createdTenant: "0a2ab4d3-4070-4b5f-bcb0-9611a07e0c49",
            })
          );
        }
      }
    }
    if (allZoneData.length === 0) {
      throw new Error("No zone data found.");
    }
    return allZoneData;
  } catch (error) {
    console.log(error);
  }
};

const tnProcedure = async () => {
  let state = "TAMIL NADU";
  try {
    apData = await getZoneData();
    const backupResponse = await villageDistrictBackup({ state }); //backupResponse
    logger.info("TN village backup done successfully!");
    const insertResponse = await insertLatestVillages(apData); //insert latest data
    logger.info("TN village data updated successfully!");
  } catch (error) {
    logger.error(`Error occured: ${error.message}`);
    await restoreLatestVillages({ state }); //rollback
    logger.info("TN village data restored successfully!");
  }
};

tnProcedure();
