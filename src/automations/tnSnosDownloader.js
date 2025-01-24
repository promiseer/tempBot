const fs = require("fs");
const logger = require("../../utils/logger");
const { clickButton } = require("../../utils/pupeteer");

const {
  selectDropdownOption,
  handleCaptcha,
  savePdfToFile,
} = require("../../utils/tnutils");

/**
 * Clicks "Search/View EC" on the page, fills out the form for YEAR_WISE mode,
 * solves the captcha, and attempts to download the PDF.
 * @param {import("puppeteer").Page} page - The Puppeteer page object.
 * @param {string} zone - Zone name for the dropdown.
 * @param {string} district - District name for the dropdown.
 * @param {string} sro - SRO name for the dropdown.
 * @param {string} startDate - Start date in DD/MM/YYYY format.
 * @param {string} endDate - End date in DD/MM/YYYY format.
 * @param {string} village - Village name for the dropdown.
 * @param {string} surveyNo - Survey number.
 * @returns {Promise<string|null>} - The path to the downloaded file, or null if not found.
 * @throws Will throw an error if any step fails.
 */
async function clickAndSearchSnos(
  page,
  zone,
  district,
  sro,
  startDate,
  endDate,
  village,
  surveyNo
) {
  let captchaImagePath;
  try {
    // 2. Fill in the form fields
    await selectDropdownOption(page, "#cmb_Zone", zone);
    // Wait for district dropdown to populate and select
    await page.waitForFunction(
      () => document.querySelector("#cmb_District").options.length > 1,
      { timeout: 60000 }
    );
    await selectDropdownOption(page, "#cmb_District", district);
    await page.waitForFunction(
      () => document.querySelector("#cmb_SroName").options.length > 1,
      { timeout: 60000 }
    );
    await selectDropdownOption(page, "#cmb_SroName", sro);
    await page.evaluate(
      (startDate, endDate) => {
        document.querySelector("#txt_PeriodStartDt").value = startDate;
        document.querySelector("#txt_PeriodEndDt").value = endDate;
      },
      startDate,
      endDate
    );

    await page.waitForFunction(
      () => document.querySelector("#cmb_Village").options.length > 1,
      { timeout: 60000 }
    );
    await selectDropdownOption(page, "#cmb_Village", village);
    await page.type("#txt_SurveyNo", surveyNo.split("/")[0]);

    logger.info("Form filled successfully.");

    // 3. Click 'Add Survey' button
    await clickButton(page, "#btn_AddSurvey");
    logger.info(
      "Clicked the 'Add Survey' button; waiting for table to appear..."
    );

    // 4. Wait for the table to appear
    await page.waitForSelector("#multiAddSurvey", { timeout: 60000 });
    logger.info("Table with ID 'multiAddSurvey' appeared.");

    // 5. Handle captcha
    captchaImagePath = await handleCaptcha(page);

    // 6. Click 'Search Document' button
    await clickButton(page, "#btn_SearchDoc");
    logger.info("Clicked the 'Search Document' button; waiting for results...");

    try {
      // 7. Wait for either the "Click here" link, the "No Documents registered" message, or the "Too many schedules" message
      await Promise.race([
        page.waitForSelector('a[target="_blank"] span[style*="color: red"]', {
          timeout: 60000,
        }),
        page.waitForFunction(
          () =>
            document.body.innerText.includes(
              "Number of Schedules for provided search criteria is more than 200."
            ) ||
            document.body.innerText.includes(
              "No Documents registered during the Search Period"
            ),
          { timeout: 60000 }
        ),
      ]);

      // Check if the "No Documents registered during the Search Period" message is present
      const isNoDocuments = await page.evaluate(() =>
        document.body.innerText.includes(
          "No Documents registered during the Search Period"
        )
      );

      if (isNoDocuments) {
        throw new Error("No Documents registered during the Search Period.");
      }

      // Check if the "Too many schedules" message is present
      const isTooManySchedules = await page.evaluate(() =>
        document.body.innerText.includes(
          "Number of Schedules for provided search criteria is more than 200."
        )
      );

      if (isTooManySchedules) {
        throw new Error(
          "Too many schedules. Please provide the email address, and the EC PDF will be sent to the same."
        );
      }

      logger.info("'Click here' link appeared.");
    } catch (error) {
      if (
        error.message.includes("Too many schedules") ||
        error.message.includes(
          "No Documents registered during the Search Period"
        ) ||
        error.message.includes("timeout")
      ) {
        logger.error(error.message);
      }
      throw error;
    }

    // Cleanup captcha image
    if (captchaImagePath) {
      fs.unlink(captchaImagePath, (err) => {
        if (err) logger.error(`Failed to delete captcha image: ${err.message}`);
        else logger.info(`Deleted captcha image: ${captchaImagePath}`);
      });
    }

    // 8. Get the PDF URL
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

    // 9. Download and save the PDF
    const filePath = await savePdfToFile(pdfUrl, "tn-encumbrance-certificate");
    return filePath;
  } catch (error) {
    logger.error("Error in clickAndSearchSnos function.");
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

module.exports = { clickAndSearchSnos };
