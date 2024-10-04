const tesseract = require("tesseract.js");
const {
  downloadPdf,
  fillInput,
  clickButton,
  delay,
  waitForSelector,
  puppeteerInstance,
  selectOption,
} = require("../../common/pupeteer");

const Scrapper = async (
  url = "https://registration.telangana.gov.in/auth_login.htm"
) => {
  const username = process.env.TEL_EC_USERNAME
  const password = process.env.TEL_EC_PASSWORD
  let browser;

  try {
    browser = await puppeteerInstance();
    const page = await browser.newPage();
    await navigateToPage(page, url);

    const captchaText = await handleCaptcha(page);
    await login(browser, page, username, password, captchaText);

    await handlePostLogin(page, browser);
    await browser.close();
  } catch (error) {
    handleError(error, browser);
  }
};

const navigateToPage = async (page, url) => {
  await page.goto(url, { waitUntil: "networkidle2" });
  await waitForSelector(page, ".container");
};

const handleCaptcha = async (page) => {
  let attempts = 0;
  let captchaText = "";

  while (!captchaText || !/^[a-zA-Z0-9]{6}$/.test(captchaText)) {
    if (attempts >= 3) {
      console.log("Maximum attempts reached. Refreshing the page...");
      await page.reload({ waitUntil: ["networkidle2", "domcontentloaded"] });
      attempts = 0; // Reset attempts after refresh
      await delay(3000);
      continue;
    }

    const imageSelector = 'img[src="/Captcha.jpg"]';
    await waitForSelector(page, imageSelector);
    await waitForImageToLoad(page, imageSelector);

    const captchaImageBuffer = await captureCaptchaImage(page, imageSelector);
    captchaText = await extractCaptchaText(captchaImageBuffer);

    if (!captchaText || !/^[a-zA-Z0-9]{6}$/.test(captchaText)) {
      console.log("Invalid captcha. Retrying...");
      attempts++;
      await delay(5000);
    }
  }
  return captchaText;
};

const waitForImageToLoad = async (page, selector) => {
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

const extractCaptchaText = async (buffer) => {
  const { data } = await tesseract.recognize(buffer, "eng");
  return data.text.trim();
};

const login = async (browser, page, username, password, captchaText) => {
  await selectOption(page, "#user_type", "2"); // Select 'Citizen'
  await fillInput(page, "#username", username);
  await fillInput(page, "#password", password);
  await fillInput(page, "#captcha", captchaText);

  console.log("Form filled.");
  await clickButton(page, 'button.btn.btn-default[type="submit"]');

  const element = await page
    .waitForSelector("#myForm > h4", { timeout: 5000 })
    .catch(() => null);

  console.log("Login attemptet.");
  if (element) {
    console.log("Selector found, reloading the page...");
    await page.close();
    await browser.close();
    return Scrapper(); // Retry on successful login
  } else {
    console.log("Selector not found, continuing...");
  }
};

const handlePostLogin = async (
  page,
  browser,
  isSearchByDocumentNumber = true
) => {
  try {
    await delay(3000);

    await clickButton(
      page,
      "body > div.xs-hidden > div:nth-child(1) > div.container > div > form > div:nth-child(8) > a"
    );

    const newPagePromise = getNewPageWhenLoaded(browser);

    const newPage = await newPagePromise;

    console.log("Landed on EC Search submit.");
    await delay(3000);

    // Click the submit button
    await clickButton(newPage, "button.btn.btn-default");
    await page.close();

    if (isSearchByDocumentNumber) {
      await searchByDocumentNumber(newPage);
    } else {
      await searchByProperty(newPage);
    }

    await clickButton(newPage, "#checkall2"); //select all docs
    await delay(3000);

    await clickButton(
      newPage,
      "#form1 > div.s_d > div.col-md-3.col-sm-4 > div.pull-center > button"
    );
    await delay(3000);

    await downloadPdf(newPage, "Downloads/TEL-EncumbranceCertificate-document"); // Download the PDF
    await newPage.close();
  } catch (error) {
    console.log("ERROR:", error);
  }
};

const handleError = async (error, browser) => {
  if (error.message.includes("Navigation timeout of")) {
    console.error(
      "ERROR TimeoutError: Navigation timeout of 30000 ms exceeded"
    );
    console.error("trying again");
    await browser.close();
    return Scrapper();
  }
  if (error.message.includes("ERR_NAME_NOT_RESOLVED")) {
    console.error("ERROR check your internet connection");
    return process.exit(1);
  }

  console.error("ERROR=>", error.message, error);
  return Scrapper();
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

const searchByDocumentNumber = async (page) => {
  await delay(3000);

  await fillInput(page, "#doct", "10");
  await fillInput(page, "#regyear", "2020");
  await fillInput(page, "#sroVal", "HYDERABAD (R.O)(1607)");
  await delay(3000);
  await clickButton(page, "button.btn.btn-default");
  await delay(3000);

  await clickButton(page, "#bean > button");
  await delay(3000);

  await clickButton(
    page,
    "#bean > div:nth-child(39) > div:nth-child(15) > button.btn.btn-default"
  );
  await delay(3000);
  return;
};

const searchByProperty = async (page) => {
  await clickButton(
    page,
    "#command > div:nth-child(1) > div.col-md-2.col-sm-4"
  );
  await delay(3000);
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

  return;
};
// Execute the scrapper
Scrapper();
