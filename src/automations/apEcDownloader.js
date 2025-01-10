const logger = require("../../utils/logger");
const moment = require("moment");
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
  mergePDFs,
} = require("../../utils/pupeteer");
let dummyFilePath = "public/dummy/dummy.pdf";

// Helper function for navigation error handling
const handleNavigationError = async (fn, ...args) => {
  const maxRetries = 3;
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      if (typeof fn !== "function") {
        throw new Error("Provided argument is not a function");
      }
      return await fn(...args);
    } catch (error) {
      attempts++;
      logger.error(`Attempt ${attempts} failed:`, error.message);
      if (attempts >= maxRetries) {
        logger.error("Max retries reached:", error.message);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempts)); // Exponential backoff
    }
  }
};

// Search by Document Number
const searchByDocumentNumber = async (
  encumbranceType,
  page,
  docNo,
  docYear,
  sroName,
  multipleSros,
  startDate,
  docNoIdentifier
) => {
  try {
    await page.goto("https://registration.ec.ap.gov.in/ecSearch", {
      waitUntil: "networkidle0",
    });

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

    // Continue to next steps
    // if (encumbranceType == "ENCUMBRANCE_TYPE.DNMS") {
    //   return await handleMultipleSro(
    //     page,
    //     encumbranceType,
    //     multipleSros,
    //     startDate
    //   );
    // }

    const found = await handleSecondForm(
      page,
      encumbranceType,
      multipleSros,
      startDate
    );
    if (!found) {
      logger.error("Documents not found on search data.");
      return dummyFilePath;
    }
    await page.waitForNavigation();

    const filePath = await generatePDF(
      page,
      "#__next > div > div:nth-child(2) > div > div.container > div:nth-child(2) > div > table",
      `public/Downloads/${docNoIdentifier}`
    );

    return filePath;
  } catch (error) {
    logger.error("Error in searchByDocumentNumber:", error.message);
    throw error;
  }
};

const handleMultipleSro = async (
  encumbranceType,
  page,
  sroName,
  multipleSros,
  ownerName,
  startDate,
  docNo,
  docYear,
  surveyNo,
  village,
  houseNo,
  ward,
  block,
  district,
  aliasName,
  flatNo,
  plotNo
) => {
  const tasks = [];

  for (let i = 0; i < multipleSros?.length; i += 2) {
    const sroPair = multipleSros.slice(i, i + 2);
    if (["ENCUMBRANCE_TYPE.DNMS"].includes(encumbranceType)) {
      tasks.push(
        await searchByDocumentNumber(
          encumbranceType,
          page,
          docNo,
          docYear,
          sroName,
          sroPair, // Pass individual SRO from the pair
          startDate,
          `${encumbranceType}-${i}` // Unique identifier for each task
        )
      );
    }
    if (
      [
        "ENCUMBRANCE_TYPE.HNMS",
        "ENCUMBRANCE_TYPE.PNMS",
        "ENCUMBRANCE_TYPE.FNMS",
        "ENCUMBRANCE_TYPE.SNMS",
        "ENCUMBRANCE_TYPE.SHNMS",
        "ENCUMBRANCE_TYPE.SSNMS",
        "ENCUMBRANCE_TYPE.SASNMS",
        "ENCUMBRANCE_TYPE.ASNMS",
      ].includes(encumbranceType)
    ) {
      sroPair.unshift(sroName);
      tasks.push(
        await ScrapeByNone(
          encumbranceType,
          page,
          surveyNo,
          village,
          houseNo,
          ward,
          block,
          district,
          sroName,
          sroPair,
          ownerName,
          startDate,
          aliasName,
          `${encumbranceType}-${i}`, // Unique identifier for each task
          flatNo,
          plotNo
        )
      );
    }
  }
  const filePaths = await Promise.all(tasks);
  const filePath = await mergePDFs(
    filePaths,
    `public/Downloads/${encumbranceType}.pdf`
  );
  return filePath;
};

// Handle the second form submission
const handleSecondForm = async (
  page,
  encumbranceType,
  multipleSros,
  startDate
) => {
  try {
    // Validate response and get property list
    await responseValidator(
      page,
      "https://registration.ec.ap.gov.in/ecSearchAPI/v1/public/getPropertiesByDocNumAndSroCodeAndRegYear"
    );

    const sroList =
      encumbranceType === "ENCUMBRANCE_TYPE.DNMS" ? multipleSros : [];

    // Click NEXT button after first form submission
    await clickButton(page, "button.btn.btn-primary.btn-sm");
    logger.info("2nd Form submitted successfully!");

    await page.waitForSelector("form");
    await delay(1000);
    await page.type('form input[name="applicantName"]', ".");
    await delay(1000);

    startDate
      ? await page.type('form input[name="periodOfSearchFrom"]', startDate)
      : logger.info("Skipping Date input as it's empty");

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

    // Select MultipleSRO values
    if (sroList.length) {
      await selectSRO(page, sroList);
    }

    // Submit form and proceed to download
    await clickButton(page, 'form button[type="submit"]');

    const docs = await responseValidator(
      page,
      "https://registration.ec.ap.gov.in/ecSearchAPI/v1/public/getLinkDocumentsByPropertyDetails"
    );

    if (!docs || !Object.entries(docs?.data?.documentList).length) {
      return false;
    }
    await clickButton(page, "#selectAllId");
    await clickButton(page, ".btn.btn-primary");
    return true;
  } catch (error) {
    throw error;
  }
};

// Select the SRO values
const selectSRO = async (page, sroList) => {
  await page.click("div.react-select__control"); // Focus on the dropdown

  for (let sro of sroList.slice(0, 2)) {
    await dropDownSelector(page, "input.react-select__input", sro);
  }
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
  encumbranceType,
  page,
  surveyNo,
  village,
  houseNo,
  ward,
  block,
  district,
  sroName,
  multipleSros,
  ownerName,
  startDate,
  aliasName,
  docNoIdentifier,
  flatNo,
  plotNo
) => {
  let filePath;
  try {
    // if (
    //   ["ENCUMBRANCE_TYPE.SNOS", "ENCUMBRANCE_TYPE.SSNMS"].includes(
    //     encumbranceType
    //   ) &&
    //   typeof houseNo === "string" &&
    //   houseNo?.trim() !== "" &&
    //   houseNo !== undefined
    // ) {
    //   logger.info("House No  found Skipping for SNOS ");
    //   return dummyFilePath;
    // }

    await page.goto(
      "https://registration.ec.ap.gov.in/ecSearch/EncumbranceSearch",
      { waitUntil: "networkidle0" }
    );

    await page.waitForSelector("form");
    await dropDownSelector(page, ".react-select__input", district); //select district

    await responseValidator(
      page,
      "https://registration.ec.ap.gov.in/ecSearchAPI/v1/public/getSroList"
    );
    await handleSRONames(
      page,
      "#react-select-3-input",
      [
        "ENCUMBRANCE_TYPE.HNMS",
        "ENCUMBRANCE_TYPE.SNMS",
        "ENCUMBRANCE_TYPE.SHNMS",
        "ENCUMBRANCE_TYPE.SSNMS",
        "ENCUMBRANCE_TYPE.SASNMS",
        "ENCUMBRANCE_TYPE.ASNMS",
      ].includes(encumbranceType)
        ? multipleSros
        : sroName
    );

    await fillInput(
      page,
      ".Table_columnInputBox__zkfbO",
      ownerName ? ownerName : "."
    ); //applicant name

    if (
      [
        "ENCUMBRANCE_TYPE.HNOS",
        "ENCUMBRANCE_TYPE.HNMS",
        "ENCUMBRANCE_TYPE.PNOS",
        "ENCUMBRANCE_TYPE.PNMS",
        "ENCUMBRANCE_TYPE.FNOS",
        "ENCUMBRANCE_TYPE.FNMS",
        "ENCUMBRANCE_TYPE.SNMS",
        "ENCUMBRANCE_TYPE.SHNOS",
        "ENCUMBRANCE_TYPE.SHNMS",
        "ENCUMBRANCE_TYPE.SNOS",
        "ENCUMBRANCE_TYPE.SSNOS",
        "ENCUMBRANCE_TYPE.SSNMS",
      ].includes(encumbranceType)
    ) {
      await fillBuildingDetails(
        page,
        sroName,
        surveyNo,
        houseNo,
        flatNo,
        plotNo,
        ward,
        block,
        village,
        startDate,
        aliasName,
        encumbranceType
      );
    }

    if (
      [
        "ENCUMBRANCE_TYPE.ASNMS",
        "ENCUMBRANCE_TYPE.SASNMS",
        "ENCUMBRANCE_TYPE.ASNOS",
        "ENCUMBRANCE_TYPE.SASNOS",
      ].includes(encumbranceType)
    ) {
      await fillSurveyDetails(
        page,
        plotNo,
        surveyNo,
        village,
        aliasName,
        startDate,
        encumbranceType
      );
    }

    await delay(1000);
    await submitAndValidateCaptcha(page);

    const docs = await responseValidator(
      page,
      "https://registration.ec.ap.gov.in/ecSearchAPI/v1/public/getLinkDocumentsByPropertyDetails"
    );

    if (!docs || !Object.entries(docs?.data?.documentList).length) {
      logger.error("Documents not found on search data.");
      return dummyFilePath;
    }

    await clickButton(page, "#selectAllId");
    await clickButton(page, "button.btn.btn-primary");
    await page.waitForNavigation();

    filePath = await generatePDF(
      page,
      "#__next > div > div:nth-child(2) > div > div.container > div:nth-child(2) > div > table",
      `public/Downloads/${docNoIdentifier}`
    );

    return filePath;
  } catch (error) {
    throw error;
  }
};

// Fill the building details form
const fillBuildingDetails = async (
  page,
  sroName,
  surveyNo,
  houseNo,
  flatNo,
  plotNo,
  ward,
  block,
  village,
  startDate,
  aliasName,
  encumbranceType
) => {
  await fillInput(page, 'input[name="houseNo"]', houseNo ? houseNo : ".");
  ["ENCUMBRANCE_TYPE.FNOS", "ENCUMBRANCE_TYPE.FNMS"].includes(encumbranceType)
    ? await fillInput(page, 'input[name="flatNo"]', flatNo)
    : logger.info("Skipping flatNo input as it's empty");

  ["ENCUMBRANCE_TYPE.PNOS", "ENCUMBRANCE_TYPE.PNMS"].includes(encumbranceType)
    ? await fillInput(page, 'input[name="plotOrBiNo"]', plotNo)
    : logger.info("Skipping plotNo input as it's empty");

  await fillInput(page, 'input[name="inSurveyNo"]', surveyNo);

  ward
    ? await fillInput(page, 'input[name="wardNo"]', ward)
    : logger.info("Skipping ward no input as it's empty");
  block
    ? await fillInput(page, 'input[name="blockNo"]', block)
    : logger.info("Skipping block no input as it's empty");
  await fillInput(page, 'input[name="villageOrCity"]', village);
  aliasName
    ? await fillInput(page, 'input[name="alias"]', aliasName)
    : logger.info("Skipping Alias input as it's empty");

  startDate
    ? await page.type(
        'input[name="periodOfSearchFrom"]',
        moment(startDate, "DD/MM/YYYY").format("DD-MM-YYYY")
      )
    : logger.info("Skipping Date input as it's empty");
};

// Fill the survey details form for Sites or Agricultural Lands
const fillSurveyDetails = async (
  page,
  plotNo,
  survey,
  village,
  aliasName,
  startDate
) => {
  await clickButton(page, '.form-check-input[value="BS"]');
  await clickButton(page, '.form-check-input[value="SAL"]');
  plotNo
    ? await fillInput(page, 'input[name="plotOrBiNo"]', plotNo)
    : logger.info("Skipping plotNo input as it's empty");

  await fillInput(page, 'input[name="inSurveyNo"]', survey);
  await fillInput(page, 'input[name="revenueVillage"]', village);
  await fillInput(page, 'input[name="revenueAlias"]', aliasName); //aliasName

  startDate
    ? await page.type(
        'input[name="periodOfSearchFrom"]',
        moment(startDate, "DD/MM/YYYY").format("DD-MM-YYYY")
      )
    : logger.info("Skipping Date input as it's empty");
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
  aliasName,
  plotNo,
  flatNo,
}) => {
  const browser = await puppeteerInstance();
  const page = await browser.newPage();
  logger.info(":: Automation Started");
  let filePath,
    sros = sroName;
  try {
    switch (encumbranceType) {
      case "ENCUMBRANCE_TYPE.DNOS":
        filePath = await searchByDocumentNumber(
          encumbranceType,
          page,
          docNo,
          docYear,
          sroName,
          multipleSros,
          startDate,
          encumbranceType //docIdentifier
        );
        await page.close();

        break;

      case "ENCUMBRANCE_TYPE.DNMS":
        filePath = await handleMultipleSro(
          encumbranceType,
          page,
          sroName,
          multipleSros,
          ownerName,
          startDate,
          docNo,
          docYear
        );
        sros = multipleSros.join(", ");
        await page.close();

        break;
      case "ENCUMBRANCE_TYPE.HNOS":
      case "ENCUMBRANCE_TYPE.FNOS":
      case "ENCUMBRANCE_TYPE.PNOS":
      case "ENCUMBRANCE_TYPE.SHNOS":
      case "ENCUMBRANCE_TYPE.SNOS":
      case "ENCUMBRANCE_TYPE.SSNOS":
      case "ENCUMBRANCE_TYPE.ASNOS":
      case "ENCUMBRANCE_TYPE.SASNOS":
        filePath = await ScrapeByNone(
          encumbranceType,
          page,
          surveyNo,
          village,
          houseNo,
          ward,
          block,
          district,
          sroName,
          multipleSros,
          ownerName,
          startDate,
          aliasName,
          encumbranceType, //docIdentifier,
          flatNo,
          plotNo
        );
        await page.close();

        break;

      case "ENCUMBRANCE_TYPE.HNMS":
      case "ENCUMBRANCE_TYPE.SNMS":
      case "ENCUMBRANCE_TYPE.SHNMS":
      case "ENCUMBRANCE_TYPE.SSNMS":
      case "ENCUMBRANCE_TYPE.SASNMS":
      case "ENCUMBRANCE_TYPE.FNMS":
      case "ENCUMBRANCE_TYPE.PNMS":
      case "ENCUMBRANCE_TYPE.ASNMS":
        filePath = await handleMultipleSro(
          encumbranceType,
          page,
          sroName,
          multipleSros,
          ownerName,
          startDate,
          docNo,
          docYear,
          surveyNo,
          village,
          houseNo,
          ward,
          block,
          district,
          aliasName,
          flatNo,
          plotNo
        );
        sros = multipleSros.join(", ");
        await page.close();

        break;

      default:
        logger.info("Invalid encumbranceType! ");
        break;
    }

    await browser.close();
    return { status: "ok", filePath, sros };
  } catch (error) {
    logger.error(error.message);

    throw new Error(error.message);
  } finally {
    await browser.close();
  }
};

module.exports = apEcDownloader;
