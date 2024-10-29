const puppeteer = require("puppeteer");
const fs = require("fs");
const logger = require("./logger");
const { PDFDocument } = require("pdf-lib");
const { deleteFile } = require("./deleteFile");

const puppeteerInstance = async (options = {}) => {
  try {
    const browser = await initializeBrowser(options);

    browser.on("disconnected", () => {
      logger.info(":: Browser disconnected");
    });
    return browser;
  } catch (error) {
    logger.error("Error launching Puppeteer:", error);
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
    args: ["--start-maximized", "--no-sandbox", "--disable-setuid-sandbox"],
    ...options,
  });
};

const delay = async (delay) => {
  logger.info(`Sleeping for ${delay}ms`);
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

const clickButton = async (page, selector, maxAttempts = 3, sleep = 1000) => {
  let attempts = 0;
  let clicked = false;

  while (attempts < maxAttempts && !clicked) {
    try {
      await page.waitForSelector(selector);
      const button = await page.locator(selector);
      if (await button.wait()) {
        await button.click(); // Click the button
        // logger.info(`Button  clicked on attempt ${attempts + 1}`);
        clicked = true;
      } else {
        logger.info(`Button not visible on attempt ${attempts + 1}`);
      }
    } catch (error) {
      logger.info(`Error on attempt ${attempts + 1}: ${error}`);
    }

    attempts++;

    if (!clicked && attempts < maxAttempts) {
      logger.info(`Retrying... (${attempts}/${maxAttempts})`);
      await delay(sleep); // Wait before retrying
    }
  }

  if (!clicked) {
    throw new Error(
      `Failed to click the button after ${maxAttempts} attempts.`
    );
  }
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
    logger.info("Captcha Text Found:", captchaText);
    return captchaText;
  } else if (maxRetries > 0) {
    // Retry after a specified interval if captchaText is empty
    logger.info(`Retrying... attempts left: ${maxRetries}`);
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
    margin: { top: 40, right: 40, bottom: 40, left: 40 }, // Adjust margins as needed
  });

  // Save the PDF to a file
  fs.writeFileSync(`${path}.pdf`, pdfBuffer);
  logger.info(`PDF saved as ${path}.pdf`);
};

const elementFinder = async (page, selector, delay = 1000) => {
  await page.waitForSelector(selector, { timeout: delay }).catch(() => null);
};

const generatePDF = async (page, tableSelector, filePath) => {
  try {
    const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Extracted Table PDF</title>
  <style>
      table {
          border-collapse: collapse;
      }

      td, th {
          border: 2px solid black;
          padding: 8px;
          margin-bottom: 0;
      }

      .centered-table {
          text-align: center;
      }
  </style>
</head>
<body>
  <div id="content">
      <!-- Table will be appended here -->
  </div>
</body>
</html>`;

    const getTableHTML = async (retryCount = 3) => {
      try {
        return await page.evaluate((selector) => {
          const table = document.querySelector(selector);
          if (!table) {
            throw new Error("Table not found");
          }
          return table.outerHTML;
        }, tableSelector);
      } catch (error) {
        if (retryCount > 0) {
          console.log(
            `Retrying table extraction... Attempts left: ${retryCount}`
          );
          await delay(2000); // Wait 2 seconds before retrying
          return getTableHTML(retryCount - 1); // Recursive retry with decremented counter
        } else {
          throw new Error("Table extraction failed after 3 retries");
        }
      }
    };

    const tableHTML = await getTableHTML();
    const finalHTML = htmlTemplate.replace(
      "<!-- Table will be appended here -->",
      tableHTML
    );

    await page.setContent(finalHTML); // Set the HTML content to the page
    await downloadPdf(page, filePath);
    return `${filePath}.pdf`;
  } catch (error) {
    logger.error(`Error:`, error);
    throw error;
  }
};

// Merge PDFs
async function mergePDFs(pdfPaths, outputPath) {
  try {
    // Create a new PDF document to hold the merged content
    const mergedPdf = await PDFDocument.create();
    const pdfOnlyPaths = pdfPaths.filter((path) => path.endsWith(".pdf"));

    if (pdfOnlyPaths.length === 0) {
      logger.info("No valid PDF files found to merge.");
      return null;
    }

    // Iterate over the paths of PDFs to merge
    for (const pdfPath of pdfOnlyPaths) {
      // Load each PDF
      logger.info(pdfPath);

      const pdfBytes = fs.readFileSync(pdfPath);
      const pdf = await PDFDocument.load(pdfBytes);

      // Copy each page to the merged PDF
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
      await deleteFile(pdfPath);
    }

    // Save the merged PDF as bytes and write to the output file
    const mergedPdfBytes = await mergedPdf.save();
    fs.writeFileSync(outputPath, mergedPdfBytes);
    logger.info(`Merged PDF saved to ${outputPath}`);
    return outputPath;
  } catch (error) {
    logger.error(`Error:${error.message}`);
  }
}

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
  elementFinder,
  generatePDF,
  mergePDFs,
};
