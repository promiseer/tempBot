const fs = require("fs");
const logger = require("../../utils/logger");
const { clickButton } = require("../../utils/pupeteer");
const {
  selectDropdownOption,
  handleCaptcha,
  savePdfToFile,
} = require("../../utils/tnutils");

/**
 * DNOS flow:
 * 1) Fills out the docNo/docYear form once (select DOC_WISE radio).
 * 2) Retries up to 5 times if we detect invalid captcha (#incCaptcha is visible with text).
 * 3) Returns a PDF path if found, or null if "No Documents registered."
 *
 * @param {import("puppeteer").Page} page
 *   Puppeteer page with "Search/View EC" form loaded.
 * @param {string} sroName
 *   SRO name for the dropdown.
 * @param {string} docNo
 *   Document number string (e.g. "1234").
 * @param {string} docYear
 *   Document year selection (e.g. "2022").
 *
 * @returns {Promise<string|null>}
 *   Path to the downloaded PDF if found, or null if "No Documents registered."
 *
 * @throws
 *   If captcha fails 5 times, or other fatal errors occur (e.g., missing generatePdf link).
 */
async function clickAndSearchEcDnos(page, sroName, docNo, docYear) {
  logger.info("Filling DNOS form once...");

  // Select DOC_WISE radio
  const radioClicked = await page.evaluate(() => {
    const radio = document.querySelector('input[id="DOC_WISE"]');
    if (radio) {
      radio.click();
      return true;
    }
    return false;
  });
  if (!radioClicked) {
    logger.error("DOC_WISE radio button not found or couldn't click it.");
    return null;
  }

  // Wait for doc fields (txt_DocumentNo, etc.) to appear
  await page.waitForSelector("#txt_DocumentNo", { timeout: 60000 });

  // Fill form fields one time
  await selectDropdownOption(page, "#cmb_SroName", sroName);
  await page.type("#txt_DocumentNo", docNo);
  await selectDropdownOption(page, "#cmb_Year", docYear);
  await selectDropdownOption(page, "#cmb_doc_type", "Regular Document");

  logger.info(
    "DNOS form fields set. Will now handle up to 5 captcha retries if needed."
  );

  const maxCaptchaAttempts = 5;
  for (let attempt = 1; attempt <= maxCaptchaAttempts; attempt++) {
    let captchaImagePath = null;
    try {
      logger.info(`DNOS attempt ${attempt} of ${maxCaptchaAttempts}...`);
      await new Promise((r) => setTimeout(r, 5000));

      // If there's a captcha field (#txt_Captcha), solve it.
      // If not found, we assume no captcha needed for this scenario.
      const captchaSelector = "#txt_Captcha";
      const captchaField = await page.$(captchaSelector);
      if (captchaField) {
        await page.waitForSelector(captchaSelector, { timeout: 15000 });
        captchaImagePath = await handleCaptcha(page);
      } else {
        logger.info(
          "No #txt_Captcha present; proceeding without captcha solve."
        );
      }

      // Click Search
      await clickButton(page, "#btn_SearchDoc");
      logger.info(
        "Clicked 'SearchDoc'; waiting for either generatePdf, incCaptcha, or no-doc messages..."
      );

      // Race for 3 outcomes: pdf link, #incCaptcha visible, "No Documents registered"
      // If needed, you can add more text checks (like "Too many schedules") if the portal shows them for DNOS
      const outcome = await Promise.race([
        // 1) Wait for generatePdf link (we detect by scanning onClick attribute)
        page
          .waitForFunction(
            () =>
              Array.from(document.querySelectorAll("a[onClick]")).some((el) =>
                el.getAttribute("onClick")?.includes("generatePdf")
              ),
            { timeout: 60000 }
          )
          .then(() => "pdf"),

        // 2) #incCaptcha visible with non-empty text => invalid captcha
        page
          .waitForFunction(
            () => {
              const el = document.querySelector("#incCaptcha");
              if (!el) return false;
              const isVisible = el.style.visibility === "visible";
              const hasText = el.innerText.trim().length >= 1;
              return isVisible && hasText;
            },
            { timeout: 60000 }
          )
          .then(() => "invalidCaptcha"),

        // 3) "No Documents registered"
        page
          .waitForFunction(
            () => document.body.innerText.includes("No Documents registered"),
            { timeout: 60000 }
          )
          .then(() => "noDocs"),
      ]);

      logger.info(`DNOS outcome from race: ${outcome}`);

      if (outcome === "invalidCaptcha") {
        logger.warn(
          `DNOS attempt ${attempt}: #incCaptcha is visible with text => invalid captcha.`
        );
        if (captchaImagePath) {
          try {
            fs.unlinkSync(captchaImagePath);
          } catch (delErr) {
            logger.error(`Failed removing captcha image: ${delErr.message}`);
          }
        }
        if (attempt < maxCaptchaAttempts) {
          continue; // retry
        }
        throw new Error("Exceeded max captcha attempts for DNOS (5).");
      }

      if (outcome === "noDocs") {
        logger.warn(
          "No documents found for the given docNo/docYear combination."
        );
        if (captchaImagePath) {
          try {
            fs.unlinkSync(captchaImagePath);
          } catch (delErr) {
            logger.error(`Failed removing captcha image: ${delErr.message}`);
          }
        }
        return null; // no doc
      }

      // Otherwise, outcome === "pdf"
      logger.info(
        "Found 'generatePdf' possibility; let's click the element to generate the PDF..."
      );
      await page.evaluate(() => {
        const link = Array.from(document.querySelectorAll("a[onClick]")).find(
          (el) => el.getAttribute("onClick")?.includes("generatePdf")
        );
        if (!link) {
          throw new Error("generatePdf link not found, even though expected.");
        }
        link.click();
      });

      // Then we wait for the final "Click here" link for the PDF
      logger.info("Waiting for final PDF link ('Click here')...");
      await page.waitForSelector(
        'a[target="_blank"] span[style*="color: red"]',
        {
          timeout: 60000,
        }
      );

      // Extract the PDF URL
      const pdfLinkHref = await page.evaluate(() => {
        const spans = Array.from(
          document.querySelectorAll(
            'a[target="_blank"] span[style*="color: red"]'
          )
        );
        const span = spans.find((s) => s.textContent.includes("Click here"));
        return span && span.parentElement
          ? span.parentElement.getAttribute("href")
          : null;
      });
      if (!pdfLinkHref) {
        throw new Error(
          "DNOS: No final PDF link found after generatePdf click."
        );
      }

      const pdfUrl = new URL(pdfLinkHref, page.url()).href;
      logger.info(`DNOS PDF URL => ${pdfUrl}`);

      const fileName = `tn-encumbrance-certificate-dnos-${Date.now()}`;
      const filePath = await savePdfToFile(pdfUrl, fileName);
      logger.info(`DNOS PDF downloaded => ${filePath}`);

      // Clean up captcha image
      if (captchaImagePath) {
        try {
          fs.unlinkSync(captchaImagePath);
        } catch (delErr) {
          logger.error(`Failed to delete captcha image: ${delErr.message}`);
        }
      }

      // Return success
      return filePath;
    } catch (err) {
      logger.error(`DNOS attempt ${attempt} error: ${err.message}`);
      if (captchaImagePath) {
        try {
          fs.unlinkSync(captchaImagePath);
        } catch (delErr2) {
          logger.error(`Failed removing captcha image: ${delErr2.message}`);
        }
      }
      // If fatal or final, throw
      if (
        err.message.includes("Exceeded max captcha attempts") ||
        err.message.includes("No final PDF link found") ||
        err.message.includes("generatePdf link not found")
      ) {
        throw err;
      }
      // Otherwise, rethrow so we don't loop infinitely
      throw err;
    }
  }

  throw new Error(
    "DNOS loop ended unexpectedly without success or explicit error."
  );
}

module.exports = { clickAndSearchEcDnos };
