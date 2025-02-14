const fs = require("fs");
const logger = require("../../utils/logger");
const { clickButton } = require("../../utils/pupeteer");
const {
  selectDropdownOption,
  handleCaptcha,
  savePdfToFile,
} = require("../../utils/tnutils");

/**
 * Performs a Survey-wise (SNOS) search in the "Search/View EC" form.
 * Fills the form once, then retries captcha up to 5 times if #incCaptcha has text.
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
  logger.info("Filling SNOS form...");

  // 1) Fill the form only once
  await selectDropdownOption(page, "#cmb_Zone", zone);

  await page.waitForFunction(
    () => document.querySelector("#cmb_District")?.options?.length > 1,
    { timeout: 60000 }
  );
  await selectDropdownOption(page, "#cmb_District", district);

  await page.waitForFunction(
    () => document.querySelector("#cmb_SroName")?.options?.length > 1,
    { timeout: 60000 }
  );
  await selectDropdownOption(page, "#cmb_SroName", sro);

  // Set date
  await page.evaluate(
    (s, e) => {
      document.querySelector("#txt_PeriodStartDt").value = s;
      document.querySelector("#txt_PeriodEndDt").value = e;
    },
    startDate,
    endDate
  );

  await page.waitForFunction(
    () => document.querySelector("#cmb_Village")?.options?.length > 1,
    { timeout: 60000 }
  );
  await selectDropdownOption(page, "#cmb_Village", village);

  const [mainSurvey] = surveyNo.split("/");
  await page.type("#txt_SurveyNo", mainSurvey);

  logger.info("Clicking 'Add Survey'...");
  await clickButton(page, "#btn_AddSurvey");

  logger.info("Waiting for #multiAddSurvey to confirm addition...");
  await page.waitForSelector("#multiAddSurvey", { timeout: 60000 });

  // 2) Up to 5 attempts for invalid captcha
  const maxCaptchaAttempts = 5;
  for (let attempt = 1; attempt <= maxCaptchaAttempts; attempt++) {
    let captchaImagePath = null;
    try {
      logger.info(`SNOS attempt ${attempt} of ${maxCaptchaAttempts}...`);

      // Wait for #txt_Captcha if it exists
      const captchaSelector = "#txt_Captcha";
      const hasCaptcha = await page.$(captchaSelector);
      if (hasCaptcha) {
        await page.waitForSelector(captchaSelector, { timeout: 15000 });
        captchaImagePath = await handleCaptcha(page);
      } else {
        logger.info(
          "Captcha field not found; proceeding without captcha solve."
        );
      }

      // Click "SearchDoc"
      await clickButton(page, "#btn_SearchDoc");
      logger.info("Clicked 'Search Document'; waiting for outcome...");

      /**
       * Race among:
       * 1) PDF link => "pdf"
       * 2) #incCaptcha is visible with any non-empty text => "invalidCaptcha"
       * 3) "No Documents" => "noDocs"
       * 4) "Too many schedules" => "tooMany"
       */
      const outcome = await Promise.race([
        // If we see the PDF link first:
        page
          .waitForSelector('a[target="_blank"] span[style*="color: red"]', {
            timeout: 60000,
          })
          .then(() => "pdf"),

        // If #incCaptcha is visible + has non-empty text:
        page
          .waitForFunction(
            () => {
              const el = document.querySelector("#incCaptcha");
              if (!el) return false;
              const visible = el.style.visibility === "visible";
              const textNonEmpty = el.innerText.trim().length >= 1;
              return visible && textNonEmpty;
            },
            { timeout: 60000 }
          )
          .then(() => "invalidCaptcha"),

        // If we see "No Documents registered..."
        page
          .waitForFunction(
            () =>
              document.body.innerText.includes(
                "No Documents registered during the Search Period"
              ),
            { timeout: 60000 }
          )
          .then(() => "noDocs"),

        // If we see "Number of Schedules..." => too many schedules
        page
          .waitForFunction(
            () =>
              document.body.innerText.includes(
                "Number of Schedules for provided search criteria is more than 200."
              ),
            { timeout: 60000 }
          )
          .then(() => "tooMany"),
      ]);

      logger.info(`SNOS outcome from race: ${outcome}`);

      if (outcome === "invalidCaptcha") {
        logger.warn(
          `SNOS attempt ${attempt} => #incCaptcha has some text => invalid captcha.`
        );
        // Cleanup captcha image
        if (captchaImagePath) {
          try {
            fs.unlinkSync(captchaImagePath);
          } catch (err) {
            logger.error(`Failed to remove captcha image: ${err.message}`);
          }
        }
        if (attempt < maxCaptchaAttempts) {
          // Retry the loop
          continue;
        }
        throw new Error("Exceeded SNOS captcha attempts (5).");
      } else if (outcome === "noDocs") {
        logger.warn("No Documents found in this SNOS search range.");
        if (captchaImagePath) {
          fs.unlinkSync(captchaImagePath);
        }
        return null;
      } else if (outcome === "tooMany") {
        throw new Error(
          "Too many schedules. Portal suggests using email approach."
        );
      } else if (outcome === "pdf") {
        // PDF link is present, let's retrieve it
        logger.info("Found a 'Click here' PDF link; extracting...");
        const pdfLinkHref = await page.evaluate(() => {
          const spans = Array.from(
            document.querySelectorAll(
              'a[target="_blank"] span[style*="color: red"]'
            )
          );
          const span = spans.find((el) =>
            el.textContent.includes("Click here")
          );
          return span && span.parentElement
            ? span.parentElement.getAttribute("href")
            : null;
        });
        if (!pdfLinkHref) {
          throw new Error(
            "SNOS: Could not find actual PDF link after success indicator."
          );
        }

        const pdfUrl = new URL(pdfLinkHref, page.url()).href;
        logger.info(`Downloading SNOS PDF => ${pdfUrl}`);

        const fileName = `tn-encumbrance-certificate-snos-${Date.now()}`;
        const filePath = await savePdfToFile(pdfUrl, fileName);
        logger.info(`SNOS PDF saved: ${filePath}`);

        // Cleanup captcha
        if (captchaImagePath) {
          try {
            fs.unlinkSync(captchaImagePath);
            logger.info(`Deleted captcha image: ${captchaImagePath}`);
          } catch (delErr) {
            logger.error(`Failed to delete captcha image: ${delErr.message}`);
          }
        }
        return filePath;
      }
    } catch (err) {
      logger.error(`SNOS attempt ${attempt} error: ${err.message}`);
      if (captchaImagePath) {
        try {
          fs.unlinkSync(captchaImagePath);
        } catch (delErr) {
          logger.error(`Failed to remove captcha image: ${delErr.message}`);
        }
      }
      // If fatal, throw
      if (
        err.message.includes("Exceeded SNOS captcha attempts") ||
        err.message.includes("Portal suggests using email approach") ||
        err.message.includes("Could not find actual PDF link")
      ) {
        throw err;
      }
      // Re-throw everything else
      throw err;
    }
  }

  throw new Error("SNOS loop ended without success or final error.");
}

module.exports = { clickAndSearchSnos };
