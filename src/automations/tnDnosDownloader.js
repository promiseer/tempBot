const fs = require("fs");
const logger = require("../../utils/logger");
const { clickButton } = require("../../utils/pupeteer");

const {
  selectDropdownOption,
  handleCaptcha,
  savePdfToFile,
} = require("../../utils/tnutils");

/**
 * Clicks "Search/View EC" on the page, fills out the form, solves the captcha,
 * and attempts to download the PDF.
 * @param {import("puppeteer").Page} page - The Puppeteer page object.
 * @param {string} sroName - SRO name for the dropdown.
 * @param {string} docNo - Document number.
 * @param {string} docYear - Document year.
 * @returns {Promise<string|null>} - The path to the downloaded file, or null if not found.
 * @throws Will throw an error if any step fails.
 */
async function clickAndSearchEcDnos(page, sroName, docNo, docYear) {
  let captchaImagePath;
  try {
    // 1. Click the 'DOC_WISE' radio button
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
      "Clicked the 'DOC_WISE' radio button; waiting for page re-render..."
    );

    // 2. Wait for Document Number input
    await page.waitForSelector("#txt_DocumentNo", { timeout: 60000 });
    logger.info("Document Number input appeared.");

    // 3. Fill in the form
    await selectDropdownOption(page, "#cmb_SroName", sroName);
    await page.type("#txt_DocumentNo", docNo);
    await selectDropdownOption(page, "#cmb_Year", docYear);
    await selectDropdownOption(page, "#cmb_doc_type", "Regular Document");

    logger.info("Form filled successfully. Handling captcha...");

    // 4. Solve captcha
    captchaImagePath = await handleCaptcha(page);

    // 5. Click search
    await clickButton(page, "#btn_SearchDoc");
    logger.info("Clicked the 'Search' button; waiting for page re-render...");

    // 6. Wait for either the generate PDF link or "No Documents" message
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

    // 7. Check if no documents found
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

    logger.info("Element with 'generatePdf();' onClick handler appeared.");

    // 8. Click the element with generatePdf()
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

    // Cleanup captcha image
    if (captchaImagePath) {
      fs.unlink(captchaImagePath, (err) => {
        if (err) logger.error(`Failed to delete captcha image: ${err.message}`);
        else logger.info(`Deleted captcha image: ${captchaImagePath}`);
      });
    }

    // 9. Wait for "Click here" link for the PDF
    await page.waitForSelector('a[target="_blank"] span[style*="color: red"]', {
      timeout: 60000,
    });
    logger.info("'Click here' link appeared.");

    // 10. Get the PDF URL
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

    const pdfUrl = new URL(pdfLinkHref, page.url()).href;
    logger.info(`Constructed PDF URL: ${pdfUrl}`);

    // 11. Download and save the PDF
    const filePath = await savePdfToFile(pdfUrl, "tn-encumbrance-certificate");
    return filePath;
  } catch (error) {
    logger.error("Error in clickAndSearchEc function.");
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

module.exports = { clickAndSearchEcDnos };
