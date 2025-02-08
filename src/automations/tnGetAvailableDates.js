const logger = require("../../utils/logger");
const { puppeteerInstance } = require("../../utils/pupeteer");
const moment = require("moment");

/**
 * Navigates to the TN Registration portal’s Available Dates page,
 * verifies the given zone, district, SRO and village, and finally returns the start and end dates.
 * If the end date is empty, it returns tomorrow’s date.
 *
 * @param {Object} options - Input options.
 * @param {string} options.zone - Zone name (e.g. "Chengalpattu").
 * @param {string} options.district - District name (e.g. "Chengalpattu" or "Kancheepuram" or "Tambaram").
 * @param {string} options.sroName - SRO name (as displayed in the dro list).
 * @param {string} options.village - Village name (as it appears in the table).
 * @param {Object} [options.browser] - Optional existing Puppeteer browser instance.
 * @returns {Promise<Object>} - An object of the form { startDate, endDate }.
 * @throws {Error} If any step (zone, district, SRO, or village) is not found.
 */
async function tnGetAvailableDates({
  zone,
  district,
  sroName,
  village,
  browser: providedBrowser,
}) {
  logger.info(":: getAvailableDates Automation Started");

  let browser;
  let page;
  let newBrowserCreated = false;
  let availableDates = null;

  try {
    // Use an existing browser instance if provided; otherwise, create a new one.
    if (providedBrowser) {
      browser = providedBrowser;
      logger.info("Using existing browser instance.");
    } else {
      browser = await puppeteerInstance();
      newBrowserCreated = true;
      logger.info("Created a new browser instance.");
    }

    // Open a new tab (page) in the browser
    page = await browser.newPage();

    // 1. Navigate to the available dates page
    logger.info("Navigating to TN Registration portal Available Dates page...");
    await page.goto(
      "https://tnreginet.gov.in/portal/webHP?requestType=ApplicationRH&actionVal=openDataAvailableDateEC&screenId=8400001",
      { waitUntil: "load" }
    );

    // 2. Wait for the header "EC Data Available Periods"
    await page.waitForFunction(
      () => {
        const h2 = document.querySelector("h2");
        return h2 && h2.textContent.trim() === "EC Data Available Periods";
      },
      { timeout: 60000 }
    );
    logger.info("Found header: 'EC Data Available Periods'");

    // 3. Wait for the zone container (assumed to be a <div> with an id starting with "zone")
    await page.waitForSelector("div[id^='zone']", { timeout: 60000 });

    // 4. Find the correct zone element.
    //    The zone elements are rendered as:
    //    <li class="zoneDtls" id="15">
    //      <a ... class="zoneDtls" ...><span> Chengalpattu</span></a>
    //    </li>
    const zoneElements = await page.$$("li.zoneDtls > a.zoneDtls");
    let zoneFound = false;
    for (let zoneEl of zoneElements) {
      const zoneText = await page.evaluate((el) => el.textContent, zoneEl);
      if (zoneText.trim().toLowerCase() === zone.toLowerCase()) {
        zoneFound = true;
        logger.info(`Found zone: "${zoneText.trim()}"`);
        // Click the zone to expand its dro list.
        await zoneEl.click();

        // Determine the parent li’s id (e.g. "15") and wait for the corresponding dro container
        const parentLi = await zoneEl.getProperty("parentElement");
        const liIdHandle = await parentLi.getProperty("id");
        const liId = await liIdHandle.jsonValue();
        const droSelector = `div#divDro${liId}`;
        await page.waitForSelector(droSelector, {
          visible: true,
          timeout: 60000,
        });
        break;
      }
    }
    if (!zoneFound) {
      throw new Error(`Invalid zone: "${zone}"`);
    }

    // 5. Find the district inside the expanded dro container.
    const droContainers = await page.$$("div[id^='divDro']");
    let targetDroContainer = null;
    for (let dro of droContainers) {
      const display = await page.evaluate(
        (el) => window.getComputedStyle(el).display,
        dro
      );
      if (display !== "none") {
        targetDroContainer = dro;
        break;
      }
    }
    if (!targetDroContainer) {
      throw new Error("No dro container found for the selected zone.");
    }

    // Get all dro items – each is rendered as a <li class="droDtls"> containing an <a>
    const droItems = await targetDroContainer.$$("li.droDtls > a");
    let districtFound = false;
    for (let droItem of droItems) {
      const droText = await page.evaluate((el) => el.textContent, droItem);
      if (droText.trim().toLowerCase() === district.toLowerCase()) {
        districtFound = true;
        logger.info(`Found district: "${droText.trim()}"`);
        await droItem.click();

        // After clicking, wait for the corresponding SRO container to appear.
        const parentLi = await droItem.getProperty("parentElement");
        const liIdHandle = await parentLi.getProperty("id");
        const liId = await liIdHandle.jsonValue();
        const sroSelector = `div#divSro${liId}`;
        await page.waitForSelector(sroSelector, {
          visible: true,
          timeout: 60000,
        });
        break;
      }
    }
    if (!districtFound) {
      throw new Error(`Invalid district: "${district}"`);
    }

    // 6. Within the now–expanded SRO container, look for the correct SRO.
    const sroContainers = await page.$$("div[id^='divSro']");
    let targetSroContainer = null;
    for (let sroCon of sroContainers) {
      const display = await page.evaluate(
        (el) => window.getComputedStyle(el).display,
        sroCon
      );
      if (display !== "none") {
        targetSroContainer = sroCon;
        break;
      }
    }
    if (!targetSroContainer) {
      throw new Error("No SRO container found for the selected district.");
    }

    const sroItems = await targetSroContainer.$$("li.sroDtls > a");
    let sroFound = false;
    for (let sroItem of sroItems) {
      const sroText = await page.evaluate((el) => el.textContent, sroItem);
      if (sroText.trim().toLowerCase() === sroName.toLowerCase()) {
        sroFound = true;
        logger.info(`Found SRO: "${sroText.trim()}"`);
        await sroItem.click();

        // Wait for the corresponding village container to expand.
        const parentLi = await sroItem.getProperty("parentElement");
        const liIdHandle = await parentLi.getProperty("id");
        const liId = await liIdHandle.jsonValue();
        const villageSelector = `div#divVillage${liId}`;
        await page.waitForSelector(villageSelector, {
          visible: true,
          timeout: 60000,
        });
        break;
      }
    }
    if (!sroFound) {
      throw new Error(`Invalid SRO Name: "${sroName}"`);
    }

    // 7. Within the expanded village container, get the table of available dates.
    const villageContainers = await page.$$("div[id^='divVillage']");
    let targetVillageContainer = null;
    for (let vCon of villageContainers) {
      const display = await page.evaluate(
        (el) => window.getComputedStyle(el).display,
        vCon
      );
      if (display !== "none") {
        targetVillageContainer = vCon;
        break;
      }
    }
    if (!targetVillageContainer) {
      throw new Error("No village container found for the selected SRO.");
    }
    await targetVillageContainer.waitForSelector("table#villageDtlsList", {
      visible: true,
      timeout: 60000,
    });
    const tableHandle = await targetVillageContainer.$("table#villageDtlsList");

    // 8. Find the table row that matches the given village.
    //    (Assuming the village name is in the second column (td index 1) of each row.)
    const rows = await tableHandle.$$("tbody tr");
    let foundRow = null;
    for (let row of rows) {
      const cells = await row.$$("td");
      if (cells.length >= 4) {
        const villageName = await page.evaluate(
          (el) => el.textContent,
          cells[1]
        );
        if (villageName.trim().toLowerCase() === village.toLowerCase()) {
          foundRow = cells;
          break;
        }
      }
    }
    if (!foundRow) {
      throw new Error(`Village "${village}" not found in the list.`);
    }

    // 9. Extract start date and end date.
    //     Per sample, cell index 2 is the start date and index 3 is the end date.
    let startDateText = await page.evaluate(
      (el) => el.textContent,
      foundRow[2]
    );
    let endDateText = await page.evaluate((el) => el.textContent, foundRow[3]);
    startDateText = startDateText.trim();
    endDateText = endDateText.trim();

    // If end date is empty, use tomorrow’s date.
    if (!endDateText) {
      endDateText = moment().add(1, "days").format("DD-MMM-YYYY");
    }

    logger.info(
      `For village "${village}": Start Date = "${startDateText}", End Date = "${endDateText}"`
    );
    availableDates = { startDate: startDateText, endDate: endDateText };
  } catch (error) {
    logger.error("Error in tnGetAvailableDates function.");
    logger.error(`Message: ${error.message}`);
    logger.error(`Stack: ${error.stack}`);
    throw error;
  } finally {
    // Close the tab (page) that was opened
    if (page) {
      await page.close();
    }
    // Only close the browser if we created it in this function
    if (newBrowserCreated && browser) {
      await browser.close();
    }
  }

  return availableDates;
}

module.exports = tnGetAvailableDates;
