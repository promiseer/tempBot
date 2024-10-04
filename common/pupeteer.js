const puppeteer = require("puppeteer");
const fs = require("fs");

const puppeteerInstance = async (options = {}) => {
  try {
    const browser = await initializeBrowser(options);

    browser.on("disconnected", () => {
      console.log(":: Browser disconnected");
    });
    return browser;
  } catch (error) {
    console.error("Error launching Puppeteer:", error);
    throw error;
  }
};

const initializeBrowser = async (options) => {
  return await puppeteer.launch({
    headless: false,
    timeout: 30000, // Adjust timeout as needed
    saveSessionData: true, // Set to true to save session data
    caches: true, // Disable caching
    defaultViewport: null,
    args: ["--start-maximized"],
    ...options,
  });
};

const delay = async (delay) => {
  console.log(`Sleeping for ${delay}ms`);
  await new Promise((resolve) => setTimeout(resolve, delay));
};

const saveSessionData = async (page, cookiesFilePath, localStorageFilePath) => {
  const cookies = await page.cookies();
  fs.writeFileSync(cookiesFilePath, JSON.stringify(cookies, null, 2));

  const localStorageData = await page.evaluate(() =>
    JSON.stringify(localStorage)
  );
  fs.writeFileSync(localStorageFilePath, localStorageData);
};
const dropDownSelector = async (page, selector, text) => {
  await page.waitForSelector(selector);
  await page.click(selector); // Click to open the dropdown
  await page.locator(selector).fill(text);
  await page.keyboard.press("Enter"); // Press Enter to select
};

const fillInput = async (page, selector, text) => {
  await page.waitForSelector(selector);
  await page.click(selector); // Click to open the dropdown
  await page.locator(selector).fill(text);
};
const selectOption = async (page, selector, value) => {
  await page.select(selector, value);
};

const clickButton = async (page, selector, text) => {
  await page.waitForSelector(selector);
  await page.locator(selector).click(); // Select Buildings (OR) Structures or Survey Numbers
};

const responseValidator = async (page, url) => {
  const response = await page.waitForResponse(
    (response) => response.url() === url && response.status() === 200
  );
  const contentType = response.headers()["content-type"];

  // Check if the response is JSON
  if (contentType && contentType.includes("application/json")) {
    return await response.json(); // Parse and return JSON response
  } else {
    return await response.text(); // Return plain text or other format
  } // Return the response body (assuming it's JSON)
};

const getCaptchaText = async (
  page,
  selector,
  maxRetries = 10,
  retryInterval = 1000
) => {
  await page.waitForSelector(selector);
  const captchaText = await page.$eval(
    selector,
    (element) => element.innerText
  );

  // If captchaText is not empty, return it
  if (captchaText) {
    console.log("Captcha Text Found:", captchaText);
    return captchaText;
  } else if (maxRetries > 0) {
    // Retry after a specified interval if captchaText is empty
    console.log(`Retrying... attempts left: ${maxRetries}`);
    await new Promise((resolve) => setTimeout(resolve, retryInterval)); // Wait before retrying
    return getCaptchaText(page, selector, maxRetries - 1, retryInterval);
  } else {
    throw new Error("Failed to retrieve CAPTCHA text after multiple attempts");
  }
};
const waitForSelector = async (page, selector, timeout = 10000) => {
  try {
    await page.waitForSelector(selector, { timeout });
  } catch (error) {
    throw new Error(`Timeout while waiting for selector: ${selector}`);
  }
};

const downloadPdf = async (page, path) => {
  const pdfBuffer = await page.pdf({
    format: "Legal", // Adjust the format as needed
    printBackground: true, // Include background graphics
    // margin: { top: 40, right: 40, bottom: 40, left: 40 }, // Adjust margins as needed
  });

  // Save the PDF to a file
  fs.writeFileSync(`${path}.pdf`, pdfBuffer);
  console.log(`PDF saved as ${path}.pdf`);
};

module.exports = {
  puppeteerInstance,
  dropDownSelector,
  fillInput,
  selectOption,
  clickButton,
  responseValidator,
  waitForSelector,
  getCaptchaText,
  downloadPdf,
  delay,
};
