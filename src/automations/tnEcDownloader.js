const logger = require("../../utils/logger");
const { puppeteerInstance, clickButton } = require("../../utils/pupeteer");
const { clickAndSearchEcDnos } = require("./tnDnosDownloader");
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
  startDate:ecStartDate,
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
          const endDate = moment().subtract(1, "days").format("DD-MMM-YYYY");
          const startDate = moment(ecStartDate, "DD/MM/YYYY").format(
            "DD-MMM-YYYY"
          );
          filePath = await clickAndSearchSnos(
            page,
            zone,
            district,
            sroName,
            startDate,
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
