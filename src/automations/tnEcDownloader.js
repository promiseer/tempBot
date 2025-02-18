const logger = require("../../utils/logger");
const { puppeteerInstance } = require("../../utils/pupeteer");
const { clickAndSearchEcDnos } = require("./tnDnosDownloader");
const tnGetAvailableDates = require("./tnGetAvailableDates");
const { clickAndSearchSnos } = require("./tnSnosDownloader");
const moment = require("moment");

/**
 * Sets the entire browser session to English.
 * If #fontSelection says "English," we click it and wait until it reads "தமிழ்."
 */
async function setBrowserLanguageToEnglish(browser) {
  const page = await browser.newPage();
  try {
    await page.goto("https://tnreginet.gov.in/portal/", { waitUntil: "load" });

    const fontSelectionContent = await page.$eval(
      "#fontSelection",
      (el) => el.textContent
    );

    if (fontSelectionContent.includes("English")) {
      logger.info("Switching browser session to English...");
      await page.click("#fontSelection");

      // Wait for the link text to become "தமிழ்"
      await page.waitForFunction(
        () => {
          const el = document.querySelector("#fontSelection");
          return el && el.textContent.includes("தமிழ்");
        },
        { timeout: 15000 }
      );

      logger.info("Now in English session (link label is 'தமிழ்').");
    } else {
      logger.info(
        "Already in English or link not found; skipping language toggle..."
      );
    }
  } catch (error) {
    logger.error(`Error setting browser language to English: ${error.message}`);
    throw error;
  } finally {
    await page.close();
  }
}

/**
 * Opens the home page (already in English session), finds and clicks "Search/View EC,"
 * then waits for the "Search Encumbrance Certificate" page to appear.
 */
async function openSearchEC(page) {
  logger.info("Navigating to 'Search/View EC' in current English session...");

  await page.goto("https://tnreginet.gov.in/portal/", { waitUntil: "load" });

  // Click 'Search/View EC'
  const found = await page.evaluate(() => {
    const element = Array.from(document.querySelectorAll("li, li span")).find(
      (el) => el.textContent.includes("Search/View EC")
    );
    if (element) {
      element.click();
      return true;
    }
    return false;
  });
  if (!found) {
    throw new Error("'Search/View EC' element not found on the page.");
  }

  logger.info("Clicked 'Search/View EC'; waiting for subheading...");

  // Wait for "Search Encumbrance Certificate" subheading
  await page.waitForFunction(
    () => {
      const heading = document.querySelector("h2.sub-heading");
      return (
        heading &&
        heading.textContent.trim() === "Search Encumbrance Certificate"
      );
    },
    { timeout: 60000 }
  );

  logger.info("Arrived at 'Search Encumbrance Certificate' page.");
}

/**
 * Main function for orchestrating EC downloads:
 * 1. Sets browser to English once.
 * 2. For SNOS, gets date availability and loops in 5-year chunks,
 *    opening a new page for each chunk.
 * 3. For DNOS, simply opens a new page once and downloads the PDF if available.
 */
async function tnEcDownloader({
  docNo,
  docYear,
  sroName,
  district,
  village,
  surveyNo,
  zone,
  encumbranceType,
  startDate,
}) {
  logger.info(":: TN EC Downloader Automation Started ::");

  const browser = await puppeteerInstance();
  let filePaths = [];

  try {
    // 1) Set the browser session to English one time
    await setBrowserLanguageToEnglish(browser);

    // 2) Handle SNOS or DNOS
    if (encumbranceType === "ENCUMBRANCE_TYPE.SNOS") {
      // a) Use a page to get available date range
      logger.info("Getting available date range from portal...");
      const datePage = await browser.newPage();
      const availableDates = await tnGetAvailableDates({
        district,
        sroName,
        village,
        zone,
        browser,
      });
      await datePage.close();

      // b) Compute intersection
      const userStart = moment(startDate, "DD/MM/YYYY");
      const userEnd = moment().subtract(1, "days"); // up to yesterday
      const availableStart = moment(availableDates.startDate, "DD-MMM-YYYY");
      const availableEnd = moment(availableDates.endDate, "DD-MMM-YYYY");

      const intersectionStart = moment.max(userStart, availableStart);
      const intersectionEnd = moment.min(userEnd, availableEnd);
      if (intersectionStart.isAfter(intersectionEnd)) {
        logger.warn(
          "No overlapping date range between user input and portal availability."
        );
        return [];
      }

      // c) Loop in 5-year chunks
      let chunkStart = intersectionStart.clone();
      while (chunkStart.isSameOrBefore(intersectionEnd)) {
        const chunkEnd = moment.min(
          chunkStart.clone().add(5, "years").subtract(1, "days"),
          intersectionEnd
        );

        const ecStartDate = chunkStart.format("DD-MMM-YYYY");
        const ecEndDate = chunkEnd.format("DD-MMM-YYYY");
        logger.info(`Processing SNOS chunk: ${ecStartDate} to ${ecEndDate}...`);

        // d) For each chunk, open a new page, navigate to search form, do the search
        const chunkPage = await browser.newPage();
        await openSearchEC(chunkPage);

        const filePathChunk = await clickAndSearchSnos(
          chunkPage,
          zone,
          district,
          sroName,
          ecStartDate,
          ecEndDate,
          village,
          surveyNo
        );

        if (filePathChunk) filePaths.push(filePathChunk);
        await chunkPage.close();

        // move on
        chunkStart = chunkEnd.clone().add(1, "days");
      }
    } else if (encumbranceType === "ENCUMBRANCE_TYPE.DNOS") {
      // For DNOS, single doc/year
      const dnosPage = await browser.newPage();
      await openSearchEC(dnosPage);

      const filePath = await clickAndSearchEcDnos(
        dnosPage,
        sroName,
        docNo,
        docYear
      );
      if (filePath) filePaths.push(filePath);

      await dnosPage.close();
    } else {
      throw new Error(`Invalid Encumbrance Type: ${encumbranceType}`);
    }
  } catch (error) {
    logger.error("Error in tnEcDownloader function.");
    logger.error(`Message: ${error.message}`);
    logger.error(`Stack: ${error.stack}`);
    throw error;
  } finally {
    await browser.close();
  }

  return filePaths;
}

module.exports = tnEcDownloader;
