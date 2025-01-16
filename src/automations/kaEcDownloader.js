const {
  fillInput,
  clickButton,
  delay,
  puppeteerInstance,
  selectOption,
  generatePDF,
} = require("../../utils/pupeteer");

const fetchOtpFromEmail = require("../../utils/fetchOtp");
const logger = require("../../utils/logger");
// Login function
const login = async (page) => {
  await clickButton(page, "#headerMain > ul > span > li:nth-child(2) > button");
  await delay(1000);
  await fillInput(page, "#userName", process.env.KA_EC_USERNAME);
  await delay(1000);

  await fillInput(page, "#password", process.env.KA_EC_PASSWORD);
  await delay(1000);

  const imageUrl = await page.evaluate(() => {
    // Find the captcha image by its attributes (modify selector as needed)
    const captchaImg = document.querySelector('img[src*="captcha"]');
    return captchaImg ? captchaImg.getAttribute("src") : null;
  });

  if (imageUrl) {
    logger.info(`Captcha Image URL: ${imageUrl}`);
    captcha = imageUrl.match(/\/([^\/]+)\.png$/)[1];
  } else {
    logger.info("Captcha image not found!");
  }

  await fillInput(page, "#loginCaptchaUserInput1", captcha);
  await delay(2000);

  await clickButton(
    page,
    "body > div:nth-child(1) > app-root > div > div > app-header-new > main > div.popup-container.open > div > div.card-body.ng-star-inserted > div > div.col-md-7 > form > div.row > button"
  );
  // await delay(5000);
};

const getAndFillOtp = async (page) => {
  const otp = await fetchOtpFromEmail();
  await delay(2000); // Delay after fetching OTP

  await page.waitForSelector("#otp");

  await page.type("#otp", otp);

  logger.info("Filled OTP:", otp);
};

const handleDialog = async (page) => {
  new Promise((resolve) => {
    page.on("dialog", async (dialog) => {
      logger.info("Dialog message: " + dialog.message());
      logger.info("Popup detected, re-logging in...");

      await dialog.accept(); // Accept the dialog
      await delay(1000);
      await login(page); // Re-login after accepting the dialog

      resolve(); // Resolve the promise once the dialog handling is complete
    });
  });
};
async function kaEc() {
  const browser = await puppeteerInstance();
  let page = await browser.newPage();
  await page.goto("https://kaveri.karnataka.gov.in/landing-page", {
    waitUntil: "load",
    timeout: 0,
  });

  // Start the login process
  await login(page);
  logger.info("Login completed.");
  await handleDialog(page);
  await delay(2000);
  await getAndFillOtp(page);
  await delay(2000);

  await clickButton(
    page,
    "body > div:nth-child(1) > app-root > div > div > app-header-new > main > div.popup-container.open > div > div.card-body.ng-star-inserted > div > div:nth-child(2) > form > div.row > div.col-md-8 > button"
  );
  await delay(3000);

  const invalidOtpElement = await page.$(
    "body > div:nth-child(1) > app-root > div > div > app-header-new > main > div.popup-container.open > div > div.card-body.ng-star-inserted > div > div:nth-child(2) > form > div:nth-child(2) > span"
  );
  if (invalidOtpElement) {
    const invalidOtpText = await page.evaluate(
      (el) => el.innerText,
      invalidOtpElement
    );
    if (invalidOtpText.includes("Unable to Validate OTP / Incorrect OTP")) {
      logger.info("Invalid OTP detected, retrying...");
      await page.focus("#otp");

      // Clear the OTP input field
      await page.evaluate(() => {
        document.querySelector("#otp").value = ""; // Clear OTP field by directly setting its value
      });
      // await getAndFillOtp(page);
      const otp = await fetchOtpFromEmail();
      await delay(2000); // Delay after fetching OTP
      await page.waitForSelector("#otp");

      // Focus the OTP input field to ensure it's ready for typing
      await page.focus("#otp");

      await page.$eval(
        "#otp",
        (input, otp) => {
          input.value = otp; // Set the OTP value
          input.dispatchEvent(new Event("input", { bubbles: true })); // Trigger the input event
          input.dispatchEvent(new Event("change", { bubbles: true })); // Trigger the change event
        },
        otp
      );

      await delay(2000);
      await clickButton(
        page,
        "body > div:nth-child(1) > app-root > div > div > app-header-new > main > div.popup-container.open > div > div.card-body.ng-star-inserted > div > div:nth-child(2) > form > div.row > div.col-md-8 > button"
      );
    } else {
      logger.info("Invalid OTP element not found, skipping.");
    }
  }

  await clickButton(
    page,
    "body > div:nth-child(1) > app-root > div > div > app-kaveri-dashboard > div > div.animated.fadeIn.mt-3.ng-tns-c140-2 > div > div.row.p-2.ng-tns-c140-2 > div.col-md-4.d-flex.align-items-center.justify-content-center.ng-tns-c140-2 > div > button"
  );
  await delay(1000);

  await clickButton(
    page,
    "body > div:nth-child(1) > app-root > div > div > app-kaveri-dashboard > div > div.applicationTypeOverlay.ng-tns-c140-2.ng-star-inserted > div > app-application-type > div > div > div.card-body > div.row.mt-4 > div:nth-child(2) > img"
  );

  await delay(1000);

  await clickButton(
    page,
    "#mat-dialog-0 > app-perquisite > mat-dialog-actions > button"
  );
  await delay(1000);

  await clickButton(
    page,
    "#mat-dialog-0 > app-perquisite > div.overlay.ng-star-inserted > div > div > div.card-body > div:nth-child(2) > button.btn.btn-primary"
  );

  logger.info("selecting District");
  await selectOption(page, 'select[name="district"]', "Basavanagudi");
  await delay(1000);
  logger.info("selecting taluka");
  await selectOption(page, 'select[name="taluka"]', "Kengeri");
  await delay(1000);
  logger.info("selecting taluka");

  await selectOption(page, 'select[name="hobli"]', "Uttara Halli Hobli 4");
  await delay(1000);

  await selectOption(page, 'select[name="village"]', "Thurahalli");

  await clickButton(
    page,
    "body > div:nth-child(1) > app-root > div > div > app-ec-search-citizen > div > div.containe-lg > div > div > form > div:nth-child(4) > div.row > div:nth-child(2) > label"
  );

  await selectOption(page, 'select[name="_currentproperttypeid"]', "Flat No");

  await fillInput(page, 'input[name="_currentnumber"]', "0401");

  // await fillInput(page, 'input[name="surveynumber"]', "123");
  await page.$eval('input[name="fromdate"]', (input) => {
    input.value = "01/01/2004"; // Set the desired date here
    input.dispatchEvent(new Event("input", { bubbles: true })); // Trigger the input event
    input.dispatchEvent(new Event("change", { bubbles: true })); // Trigger the change event
    input.removeAttribute("required");
  });

  await page.$eval('input[name="todate"]', (input) => {
    input.value = "01/01/2024"; // Set the desired date here
    input.dispatchEvent(new Event("input", { bubbles: true })); // Trigger the input event
    input.dispatchEvent(new Event("change", { bubbles: true })); // Trigger the change event
    input.removeAttribute("required");
  });

  await delay(1000);

  await clickButton(
    page,
    "body > div:nth-child(1) > app-root > div > div > app-ec-search-citizen > div > div.containe-lg > div > div > form > div.mt-3.text-center > button.mat-tooltip-trigger.btn.btn-primary.mr-1.ng-star-inserted"
  );

  const filePath = await generatePDF(
    page,
    "#PdfData > table",
    `public/Downloads/${"docNoIdentifier"}`,
    true
  );

  return filePath;
}

module.exports = kaEc;
