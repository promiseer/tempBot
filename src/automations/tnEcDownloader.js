const fs = require("fs");
const path = require("path");
const axios = require("axios");
const logger = require("../../utils/logger");
const { puppeteerInstance, clickButton, getCaptchaTextFromImage } = require("../../utils/pupeteer");

/**
 * Ensures a directory exists; if it doesn't, it creates one recursively.
 * @param {string} dirPath - The path of the directory to ensure existence.
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Saves a remote PDF file to the local filesystem.
 * @param {string} pdfUrl - The URL of the PDF to download.
 * @param {string} fileName - The name (without extension) of the file to be saved.
 * @returns {Promise<string>} - The path where the PDF is saved.
 * @throws Will throw an error if the PDF cannot be saved.
 */
async function savePdfToFile(pdfUrl, fileName) {
  try {
    const dirPath = path.resolve(__dirname, "../../Public/Downloads");
    ensureDirectoryExists(dirPath);

    const filePath = path.join(dirPath, `${fileName}.pdf`);

    logger.info(`Downloading PDF from: ${pdfUrl}`);
    const response = await axios.get(pdfUrl, { responseType: "arraybuffer" });

    fs.writeFileSync(filePath, response.data);
    logger.info(`PDF saved to: ${filePath}`);

    return filePath;
  } catch (error) {
    logger.error(`Error saving PDF: ${error.message}`);
    throw error;
  }
}

/**
 * Selects an option in a dropdown by matching visible text.
 * @param {import("puppeteer").Page} page - The Puppeteer page object.
 * @param {string} selector - CSS selector for the <select> element.
 * @param {string} text - The visible text of the option to select.
 * @throws Will throw an error if the option or the dropdown cannot be found.
 */
async function selectDropdownOption(page, selector, text) {
  try {
    await page.waitForSelector(selector, { timeout: 10000 });
    const optionFound = await page.evaluate(
      (dropdownSelector, optionText) => {
        const select = document.querySelector(dropdownSelector);
        if (!select) return false;

        const options = Array.from(select.options);
        const desiredOption = options.find(
          (opt) => opt.textContent.trim() === optionText
        );

        if (desiredOption) {
          select.value = desiredOption.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
        return false;
      },
      selector,
      text
    );

    if (!optionFound) {
      throw new Error(
        `Option with text "${text}" not found for selector "${selector}"`
      );
    }
  } catch (error) {
    logger.error(
      `Error selecting option in dropdown "${selector}": ${error.message}`
    );
    throw error;
  }
}

/**
 * Handles CAPTCHA by retrieving the text from the CAPTCHA image, filling the form, and returning the image path (for cleanup).
 * @param {import("puppeteer").Page} page - The Puppeteer page object.
 * @returns {Promise<string>} - The path of the captcha image (for deletion).
 * @throws Will throw an error if the CAPTCHA could not be solved or any step fails.
 */
async function handleCaptcha(page) {
  let captchaData;
  try {
    // e.g. getCaptchaTextFromImage(page, "#captcha", maxRetries, delayBetweenRetries)
    captchaData = await getCaptchaTextFromImage(page, "#captcha", 3, 1000);
    // Fill the CAPTCHA
    await page.type("#txt_Captcha", captchaData.captchaText);
    logger.info("Captcha solved and entered.");
    return captchaData.imagePath;
  } catch (error) {
    logger.error(`Failed to solve captcha: ${error.message}`);
    throw error;
  }
}

/**
 * Clicks "Search/View EC" on the page, fills out the form, solves the captcha, and attempts to download the PDF.
 * @param {import("puppeteer").Page} page - The Puppeteer page object.
 * @param {string} sroName - SRO name for the dropdown.
 * @param {string} docNo - Document number.
 * @param {string} docYear - Document year.
 * @returns {Promise<string|null>} - The path to the downloaded file, or null if not found.
 * @throws Will throw an error if any step fails.
 */
async function clickSearchViewEC(page, sroName, docNo, docYear) {
  let captchaImagePath;
  try {
    // Find and click 'Search/View EC'
    const foundSearchECLink = await page.evaluate(() => {
      const element = Array.from(document.querySelectorAll("li, li span")).find(
        (el) => el.textContent.includes("Search/View EC")
      );
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

    logger.info(
      "Clicked 'Search/View EC' link; waiting for content to load..."
    );

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

    // Click the 'DOC_WISE' radio button
    const radioClicked = await page.evaluate(() => {
      const radio = document.querySelector('input[id="DOC_WISE"]');
      if (radio) {
        radio.click();
        return true;
      }
      return false;
    });

    if (!radioClicked) {
      logger.error("'DOC_WISE' radio input not found.");
      return null;
    }

    logger.info(
      "Clicked the 'DOC_WISE' radio button; waiting for page to re-render..."
    );

    // Wait for Document Number input
    await page.waitForSelector("#txt_DocumentNo", { timeout: 60000 });
    logger.info("Document Number input appeared.");

    // Fill in the form
    await selectDropdownOption(page, "#cmb_SroName", sroName);
    await page.type("#txt_DocumentNo", docNo);
    await selectDropdownOption(page, "#cmb_Year", docYear);
    await selectDropdownOption(page, "#cmb_doc_type", "Regular Document");

    logger.info("Form filled successfully. Handling captcha...");

    // Solve captcha
    captchaImagePath = await handleCaptcha(page);

    // Click search
    await clickButton(page, "#btn_SearchDoc");
    logger.info(
      "Clicked the 'Search' button; waiting for page to re-render..."
    );

    // Wait for either the generate PDF link or the "No Documents" message
    const searchResult = await Promise.race([
      page
        .waitForFunction(
          () =>
            Array.from(document.querySelectorAll("a[onClick]")).some((el) =>
              el.getAttribute("onClick").includes("generatePdf")
            ),
          { timeout: 60000 }
        )
        .then(() => "generatePdf"),
      page
        .waitForFunction(
          () => document.body.innerText.includes("No Documents registered"),
          { timeout: 60000 }
        )
        .then(() => "noDocuments"),
    ]);

    // Check if no documents found
    if (searchResult === "noDocuments") {
      logger.warn(
        "No documents registered for the provided search parameters."
      );
      if (captchaImagePath) {
        fs.unlink(captchaImagePath, (err) => {
          if (err)
            logger.error(`Failed to delete captcha image: ${err.message}`);
          else logger.info(`Deleted captcha image: ${captchaImagePath}`);
        });
      }
      return null;
    }

    // If we reach here, there's a generatePdf link
    logger.info("Element with 'generatePdf();' onClick handler appeared.");

    // Click the element with generatePdf() in its onClick
    await page.evaluate(() => {
      const element = Array.from(document.querySelectorAll("a[onClick]")).find(
        (el) => el.getAttribute("onClick").includes("generatePdf")
      );
      if (element) element.click();
      else
        throw new Error(
          "Element with 'generatePdf();' onClick handler not found."
        );
    });

    logger.info("Clicked the element to generate PDF; waiting for new link...");

    // Clean up captcha image
    if (captchaImagePath) {
      fs.unlink(captchaImagePath, (err) => {
        if (err) logger.error(`Failed to delete captcha image: ${err.message}`);
        else logger.info(`Deleted captcha image: ${captchaImagePath}`);
      });
    }

    // Wait for "Click here" link for the PDF
    await page.waitForSelector('a[target="_blank"] span[style*="color: red"]', {
      timeout: 60000,
    });
    logger.info("'Click here' link appeared.");

    // Get the PDF URL
    const pdfLinkHref = await page.evaluate(() => {
      const spans = Array.from(
        document.querySelectorAll(
          'a[target="_blank"] span[style*="color: red"]'
        )
      );
      const span = spans.find((el) => el.textContent.includes("Click here"));
      return span && span.parentElement
        ? span.parentElement.getAttribute("href")
        : null;
    });

    if (!pdfLinkHref) {
      throw new Error("PDF download link not found.");
    }

    // Construct full URL from relative link
    const pdfUrl = new URL(pdfLinkHref, page.url()).href;
    logger.info(`Constructed PDF URL: ${pdfUrl}`);

    // Download and save the PDF
    const filePath = await savePdfToFile(pdfUrl, "tn-encumbrance-certificate");
    return filePath;
  } catch (error) {
    logger.error("Error in clickSearchViewEC function.");
    logger.error(`Message: ${error.message}`);
    logger.error(`Stack: ${error.stack}`);

    // Attempt to delete the captcha image if we have it
    if (captchaImagePath) {
      fs.unlink(captchaImagePath, (err) => {
        if (err) logger.error(`Failed to delete captcha image: ${err.message}`);
        else logger.info(`Deleted captcha image: ${captchaImagePath}`);
      });
    }
    throw error;
  }
}

/**
 * Main function to navigate to the Tamil Nadu registration portal,
 * click "Search/View EC," fill the form, solve captcha, and download the PDF.
 * @param {Object} options - The input parameters.
 * @param {string} options.docNo - The document number.
 * @param {string} options.docYear - The document year.
 * @param {string} options.sroName - The SRO name.
 * @returns {Promise<string|null>} - The path to the downloaded PDF or null if not found.
 */
async function tnEcDownloader({ docNo, docYear, sroName }) {
  logger.info(":: TN EC Downloader Automation Started");

  const browser = await puppeteerInstance();
  const page = await browser.newPage();
  let filePath = null;

  try {
    // Go to Tamil Nadu registration portal
    logger.info("Navigating to Tamil Nadu registration portal...");
    await page.goto("https://tnreginet.gov.in/portal/", {
      waitUntil: "networkidle0",
    });

    // Check if #fontSelection contains "English"
    const fontSelectionContent = await page.$eval(
      "#fontSelection",
      (el) => el.textContent
    );
    if (fontSelectionContent.includes("English")) {
      logger.info(
        "The 'fontSelection' element contains 'English'; clicking it..."
      );
      await clickButton(page, "#fontSelection");
      await page.waitForNavigation({ waitUntil: "networkidle0" });

      // Proceed to Search/View EC flow
      filePath = await clickSearchViewEC(page, sroName, docNo, docYear);
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
