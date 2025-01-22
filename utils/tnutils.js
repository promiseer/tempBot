const fs = require("fs");
const path = require("path");
const axios = require("axios");
const logger = require("./logger");
const { getCaptchaTextFromImage, clickButton } = require("./pupeteer");

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
    const dirPath = path.resolve(__dirname, "../../public/Downloads");
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
  try {
    // Example usage of getCaptchaTextFromImage
    const captchaData = await getCaptchaTextFromImage(
      page,
      "#captcha",
      3,
      1000
    );

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
 * Generic helper to click a selector and wait for a specific selector to appear.
 * @param {import("puppeteer").Page} page
 * @param {string} clickSelector - CSS selector to click on.
 * @param {string} waitForSelector - CSS selector to wait for after clicking.
 * @param {number} [timeout=60000]
 */
async function clickElementAndWaitForSelector(
  page,
  clickSelector,
  waitForSelector,
  timeout = 60000
) {
  await Promise.all([
    page.waitForSelector(waitForSelector, { timeout }),
    page.click(clickSelector),
  ]);
}

/**
 * Generic helper to click a selector and wait for navigation.
 * @param {import("puppeteer").Page} page
 * @param {string} clickSelector - CSS selector to click on.
 * @param {object} [options={ waitUntil: 'load', timeout: 60000 }]
 */
async function clickElementAndWaitForNavigation(
  page,
  clickSelector,
  options = { waitUntil: "load", timeout: 60000 }
) {
  await Promise.all([
    page.waitForNavigation(options),
    page.click(clickSelector),
  ]);
}

module.exports = {
  ensureDirectoryExists,
  savePdfToFile,
  selectDropdownOption,
  handleCaptcha,
  clickElementAndWaitForSelector,
  clickElementAndWaitForNavigation,
};
