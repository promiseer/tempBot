const logger = require("../../utils/logger");
const {
  puppeteerInstance,
  clickButton,
  getCaptchaTextFromImage,
} = require("../../utils/pupeteer");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

// Helper function to ensure directory exists
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Helper function to save the PDF file
const savePdfToFile = async (pdfUrl, fileName) => {
  const dirPath = path.resolve(__dirname, "../../Public/Downloads");

  // Ensure that the directory exists
  ensureDirectoryExists(dirPath);

  // Construct the full file path
  const filePath = path.join(dirPath, `${fileName}.pdf`);

  // Download the PDF using axios
  const response = await axios.get(pdfUrl, { responseType: "stream" });
  const writer = fs.createWriteStream(filePath);

  return new Promise((resolve, reject) => {
    response.data.pipe(writer);
    let error = null;
    writer.on("error", (err) => {
      error = err;
      writer.close();
      logger.error(`Error saving PDF: ${err.message}`);
      reject(err);
    });
    writer.on("close", () => {
      if (!error) {
        logger.info(`PDF saved to ${filePath}`);
        resolve(filePath);
      }
    });
  });
};

// Helper function to select an option by visible text in a dropdown
const selectDropdownOption = async (page, selector, text) => {
  try {
    await page.waitForSelector(selector, { timeout: 10000 }); // Wait for the dropdown to appear
    const optionFound = await page.evaluate(
      (selector, text) => {
        const select = document.querySelector(selector);
        const options = Array.from(select.options);
        const option = options.find((opt) => opt.textContent.trim() === text);
        if (option) {
          select.value = option.value;
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
};

// Helper function to handle CAPTCHA
const handleCaptcha = async (page) => {
  try {
    // Get CAPTCHA text using the same utility from AP code
    const captchaText = await getCaptchaTextFromImage(
      page,
      "#captcha",
      3,
      1000
    );

    // Fill CAPTCHA input field with id #txt_Captcha
    await page.type("#txt_Captcha", captchaText);
    logger.info("Captcha solved and entered.");
  } catch (error) {
    logger.error("Failed to solve captcha.");
    throw error;
  }
};

// Helper function to click "Search/View EC" li element and handle the process after it
const clickSearchViewEC = async (page, sroName, docNo, docYear) => {
  try {
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

    if (found) {
      logger.info(
        "Clicked 'Search/View EC' link, waiting for content to load..."
      );

      // Step 1: Wait for <h2> with class 'sub-heading' and text 'Search Encumbrance Certificate'
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

      // Step 2: Click the radio input with id 'DOC_WISE'
      const radioClicked = await page.evaluate(() => {
        const radio = document.querySelector('input[id="DOC_WISE"]');
        if (radio) {
          radio.click();
          return true;
        }
        return false;
      });

      if (radioClicked) {
        logger.info(
          "Clicked the 'DOC_WISE' radio button, waiting for page to re-render..."
        );

        // Step 3: Wait for the 'txt_DocumentNo' element to appear
        await page.waitForSelector("#txt_DocumentNo", { timeout: 60000 });
        logger.info("Document Number input appeared.");

        // Step 4: Fill in the form fields
        await selectDropdownOption(page, "#cmb_SroName", sroName); // Select SRO name
        await page.type("#txt_DocumentNo", docNo); // Fill Document Number
        await selectDropdownOption(page, "#cmb_Year", docYear); // Select Year
        await selectDropdownOption(page, "#cmb_doc_type", "Regular Document"); // Select Document Type

        logger.info("Form filled successfully. Handling captcha...");

        // Step 5: Solve captcha
        await handleCaptcha(page);

        // Step 6: Click the search button
        await clickButton(page, "#btn_SearchDoc");
        logger.info(
          "Clicked the 'Search' button. Waiting for page to re-render..."
        );

        // Step 7: Wait for the element with onClick='generatePdf();' to appear
        const searchResult = await Promise.race([
          page
            .waitForFunction(
              () => {
                return Array.from(document.querySelectorAll("a[onClick]")).some(
                  (el) => el.getAttribute("onClick").includes("generatePdf")
                );
              },
              { timeout: 60000 }
            )
            .then(() => "generatePdf"),

          page
            .waitForFunction(
              () => {
                return document.body.innerText.includes(
                  "No Documents registered"
                );
              },
              { timeout: 60000 }
            )
            .then(() => "noDocuments"),
        ]);

        if (searchResult === "noDocuments") {
          logger.warn(
            "No documents registered for the provided search parameters."
          );
          return;
        }
        logger.info("Element with 'generatePdf();' onClick handler appeared.");

        // Step 8: Click the element to generate the PDF
        await page.evaluate(() => {
          const element = Array.from(
            document.querySelectorAll("a[onClick]")
          ).find((el) => el.getAttribute("onClick").includes("generatePdf"));
          if (element) {
            element.click();
          } else {
            throw new Error(
              "Element with 'generatePdf();' onClick handler not found."
            );
          }
        });
        logger.info(
          "Clicked the element to generate PDF. Waiting for page to re-render..."
        );

        // Step 9: Wait for the 'Click here' link to appear
        await page.waitForSelector(
          'a[target="_blank"] span[style*="color: red"]',
          { timeout: 60000 }
        );
        logger.info("'Click here' link appeared.");

        // Step 10: Get the href attribute of the link
        const pdfLinkHref = await page.evaluate(() => {
          const span = Array.from(
            document.querySelectorAll(
              'a[target="_blank"] span[style*="color: red"]'
            )
          ).find((el) => el.textContent.includes("Click here"));
          if (span && span.parentElement) {
            return span.parentElement.getAttribute("href");
          }
          return null;
        });

        if (!pdfLinkHref) {
          throw new Error("PDF download link not found.");
        }

        // Step 11: Construct the full URL for the PDF
        const pdfUrl = new URL(pdfLinkHref, page.url()).href;
        logger.info(`PDF URL constructed: ${pdfUrl}`);

        // Step 12: Download and save the PDF
        logger.info("Downloading PDF...");
        await savePdfToFile(pdfUrl, "tn-encumbrance-certificate");
      } else {
        logger.error("'DOC_WISE' radio input not found.");
      }
    } else {
      logger.error("'Search/View EC' element not found.");
    }
  } catch (error) {
    logger.error("Error in clickSearchViewEC function.");
    logger.error(`Error message: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    throw error;
  }
};

// Main function to navigate to Search/View EC and save the PDF
const tnEcDownloader = async ({
  docNo,
  docYear,
  sroName,
  State,
  ownerName,
  houseNo,
  surveyNo,
  village,
  ward,
  block,
  district,
}) => {
  const browser = await puppeteerInstance();
  const page = await browser.newPage();

  try {
    // Step 1: Go to the Tamil Nadu registration portal
    logger.info("Navigating to Tamil Nadu registration portal...");
    await page.goto("https://tnreginet.gov.in/portal/", {
      waitUntil: "networkidle0",
    });

    // Step 2: Check if the content inside #fontSelection contains the word 'English'
    const fontSelectionContent = await page.$eval(
      "#fontSelection",
      (el) => el.textContent
    );

    if (fontSelectionContent.includes("English")) {
      logger.info(
        "The 'fontSelection' element contains 'English', clicking it..."
      );

      // Step 3: Click the a element with id="fontSelection"
      await clickButton(page, "#fontSelection");

      // Step 4: Wait for the new page to load completely
      await page.waitForNavigation({ waitUntil: "networkidle0" });

      // Step 5: Click the "Search/View EC" li element
      await clickSearchViewEC(page, sroName, docNo, docYear);
    } else {
      logger.info(
        "The 'fontSelection' element does not contain 'English', skipping the click."
      );
    }
  } catch (error) {
    logger.error("Error in tnEcDownloader function.");
    logger.error(`Error message: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
  } finally {
    await browser.close();
  }
};

module.exports = tnEcDownloader;
