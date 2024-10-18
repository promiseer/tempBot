const logger = require("../../utils/logger");
const {
  clickButton,
  fillInput,
  dropDownSelector,
  responseValidator,
  getCaptchaText,
  downloadPdf,
  puppeteerInstance,
  elementFinder,
  generatePDF,
  delay,
} = require("../../utils/pupeteer");
const fs = require("fs");

// Helper function for navigation error handling
const handleNavigationError = async (fn, ...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    if (error.message.includes("Navigation timeout of")) {
      logger.error(
        "ERROR TimeoutError: Navigation timeout of 30000 ms exceeded, retrying..."
      );
      return fn(...args); // Retry on timeout
    }
    if (error.message.includes("ERR_NAME_NOT_RESOLVED")) {
      logger.error("ERROR: Check your internet connection.");
      process.exit(1); // Exit on connection issue
    }
    logger.error("ERROR: ", error.message);
    throw error;
  }
};

// Search by Document Number
const searchByDocumentNumber = async (page, url, docNo, docYear, sroName) => {
  try {
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForSelector("#encumbranceServiceForm");

    // Select 'Document Number' in the dropdown
    await page.select("#typeSelectId", "DocNo");

    // Fill document number and registration year
    await fillInput(
      page,
      '#encumbranceServiceForm input[name="docMemoNo"]',
      docNo
    );
    await fillInput(
      page,
      '#encumbranceServiceForm input[name="yearOfRegistration"]',
      docYear
    );

    // Select SRO using a dropdown
    await dropDownSelector(page, "input.react-select__input", sroName);

    // Get CAPTCHA text and fill it in
    const captchaText = await getCaptchaText(
      page,
      "div.col-lg-3.col-md-3.col-3 span",
      3,
      1000
    );
    await page.type(
      '#encumbranceServiceForm input[name="captchaVal"]',
      captchaText
    );

    // Submit form
    await clickButton(page, '#encumbranceServiceForm button[type="submit"]');
    logger.info("Logged in successfully");

    // Validate response and get property list
    const propertyList = await responseValidator(
      page,
      "https://registration.ec.ap.gov.in/ecSearchAPI/v1/public/getPropertiesByDocNumAndSroCodeAndRegYear"
    );
    const sroList = propertyList.data.drSroList.map((item) => item.srname);

    // Continue to next steps
    await handleSecondForm(page, sroList);
    await page.waitForNavigation();

    const filePath = await generatePDF(
      page,
      "#__next > div > div:nth-child(2) > div > div.container > div:nth-child(2) > div > table",
      `Public/Downloads/AP-EncumbranceCertificate-document-by-doc-${docNo}`
    );
    await page.close();

    return filePath;
  } catch (error) {
    logger.error("Error in searchByDocumentNumber:", error.message);
    throw error;

    //   return handleNavigationError(
    //     searchByDocumentNumber,
    //     page,
    //     url,
    //     docNo,
    //     yearOfRegistration,
    //     sroName
    //   );
  }
};

// Handle the second form submission
const handleSecondForm = async (page, sroList) => {
  try {
    // Click NEXT button after first form submission
    await clickButton(page, "button.btn.btn-primary.btn-sm");
    logger.info("2nd Form submitted successfully!");

    await page.waitForSelector("form");
    await page.type('form input[name="applicantName"]', ".");

    // Get new CAPTCHA text and fill it
    const captchaText = await getCaptchaText(
      page,
      "form div.col-lg-1.col-md-1.col-1 span",
      3,
      1000
    );
    logger.info("3rd CAPTCHA", captchaText);

    errorCaptcha = elementFinder(
      page,
      "#__next > div > div:nth-child(3) > div.MainContent > div > div > div > div > div > form > div.p.row > div.col-lg-3.col-md-3.col-3 > div"
    );
    if (errorCaptcha) {
      logger.info("Captcha error found");
    }
    await page.type('form input[name="captchaVal"]', captchaText);

    // Select SRO values
    await selectSRO(page, sroList);

    // Submit form and proceed to download
    await clickButton(page, 'form button[type="submit"]');
    await clickButton(page, "#selectAllId");
    await clickButton(page, ".btn.btn-primary");
  } catch (error) {
    throw error;
  }
};

// Select the SRO values
const selectSRO = async (page, sroList) => {
  await page.click("div.react-select__control"); // Focus on the dropdown

  for (let sro of sroList.slice(0, 2)) {
    //first 2 SROS only
    await dropDownSelector(page, "input.react-select__input", sro);
  }
  // logger.info(`Selected SRO values: ${JSON.stringify(sroList[0])}`);
};

const handleSRONames = async (page, selector, sroName) => {
  // Check if sroName is an array
  if (Array.isArray(sroName)) {
    // Iterate over each SRO and call dropDownSelector
    for (let sro of sroName) {
      await dropDownSelector(page, selector, sro); // Handle multiple SROs
      await delay(1000);
    }
  } else {
    // Handle single SRO
    await dropDownSelector(page, selector, sroName);
    await delay(1000);

  }
};


// Search by None (without document number)
const ScrapeByNone = async (
  page,
  url,
  surveyNo,
  village,
  houseNo,
  ward,
  block,
  district,
  sroName,
  ownerName
) => {
  let filePath;
  try {
    await page.goto(url, { waitUntil: "networkidle0" });

    await page.waitForSelector("form");
    await dropDownSelector(page, ".react-select__input", district); //select district

    await responseValidator(
      page,
      "https://registration.ec.ap.gov.in/ecSearchAPI/v1/public/getSroList"
    );
    await handleSRONames(page, "#react-select-3-input", sroName);

    await fillInput(
      page,
      ".Table_columnInputBox__zkfbO",
      ownerName ? ownerName : "."
    ); //applicant name

    if (houseNo) {
      await fillBuildingDetails(page, surveyNo, houseNo, ward, block, village); //@todo: add alias if required
    } else {
      await fillSurveyDetails(page, surveyNo, village);
    }

    await delay(1000);
    await submitAndValidateCaptcha(page);

    const docs = await responseValidator(
      page,
      "https://registration.ec.ap.gov.in/ecSearchAPI/v1/public/getLinkDocumentsByPropertyDetails"
    );

    if (!Object.entries(docs.data.documentList).length) {
      filePath = "Public/Downloads/no-documents-found.png";
      await page.screenshot({
        path: filePath,
      });
      logger.error("Documents not found on search data.");
      return filePath;
    }

    await clickButton(page, "#selectAllId");
    await clickButton(page, "button.btn.btn-primary");
    await page.waitForNavigation();

    filePath = await generatePDF(
      page,
      "#__next > div > div:nth-child(2) > div > div.container > div:nth-child(2) > div > table",
      `Public/Downloads/AP-EncumbranceCertificate-document-without-docNumber`
    );

    await page.close();
    return filePath;
  } catch (error) {
    throw error;

    //   return handleNavigationError(
    //     ScrapeByNone,
    //     page,
    //     url,
    //     searchByBuildingDetails
    //   );
  }
};

// Fill the building details form
const fillBuildingDetails = async (
  page,
  surveyNo,
  houseNo,
  ward,
  block,
  village,
  alias
) => {
  await fillInput(page, 'input[name="inSurveyNo"]', surveyNo);
  await fillInput(page, 'input[name="houseNo"]', houseNo);
  ward
    ? await fillInput(page, 'input[name="wardNo"]', ward)
    : logger.info("Skipping ward no input as it's empty");
  block
    ? await fillInput(page, 'input[name="blockNo"]', block)
    : logger.info("Skipping block no input as it's empty");
  await fillInput(page, 'input[name="villageOrCity"]', village);
  alias
    ? await fillInput(page, 'input[name="alias"]', alias)
    : logger.info("Skipping Alias input as it's empty");
};

// Fill the survey details form
const fillSurveyDetails = async (page, survey, village) => {
  await clickButton(page, '.form-check-input[value="BS"]');
  await clickButton(page, '.form-check-input[value="SAL"]');
  await fillInput(page, 'input[name="inSurveyNo"]', survey);
  await fillInput(page, 'input[name="revenueVillage"]', village);
};

// Submit form and fill CAPTCHA
const submitAndValidateCaptcha = async (page) => {
  const captchaText = await getCaptchaText(
    page,
    "div.col-lg-1.col-md-1.col-1 span",
    3,
    1000
  );
  await fillInput(page, 'input[name="captchaVal"]', captchaText);
  await clickButton(page, 'button[type="submit"].btn-primary');
};

// Main function to trigger the script
const apEcDownloader = async ({
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
  logger.info(":: Automation Started");
  let filePath;
  try {
    if (docNo) {
      logger.info("...searching by documentNo ");
      filePath = await searchByDocumentNumber(
        page,
        "https://registration.ec.ap.gov.in/ecSearch",
        docNo,
        docYear,
        sroName
      );
    } else {
      logger.info("..searching without documentNo ");

      filePath = await ScrapeByNone(
        page,
        "https://registration.ec.ap.gov.in/ecSearch/EncumbranceSearch",
        surveyNo,
        village,
        houseNo,
        ward,
        block,
        district,
        sroName,
        ownerName
      );
    }

    await browser.close();
    return { status: "ok", filePath };
  } catch (error) {
    logger.info(error.message);
    throw new Error(error.message);
  } finally {
    await browser.close();
  }
};

module.exports = apEcDownloader;
