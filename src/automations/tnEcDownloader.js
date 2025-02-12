const logger = require("../../utils/logger");
const { puppeteerInstance, clickButton } = require("../../utils/pupeteer");
const { clickAndSearchEcDnos } = require("./tnDnosDownloader");
const tnGetAvailableDates = require("./tnGetAvailableDates");
const { clickAndSearchSnos } = require("./tnSnosDownloader");
const moment = require("moment");
/**
 * Main function to navigate to the Tamil Nadu registration portal,
 * click "Search/View EC," fill the form, solve captcha, and download the PDF.
 * @param {Object} options - The input parameters.
 * @param {string} options.docNo - The document number.
 * @param {string} options.docYear - The document year.
 * @param {string} options.sroName - The SRO name.
 * @returns {Promise<string|null>} - The path to the downloaded PDF or null if not found.
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
  logger.info(":: TN EC Downloader Automation Started");

  const browser = await puppeteerInstance();
  const page = await browser.newPage();
  let filePath = null;

  try {
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

      // 3. Find and click 'Search/View EC'
      const foundSearchECLink = await page.evaluate(() => {
        const element = Array.from(
          document.querySelectorAll("li, li span")
        ).find((el) => el.textContent.includes("Search/View EC"));
        if (element) {
          element.click();
          return true;
        }
        return false;
      });

      if (!foundSearchECLink) {
        logger.error("'Search/View EC' element not found.");
        return null;
      }

      logger.info("Clicked 'Search/View EC'; waiting for content to load...");

      // 4. Wait for the "Search Encumbrance Certificate" subheading
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
      logger.info("Found the 'Search Encumbrance Certificate' subheading.");

      switch (encumbranceType) {
        case "ENCUMBRANCE_TYPE.SNOS":
          // Get available dates from the portal
          const availableDates = await tnGetAvailableDates({
            district,
            sroName,
            village,
            zone,
            browser,
          });

          // Parse the user-provided dates.
          // startDate is provided as "DD/MM/YYYY" and we use moment().subtract(1, "days") for the user end date.
          const userStart = moment(startDate, "DD/MM/YYYY");
          const userEnd = moment().subtract(1, "days");

          // Parse the available dates returned by tnGetAvailableDates (assumed to be in "DD-MMM-YYYY")
          const availableStart = moment(
            availableDates.startDate,
            "DD-MMM-YYYY"
          );
          const availableEnd = moment(availableDates.endDate, "DD-MMM-YYYY");

          // Compute the intersection of the two date ranges:
          // Intersection start is the later of the two start dates.
          // Intersection end is the earlier of the two end dates.
          const intersectionStart = moment.max(userStart, availableStart);
          const intersectionEnd = moment.min(userEnd, availableEnd);

          // Format the intersection dates as "DD-MMM-YYYY"
          const ecStartDate = intersectionStart.format("DD-MMM-YYYY");
          const endDate = intersectionEnd.format("DD-MMM-YYYY");

          // Pass the intersection dates into your downloader function.
          filePath = await clickAndSearchSnos(
            page,
            zone,
            district,
            sroName,
            ecStartDate,
            endDate,
            village,
            surveyNo
          );
          break;
        case "ENCUMBRANCE_TYPE.DNOS":
          filePath = await clickAndSearchEcDnos(page, sroName, docNo, docYear);
          break;
        default:
          throw new Error(`Invalid Encumbrance Type: ${encumbranceType}`);
      }
    } else {
      logger.info(
        "The 'fontSelection' element does not contain 'English'; skipping the click."
      );
    }
  } catch (error) {
    logger.error("Error in tnEcDownloader function.");
    logger.error(`Message: ${error.message}`);
    logger.error(`Stack: ${error.stack}`);
    throw error; // re-throw to let the caller handle it
  } finally {
    await browser.close();
  }

  return filePath;
}

module.exports = tnEcDownloader;
