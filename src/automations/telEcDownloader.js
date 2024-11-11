const tesseract = require("tesseract.js");
const {
  downloadPdf,
  fillInput,
  clickButton,
  delay,
  waitForSelector,
  puppeteerInstance,
  selectOption,
  generatePDF,
} = require("../../utils/pupeteer");
const logger = require("../../utils/logger");

const MAX_ATTEMPTS = 3;
const CAPTCHA_REGEX = /^[a-zA-Z0-9]{6}$/;

const navigateToLoginPage = async (page, url) => {
  await page.goto(url, { waitUntil: "networkidle2" });
  await waitForSelector(page, ".container");
};

const solveCaptcha = async (page) => {
  let attempts = 0;
  let captchaText = "";

  while (!captchaText || !CAPTCHA_REGEX.test(captchaText)) {
    if (attempts >= MAX_ATTEMPTS) {
      logger.info("Maximum attempts reached. Refreshing the page...");
      await page.reload({ waitUntil: ["networkidle2", "domcontentloaded"] });
      attempts = 0; // Reset attempts after refresh
      await delay(1000);
      continue;
    }

    const imageSelector = 'img[src="/Captcha.jpg"]';
    await waitForSelector(page, imageSelector);
    await ensureImageIsLoaded(page, imageSelector);

    const captchaImageBuffer = await captureCaptchaImage(page, imageSelector);
    captchaText = await extractCaptchaFromImage(captchaImageBuffer);

    if (!captchaText || !/^[a-zA-Z0-9]{6}$/.test(captchaText)) {
      logger.info("Invalid captcha. Retrying...");
      attempts++;
      await delay(5000);
    }
  }
  return captchaText;
};

const ensureImageIsLoaded = async (page, selector) => {
  await page.evaluate((selector) => {
    return new Promise((resolve, reject) => {
      const img = document.querySelector(selector);
      if (!img) {
        return reject("Image not found in the DOM.");
      }
      if (img.complete) {
        return resolve();
      }
      img.onload = resolve;
      img.onerror = () => reject("Image failed to load.");
    });
  }, selector);
};

const captureCaptchaImage = async (page, selector) => {
  const imgElement = await page.$(selector);
  if (!imgElement) {
    throw new Error("Image element not found after it was loaded.");
  }
  return await imgElement.screenshot({ encoding: "binary" });
};

const extractCaptchaFromImage = async (buffer) => {
  const { data } = await tesseract.recognize(buffer, "eng");
  return data.text.trim();
};

const attemptLogin = async (page, username, password, captchaText) => {
  await selectOption(page, "#user_type", "2"); // Select 'Citizen'
  await fillInput(page, "#username", username);
  await fillInput(page, "#password", password);
  await fillInput(page, "#captcha", captchaText);

  logger.info("Form filled.");
  await clickButton(page, 'button.btn.btn-default[type="submit"]');

  const loginErrorElement = await page
    .waitForSelector("#myForm > h4", { timeout: 5000 })
    .catch(() => null);

  if (loginErrorElement) {
    logger.error("Login Atempt Error, reloading the page...");
    await page.close();
  } else {
    logger.info("Logged in Succesfully");
  }
};

const handlePostFormFIlled = async (page, docNoIdentifier) => {
  try {
    await clickButton(page, "#checkall2"); //select all docs

    await clickButton(
      page,
      "#form1 > div.s_d > div.col-md-3.col-sm-4 > div.pull-center > button"
    );

    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    filePath = await generatePDF(
      page,
      "table.table-bordered",
      `public/Downloads/${docNoIdentifier}`
    );

    return filePath;
  } catch (error) {
    logger.error("Post-login action error:", error);
    throw error;
  }
};

const handleLogin = async (page, browser) => {
  try {
    const url = "https://registration.telangana.gov.in/auth_login.htm";
    await navigateToLoginPage(page, url);

    const captchaText = await solveCaptcha(page);
    await attemptLogin(
      page,
      process.env.TEL_EC_USERNAME,
      process.env.TEL_EC_PASSWORD,
      captchaText
    );

    await clickButton(
      page,
      "body > div.xs-hidden > div:nth-child(1) > div.container > div > form > div:nth-child(8) > a"
    );

    const nextPage = await getNewPageWhenLoaded(browser);

    logger.info("Landed on EC Search submit.");
    await delay(1000);

    // Click the submit button
    await clickButton(nextPage, "button.btn.btn-default");
    await page.close();
    return nextPage;
  } catch (error) {
    throw error;
  }
};
const handleScraperError = async (error, browser) => {
  try {
    if (error.message.includes("Navigation timeout of")) {
      logger.error(
        "ERROR TimeoutError: Navigation timeout of 10000 ms exceeded"
      );
      logger.error("trying again");
      await browser.close();
      return;
    }
    if (error.message.includes("ERR_NAME_NOT_RESOLVED")) {
      logger.error("ERROR check your internet connection");
      return;
    }

    logger.error(`ERROR=> ${error.message} `);
    await browser.close();
    return new Error(error.message);
  } catch (error) {
    logger.error(error.message);
  }
};

const getNewPageWhenLoaded = async (browser) => {
  return new Promise((resolve) => {
    browser.once("targetcreated", async (target) => {
      const newPage = await target.page();
      if (newPage) {
        await newPage.waitForSelector("body"); // Ensure the new page is fully loaded
        resolve(newPage);
      }
    });
  });
};

const searchByDocumentNumber = async (
  page,
  encumbranceType,
  docNo,
  docYear,
  sroName,
  multipleSros,
  startDate,
  docNoIdentifier
) => {
  // await delay(1000);

  await fillInput(page, "#doct", docNo);
  await fillInput(page, "#regyear", docYear);
  await fillInput(page, "#sroVal", sroName);
  await delay(3000);
  await clickButton(page, "button.btn.btn-default");
  await delay(3000);

  await clickButton(page, "#bean > button");
  await delay(3000);

  await clickButton(
    page,
    "#bean > div:nth-child(39) > div:nth-child(15) > button.btn.btn-default"
  );
  await delay(1000);
  return await handlePostFormFIlled(page, docNoIdentifier);
};

const searchByProperty = async (
  page,
  encumbranceType,
  sroName,
  startDate,
  docNoIdentifier
) => {
  await clickButton(
    page,
    "#command > div:nth-child(1) > div.col-md-2.col-sm-4"
  );
  await delay(1000);
  await selectOption(page, "#dist_code", "16_1"); // Select 'dist_code'
  await delay(1000);

  await selectOption(page, "#mandal_code", "00"); // Select 'mandal_code'
  await delay(1000);

  await selectOption(page, "#village_code", "1600002"); // Select 'village_code'
  await delay(2000);

  //building structures

  await fillInput(page, "#house_no", "1-130"); //House No
  await fillInput(page, "#flat_no", ""); //Flat No
  await fillInput(page, "#apt", ""); //Apartment
  await fillInput(page, "#ward_no", ""); //ward no
  await fillInput(page, "#block_no", ""); //blockno

  //agricultural lands
  await fillInput(page, "#plot_no", ""); //plot_no
  await fillInput(page, "#sy_no", ""); //sy_no

  //bounded by
  // await fillInput(page, "#east", ""); //east
  // await fillInput(page, "#west", ""); //west
  // await fillInput(page, "#north", ""); //north
  // await fillInput(page, "#south", ""); //south

  //search period
  // await fillInput(page, "#dp1727956870980", ""); //start date
  // await fillInput(page, "#dp1727956870981", ""); //end date

  await delay(1000);
  await clickButton(page, "button.btn.btn-default");
  await delay(3000);
  await handlePostFormFIlled(page, docNoIdentifier);

  return;
};

const telEcDownloader = async ({
  docNo,
  docYear,
  sroName,
  multipleSros,
  ownerName,
  houseNo,
  surveyNo,
  village,
  ward,
  block,
  district,
  encumbranceType,
  startDate,
}) => {
  const browser = await puppeteerInstance();
  let page = await browser.newPage();
  logger.info(":: Automation Started");
  let filePath;
  try {
    page = await handleLogin(page, browser);

    switch (encumbranceType) {
      case "ENCUMBRANCE_TYPE.DNOS":
        filePath = await searchByDocumentNumber(
          page,
          encumbranceType,
          docNo,
          docYear,
          sroName,
          multipleSros,
          startDate,
          docNo
        );
        await page.close();
        break;

      case "ENCUMBRANCE_TYPE.HNOS":
        filePath = await searchByProperty(
          page,
          encumbranceType,
          sroName,
          startDate,
          docNo
        );
        await page.close();
        break;
      case "ENCUMBRANCE_TYPE.TELHNOS":
        break;
      default:
        logger.info("Invalid encumbranceType! ");
        break;
    }

    await browser.close();
    return { status: "ok", filePath };
  } catch (error) {
    logger.info(error.message);

    throw new Error(error.message);
    // handleScraperError(error, browser);
  } finally {
    await browser.close();
  }
};

module.exports = telEcDownloader;
