const tesseract = require("tesseract.js");
const moment = require("moment");

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

const navigateToLoginPage = async (page, url, retries = 1) => {
  try {
    // Attempt to navigate to the URL
    await page.goto(url, {
      waitUntil: ["networkidle2", "domcontentloaded"],
      timeout: 10000,
    });
  } catch (error) {
    logger.error(
      `Navigation failed, ${retries} retry${retries > 1 ? "ies" : ""} left. ${
        error.message
      }`
    );

    if (retries > 0) {
      // Reload the page and retry navigation
      await page.reload({ waitUntil: ["networkidle2", "domcontentloaded"] });

      // Recursive call with reduced retries
      await navigateToLoginPage(page, url, retries - 1);
    } else {
      logger.info("No retries left. Navigation failed.");
    }
  }
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
  await selectOption(page, "#user_type", "Citizen"); // Select 'Citizen'
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
    await delay(2000);
    // await page.waitForSelector("#form1 > div.s_d > div.col-md-3.col-sm-4 > ol");

    const checkboxes = await page.$$(
      "#form1 > div.s_d > div.col-md-3.col-sm-4 > ol input[type='checkbox']"
    );

    if (checkboxes.length === 0) {
      logger.error("No checkboxes found in the ordered list.");
      return "public/dummy/dummy.pdf";
    }

    const threshold = 50;

    // Click each checkbox if it is not already checked
    if (checkboxes.length > threshold) {
      // If there are many checkboxes, click each individually
      for (const checkbox of checkboxes) {
        const isChecked = await checkbox.evaluate((el) => el.checked);
        if (!isChecked) {
          await checkbox.click();
        }
      }
    } else {
      // If fewer checkboxes, click the "Select All" button
      await clickButton(page, "#checkall2");
    }

    await clickButton(
      page,
      "#form1 > div.s_d > div.col-md-3.col-sm-4 > div.pull-center > button"
    );

    await page.waitForNavigation({
      waitUntil: ["networkidle2", "domcontentloaded"],
      timeout: 60000,
    });
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
    await navigateToLoginPage(page, url, 2);

    const captchaText = await solveCaptcha(page);
    await attemptLogin(
      page,
      process.env.TEL_EC_USERNAME,
      process.env.TEL_EC_PASSWORD,
      captchaText
    );
    await delay(1000);
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
  return await handlePostFormFIlled(page, docNoIdentifier);
};

const searchByProperty = async (
  page,
  encumbranceType,
  houseNo,
  surveyNo,
  village,
  ward,
  block,
  district,
  sroName,
  startDate,
  docNoIdentifier
) => {
  await delay(1000);
  await clickButton(
    page,
    "#command > div:nth-child(1) > div.col-md-2.col-sm-4"
  );
  await delay(1000);
  await selectOption(page, "#dist_code", district); // Select 'dist_code'
  await delay(1000);

  await selectOption(page, "#mandal_code", sroName); // Select 'mandal_code'
  await delay(1000);

  await selectOption(page, "#village_code", village); // Select 'village_code'
  await delay(2000);

  if (
    ["ENCUMBRANCE_TYPE.HNOS", "ENCUMBRANCE_TYPE.SHNOS"].includes(
      encumbranceType
    )
  ) {
    await fillBuildingDetails(page, encumbranceType, houseNo, ward, block);
  }

  if (
    ["ENCUMBRANCE_TYPE.SNOS", "ENCUMBRANCE_TYPE.SSNOS"].includes(
      encumbranceType
    )
  ) {
    await fillSurveyDetails(page, encumbranceType, surveyNo);
  }

  //search period
  startDate
    ? await fillInput(
        page,
        'input[name="sro_start_date"]',
        moment(startDate, "DD-MM-YYYY").format("DD/MM/YYYY")
      )
    : logger.info("Skipping Date input as it's empty"); //start date
  // await fillInput(page, 'input[name="sro_end_date"]', ""); //end date

  await delay(1000);
  await clickButton(page, "button.btn.btn-default");
  await delay(3000);
  return await handlePostFormFIlled(page, docNoIdentifier);
};

const fillBuildingDetails = async (
  page,
  encumbranceType,
  houseNo,
  ward,
  block
) => {
  //building structures
  await fillInput(
    page,
    "#house_no",
    ["ENCUMBRANCE_TYPE.SHNOS"].includes(encumbranceType)
      ? houseNo.split("/")[0]
      : houseNo
  ); //House No

  //for flat no
  // await fillInput(page, "#flat_no", flatNo); //Flat No
  // await fillInput(page, "#apt", ""); //Apartment

  //for ward/block
  ward
    ? await fillInput(page, "#ward_no", ward)
    : logger.info("Skipping ward input as it's empty"); //ward no

  block
    ? await fillInput(page, "#block_no", block)
    : logger.info("Skipping block input as it's empty"); //ward no //blockno
};

const fillSurveyDetails = async (page, encumbranceType, surveyNo, plot_no) => {
  //agricultural lands
  plot_no
    ? await fillInput(page, "#plot_no", plot_no)
    : logger.info("Skipping plot_no input as it's empty"); //plot_no

  await fillInput(
    page,
    "#sy_no",
    ["ENCUMBRANCE_TYPE.SSNOS"].includes(encumbranceType)
      ? surveyNo.split("/")[0]
      : surveyNo
  ); //sy_no
};

const fillBoundedRegionDetails = async (eat, west, north, south) => {
  //bounded by NOTE: Note needed this fields
  await fillInput(page, "#east", eat); //east
  await fillInput(page, "#west", west); //west
  await fillInput(page, "#north", north); //north
  await fillInput(page, "#south", south); //south
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
      case "ENCUMBRANCE_TYPE.SHNOS":
      case "ENCUMBRANCE_TYPE.SNOS":
      case "ENCUMBRANCE_TYPE.SSNOS":
        filePath = await searchByProperty(
          page,
          encumbranceType,
          houseNo,
          surveyNo,
          village,
          ward,
          block,
          district,
          sroName,
          startDate,
          docNo
        );
        await page.close();
        break;

      default:
        logger.info("Invalid encumbranceType! ");
        break;
    }

    await browser.close();
    return { status: "ok", filePath };
  } catch (error) {
    logger.info(error.message);
    await browser.close();
    throw new Error(error.message);
  } finally {
    await browser.close();
  }
};

module.exports = telEcDownloader;
